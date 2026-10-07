//go:build linux

package supervisor

import (
	"errors"
	"syscall"
	"unsafe"
)

const (
	waitIDProcess = 1
	waitExited    = 0x00000004
	waitNoReap    = 0x01000000
)

// observeProcessExit waits until pid exits without reaping it. Keeping the
// process-group leader as a zombie prevents Linux from reusing its PID—and
// therefore its PGID—while Bellhop finishes signaling the original group.
func observeProcessExit(pid int) error {
	var information [128]byte
	for {
		_, _, errno := syscall.Syscall6(
			syscall.SYS_WAITID,
			waitIDProcess,
			uintptr(pid),
			uintptr(unsafe.Pointer(&information[0])),
			waitExited|waitNoReap,
			0,
			0,
		)
		if errno == 0 {
			return nil
		}
		if errors.Is(errno, syscall.EINTR) {
			continue
		}
		return errno
	}
}
