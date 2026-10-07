//go:build linux

package discovery

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestParseLocalAddress(t *testing.T) {
	tests := []struct {
		name string
		host string
		port string
		ipv6 bool
		want string
	}{
		{name: "specific IPv4", host: "1.2.3.4", port: "1F90", want: "1.2.3.4:8080"},
		{name: "wildcard IPv4", host: "0.0.0.0", port: "1F90", want: "127.0.0.1:8080"},
		{name: "specific IPv6", host: "2001:db8::1", port: "2382", ipv6: true, want: "[2001:db8::1]:9090"},
		{name: "wildcard IPv6", host: "::", port: "2382", ipv6: true, want: "[::1]:9090"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			encoded := encodeProcAddress(t, test.host, test.ipv6, binary.NativeEndian) + ":" + test.port
			got, err := parseLocalAddress(encoded, test.ipv6)
			if err != nil {
				t.Fatalf("parseLocalAddress() error = %v", err)
			}
			if got != test.want {
				t.Fatalf("parseLocalAddress() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestConvertProcWordsToNetworkOrder(t *testing.T) {
	for _, host := range []string{"1.2.3.4", "2001:db8::1"} {
		for _, order := range []struct {
			name  string
			value binary.ByteOrder
		}{
			{name: "little endian", value: binary.LittleEndian},
			{name: "big endian", value: binary.BigEndian},
		} {
			t.Run(host+"/"+order.name, func(t *testing.T) {
				ipv6 := net.ParseIP(host).To4() == nil
				encoded, err := hex.DecodeString(encodeProcAddress(t, host, ipv6, order.value))
				if err != nil {
					t.Fatal(err)
				}
				convertProcWordsToNetworkOrder(encoded, order.value)
				if got := net.IP(encoded).String(); got != host {
					t.Fatalf("converted address = %q, want %q", got, host)
				}
			})
		}
	}
}

func TestParseLocalAddressRejectsMalformedFields(t *testing.T) {
	for _, encoded := range []string{"not-an-address", "0100007F:not-a-port", "invalid!:1F90", "0102:1F90"} {
		t.Run(encoded, func(t *testing.T) {
			if _, err := parseLocalAddress(encoded, false); err == nil {
				t.Fatal("parseLocalAddress() error = nil, want parse error")
			}
		})
	}
}

func TestDiscoverFromProcReturnsAnOwnedListener(t *testing.T) {
	processRoot := filepath.Join(t.TempDir(), "4242")
	if err := os.MkdirAll(filepath.Join(processRoot, "fd"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(processRoot, "net"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("socket:[11111]", filepath.Join(processRoot, "fd", "3")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("socket:[22222]", filepath.Join(processRoot, "fd", "4")); err != nil {
		t.Fatal(err)
	}
	copyFixture(t, "testdata/tcp", filepath.Join(processRoot, "net", "tcp"))
	copyFixture(t, "testdata/tcp6", filepath.Join(processRoot, "net", "tcp6"))

	address, err := discoverFromProc(filepath.Dir(processRoot), 4242)
	if err != nil {
		t.Fatalf("discoverFromProc() error = %v", err)
	}
	if address != "127.0.0.1:8080" && address != "[::1]:9090" {
		t.Fatalf("discoverFromProc() = %q, want one of the child's listeners", address)
	}
}

func TestDiscoverFromProcMapsWildcardIPv6ToLoopback(t *testing.T) {
	processRoot := filepath.Join(t.TempDir(), "4242")
	if err := os.MkdirAll(filepath.Join(processRoot, "fd"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(processRoot, "net"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("socket:[22222]", filepath.Join(processRoot, "fd", "4")); err != nil {
		t.Fatal(err)
	}
	copyFixture(t, "testdata/tcp", filepath.Join(processRoot, "net", "tcp"))
	copyFixture(t, "testdata/tcp6", filepath.Join(processRoot, "net", "tcp6"))

	address, err := discoverFromProc(filepath.Dir(processRoot), 4242)
	if err != nil {
		t.Fatalf("discoverFromProc() error = %v", err)
	}
	if address != "[::1]:9090" {
		t.Fatalf("discoverFromProc() = %q, want %q", address, "[::1]:9090")
	}
}

func TestDiscoverFromProcIgnoresNonListeningAndUnownedSockets(t *testing.T) {
	processRoot := filepath.Join(t.TempDir(), "4242")
	if err := os.MkdirAll(filepath.Join(processRoot, "fd"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(processRoot, "net"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("socket:[33333]", filepath.Join(processRoot, "fd", "5")); err != nil {
		t.Fatal(err)
	}
	copyFixture(t, "testdata/tcp", filepath.Join(processRoot, "net", "tcp"))
	copyFixture(t, "testdata/tcp6", filepath.Join(processRoot, "net", "tcp6"))

	_, err := discoverFromProc(filepath.Dir(processRoot), 4242)
	if !isNotReady(err) {
		t.Fatalf("discoverFromProc() error = %v, want not ready", err)
	}
}

func TestDiscoverFromProcReturnsMalformedTableError(t *testing.T) {
	for _, row := range []string{
		"malformed row",
		"0: malformed 00000000:0000 0A 0 0 0 0 0 11111",
	} {
		t.Run(row, func(t *testing.T) {
			processRoot := filepath.Join(t.TempDir(), "4242")
			if err := os.MkdirAll(filepath.Join(processRoot, "fd"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(filepath.Join(processRoot, "net"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink("socket:[11111]", filepath.Join(processRoot, "fd", "3")); err != nil {
				t.Fatal(err)
			}
			table := "header\n" + row + "\n"
			if err := os.WriteFile(filepath.Join(processRoot, "net", "tcp"), []byte(table), 0o600); err != nil {
				t.Fatal(err)
			}

			_, err := discoverFromProc(filepath.Dir(processRoot), 4242)
			if err == nil || errors.Is(err, ErrNotReady) {
				t.Fatalf("discoverFromProc() error = %v, want actionable parse error", err)
			}
		})
	}
}

func TestDiscoverFromProcReturnsPersistentDescriptorError(t *testing.T) {
	processRoot := filepath.Join(t.TempDir(), "4242")
	if err := os.MkdirAll(filepath.Join(processRoot, "fd", "3"), 0o755); err != nil {
		t.Fatal(err)
	}

	_, err := discoverFromProc(filepath.Dir(processRoot), 4242)
	if err == nil || errors.Is(err, ErrNotReady) {
		t.Fatalf("discoverFromProc() error = %v, want actionable descriptor error", err)
	}
}

func TestDiscoverFromProcTreatsDisappearedProcessAsNotReady(t *testing.T) {
	_, err := discoverFromProc(t.TempDir(), 4242)
	if !errors.Is(err, ErrNotReady) {
		t.Fatalf("discoverFromProc() error = %v, want ErrNotReady", err)
	}
}

func TestClassifySnapshotErrorPreservesPermissionFailure(t *testing.T) {
	err := classifySnapshotError("read descriptors", os.ErrPermission)
	if err == nil || errors.Is(err, ErrNotReady) || !errors.Is(err, os.ErrPermission) {
		t.Fatalf("classifySnapshotError() = %v, want wrapped permission error", err)
	}
}

func TestDiscoverFromProcRejectsListenerLostBeforeRevalidation(t *testing.T) {
	processRoot := filepath.Join(t.TempDir(), "4242")
	if err := os.MkdirAll(filepath.Join(processRoot, "net"), 0o755); err != nil {
		t.Fatal(err)
	}
	copyFixture(t, "testdata/tcp", filepath.Join(processRoot, "net", "tcp"))
	copyFixture(t, "testdata/tcp6", filepath.Join(processRoot, "net", "tcp6"))

	reads := 0
	readInodes := func(string) (map[string]struct{}, error) {
		reads++
		if reads == 1 {
			return map[string]struct{}{"11111": {}}, nil
		}
		return map[string]struct{}{}, nil
	}
	_, err := discoverFromProcWithSocketReader(filepath.Dir(processRoot), 4242, readInodes)
	if !errors.Is(err, ErrNotReady) {
		t.Fatalf("discoverFromProcWithSocketReader() error = %v, want ErrNotReady", err)
	}
}

func TestDiscoverFindsDirectChildListener(t *testing.T) {
	if os.Getenv("BELLHOP_DISCOVERY_HELPER") == "1" {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		fmt.Fprintln(os.Stdout, "ready")
		connection, err := listener.Accept()
		if err != nil {
			os.Exit(3)
		}
		_ = connection.Close()
		_ = listener.Close()
		os.Exit(0)
	}

	command := exec.Command(os.Args[0], "-test.run=^TestDiscoverFindsDirectChildListener$")
	command.Env = append(os.Environ(), "BELLHOP_DISCOVERY_HELPER=1")
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = command.Process.Kill()
		_ = command.Wait()
	})
	if line, err := bufio.NewReader(stdout).ReadString('\n'); err != nil || line != "ready\n" {
		t.Fatalf("helper readiness = %q, %v", line, err)
	}

	var address string
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		address, err = Discover(command.Process.Pid)
		if err == nil {
			break
		}
		if !isNotReady(err) {
			t.Fatalf("Discover() error = %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("Discover() did not find child listener: %v", err)
	}
	connection, err := net.DialTimeout("tcp", address, time.Second)
	if err != nil {
		t.Fatalf("dial discovered address %q: %v", address, err)
	}
	_ = connection.Close()
}

func TestDiscoverExitedProcessIsNotReady(t *testing.T) {
	command := exec.Command(os.Args[0], "-test.run=^$")
	if err := command.Run(); err != nil {
		t.Fatal(err)
	}
	if _, err := Discover(command.ProcessState.Pid()); !isNotReady(err) {
		t.Fatalf("Discover() error = %v, want not ready", err)
	}
}

func copyFixture(t *testing.T, source string, destination string) {
	t.Helper()
	input, err := os.Open(source)
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	output, err := os.Create(destination)
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	if _, err := io.Copy(output, input); err != nil {
		t.Fatal(err)
	}
}

func isNotReady(err error) bool {
	return err == ErrNotReady
}

func encodeProcAddress(t *testing.T, host string, ipv6 bool, order binary.ByteOrder) string {
	t.Helper()
	address := net.ParseIP(host)
	if address == nil {
		t.Fatalf("parse test IP %q", host)
	}
	if ipv6 {
		address = address.To16()
	} else {
		address = address.To4()
	}
	encoded := make([]byte, len(address))
	for word := 0; word < len(address); word += 4 {
		value := binary.BigEndian.Uint32(address[word : word+4])
		order.PutUint32(encoded[word:word+4], value)
	}
	return hex.EncodeToString(encoded)
}
