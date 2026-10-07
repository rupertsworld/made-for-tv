//go:build linux

package console

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

func TestPrinterCapturesTerminalWidthAndRewritesThroughPTY(t *testing.T) {
	master, slave := openPseudoTerminal(t)
	setTerminalWindowSize(t, slave, 24, 80)
	printer := New(slave, true, false)
	if printer.terminalWidth != 80 {
		t.Fatalf("captured terminal width = %d, want 80", printer.terminalWidth)
	}
	if printer.terminalHeight != 24 {
		t.Fatalf("captured terminal height = %d, want 24", printer.terminalHeight)
	}

	printer.Startup("127.0.0.1:8770", []string{"vault"})
	printer.Listening("vault", 4747)
	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault  ○ starting\n" +
		"\x1b[1A\r\x1b[2K  vault  ● listening :4747\x1b[1B\r"
	if got := readPseudoTerminal(t, master, len(want)); got != want {
		t.Fatalf("PTY output = %q, want rewrite %q", got, want)
	}
}

func TestPrinterRechecksNarrowedTerminalWidthBeforeRewrite(t *testing.T) {
	master, slave := openPseudoTerminal(t)
	setTerminalWindowSize(t, slave, 24, 80)
	printer := New(slave, true, false)
	printer.Startup("127.0.0.1:8770", []string{"vault"})
	setTerminalWindowSize(t, slave, 24, 20)
	printer.Listening("vault", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault  ○ starting\n" +
		"  vault  ● listening :4747\n"
	if got := readPseudoTerminal(t, master, len(want)); got != want {
		t.Fatalf("PTY output after resize = %q, want appended state %q", got, want)
	}
}

func TestPrinterRechecksTerminalWidthAtStartup(t *testing.T) {
	master, slave := openPseudoTerminal(t)
	setTerminalWindowSize(t, slave, 24, 80)
	printer := New(slave, true, false)
	setTerminalWindowSize(t, slave, 24, 19)
	printer.Startup("127.0.0.1:8770", []string{"vault"})
	setTerminalWindowSize(t, slave, 24, 80)
	printer.Listening("vault", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault  ○ starting\n" +
		"  vault  ● listening :4747\n"
	if got := readPseudoTerminal(t, master, len(want)); got != want {
		t.Fatalf("PTY output after startup resize = %q, want appended state %q", got, want)
	}
}

func TestPrinterAppendsWhenCursorDistanceReachesTerminalHeight(t *testing.T) {
	master, slave := openPseudoTerminal(t)
	setTerminalWindowSize(t, slave, 2, 80)
	printer := New(slave, true, false)
	printer.Startup("127.0.0.1:8770", []string{"one", "two"})
	printer.Listening("one", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  one  ○ starting\n" +
		"  two  ○ starting\n" +
		"  one  ● listening :4747\n"
	if got := readPseudoTerminal(t, master, len(want)); got != want {
		t.Fatalf("short PTY output = %q, want appended state %q", got, want)
	}
}

func TestPrinterFreezesWhenTerminalWidthCannotBeRequeried(t *testing.T) {
	_, slave := openPseudoTerminal(t)
	setTerminalWindowSize(t, slave, 24, 80)

	var output bytes.Buffer
	printer := New(&output, true, false)
	printer.terminalFile = slave
	printer.terminalWidth = 80
	printer.terminalHeight = 24
	printer.Startup("127.0.0.1:8770", []string{"vault"})
	if err := slave.Close(); err != nil {
		t.Fatal(err)
	}
	printer.Listening("vault", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault  ○ starting\n" +
		"  vault  ● listening :4747\n"
	if got := output.String(); got != want {
		t.Fatalf("output after terminal width failure = %q, want appended state %q", got, want)
	}
}

func openPseudoTerminal(t *testing.T) (*os.File, *os.File) {
	t.Helper()
	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		t.Skipf("open /dev/ptmx: %v", err)
	}
	t.Cleanup(func() { _ = master.Close() })

	var unlock int32
	pseudoTerminalIoctl(t, master, syscall.TIOCSPTLCK, unsafe.Pointer(&unlock))
	var number uint32
	pseudoTerminalIoctl(t, master, syscall.TIOCGPTN, unsafe.Pointer(&number))
	slave, err := os.OpenFile(fmt.Sprintf("/dev/pts/%d", number), os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		t.Fatalf("open pseudoterminal slave: %v", err)
	}
	t.Cleanup(func() { _ = slave.Close() })

	var settings syscall.Termios
	pseudoTerminalIoctl(t, slave, syscall.TCGETS, unsafe.Pointer(&settings))
	settings.Oflag &^= syscall.OPOST
	pseudoTerminalIoctl(t, slave, syscall.TCSETS, unsafe.Pointer(&settings))
	return master, slave
}

func setTerminalWindowSize(t *testing.T, terminal *os.File, rows, columns uint16) {
	t.Helper()
	size := windowSize{rows: rows, columns: columns}
	pseudoTerminalIoctl(t, terminal, syscall.TIOCSWINSZ, unsafe.Pointer(&size))
}

func pseudoTerminalIoctl(t *testing.T, file *os.File, request uint, pointer unsafe.Pointer) {
	t.Helper()
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		file.Fd(),
		uintptr(request),
		uintptr(pointer),
	)
	if errno != 0 {
		t.Fatalf("ioctl %#x: %v", request, errno)
	}
}

func readPseudoTerminal(t *testing.T, master *os.File, length int) string {
	t.Helper()
	if err := master.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	content := make([]byte, length)
	if _, err := io.ReadFull(master, content); err != nil {
		t.Fatalf("read pseudoterminal: %v", err)
	}
	return string(content)
}
