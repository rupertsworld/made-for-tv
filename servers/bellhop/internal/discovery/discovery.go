// Package discovery finds listening TCP sockets owned by direct child
// processes. Platform-specific implementations keep operating-system details
// out of Bellhop's supervision layer.
package discovery

import "errors"

// ErrNotReady means the process does not currently own an observable listening
// TCP socket. It also covers transient /proc races while a process starts or
// exits, so callers can safely retry.
var ErrNotReady = errors.New("process has no listening TCP socket")

// ErrUnsupported means listener discovery is unavailable on this platform.
var ErrUnsupported = errors.New("process TCP listener discovery is unsupported on this platform")
