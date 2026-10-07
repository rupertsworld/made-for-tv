//go:build !linux

package supervisor

import "errors"

var errExitObservationUnsupported = errors.New("safe child exit observation is only supported on Linux")

func observeProcessExit(int) error {
	return errExitObservationUnsupported
}
