// Package e2e drives process supervision and HTTP proxying through the
// compiled Bellhop command. This file also contains the real child process
// used by those tests; TestMain selects it through BELLHOP_E2E_HELPER.
package e2e

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestTerminalOutputReportsStartupAndListeningOnlyOnStandardError(t *testing.T) {
	port := availablePort(t)
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{
			{"name": "vault", "command": []string{os.Args[0], "vault"}},
			{"name": "linear", "command": []string{os.Args[0], "linear"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	process := startBellhop(t, []string{"--config", configPath}, map[string]string{
		"BELLHOP_E2E_HELPER": "service",
	})
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/vault", http.StatusCreated)
	waitForRuntimeStatus(t, port, "/linear", http.StatusCreated)
	process.stop(t)

	if process.standardOutput.Len() != 0 {
		t.Fatalf("stdout = %q, want empty across the full run", &process.standardOutput)
	}
	standardError := process.standardError.String()
	wantStartup := fmt.Sprintf(
		"bellhop serving http://127.0.0.1:%d\n  vault   ○ starting\n  linear  ○ starting\n",
		port,
	)
	if !strings.HasPrefix(standardError, wantStartup) {
		t.Fatalf("stderr = %q, want startup prefix %q", standardError, wantStartup)
	}
	for _, mount := range []string{"vault", "linear"} {
		line := fmt.Sprintf("  %-6s  ● listening :", mount)
		if count := strings.Count(standardError, line); count != 1 {
			t.Errorf("stderr contains %d %s listening lines, want 1: %q", count, mount, standardError)
		}
	}
	if strings.Contains(standardError, "\x1b") {
		t.Fatalf("non-TTY stderr contains escape bytes: %q", standardError)
	}
}

func TestHTTPDoesNotServeBeforeStartupOutputCompletes(t *testing.T) {
	port := availablePort(t)
	longName := strings.Repeat("mount", 1_000_000)
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{{
			"name": longName, "command": []string{filepath.Join(t.TempDir(), "missing")},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	command := exec.Command(bellhopBinary, "--config", configPath)
	standardError, err := command.StderrPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	cleanedUp := false
	t.Cleanup(func() {
		if !cleanedUp {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})

	waitForTCPBind(t, port)
	responseResult := make(chan error, 1)
	go func() {
		response, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/unimplemented", port))
		if err == nil {
			_ = response.Body.Close()
		}
		responseResult <- err
	}()
	select {
	case err := <-responseResult:
		t.Fatalf("HTTP completed before startup stderr drained: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	drained := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, standardError)
		close(drained)
	}()
	select {
	case err := <-responseResult:
		if err != nil {
			t.Fatalf("HTTP after startup stderr drained: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("HTTP did not start after startup stderr drained")
	}
	if err := command.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	if err := command.Wait(); err != nil {
		t.Fatal(err)
	}
	cleanedUp = true
	<-drained
}

func waitForTCPBind(t *testing.T, port int) {
	t.Helper()
	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		connection, err := net.DialTimeout("tcp", address, 20*time.Millisecond)
		if err == nil {
			_ = connection.Close()
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("bellhop did not bind %s", address)
}

func TestMountReturnsUnavailableUntilChildListensThenProxiesTransparently(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	argumentsFile := filepath.Join(directory, "arguments.json")
	command := []string{os.Args[0], "literal;$HOME", "argument with spaces", "~/literal"}
	process := startRuntimeBellhop(t, port, command, map[string]string{
		"BELLHOP_E2E_HELPER":       "service",
		"BELLHOP_HELPER_DELAY":     "400ms",
		"BELLHOP_HELPER_ARGUMENTS": argumentsFile,
		"BELLHOP_INHERITED_MARKER": "inherited",
		"BELLHOP_URL":              "http://stale.example:9999",
		"BELLHOP_STATE_DIR":        "/stale/state",
		"BELLHOP_MOUNT":            "stale",
	})
	defer process.stop(t)

	waitForListener(t, port)
	response := runtimeRequest(t, port, http.MethodPost, "/service/a%2Fb/c?x=1%202", "request body", map[string]string{
		"X-End-To-End": "preserved",
	})
	if response.status != http.StatusServiceUnavailable {
		t.Fatalf("request before readiness status = %d, want 503", response.status)
	}

	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)
	response = runtimeRequest(t, port, http.MethodPost, "/service/a%2Fb/c?x=1%202", "request body", map[string]string{
		"X-End-To-End": "preserved",
		"Connection":   "X-Hop",
		"X-Hop":        "must not cross",
	})
	if response.status != http.StatusCreated {
		t.Fatalf("proxied status = %d, want 201; body: %s", response.status, response.body)
	}
	if response.header.Get("X-Upstream") != "preserved" {
		t.Errorf("response header was not preserved: %v", response.header)
	}
	if response.header.Get("X-Upstream-Hop") != "" {
		t.Errorf("hop-by-hop response header crossed proxy: %v", response.header)
	}
	for _, expected := range []string{
		"method=POST",
		"path=/a%2Fb/c",
		"query=x=1%202",
		"host=127.0.0.1:" + strconv.Itoa(port),
		"header=preserved",
		"hop=",
		"body=request body",
	} {
		if !strings.Contains(response.body, expected) {
			t.Errorf("proxied body does not contain %q:\n%s", expected, response.body)
		}
	}

	bare := runtimeRequest(t, port, http.MethodGet, "/service", "", nil)
	if !strings.Contains(bare.body, "path=/\n") {
		t.Errorf("bare mount did not map to root:\n%s", bare.body)
	}

	var recorded struct {
		Arguments  []string `json:"arguments"`
		Marker     string   `json:"marker"`
		BellhopURL string   `json:"bellhop_url"`
		StateDir   string   `json:"state_dir"`
		Mount      string   `json:"mount"`
	}
	waitForFile(t, argumentsFile)
	content, err := os.ReadFile(argumentsFile)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(content, &recorded); err != nil {
		t.Fatal(err)
	}
	if strings.Join(recorded.Arguments, "|") != "literal;$HOME|argument with spaces|~/literal" {
		t.Errorf("child arguments = %q, want literal command arguments", recorded.Arguments)
	}
	if recorded.Marker != "inherited" {
		t.Errorf("inherited marker = %q, want inherited", recorded.Marker)
	}
	if recorded.BellhopURL != "http://stale.example:9999" {
		t.Errorf("BELLHOP_URL = %q, want inherited value", recorded.BellhopURL)
	}
	if recorded.StateDir != "/stale/state" {
		t.Errorf("BELLHOP_STATE_DIR = %q, want inherited value", recorded.StateDir)
	}
	if recorded.Mount != "stale" {
		t.Errorf("BELLHOP_MOUNT = %q, want inherited value", recorded.Mount)
	}
}

func TestBellhopTouchesOnlyItsConfigFile(t *testing.T) {
	port := availablePort(t)
	homeDirectory := t.TempDir()
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{{
			"name": "service", "command": []string{os.Args[0]},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	writeConfig(t, homeDirectory, ".bellhop.json", string(content))
	process := startBellhop(t, nil, map[string]string{
		"BELLHOP_CONFIG":     "",
		"BELLHOP_E2E_HELPER": "service",
		"HOME":               homeDirectory,
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	entries, err := os.ReadDir(homeDirectory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != ".bellhop.json" {
		names := make([]string, len(entries))
		for index, entry := range entries {
			names[index] = entry.Name()
		}
		t.Fatalf("files under HOME = %v, want only .bellhop.json", names)
	}
	for _, path := range []string{
		filepath.Join(homeDirectory, ".bellhop"),
		filepath.Join(homeDirectory, "service"),
	} {
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("unexpected Bellhop state path %s: %v", path, err)
		}
	}
}

func TestEscapedMountNamePreservesEscapedRemainingPath(t *testing.T) {
	port := availablePort(t)
	process := startNamedRuntimeBellhop(t, port, "odd name", []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER": "service",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/odd%20name", http.StatusCreated)

	response := runtimeRequest(t, port, http.MethodGet, "/odd%20name/a%2fb", "", nil)
	if response.status != http.StatusCreated {
		t.Fatalf("escaped mount response = %d, want 201", response.status)
	}
	if !strings.Contains(response.body, "path=/a%2fb\n") {
		t.Errorf("escaped remaining path was not preserved:\n%s", response.body)
	}
}

func TestListenerFailureStartsNoChildren(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	startsFile := filepath.Join(t.TempDir(), "starts")
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{{
			"name": "service", "command": []string{os.Args[0]},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	command := exec.Command(bellhopBinary, "--config", configPath)
	command.Env = mergedEnvironment(map[string]string{
		"BELLHOP_E2E_HELPER":    "service",
		"BELLHOP_HELPER_STARTS": startsFile,
	})
	var standardError bytes.Buffer
	command.Stderr = &standardError
	if err := command.Run(); err == nil {
		t.Fatal("bellhop succeeded, want listener failure")
	}
	if _, err := os.Stat(startsFile); !os.IsNotExist(err) {
		t.Errorf("child was started before listener bound; stat error: %v", err)
	}
}

func TestRoutingAndUpstreamFailureStatuses(t *testing.T) {
	port := availablePort(t)
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER": "service",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	if status := runtimeRequest(t, port, http.MethodGet, "/unknown", "", nil).status; status != http.StatusNotFound {
		t.Errorf("unknown route status = %d, want 404", status)
	}
	if status := runtimeRequest(t, port, http.MethodGet, "/service-other", "", nil).status; status != http.StatusNotFound {
		t.Errorf("partial mount match status = %d, want 404", status)
	}

	runtimeRequest(t, port, http.MethodGet, "/service/replace-listener", "", nil)
	waitForRuntimeStatus(t, port, "/service", http.StatusServiceUnavailable)
	waitForRuntimeBody(t, port, "/service", "listener-generation=2")
}

func TestProxyTransportFailureReturnsBadGateway(t *testing.T) {
	port := availablePort(t)
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER": "service",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	response := runtimeRequest(t, port, http.MethodGet, "/service/drop-connection", "", nil)
	if response.status != http.StatusBadGateway {
		t.Fatalf("dropped upstream connection status = %d, want 502", response.status)
	}
}

func TestChildExitClearsTargetAndRestartsAfterOneSecond(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	startsFile := filepath.Join(directory, "starts")
	exitsFile := filepath.Join(directory, "exits")
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER":    "service",
		"BELLHOP_HELPER_STARTS": startsFile,
		"BELLHOP_HELPER_EXITS":  exitsFile,
	})
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	runtimeRequest(t, port, http.MethodGet, "/service/exit", "", nil)
	waitForRuntimeStatus(t, port, "/service", http.StatusServiceUnavailable)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	exitTimestamp := parseTimestamp(t, waitForLines(t, exitsFile, 1)[0])
	lines := waitForLines(t, startsFile, 2)
	assertRestartWindow(t, exitTimestamp, parseTimestamp(t, lines[1]))
	process.stop(t)
	standardError := process.standardError.String()
	if count := strings.Count(standardError, "  service  ○ restarting in 1s\n"); count != 1 {
		t.Fatalf("restart lines = %d, want 1; stderr: %q", count, &process.standardError)
	}
	if count := strings.Count(standardError, "  service  ○ starting\n"); count != 1 {
		t.Fatalf("starting lines = %d, want only the startup line; stderr: %q", count, &process.standardError)
	}
}

func TestChildExitCleansOldProcessGroupBeforeRestart(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	startsFile := filepath.Join(directory, "starts")
	exitsFile := filepath.Join(directory, "exits")
	descendantPIDFile := filepath.Join(directory, "descendant-pids")
	descendantReadyFile := filepath.Join(directory, "descendant-ready")
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER":             "service",
		"BELLHOP_HELPER_STARTS":          startsFile,
		"BELLHOP_HELPER_EXITS":           exitsFile,
		"BELLHOP_DESCENDANT_PID":         descendantPIDFile,
		"BELLHOP_DESCENDANT_READY":       descendantReadyFile,
		"BELLHOP_DESCENDANT_IGNORE_TERM": "1",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)
	waitForFile(t, descendantReadyFile)
	firstDescendantPID := waitForPIDLines(t, descendantPIDFile, 1)[0]

	runtimeRequest(t, port, http.MethodGet, "/service/exit", "", nil)
	starts := waitForLines(t, startsFile, 2)
	if !processIsGone(firstDescendantPID) {
		t.Fatalf("old descendant %d was still live when the child restarted", firstDescendantPID)
	}
	assertRestartWindow(t, parseTimestamp(t, waitForLines(t, exitsFile, 1)[0]), parseTimestamp(t, starts[1]))
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)
}

func TestShutdownSignalsChildWaitsAndDoesNotRestart(t *testing.T) {
	for _, signalToSend := range []os.Signal{os.Interrupt, syscall.SIGTERM} {
		t.Run(signalToSend.String(), func(t *testing.T) {
			port := availablePort(t)
			directory := t.TempDir()
			startsFile := filepath.Join(directory, "starts")
			signalFile := filepath.Join(directory, "signal")
			process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
				"BELLHOP_E2E_HELPER":        "service",
				"BELLHOP_HELPER_STARTS":     startsFile,
				"BELLHOP_HELPER_SIGNAL":     signalFile,
				"BELLHOP_HELPER_STOP_DELAY": "150ms",
			})
			waitForListener(t, port)
			waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

			started := time.Now()
			if err := process.command.Process.Signal(signalToSend); err != nil {
				t.Fatal(err)
			}
			if err := process.command.Wait(); err != nil {
				t.Fatalf("bellhop shutdown: %v; stderr: %s", err, &process.standardError)
			}
			if elapsed := time.Since(started); elapsed < 150*time.Millisecond {
				t.Errorf("shutdown returned after %s, before cooperative child exit", elapsed)
			}
			waitForFile(t, signalFile)
			time.Sleep(1100 * time.Millisecond)
			if lines := readLines(t, startsFile); len(lines) != 1 {
				t.Errorf("child starts after shutdown = %d, want 1", len(lines))
			}
			if strings.Contains(process.standardError.String(), "○ restarting") {
				t.Errorf("shutdown emitted a restart notice: %q", &process.standardError)
			}
		})
	}
}

func TestShutdownKillsChildThatIgnoresSIGTERMWithoutRestart(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	startsFile := filepath.Join(directory, "starts")
	pidFile := filepath.Join(directory, "pid")
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER":         "service",
		"BELLHOP_HELPER_STARTS":      startsFile,
		"BELLHOP_HELPER_PID":         pidFile,
		"BELLHOP_HELPER_IGNORE_TERM": "1",
	})
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)
	waitForFile(t, pidFile)

	if err := process.command.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	if err := process.command.Wait(); err != nil {
		t.Fatalf("bellhop shutdown: %v; stderr: %s", err, &process.standardError)
	}
	childPIDText, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	childPID, err := strconv.Atoi(string(childPIDText))
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(childPID, 0); !errors.Is(err, syscall.ESRCH) {
		t.Errorf("child %d still exists after Bellhop exit: %v", childPID, err)
	}
	time.Sleep(1100 * time.Millisecond)
	if lines := readLines(t, startsFile); len(lines) != 1 {
		t.Errorf("child starts after shutdown = %d, want 1", len(lines))
	}
}

func TestShutdownKillsEntireChildProcessGroup(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	childPIDFile := filepath.Join(directory, "child-pid")
	descendantPIDFile := filepath.Join(directory, "descendant-pid")
	descendantReadyFile := filepath.Join(directory, "descendant-ready")
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER":             "service",
		"BELLHOP_HELPER_PID":             childPIDFile,
		"BELLHOP_DESCENDANT_PID":         descendantPIDFile,
		"BELLHOP_DESCENDANT_READY":       descendantReadyFile,
		"BELLHOP_DESCENDANT_IGNORE_TERM": "1",
	})
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)
	waitForFile(t, descendantReadyFile)

	if err := process.command.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	if err := process.command.Wait(); err != nil {
		t.Fatalf("bellhop shutdown: %v; stderr: %s", err, &process.standardError)
	}

	assertProcessGone(t, childPIDFile)
	assertProcessGone(t, descendantPIDFile)
}

func TestShutdownReleasesInflightHangingProxyRequest(t *testing.T) {
	port := availablePort(t)
	hangEnteredFile := filepath.Join(t.TempDir(), "hang-entered")
	process := startRuntimeBellhop(t, port, []string{os.Args[0]}, map[string]string{
		"BELLHOP_E2E_HELPER":          "service",
		"BELLHOP_HELPER_IGNORE_TERM":  "1",
		"BELLHOP_HELPER_HANG_ENTERED": hangEnteredFile,
	})
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	requestFinished := make(chan error, 1)
	go func() {
		response, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/service/hang", port))
		if err == nil {
			_ = response.Body.Close()
		}
		requestFinished <- err
	}()
	waitForFile(t, hangEnteredFile)

	if err := process.command.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	exited := make(chan error, 1)
	go func() { exited <- process.command.Wait() }()
	select {
	case err := <-exited:
		if err != nil {
			t.Fatalf("bellhop shutdown: %v; stderr: %s", err, &process.standardError)
		}
	case <-time.After(3 * time.Second):
		_ = process.command.Process.Kill()
		t.Fatal("Bellhop did not exit with an in-flight hanging proxy request")
	}
	select {
	case <-requestFinished:
	case <-time.After(time.Second):
		t.Fatal("hanging proxy request was not released")
	}
}

type runtimeResponse struct {
	status int
	header http.Header
	body   string
}

func startRuntimeBellhop(t *testing.T, port int, command []string, environment map[string]string) *bellhopProcess {
	return startNamedRuntimeBellhop(t, port, "service", command, environment)
}

func startNamedRuntimeBellhop(t *testing.T, port int, name string, command []string, environment map[string]string) *bellhopProcess {
	t.Helper()
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{{
			"name": name, "command": command,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	return startBellhop(t, []string{"--config", configPath}, environment)
}

func runtimeRequest(t *testing.T, port int, method, path, body string, headers map[string]string) runtimeResponse {
	t.Helper()
	request, err := http.NewRequest(method, fmt.Sprintf("http://127.0.0.1:%d%s", port, path), strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer response.Body.Close()
	content, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return runtimeResponse{status: response.StatusCode, header: response.Header, body: string(content)}
}

func waitForRuntimeStatus(t *testing.T, port int, path string, status int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response := runtimeRequest(t, port, http.MethodGet, path, "", nil)
		if response.status == status {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("GET %s did not reach status %d", path, status)
}

func waitForRuntimeBody(t *testing.T, port int, path, expected string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response := runtimeRequest(t, port, http.MethodGet, path, "", nil)
		if response.status == http.StatusCreated && strings.Contains(response.body, expected) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("GET %s did not return body containing %q", path, expected)
}

func assertProcessGone(t *testing.T, pidFile string) {
	t.Helper()
	content, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	processID, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil {
		t.Fatal(err)
	}
	waitForProcessGone(t, processID)
}

func waitForProcessGone(t *testing.T, processID int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if processIsGone(processID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Errorf("process %d survived Bellhop cleanup", processID)
}

func processIsGone(processID int) bool {
	if err := syscall.Kill(processID, 0); errors.Is(err, syscall.ESRCH) {
		return true
	}
	// A killed orphan can remain as a zombie until the container's PID 1
	// reaps it. It has no executable process left and therefore does not
	// survive Bellhop, despite kill(pid, 0) continuing to find its PID.
	status, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", processID))
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	if err != nil {
		return false
	}
	closeParenthesis := strings.LastIndexByte(string(status), ')')
	if closeParenthesis < 0 {
		return false
	}
	fields := strings.Fields(string(status[closeParenthesis+1:]))
	return len(fields) > 0 && fields[0] == "Z"
}

func waitForPIDLines(t *testing.T, path string, count int) []int {
	t.Helper()
	lines := waitForLines(t, path, count)
	processIDs := make([]int, len(lines))
	for index, line := range lines {
		processID, err := strconv.Atoi(line)
		if err != nil {
			t.Fatal(err)
		}
		processIDs[index] = processID
	}
	return processIDs
}

func parseTimestamp(t *testing.T, value string) int64 {
	t.Helper()
	timestamp, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	return timestamp
}

func assertRestartWindow(t *testing.T, exitTimestamp, restartTimestamp int64) {
	t.Helper()
	delay := time.Duration(restartTimestamp - exitTimestamp)
	upperBound := 1500 * time.Millisecond
	// The race runtime spends roughly another second finalizing the helper
	// process after its marker is written but before waitid can observe exit.
	// Production timing and the ordinary e2e suite retain the tight bound.
	if raceInstrumentationEnabled {
		upperBound = 2500 * time.Millisecond
	}
	if delay < time.Second || delay >= upperBound {
		t.Errorf("restart after exit = %s, want >=1s and <%s", delay, upperBound)
	}
}

func waitForFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("file %s was not created", path)
}

func waitForLines(t *testing.T, path string, count int) []string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		lines := readLines(t, path)
		if len(lines) >= count {
			return lines
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("file %s did not reach %d lines", path, count)
	return nil
}

func readLines(t *testing.T, path string) []string {
	t.Helper()
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return strings.Fields(string(content))
}

func runRuntimeHelper() {
	if os.Getenv("BELLHOP_E2E_HELPER") == "descendant" {
		runDescendantHelper()
	}
	if pidFile := os.Getenv("BELLHOP_HELPER_PID"); pidFile != "" {
		if err := os.WriteFile(pidFile, []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
			panic(err)
		}
	}
	if startsFile := os.Getenv("BELLHOP_HELPER_STARTS"); startsFile != "" {
		file, err := os.OpenFile(startsFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			panic(err)
		}
		_, _ = fmt.Fprintln(file, time.Now().UnixNano())
		_ = file.Close()
	}
	if argumentsFile := os.Getenv("BELLHOP_HELPER_ARGUMENTS"); argumentsFile != "" {
		content, _ := json.Marshal(map[string]any{
			"arguments":   os.Args[1:],
			"marker":      os.Getenv("BELLHOP_INHERITED_MARKER"),
			"bellhop_url": os.Getenv("BELLHOP_URL"),
			"state_dir":   os.Getenv("BELLHOP_STATE_DIR"),
			"mount":       os.Getenv("BELLHOP_MOUNT"),
		})
		if err := os.WriteFile(argumentsFile, content, 0o600); err != nil {
			panic(err)
		}
	}
	delayArgument := os.Getenv("BELLHOP_HELPER_DELAY_ARGUMENT")
	if delay := os.Getenv("BELLHOP_HELPER_DELAY"); delay != "" &&
		(delayArgument == "" || slices.Contains(os.Args[1:], delayArgument)) {
		duration, err := time.ParseDuration(delay)
		if err != nil {
			panic(err)
		}
		time.Sleep(duration)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	var server *http.Server
	var listenerGeneration atomic.Int32
	listenerGeneration.Store(1)
	var handler http.Handler
	handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if requestsFile := os.Getenv("BELLHOP_HELPER_REQUESTS"); requestsFile != "" {
			file, err := os.OpenFile(requestsFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
			if err != nil {
				panic(err)
			}
			_, _ = fmt.Fprintln(file, request.URL.Path)
			_ = file.Close()
		}
		switch request.URL.Path {
		case "/drop-connection":
			hijacker, supported := response.(http.Hijacker)
			if !supported {
				panic("runtime helper response does not support connection hijacking")
			}
			connection, _, err := hijacker.Hijack()
			if err != nil {
				panic(err)
			}
			_ = connection.Close()
			return
		case "/hang":
			if marker := os.Getenv("BELLHOP_HELPER_HANG_ENTERED"); marker != "" {
				file, err := os.Create(marker)
				if err != nil {
					panic(err)
				}
				if err := file.Close(); err != nil {
					panic(err)
				}
			}
			select {}
		case "/exit":
			go func() {
				time.Sleep(10 * time.Millisecond)
				if exitsFile := os.Getenv("BELLHOP_HELPER_EXITS"); exitsFile != "" {
					file, err := os.OpenFile(exitsFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
					if err != nil {
						panic(err)
					}
					_, _ = fmt.Fprintln(file, time.Now().UnixNano())
					_ = file.Close()
				}
				os.Exit(0)
			}()
		case "/replace-listener":
			go func() {
				time.Sleep(10 * time.Millisecond)
				_ = server.Close()
				// Keep the child alive without a listener long enough for
				// Bellhop to observe and unpublish the obsolete target.
				time.Sleep(150 * time.Millisecond)
				replacement, listenError := net.Listen("tcp", "127.0.0.1:0")
				if listenError != nil {
					panic(listenError)
				}
				listenerGeneration.Store(2)
				server = &http.Server{Handler: handler}
				_ = server.Serve(replacement)
			}()
		}
		content, _ := io.ReadAll(request.Body)
		if os.Getenv("BELLHOP_HELPER_EMIT_CORS") != "" {
			// A misbehaving mount that sets its own CORS headers. Bellhop owns
			// CORS at its edge and must strip these before they reach the client.
			response.Header().Set("Access-Control-Allow-Origin", "https://child.example")
			response.Header().Set("Access-Control-Allow-Methods", "DELETE")
			response.Header().Set("Access-Control-Allow-Headers", "X-Child")
			response.Header().Set("Access-Control-Allow-Credentials", "true")
			response.Header().Set("Access-Control-Expose-Headers", "X-Child")
			response.Header().Set("Access-Control-Max-Age", "600")
			response.Header().Set("Access-Control-Private-Network", "true")
		}
		response.Header().Set("X-Upstream", "preserved")
		response.Header().Set("Connection", "X-Upstream-Hop")
		response.Header().Set("X-Upstream-Hop", "must not cross")
		response.WriteHeader(http.StatusCreated)
		_, _ = fmt.Fprintf(response,
			"method=%s\npath=%s\nquery=%s\nhost=%s\nheader=%s\nhop=%s\nbody=%s\nlistener-generation=%d\npid=%d\narguments=%s\n",
			request.Method, request.URL.EscapedPath(), request.URL.RawQuery, request.Host,
			request.Header.Get("X-End-To-End"), request.Header.Get("X-Hop"), content, listenerGeneration.Load(),
			os.Getpid(), strings.Join(os.Args[1:], " "))
	})
	server = &http.Server{Handler: handler}

	if descendantPIDFile := os.Getenv("BELLHOP_DESCENDANT_PID"); descendantPIDFile != "" {
		descendant := exec.Command(os.Args[0])
		descendant.Env = mergedEnvironment(map[string]string{
			"BELLHOP_E2E_HELPER":             "descendant",
			"BELLHOP_DESCENDANT_PID":         descendantPIDFile,
			"BELLHOP_DESCENDANT_READY":       os.Getenv("BELLHOP_DESCENDANT_READY"),
			"BELLHOP_DESCENDANT_IGNORE_TERM": os.Getenv("BELLHOP_DESCENDANT_IGNORE_TERM"),
		})
		if err := descendant.Start(); err != nil {
			panic(err)
		}
	}

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM)
	go func() {
		<-signals
		if os.Getenv("BELLHOP_HELPER_IGNORE_TERM") != "" {
			select {}
		}
		if signalFile := os.Getenv("BELLHOP_HELPER_SIGNAL"); signalFile != "" {
			_ = os.WriteFile(signalFile, []byte("SIGTERM"), 0o600)
		}
		if delay := os.Getenv("BELLHOP_HELPER_STOP_DELAY"); delay != "" {
			duration, _ := time.ParseDuration(delay)
			time.Sleep(duration)
		}
		_ = server.Close()
		os.Exit(0)
	}()
	_ = server.Serve(listener)
	select {}
}

func runDescendantHelper() {
	if pidFile := os.Getenv("BELLHOP_DESCENDANT_PID"); pidFile != "" {
		file, err := os.OpenFile(pidFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			panic(err)
		}
		_, _ = fmt.Fprintln(file, os.Getpid())
		_ = file.Close()
	}
	if os.Getenv("BELLHOP_DESCENDANT_IGNORE_TERM") != "" {
		signal.Ignore(syscall.SIGTERM)
	}
	if readyFile := os.Getenv("BELLHOP_DESCENDANT_READY"); readyFile != "" {
		if err := os.WriteFile(readyFile, []byte("ready"), 0o600); err != nil {
			panic(err)
		}
	}
	select {}
}
