//go:build !linux

package discovery

// Discover reports that direct-child listener discovery is Linux-only.
func Discover(pid int) (string, error) {
	return "", ErrUnsupported
}
