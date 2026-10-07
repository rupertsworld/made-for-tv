//go:build linux

package console

import (
	"os"
	"syscall"
	"unsafe"
)

type windowSize struct {
	rows    uint16
	columns uint16
	xPixels uint16
	yPixels uint16
}

// IsTerminal reports whether file is a terminal.
func IsTerminal(file *os.File) bool {
	var settings syscall.Termios
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		file.Fd(),
		uintptr(syscall.TCGETS),
		uintptr(unsafe.Pointer(&settings)),
	)
	return errno == 0
}

func terminalSize(file *os.File) (int, int) {
	var size windowSize
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		file.Fd(),
		uintptr(syscall.TIOCGWINSZ),
		uintptr(unsafe.Pointer(&size)),
	)
	if errno != 0 {
		return 0, 0
	}
	return int(size.rows), int(size.columns)
}
