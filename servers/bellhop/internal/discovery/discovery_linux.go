//go:build linux

package discovery

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

const tcpListenState = "0A"

// Discover returns a dialable address for a listening TCP socket owned by pid.
func Discover(pid int) (string, error) {
	return discoverFromProc("/proc", pid)
}

func discoverFromProc(procRoot string, pid int) (string, error) {
	return discoverFromProcWithSocketReader(procRoot, pid, readSocketInodes)
}

func discoverFromProcWithSocketReader(
	procRoot string,
	pid int,
	readInodes func(string) (map[string]struct{}, error),
) (string, error) {
	processRoot := filepath.Join(procRoot, strconv.Itoa(pid))
	socketInodes, err := readInodes(filepath.Join(processRoot, "fd"))
	if err != nil {
		return "", classifySnapshotError("read process socket descriptors", err)
	}
	if len(socketInodes) == 0 {
		return "", ErrNotReady
	}

	for _, table := range []struct {
		path string
		ipv6 bool
	}{
		{path: filepath.Join(processRoot, "net", "tcp")},
		{path: filepath.Join(processRoot, "net", "tcp6"), ipv6: true},
	} {
		address, inode, found, err := findOwnedListener(table.path, table.ipv6, socketInodes)
		if err != nil {
			return "", classifySnapshotError("read process TCP table", err)
		}
		if found {
			currentInodes, err := readInodes(filepath.Join(processRoot, "fd"))
			if err != nil {
				return "", classifySnapshotError("revalidate process socket descriptors", err)
			}
			if _, stillOwned := currentInodes[inode]; !stillOwned {
				return "", ErrNotReady
			}
			return address, nil
		}
	}
	return "", ErrNotReady
}

func readSocketInodes(directory string) (map[string]struct{}, error) {
	descriptors, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}
	inodes := make(map[string]struct{})
	for _, descriptor := range descriptors {
		target, err := os.Readlink(filepath.Join(directory, descriptor.Name()))
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, fmt.Errorf("read descriptor %q: %w", descriptor.Name(), err)
		}
		if strings.HasPrefix(target, "socket:[") && strings.HasSuffix(target, "]") {
			inodes[strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]")] = struct{}{}
		}
	}
	return inodes, nil
}

func classifySnapshotError(operation string, err error) error {
	// A child may exit or close a descriptor between any two /proc reads.
	// Those races are an ordinary not-ready state. Other errors are persistent
	// diagnostics (permissions, malformed tables, I/O failure) and must remain
	// visible to the caller instead of causing an endless readiness retry.
	if errors.Is(err, os.ErrNotExist) || errors.Is(err, syscall.ESRCH) {
		return ErrNotReady
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func findOwnedListener(path string, ipv6 bool, ownedInodes map[string]struct{}) (string, string, bool, error) {
	table, err := os.Open(path)
	if err != nil {
		return "", "", false, err
	}
	defer table.Close()

	scanner := bufio.NewScanner(table)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return "", "", false, err
		}
		return "", "", false, nil
	}
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		if len(fields) <= 9 {
			return "", "", false, fmt.Errorf("parse TCP table row %q: expected at least 10 fields", scanner.Text())
		}
		if fields[3] != tcpListenState {
			continue
		}
		if _, owned := ownedInodes[fields[9]]; !owned {
			continue
		}
		address, err := parseLocalAddress(fields[1], ipv6)
		if err != nil {
			return "", "", false, err
		}
		return address, fields[9], true, nil
	}
	if err := scanner.Err(); err != nil {
		return "", "", false, err
	}
	return "", "", false, nil
}

func parseLocalAddress(encoded string, ipv6 bool) (string, error) {
	hostText, portText, found := strings.Cut(encoded, ":")
	if !found {
		return "", fmt.Errorf("parse local TCP address %q", encoded)
	}
	port, err := strconv.ParseUint(portText, 16, 16)
	if err != nil {
		return "", fmt.Errorf("parse TCP port %q: %w", portText, err)
	}
	hostBytes, err := hex.DecodeString(hostText)
	if err != nil {
		return "", fmt.Errorf("parse TCP host %q: %w", hostText, err)
	}

	var host net.IP
	if ipv6 {
		if len(hostBytes) != net.IPv6len {
			return "", fmt.Errorf("parse IPv6 host %q: expected 16 bytes", hostText)
		}
		convertProcWordsToNetworkOrder(hostBytes, binary.NativeEndian)
		host = net.IP(hostBytes)
		if host.IsUnspecified() {
			host = net.IPv6loopback
		}
	} else {
		if len(hostBytes) != net.IPv4len {
			return "", fmt.Errorf("parse IPv4 host %q: expected 4 bytes", hostText)
		}
		convertProcWordsToNetworkOrder(hostBytes, binary.NativeEndian)
		host = net.IP(hostBytes)
		if host.IsUnspecified() {
			host = net.IPv4(127, 0, 0, 1)
		}
	}
	return net.JoinHostPort(host.String(), strconv.FormatUint(port, 10)), nil
}

func convertProcWordsToNetworkOrder(address []byte, nativeOrder binary.ByteOrder) {
	// /proc renders addresses as native-endian uint32 words. Decode with the
	// host's actual byte order and re-encode in the network order expected by
	// net.IP; this is correct on both little- and big-endian Linux.
	for word := 0; word < len(address); word += 4 {
		value := nativeOrder.Uint32(address[word : word+4])
		binary.BigEndian.PutUint32(address[word:word+4], value)
	}
}
