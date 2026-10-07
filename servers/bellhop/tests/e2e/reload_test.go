package e2e

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

type reloadMount struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Command     []string `json:"command"`
}

type reloadConfiguration struct {
	Host           string        `json:"host,omitempty"`
	Port           int           `json:"port"`
	AllowedOrigins []string      `json:"allowed_origins,omitempty"`
	Mounts         []reloadMount `json:"mounts"`
}

var reloadHTTPClient = &http.Client{Timeout: time.Second}

func TestReloadAddsMountWithoutInterruptingUnchangedMount(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.json")
	startsFile := filepath.Join(directory, "starts")
	mountA := reloadTestMount(t, "a", "unchanged-a")
	mountB := reloadTestMount(t, "b", "added-b")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountA}})
	process := startReloadBellhop(t, configPath, map[string]string{"BELLHOP_HELPER_STARTS": startsFile})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	originalPID := reloadMountPID(t, port, "/a")
	if starts := waitForLines(t, startsFile, 1); len(starts) != 1 {
		t.Fatalf("initial child starts = %d, want 1", len(starts))
	}

	stopSampling := make(chan struct{})
	var samplingWait sync.WaitGroup
	var samplingMutex sync.Mutex
	var samplingErrors []string
	var stopSamplingOnce sync.Once
	stopSampler := func() {
		stopSamplingOnce.Do(func() {
			close(stopSampling)
			samplingWait.Wait()
		})
	}
	defer stopSampler()
	samplingWait.Add(1)
	go func() {
		defer samplingWait.Done()
		for {
			select {
			case <-stopSampling:
				return
			default:
			}
			status, processID, err := sampleReloadMount(port, "/a")
			if err != nil || status != http.StatusCreated || processID != originalPID {
				samplingMutex.Lock()
				samplingErrors = append(samplingErrors,
					fmt.Sprintf("status=%d pid=%d error=%v", status, processID, err))
				samplingMutex.Unlock()
			}
			time.Sleep(2 * time.Millisecond)
		}
	}()

	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountA, mountB}})
	signalReload(t, process)
	waitForRuntimeBody(t, port, "/b", "arguments=added-b")
	waitForMountIndex(t, port, []reloadMount{mountA, mountB})
	stopSampler()
	if starts := waitForLines(t, startsFile, 2); len(starts) != 2 {
		t.Fatalf("child starts after adding one mount = %d, want exactly 2", len(starts))
	}

	samplingMutex.Lock()
	defer samplingMutex.Unlock()
	if len(samplingErrors) != 0 {
		t.Fatalf("unchanged mount was interrupted during reload: %s", strings.Join(samplingErrors, "; "))
	}
	if processID := reloadMountPID(t, port, "/a"); processID != originalPID {
		t.Fatalf("unchanged mount PID = %d after reload, want %d", processID, originalPID)
	}
}

func TestReloadRemovesMountAndKillsItsChild(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	mountA := reloadTestMount(t, "a", "removed-a")
	mountB := reloadTestMount(t, "b", "retained-b")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountA, mountB}})
	process := startReloadBellhop(t, configPath, nil)
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	waitForRuntimeStatus(t, port, "/b", http.StatusCreated)
	removedPID := reloadMountPID(t, port, "/a")

	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountB}})
	signalReload(t, process)
	waitForRuntimeStatus(t, port, "/a", http.StatusNotFound)
	waitForMountIndex(t, port, []reloadMount{mountB})
	waitForProcessGone(t, removedPID)
	if response := runtimeRequest(t, port, http.MethodGet, "/b", "", nil); response.status != http.StatusCreated {
		t.Fatalf("retained mount status = %d, want 201", response.status)
	}
}

func TestReloadRestartsChangedMountWithNewCommand(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	before := reloadTestMount(t, "a", "before")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{before}})
	process := startReloadBellhop(t, configPath, map[string]string{
		"BELLHOP_HELPER_DELAY":          "400ms",
		"BELLHOP_HELPER_DELAY_ARGUMENT": "after",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeBody(t, port, "/a", "arguments=before")
	originalPID := reloadMountPID(t, port, "/a")

	after := before
	after.Command = []string{os.Args[0], "after"}
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{after}})
	signalReload(t, process)
	waitForRuntimeStatus(t, port, "/a", http.StatusServiceUnavailable)
	waitForRuntimeBody(t, port, "/a", "arguments=after")
	replacementPID := reloadMountPID(t, port, "/a")
	if replacementPID == originalPID {
		t.Fatalf("changed mount PID remained %d", originalPID)
	}
	waitForProcessGone(t, originalPID)
}

func TestReloadReportsEachMountEffect(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	unchanged := reloadTestMount(t, "same", "same")
	removed := reloadTestMount(t, "removed", "removed")
	changed := reloadTestMount(t, "changed", "before")
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port: port,
		Mounts: []reloadMount{
			unchanged,
			removed,
			changed,
		},
	})
	process := startReloadBellhop(t, configPath, nil)
	waitForListener(t, port)
	for _, mount := range []string{"same", "removed", "changed"} {
		waitForRuntimeStatus(t, port, "/"+mount, http.StatusCreated)
	}

	changed.Command = []string{os.Args[0], "after"}
	added := reloadTestMount(t, "added", "added")
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port:   port,
		Mounts: []reloadMount{unchanged, changed, added},
	})
	signalReload(t, process)
	waitForMountIndex(t, port, []reloadMount{unchanged, changed, added})
	waitForRuntimeStatus(t, port, "/removed", http.StatusNotFound)
	waitForRuntimeStatus(t, port, "/changed", http.StatusCreated)
	waitForRuntimeStatus(t, port, "/added", http.StatusCreated)
	process.stop(t)

	standardError := process.standardError.String()
	for _, line := range []string{
		"  added    ○ starting\n",
		"  removed  ○ stopped\n",
		"  changed  ○ restarting\n",
	} {
		if count := strings.Count(standardError, line); count != 1 {
			t.Errorf("stderr contains %d copies of %q, want 1: %q", count, line, standardError)
		}
	}
	if count := strings.Count(standardError, "  same     ○ starting\n"); count != 1 {
		t.Errorf("unchanged mount start lines = %d, want only its initial start: %q", count, standardError)
	}
	for _, state := range []string{"○ restarting", "○ stopped"} {
		if strings.Contains(standardError, "  same     "+state) {
			t.Errorf("unchanged mount produced a %s reload line: %q", state, standardError)
		}
	}
}

func TestReloadReportsEffectsForMissingExecutablesWithCandidateWidth(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.json")
	removed := reloadTestMount(t, "a", "removed")
	changed := reloadTestMount(t, "changed", "before")
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port:   port,
		Mounts: []reloadMount{removed, changed},
	})
	process := startReloadBellhop(t, configPath, nil)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	waitForRuntimeStatus(t, port, "/changed", http.StatusCreated)

	missingExecutable := filepath.Join(directory, "missing-executable")
	changed.Command = []string{missingExecutable}
	addedName := "very-long-missing"
	added := reloadMount{Name: addedName, Command: []string{missingExecutable}}
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port:   port,
		Mounts: []reloadMount{changed, added},
	})
	signalReload(t, process)
	waitForMountIndex(t, port, []reloadMount{changed, added})
	waitForRuntimeStatus(t, port, "/a", http.StatusNotFound)
	waitForRuntimeStatus(t, port, "/changed", http.StatusServiceUnavailable)
	waitForRuntimeStatus(t, port, "/"+addedName, http.StatusServiceUnavailable)
	process.stop(t)

	standardError := process.standardError.String()
	width := len(addedName)
	for mount, state := range map[string]string{
		"a":       "○ stopped",
		"changed": "○ restarting",
		addedName: "○ starting",
	} {
		line := fmt.Sprintf("  %-*s  %s\n", width, mount, state)
		if count := strings.Count(standardError, line); count != 1 {
			t.Errorf("stderr contains %d copies of %q, want 1: %q", count, line, standardError)
		}
	}
}

func TestReloadEffectPrecedesImmediateChildExit(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{}})
	process := startReloadBellhop(t, configPath, nil)
	waitForListener(t, port)

	mount := reloadMount{Name: "flash", Command: []string{"/bin/true"}}
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mount}})
	signalReload(t, process)
	waitForMountIndex(t, port, []reloadMount{mount})
	time.Sleep(100 * time.Millisecond)
	process.stop(t)

	standardError := process.standardError.String()
	effect := strings.Index(standardError, "  flash  ○ starting\n")
	exit := strings.Index(standardError, "  flash  ○ restarting in 1s\n")
	if effect < 0 || exit < 0 || effect > exit {
		t.Fatalf("stderr lifecycle order is not start then exit: %q", standardError)
	}
}

func TestReloadLeavesIdenticalMountRunning(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.json")
	startsFile := filepath.Join(directory, "starts")
	mount := reloadTestMount(t, "a", "identical")
	configuration := reloadConfiguration{Port: port, Mounts: []reloadMount{mount}}
	writeReloadConfiguration(t, configPath, configuration)
	process := startReloadBellhop(t, configPath, map[string]string{"BELLHOP_HELPER_STARTS": startsFile})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	originalPID := reloadMountPID(t, port, "/a")
	waitForLines(t, startsFile, 1)

	writeReloadConfiguration(t, configPath, configuration)
	signalReload(t, process)
	assertReloadMountStable(t, port, "/a", originalPID, 300*time.Millisecond)
	if starts := readLines(t, startsFile); len(starts) != 1 {
		t.Fatalf("identical mount starts = %d, want 1", len(starts))
	}
}

func TestReloadDescriptionChangeUpdatesIndexWithoutRestartingMount(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.json")
	startsFile := filepath.Join(directory, "starts")
	mount := reloadTestMount(t, "a", "description-only")
	mount.Description = "Before reload"
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mount}})
	process := startReloadBellhop(t, configPath, map[string]string{"BELLHOP_HELPER_STARTS": startsFile})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	originalPID := reloadMountPID(t, port, "/a")
	waitForLines(t, startsFile, 1)

	updated := mount
	updated.Description = "After reload"
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{updated}})
	signalReload(t, process)
	waitForMountIndex(t, port, []reloadMount{updated})
	assertReloadMountStable(t, port, "/a", originalPID, 300*time.Millisecond)
	if starts := readLines(t, startsFile); len(starts) != 1 {
		t.Fatalf("child starts after description change = %d, want 1", len(starts))
	}
}

func TestReloadReordersIndexWithoutRestartingMounts(t *testing.T) {
	port := availablePort(t)
	directory := t.TempDir()
	configPath := filepath.Join(directory, "config.json")
	startsFile := filepath.Join(directory, "starts")
	mountA := reloadTestMount(t, "a", "unchanged-a")
	mountB := reloadTestMount(t, "b", "unchanged-b")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountA, mountB}})
	process := startReloadBellhop(t, configPath, map[string]string{"BELLHOP_HELPER_STARTS": startsFile})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	waitForRuntimeStatus(t, port, "/b", http.StatusCreated)
	processA := reloadMountPID(t, port, "/a")
	processB := reloadMountPID(t, port, "/b")
	waitForLines(t, startsFile, 2)

	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mountB, mountA}})
	signalReload(t, process)
	waitForMountIndex(t, port, []reloadMount{mountB, mountA})

	if current := reloadMountPID(t, port, "/a"); current != processA {
		t.Errorf("mount a PID = %d, want unchanged %d", current, processA)
	}
	if current := reloadMountPID(t, port, "/b"); current != processB {
		t.Errorf("mount b PID = %d, want unchanged %d", current, processB)
	}
	if starts := readLines(t, startsFile); len(starts) != 2 {
		t.Errorf("child starts after reorder = %d, want 2", len(starts))
	}
}

func TestReloadInvalidConfigurationKeepsCurrentConfigurationAndLogsError(t *testing.T) {
	for _, test := range []struct {
		name    string
		content func(port int) string
	}{
		{
			name: "malformed JSON",
			content: func(int) string {
				return `{"mounts":`
			},
		},
		{
			name: "validation failure",
			content: func(port int) string {
				return fmt.Sprintf(
					`{"port":%d,"mounts":[{"name":"a","command":[]}]}`,
					port,
				)
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			port := availablePort(t)
			configPath := filepath.Join(t.TempDir(), "config.json")
			mount := reloadTestMount(t, "a", "valid")
			writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mount}})
			process := startReloadBellhop(t, configPath, nil)
			waitForListener(t, port)
			waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
			originalPID := reloadMountPID(t, port, "/a")

			if err := os.WriteFile(configPath, []byte(test.content(port)), 0o600); err != nil {
				t.Fatal(err)
			}
			signalReload(t, process)
			assertReloadMountStable(t, port, "/a", originalPID, 300*time.Millisecond)
			if response := runtimeRequest(t, port, http.MethodGet, "/unknown", "", nil); response.status != http.StatusNotFound {
				t.Fatalf("unknown route status = %d, want unchanged mount set with 404", response.status)
			}
			process.stop(t)
			standardError := process.standardError.String()
			if !strings.Contains(standardError, "previous configuration is kept") {
				t.Fatalf("stderr = %q, want reload error retention notice", standardError)
			}
		})
	}
}

func TestReloadMissingConfigurationKeepsCurrentConfigurationAndWritesNothing(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	mount := reloadTestMount(t, "a", "missing-config")
	writeReloadConfiguration(t, configPath, reloadConfiguration{Port: port, Mounts: []reloadMount{mount}})
	process := startReloadBellhop(t, configPath, nil)
	defer func() {
		if process.command.ProcessState == nil {
			process.stop(t)
		}
	}()
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	originalPID := reloadMountPID(t, port, "/a")

	if err := os.Remove(configPath); err != nil {
		t.Fatal(err)
	}
	signalReload(t, process)
	assertReloadMountStable(t, port, "/a", originalPID, 300*time.Millisecond)
	if _, err := os.Stat(configPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing config was recreated: %v", err)
	}

	process.stop(t)
	standardError := process.standardError.String()
	if !strings.Contains(standardError, "reload") || !strings.Contains(standardError, configPath) {
		t.Fatalf("stderr = %q, want reload error naming missing config", standardError)
	}
}

func TestReloadReappliesAllowedOrigins(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "config.json")
	mount := reloadTestMount(t, "a", "origins")
	oldOrigin := "https://old.example"
	newOrigin := "https://new.example"
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port: port, AllowedOrigins: []string{oldOrigin}, Mounts: []reloadMount{mount},
	})
	process := startReloadBellhop(t, configPath, nil)
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)

	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Port: port, AllowedOrigins: []string{newOrigin}, Mounts: []reloadMount{mount},
	})
	signalReload(t, process)
	waitForOriginStatus(t, port, "/a", newOrigin, http.StatusCreated)
	response := runtimeRequest(t, port, http.MethodGet, "/a", "", map[string]string{"Origin": oldOrigin})
	if response.status != http.StatusForbidden {
		t.Fatalf("removed origin status = %d, want 403", response.status)
	}
}

func TestReloadKeepsLaunchFlagOverridesSticky(t *testing.T) {
	port := availablePort(t)
	filePort := distinctAvailablePort(t, port)
	replacementPort := distinctAvailablePort(t, port, filePort)
	configPath := filepath.Join(t.TempDir(), "config.json")
	mount := reloadTestMount(t, "a", "sticky")
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Host: "192.0.2.1", Port: filePort, AllowedOrigins: []string{"https://file.example"}, Mounts: []reloadMount{mount},
	})
	process := startReloadBellhop(t, configPath, nil,
		"--host", "127.0.0.1", "--port", strconv.Itoa(port), "--allowed-origins=")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	assertAddressNotListening(t, filePort)

	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Host: "198.51.100.1", Port: replacementPort, AllowedOrigins: []string{"https://replacement.example"}, Mounts: []reloadMount{mount},
	})
	signalReload(t, process)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	assertAddressNotListening(t, replacementPort)
	for _, origin := range []string{"https://file.example", "https://replacement.example"} {
		response := runtimeRequest(t, port, http.MethodGet, "/a", "", map[string]string{"Origin": origin})
		if response.status != http.StatusForbidden {
			t.Fatalf("origin %q status = %d, want sticky empty override to reject with 403", origin, response.status)
		}
	}
}

func TestReloadLogsAndIgnoresFileHostAndPortChanges(t *testing.T) {
	port := availablePort(t)
	replacementPort := distinctAvailablePort(t, port)
	configPath := filepath.Join(t.TempDir(), "config.json")
	mount := reloadTestMount(t, "a", "address")
	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Host: "127.0.0.1", Port: port, Mounts: []reloadMount{mount},
	})
	process := startReloadBellhop(t, configPath, nil)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/a", http.StatusCreated)
	originalPID := reloadMountPID(t, port, "/a")

	writeReloadConfiguration(t, configPath, reloadConfiguration{
		Host: "192.0.2.1", Port: replacementPort, Mounts: []reloadMount{mount},
	})
	signalReload(t, process)
	assertReloadMountStable(t, port, "/a", originalPID, 300*time.Millisecond)
	assertAddressNotListening(t, replacementPort)
	process.stop(t)
	standardError := process.standardError.String()
	if !strings.Contains(standardError, "host") || !strings.Contains(standardError, "port") {
		t.Fatalf("stderr = %q, want ignored host and port change warning", standardError)
	}
}

func reloadTestMount(t *testing.T, name, behavior string) reloadMount {
	t.Helper()
	return reloadMount{Name: name, Command: []string{os.Args[0], behavior}}
}

func writeReloadConfiguration(t *testing.T, path string, configuration reloadConfiguration) {
	t.Helper()
	content, err := json.Marshal(configuration)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

func startReloadBellhop(t *testing.T, configPath string, environment map[string]string, extraArguments ...string) *bellhopProcess {
	t.Helper()
	arguments := append([]string{"--config", configPath}, extraArguments...)
	environment = copyEnvironment(environment)
	environment["BELLHOP_E2E_HELPER"] = "service"
	return startBellhop(t, arguments, environment)
}

func copyEnvironment(environment map[string]string) map[string]string {
	copied := make(map[string]string, len(environment)+1)
	for name, value := range environment {
		copied[name] = value
	}
	return copied
}

func signalReload(t *testing.T, process *bellhopProcess) {
	t.Helper()
	if err := process.command.Process.Signal(syscall.SIGHUP); err != nil {
		t.Fatalf("signal bellhop reload: %v", err)
	}
}

func reloadMountPID(t *testing.T, port int, path string) int {
	t.Helper()
	response := runtimeRequest(t, port, http.MethodGet, path, "", nil)
	if response.status != http.StatusCreated {
		t.Fatalf("GET %s status = %d, want 201", path, response.status)
	}
	processID, err := reloadResponsePID(response.body)
	if err != nil {
		t.Fatal(err)
	}
	return processID
}

func reloadResponsePID(body string) (int, error) {
	for _, line := range strings.Split(body, "\n") {
		value, found := strings.CutPrefix(line, "pid=")
		if !found {
			continue
		}
		processID, err := strconv.Atoi(value)
		if err != nil {
			return 0, fmt.Errorf("parse child PID %q: %w", value, err)
		}
		return processID, nil
	}
	return 0, errors.New("response contains no child PID")
}

func sampleReloadMount(port int, path string) (int, int, error) {
	response, err := reloadHTTPClient.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, path))
	if err != nil {
		return 0, 0, err
	}
	defer response.Body.Close()
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return response.StatusCode, 0, err
	}
	processID, err := reloadResponsePID(string(content))
	return response.StatusCode, processID, err
}

func distinctAvailablePort(t *testing.T, excluded ...int) int {
	t.Helper()
	for {
		port := availablePort(t)
		distinct := true
		for _, excludedPort := range excluded {
			if port == excludedPort {
				distinct = false
				break
			}
		}
		if distinct {
			return port
		}
	}
}

func assertAddressNotListening(t *testing.T, port int) {
	t.Helper()
	connection, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), 100*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		t.Fatalf("unexpected listener on ignored file port %d", port)
	}
}

func assertReloadMountStable(t *testing.T, port int, path string, processID int, duration time.Duration) {
	t.Helper()
	deadline := time.Now().Add(duration)
	for time.Now().Before(deadline) {
		status, currentPID, err := sampleReloadMount(port, path)
		if err != nil {
			t.Fatalf("sample unchanged mount: %v", err)
		}
		if status != http.StatusCreated {
			t.Fatalf("unchanged mount status = %d, want 201", status)
		}
		if currentPID != processID {
			t.Fatalf("unchanged mount PID = %d, want %d", currentPID, processID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitForOriginStatus(t *testing.T, port int, path, origin string, status int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response := runtimeRequest(t, port, http.MethodGet, path, "", map[string]string{"Origin": origin})
		if response.status == status {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("GET %s with Origin %s did not reach status %d", path, origin, status)
}

func waitForMountIndex(t *testing.T, port int, want []reloadMount) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		response := runtimeRequest(t, port, http.MethodGet, "/", "", nil)
		var index struct {
			Mounts []reloadMount `json:"mounts"`
		}
		if response.status == http.StatusOK &&
			json.Unmarshal([]byte(response.body), &index) == nil &&
			slices.EqualFunc(index.Mounts, want, func(actual, expected reloadMount) bool {
				return actual.Name == expected.Name && actual.Description == expected.Description
			}) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("GET / did not return mounts %v", want)
}
