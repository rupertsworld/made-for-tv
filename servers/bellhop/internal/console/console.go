// Package console formats Bellhop's terminal output.
package console

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	reset      = "\x1b[0m"
	dimGrey    = "\x1b[2;90m"
	green      = "\x1b[32m"
	yellow     = "\x1b[33m"
	red        = "\x1b[31m"
	listening  = "● listening"
	starting   = "○ starting"
	restarting = "○ restarting"
)

// Printer writes complete terminal lines without allowing concurrent child
// events to interleave.
type Printer struct {
	mutex                 sync.Mutex
	writer                io.Writer
	terminal              bool
	color                 bool
	terminalFile          *os.File
	terminalWidth         int
	terminalHeight        int
	mountNameWidth        int
	startupMountNameWidth int
	startupMountRows      map[string]int
	startupRowWidths      []int
	linesSinceStartup     int
}

// New constructs a printer with explicit terminal and color decisions.
func New(writer io.Writer, terminal, color bool) *Printer {
	printer := &Printer{writer: writer, terminal: terminal, color: color}
	if file, ok := writer.(*os.File); ok && terminal {
		printer.terminalFile = file
		printer.terminalHeight, printer.terminalWidth = terminalSize(file)
	}
	return printer
}

// ColorEnabled reports whether file is a terminal and NO_COLOR is unset.
func ColorEnabled(file *os.File) bool {
	if _, set := os.LookupEnv("NO_COLOR"); set {
		return false
	}
	return IsTerminal(file)
}

// Startup writes the bound address and the initial state of every mount.
func (printer *Printer) Startup(address string, mounts []string) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.reserveMountsLocked(mounts)
	if printer.terminal {
		printer.refreshTerminalSizeLocked()
		printer.startupMountNameWidth = printer.mountNameWidth
		printer.startupRowWidths = make([]int, len(mounts))
		printer.startupMountRows = make(map[string]int, len(mounts))
		rowsAreSingleLine := true
		for index := len(mounts) - 1; index >= 0; index-- {
			mount := mounts[index]
			distance := len(mounts) - index
			line := mountLine(mount, starting, "", printer.startupMountNameWidth)
			printer.startupRowWidths[index] = terminalRowWidth(mount, line)
			rowsAreSingleLine = rowsAreSingleLine &&
				distance < printer.terminalHeight &&
				printer.startupRowWidths[index] > 0 &&
				printer.startupRowWidths[index] <= printer.terminalWidth
			if rowsAreSingleLine {
				printer.startupMountRows[mount] = index
			}
		}
	}
	if printer.color {
		_, _ = fmt.Fprintf(printer.writer, "%sbellhop serving%s http://%s\n", dimGrey, reset, address)
	} else {
		_, _ = fmt.Fprintf(printer.writer, "bellhop serving http://%s\n", address)
	}
	for _, mount := range mounts {
		printer.writeMountLocked(mount, starting, yellow, "")
	}
	printer.linesSinceStartup = 0
}

// ReserveMounts widens the mount-name column before concurrent lifecycle
// output for a new configuration can begin.
func (printer *Printer) ReserveMounts(mounts []string) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.reserveMountsLocked(mounts)
}

func (printer *Printer) reserveMountsLocked(mounts []string) {
	for _, mount := range mounts {
		if width := utf8.RuneCountInString(mount); width > printer.mountNameWidth {
			printer.mountNameWidth = width
		}
	}
}

// Starting writes a child-start event.
func (printer *Printer) Starting(mount string) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.writeMountLocked(mount, starting, yellow, "")
}

// Listening writes a child-listening event with its discovered port.
func (printer *Printer) Listening(mount string, port int) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	portSuffix := fmt.Sprintf(":%d", port)
	plainSuffix := " " + portSuffix
	suffix := plainSuffix
	if printer.color {
		suffix = " " + dimGrey + portSuffix + reset
	}
	if printer.rewriteStartupMountLocked(mount, listening, green, suffix, plainSuffix) {
		return
	}
	printer.writeMountLocked(mount, listening, green, suffix)
}

// Restarting writes either a reload restart or a delayed child restart.
func (printer *Printer) Restarting(mount string, delay time.Duration) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	suffix := ""
	if delay > 0 {
		suffix = " in " + delay.String()
	}
	printer.writeMountLocked(mount, restarting, yellow, suffix)
}

// Stopped writes a reload stop event.
func (printer *Printer) Stopped(mount string) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.writeMountLocked(mount, "○ stopped", "", "")
}

// Error writes one prefixed error line.
func (printer *Printer) Error(err error) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.writeErrorLocked(err.Error())
}

// ReloadError writes a reload error and states that the active configuration
// remains in use.
func (printer *Printer) ReloadError(err error) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.writeErrorLocked("reload: " + err.Error() + "; previous configuration is kept")
}

// Write turns one logger write into one Bellhop error line.
func (printer *Printer) Write(content []byte) (int, error) {
	printer.mutex.Lock()
	defer printer.mutex.Unlock()
	printer.writeErrorLocked(strings.TrimSpace(string(content)))
	return len(content), nil
}

func (printer *Printer) writeMountLocked(mount, state, color, suffix string) {
	if width := utf8.RuneCountInString(mount); width > printer.mountNameWidth {
		printer.mountNameWidth = width
	}
	line := printer.mountLineLocked(mount, state, color, suffix, printer.mountNameWidth)
	_, _ = fmt.Fprintln(printer.writer, line)
	printer.linesSinceStartup++
}

func (printer *Printer) rewriteStartupMountLocked(mount, state, color, suffix, plainSuffix string) bool {
	row, exists := printer.startupMountRows[mount]
	if !printer.terminal || printer.linesSinceStartup != 0 || !exists {
		return false
	}
	printer.refreshTerminalSizeLocked()
	distance := len(printer.startupRowWidths) - row
	if distance >= printer.terminalHeight {
		return false
	}
	for index := row; index < len(printer.startupRowWidths); index++ {
		if printer.startupRowWidths[index] == 0 || printer.startupRowWidths[index] > printer.terminalWidth {
			return false
		}
	}
	plainLine := mountLine(mount, state, plainSuffix, printer.startupMountNameWidth)
	replacementWidth := terminalRowWidth(mount, plainLine)
	if replacementWidth == 0 || replacementWidth > printer.terminalWidth {
		return false
	}
	line := printer.mountLineLocked(mount, state, color, suffix, printer.startupMountNameWidth)
	_, _ = fmt.Fprintf(
		printer.writer,
		"\x1b[%dA\r\x1b[2K%s\x1b[%dB\r",
		distance,
		line,
		distance,
	)
	printer.startupRowWidths[row] = replacementWidth
	delete(printer.startupMountRows, mount)
	return true
}

func (printer *Printer) mountLineLocked(mount, state, color, suffix string, width int) string {
	if printer.color && color != "" {
		state = color + state + reset
	}
	return mountLine(mount, state, suffix, width)
}

func mountLine(mount, state, suffix string, width int) string {
	return fmt.Sprintf("  %-*s  %s%s", width, mount, state, suffix)
}

func terminalRowWidth(mount, line string) int {
	for _, character := range mount {
		if character < ' ' || character > '~' {
			return 0
		}
	}
	// A state marker may occupy two cells, one more than its rune count.
	return utf8.RuneCountInString(line) + 1
}

func (printer *Printer) refreshTerminalSizeLocked() {
	if printer.terminalFile != nil {
		printer.terminalHeight, printer.terminalWidth = terminalSize(printer.terminalFile)
	}
}

func (printer *Printer) writeErrorLocked(message string) {
	message = strings.NewReplacer("\r\n", " ", "\r", " ", "\n", " ").Replace(message)
	prefix := "bellhop:"
	if printer.color {
		prefix = red + prefix + reset
	}
	_, _ = fmt.Fprintf(printer.writer, "%s %s\n", prefix, message)
	printer.linesSinceStartup++
}
