//go:build !linux

package console

import "os"

// IsTerminal reports whether file is a terminal.
func IsTerminal(*os.File) bool {
	return false
}

func terminalSize(*os.File) (int, int) {
	return 0, 0
}
