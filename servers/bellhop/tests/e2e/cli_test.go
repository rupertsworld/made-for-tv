// Package e2e exercises Bellhop through its compiled command-line interface.
package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

var bellhopBinary string

func TestMain(testMain *testing.M) {
	if os.Getenv("BELLHOP_E2E_HELPER") != "" {
		runRuntimeHelper()
		os.Exit(0)
	}

	temporaryDirectory, err := os.MkdirTemp("", "bellhop-e2e-")
	if err != nil {
		panic(err)
	}

	bellhopBinary = filepath.Join(temporaryDirectory, "bellhop")
	build := exec.Command("go", "build", "-o", bellhopBinary, "../../cmd/bellhop")
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	exitCode := 1
	if err := build.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "build bellhop for e2e tests:", err)
	} else {
		exitCode = testMain.Run()
	}

	// os.Exit does not run deferred calls, so cleanup must happen explicitly
	// after the suite and before returning its status to the Go test runner.
	if err := os.RemoveAll(temporaryDirectory); err != nil {
		fmt.Fprintln(os.Stderr, "remove e2e temporary directory:", err)
		exitCode = 1
	}
	os.Exit(exitCode)
}

func TestConfigPathPrecedence(t *testing.T) {
	t.Run("config flag overrides environment paths", func(t *testing.T) {
		flagPort := availablePort(t)
		environmentPort := availablePort(t)
		homePort := availablePort(t)
		directory := t.TempDir()

		flagConfig := writeConfig(t, directory, "flag.json", configWithPort(flagPort))
		environmentConfig := writeConfig(t, directory, "environment.json", configWithPort(environmentPort))
		homeDirectory := filepath.Join(directory, "home")
		writeConfig(t, homeDirectory, ".bellhop.json", configWithPort(homePort))

		process := startBellhop(t, []string{"--config", flagConfig}, map[string]string{
			"BELLHOP_CONFIG":  environmentConfig,
			"XDG_CONFIG_HOME": filepath.Join(directory, "ignored-xdg"),
			"HOME":            homeDirectory,
		})
		waitForListener(t, flagPort)
		process.stop(t)
	})

	t.Run("bellhop config overrides home", func(t *testing.T) {
		environmentPort := availablePort(t)
		homePort := availablePort(t)
		directory := t.TempDir()

		environmentConfig := writeConfig(t, directory, "environment.json", configWithPort(environmentPort))
		homeDirectory := filepath.Join(directory, "home")
		writeConfig(t, homeDirectory, ".bellhop.json", configWithPort(homePort))

		process := startBellhop(t, nil, map[string]string{
			"BELLHOP_CONFIG":  environmentConfig,
			"XDG_CONFIG_HOME": filepath.Join(directory, "ignored-xdg"),
			"HOME":            homeDirectory,
		})
		waitForListener(t, environmentPort)
		process.stop(t)
	})

	t.Run("xdg config is ignored", func(t *testing.T) {
		homePort := availablePort(t)
		directory := t.TempDir()

		xdgDirectory := filepath.Join(directory, "xdg")
		writeConfig(t, filepath.Join(xdgDirectory, "bellhop"), "config.json", configWithPort(availablePort(t)))
		homeDirectory := filepath.Join(directory, "home")
		writeConfig(t, homeDirectory, ".bellhop.json", configWithPort(homePort))

		process := startBellhop(t, nil, map[string]string{
			"BELLHOP_CONFIG":  "",
			"XDG_CONFIG_HOME": xdgDirectory,
			"HOME":            homeDirectory,
		})
		waitForListener(t, homePort)
		process.stop(t)
	})

	t.Run("home config is the fallback", func(t *testing.T) {
		port := availablePort(t)
		homeDirectory := filepath.Join(t.TempDir(), "home")
		writeConfig(t, homeDirectory, ".bellhop.json", configWithPort(port))

		process := startBellhop(t, nil, map[string]string{
			"BELLHOP_CONFIG":  "",
			"XDG_CONFIG_HOME": "",
			"HOME":            homeDirectory,
		})
		waitForListener(t, port)
		process.stop(t)
	})
}

func TestMissingConfigCreatesStarterAndStarts(t *testing.T) {
	port := availablePort(t)
	configPath := filepath.Join(t.TempDir(), "missing", "parents", "config.json")

	process := startBellhop(t, []string{"--config", configPath, "--port", strconv.Itoa(port)}, nil)
	waitForListener(t, port)
	index := runtimeRequest(t, port, http.MethodGet, "/", "", nil)
	if index.status != http.StatusOK || index.body != `{"mounts":[]}` {
		t.Errorf("starter GET / = (%d, %q), want (200, %q)", index.status, index.body, `{"mounts":[]}`)
	}
	process.stop(t)

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read starter config: %v", err)
	}
	if string(content) != `{"mounts": []}` {
		t.Fatalf("starter config = %q, want exactly %q", content, `{"mounts": []}`)
	}
}

func TestLegacyConfigIsNotMigrated(t *testing.T) {
	port := availablePort(t)
	homeDirectory := filepath.Join(t.TempDir(), "home")
	legacyPath := writeConfig(t, filepath.Join(homeDirectory, ".config", "bellhop"), "config.json", configWithPort(availablePort(t)))

	process := startBellhop(t, []string{"--port", strconv.Itoa(port)}, map[string]string{
		"BELLHOP_CONFIG":  "",
		"XDG_CONFIG_HOME": filepath.Join(homeDirectory, ".config"),
		"HOME":            homeDirectory,
	})
	waitForListener(t, port)
	process.stop(t)

	if content, err := os.ReadFile(filepath.Join(homeDirectory, ".bellhop.json")); err != nil || string(content) != `{"mounts": []}` {
		t.Fatalf("new default config = %q, err = %v", content, err)
	}
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("legacy config was moved or removed: %v", err)
	}
}

func TestTildeConfigPathIsLiteral(t *testing.T) {
	port := availablePort(t)
	workingDirectory := t.TempDir()
	configPath := writeConfig(t, filepath.Join(workingDirectory, "~", "settings"), "bellhop.json", configWithPort(port))

	process := startBellhopInDirectory(t, workingDirectory, []string{"--config", "~/settings/bellhop.json"}, map[string]string{
		"HOME": filepath.Join(t.TempDir(), "different-home"),
	})
	waitForListener(t, port)
	process.stop(t)

	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("expected existing home-relative config: %v", err)
	}
}

func TestDefaultsAndFlagOverrides(t *testing.T) {
	t.Run("defaults to localhost port 2355", func(t *testing.T) {
		configPath := writeConfig(t, t.TempDir(), "config.json", `{"mounts":[]}`)
		process := startBellhop(t, []string{"--config", configPath}, nil)
		waitForAddress(t, "127.0.0.1:2355")
		process.stop(t)
	})

	t.Run("file host and port are used", func(t *testing.T) {
		port := availablePort(t)
		configPath := writeConfig(t, t.TempDir(), "config.json", fmt.Sprintf(
			`{"host":"127.0.0.1","port":%d,"mounts":[]}`, port,
		))
		process := startBellhop(t, []string{"--config", configPath}, nil)
		waitForListener(t, port)
		process.stop(t)
	})

	t.Run("flags override file host and port", func(t *testing.T) {
		filePort := availablePort(t)
		flagPort := availablePort(t)
		configPath := writeConfig(t, t.TempDir(), "config.json", fmt.Sprintf(
			`{"host":"192.0.2.1","port":%d,"mounts":[]}`, filePort,
		))
		process := startBellhop(t, []string{
			"--config", configPath,
			"--host", "127.0.0.1",
			"--port", strconv.Itoa(flagPort),
		}, nil)
		waitForListener(t, flagPort)
		process.stop(t)
	})
}

func TestInvalidConfigurationExitsNonZero(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{name: "malformed json", content: `{"mounts":`},
		{name: "unknown field", content: `{"mounts":[],"mystery":true}`},
		{name: "missing mounts", content: `{}`},
		{name: "invalid port", content: `{"port":70000,"mounts":[]}`},
		{name: "empty name", content: mountConfig("", []string{"service"})},
		{name: "dot name", content: mountConfig(".", []string{"service"})},
		{name: "dot dot name", content: mountConfig("..", []string{"service"})},
		{name: "name containing slash", content: mountConfig("team/service", []string{"service"})},
		{name: "name containing backslash", content: mountConfig(`team\service`, []string{"service"})},
		{name: "name containing ASCII control character", content: mountConfig("team\nservice", []string{"service"})},
		{name: "name containing non ASCII control character", content: mountConfig("team\u0085service", []string{"service"})},
		{name: "empty command", content: mountConfig("service", []string{})},
		{name: "legacy docs field", content: `{"mounts":[{"name":"service","command":["service"],"docs":"/tmp/docs"}]}`},
		{name: "duplicate names", content: `{"mounts":[{"name":"service","command":["one"]},{"name":"service","command":["two"]}]}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			configPath := writeConfig(t, t.TempDir(), "config.json", test.content)
			command := exec.Command(bellhopBinary, "--config", configPath)
			var standardError bytes.Buffer
			command.Stderr = &standardError

			err := command.Run()
			if err == nil {
				t.Fatal("bellhop succeeded, want non-zero exit")
			}
			if standardError.Len() == 0 {
				t.Fatal("stderr is empty, want a clear configuration error")
			}
		})
	}
}

func TestMalformedConfigurationReportsPathAndLineOnlyOnStandardError(t *testing.T) {
	configPath := writeConfig(t, t.TempDir(), "config.json", "{\n  \"mounts\": [],\n  \"port\": nope\n}")
	command := exec.Command(bellhopBinary, "--config", configPath)
	var standardOutput bytes.Buffer
	var standardError bytes.Buffer
	command.Stdout = &standardOutput
	command.Stderr = &standardError

	if err := command.Run(); err == nil {
		t.Fatal("bellhop succeeded, want non-zero exit")
	}
	if standardOutput.Len() != 0 {
		t.Fatalf("stdout = %q, want empty", &standardOutput)
	}
	output := standardError.String()
	if !strings.HasPrefix(output, "bellhop: parse config ") ||
		!strings.Contains(output, `"`+configPath+`" line 3:`) {
		t.Fatalf("stderr = %q, want one prefixed parse error naming path and line", output)
	}
	if strings.Count(output, "\n") != 1 {
		t.Fatalf("stderr = %q, want one sentence", output)
	}
	if strings.Contains(output, "\x1b") {
		t.Fatalf("non-TTY stderr contains escape bytes: %q", output)
	}
}

func TestInvocationErrorsUseOnlyStandardError(t *testing.T) {
	for _, arguments := range [][]string{{"--help"}, {"--unknown-flag"}} {
		t.Run(strings.Join(arguments, " "), func(t *testing.T) {
			command := exec.Command(bellhopBinary, arguments...)
			var standardOutput bytes.Buffer
			var standardError bytes.Buffer
			command.Stdout = &standardOutput
			command.Stderr = &standardError

			if err := command.Run(); err == nil {
				t.Fatal("bellhop succeeded, want invocation error")
			}
			if standardOutput.Len() != 0 {
				t.Fatalf("stdout = %q, want empty", &standardOutput)
			}
			output := standardError.String()
			if !strings.HasPrefix(output, "bellhop:") || strings.Count(output, "\n") != 1 {
				t.Fatalf("stderr = %q, want one bellhop-prefixed line", output)
			}
		})
	}
}

func TestConfigReadAndCreationFailuresExitNonZero(t *testing.T) {
	t.Run("config path is a directory", func(t *testing.T) {
		command := exec.Command(bellhopBinary, "--config", t.TempDir())
		var standardError bytes.Buffer
		command.Stderr = &standardError

		if err := command.Run(); err == nil {
			t.Fatal("bellhop succeeded, want non-zero exit")
		}
		if standardError.Len() == 0 {
			t.Fatal("stderr is empty, want a clear read error")
		}
	})

	t.Run("parent path cannot be created", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(parentFile, []byte("not a directory"), 0o600); err != nil {
			t.Fatal(err)
		}
		command := exec.Command(bellhopBinary, "--config", filepath.Join(parentFile, "config.json"))
		var standardError bytes.Buffer
		command.Stderr = &standardError

		if err := command.Run(); err == nil {
			t.Fatal("bellhop succeeded, want non-zero exit")
		}
		if standardError.Len() == 0 {
			t.Fatal("stderr is empty, want a clear creation error")
		}
	})
}

func TestListenerFailureExitsNonZero(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	configPath := writeConfig(t, t.TempDir(), "config.json", configWithPort(port))
	command := exec.Command(bellhopBinary, "--config", configPath)
	var standardError bytes.Buffer
	command.Stderr = &standardError

	if err := command.Run(); err == nil {
		t.Fatal("bellhop succeeded, want non-zero exit")
	}
	if standardError.Len() == 0 {
		t.Fatal("stderr is empty, want a listener error")
	}
}

type bellhopProcess struct {
	command        *exec.Cmd
	standardOutput bytes.Buffer
	standardError  bytes.Buffer
}

func startBellhop(t *testing.T, arguments []string, environment map[string]string) *bellhopProcess {
	return startBellhopInDirectory(t, "", arguments, environment)
}

func startBellhopInDirectory(t *testing.T, directory string, arguments []string, environment map[string]string) *bellhopProcess {
	t.Helper()
	command := exec.Command(bellhopBinary, arguments...)
	command.Dir = directory
	command.Env = mergedEnvironment(environment)
	process := &bellhopProcess{command: command}
	command.Stdout = &process.standardOutput
	command.Stderr = &process.standardError
	if err := command.Start(); err != nil {
		t.Fatalf("start bellhop: %v", err)
	}
	t.Cleanup(func() {
		if command.ProcessState == nil {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})
	return process
}

func (process *bellhopProcess) stop(t *testing.T) {
	t.Helper()
	if err := process.command.Process.Signal(os.Interrupt); err != nil {
		t.Fatalf("signal bellhop: %v", err)
	}
	if err := process.command.Wait(); err != nil {
		t.Fatalf("bellhop shutdown: %v; stderr: %s", err, &process.standardError)
	}
}

func waitForListener(t *testing.T, port int) {
	t.Helper()
	waitForAddress(t, net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
}

func waitForAddress(t *testing.T, address string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get("http://" + address + "/unimplemented")
		if err == nil {
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("bellhop did not listen at %s", address)
}

func availablePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return port
}

func writeConfig(t *testing.T, directory, name, content string) string {
	t.Helper()
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func configWithPort(port int) string {
	return fmt.Sprintf(`{"port":%d,"mounts":[]}`, port)
}

func mountConfig(name string, command []string) string {
	content, err := json.Marshal(map[string]any{
		"mounts": []any{map[string]any{
			"name":    name,
			"command": command,
		}},
	})
	if err != nil {
		panic(err)
	}
	return string(content)
}

func mergedEnvironment(overrides map[string]string) []string {
	values := make(map[string]string)
	for _, entry := range os.Environ() {
		key, value, found := strings.Cut(entry, "=")
		if found {
			values[key] = value
		}
	}
	for key, value := range overrides {
		values[key] = value
	}
	environment := make([]string, 0, len(values))
	for key, value := range values {
		environment = append(environment, key+"="+value)
	}
	return environment
}
