package config

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestParseErrorNamesConfigPathAndLine(t *testing.T) {
	for _, test := range []struct {
		name    string
		content string
		line    int
	}{
		{
			name:    "syntax error",
			content: "{\n  \"mounts\": [],\n  \"port\": nope\n}",
			line:    3,
		},
		{
			name:    "empty file",
			content: "",
			line:    1,
		},
		{
			name:    "unexpected end of file",
			content: "{\n  \"mounts\": [\n",
			line:    3,
		},
		{
			name:    "unknown field",
			content: "{\n  \"mounts\": [],\n  \"mystery\": true\n}",
			line:    3,
		},
		{
			name: "case variant root field",
			content: "{\n" +
				"  \"Mounts\": [],\n" +
				"  \"mystery\": true\n" +
				"}",
			line: 3,
		},
		{
			name: "case variant mount fields",
			content: "{\n" +
				"  \"mounts\": [{\n" +
				"    \"Name\": \"service\",\n" +
				"    \"Command\": [\"service\"],\n" +
				"    \"mystery\": true\n" +
				"  }]\n" +
				"}",
			line: 5,
		},
		{
			name: "unknown mount field after description",
			content: "{\n" +
				"  \"mounts\": [{\n" +
				"    \"name\": \"service\",\n" +
				"    \"description\": \"Service description\",\n" +
				"    \"descriptoin\": \"misspelled\",\n" +
				"    \"command\": [\"service\"]\n" +
				"  }]\n" +
				"}",
			line: 5,
		},
		{
			name: "unknown field duplicates nested key",
			content: "{\n" +
				"  \"mounts\": [{\n" +
				"    \"name\": \"nested\",\n" +
				"    \"command\": [\"service\"]\n" +
				"  }],\n" +
				"  \"name\": true\n" +
				"}",
			line: 6,
		},
		{
			name:    "escaped unknown field",
			content: "{\n  \"mounts\": [],\n  \"\\u006eame\": true\n}",
			line:    3,
		},
		{
			name: "multiline second JSON value",
			content: "{\"mounts\": []}\n" +
				"\n" +
				"{\n" +
				"  \"mounts\": []\n" +
				"}",
			line: 3,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			_, err := decode(path, []byte(test.content))
			if err == nil {
				t.Fatal("decode succeeded, want parse error")
			}
			want := `parse config "` + path + `" line ` + strconv.Itoa(test.line) + `:`
			if !strings.Contains(err.Error(), want) {
				t.Fatalf("decode error = %q, want %q", err, want)
			}
		})
	}
}

func TestDecodeMountDescription(t *testing.T) {
	for _, test := range []struct {
		name        string
		content     string
		description string
	}{
		{
			name:        "present",
			content:     `{"mounts":[{"name":"service","description":"Service description","command":["service"]}]}`,
			description: "Service description",
		},
		{
			name:    "absent",
			content: `{"mounts":[{"name":"service","command":["service"]}]}`,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			configuration, err := decode("config.json", []byte(test.content))
			if err != nil {
				t.Fatal(err)
			}
			if got := configuration.Mounts[0].Description; got != test.description {
				t.Fatalf("Description = %q, want %q", got, test.description)
			}
		})
	}
}

func TestResolvePathDefaultsToHomeFileAndIgnoresXDG(t *testing.T) {
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("BELLHOP_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(t.TempDir(), "xdg"))

	path, err := ResolvePath("")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(homeDirectory, ".bellhop.json")
	if path != want {
		t.Fatalf("ResolvePath() = %q, want %q", path, want)
	}
}

func TestResolvePathExplicitSourcesRetainPrecedence(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("BELLHOP_CONFIG", "~/environment.json")

	path, err := ResolvePath("")
	if err != nil {
		t.Fatal(err)
	}
	if want := "~/environment.json"; path != want {
		t.Fatalf("environment path = %q, want %q", path, want)
	}

	path, err = ResolvePath("~/flag.json")
	if err != nil {
		t.Fatal(err)
	}
	if want := "~/flag.json"; path != want {
		t.Fatalf("flag path = %q, want %q", path, want)
	}
}

func TestResolvePathLeavesLegacyConfigUntouched(t *testing.T) {
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("BELLHOP_CONFIG", "")
	legacyPath := filepath.Join(homeDirectory, ".config", "bellhop", "config.json")
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o700); err != nil {
		t.Fatal(err)
	}
	content := []byte(`{"mounts":[{"name":"files","command":["files"]}]}`)
	if err := os.WriteFile(legacyPath, content, 0o600); err != nil {
		t.Fatal(err)
	}

	path, err := ResolvePath("")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(homeDirectory, ".bellhop.json")
	if path != want {
		t.Fatalf("path = %q, want %q", path, want)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("new config unexpectedly exists: %v", err)
	}
	got, err := os.ReadFile(legacyPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(content) {
		t.Fatalf("legacy config = %q, want unchanged %q", got, content)
	}
}

func TestLoadReadsConcurrentWritersConfigWithoutOverwritingIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	winner := []byte(`{"host":"127.0.0.2","port":9123,"mounts":[]}`)

	configuration, err := load(path, func(name string, flag int, permission os.FileMode) (*os.File, error) {
		if name != path {
			t.Fatalf("open path = %q, want %q", name, path)
		}
		if flag != os.O_WRONLY|os.O_CREATE|os.O_EXCL {
			t.Fatalf("open flags = %d, want O_WRONLY|O_CREATE|O_EXCL", flag)
		}
		if permission != 0o600 {
			t.Fatalf("open permission = %o, want 600", permission)
		}
		if err := os.WriteFile(path, winner, 0o600); err != nil {
			t.Fatalf("write winning config: %v", err)
		}
		return nil, os.ErrExist
	})
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if configuration.Host != "127.0.0.2" || configuration.Port != 9123 {
		t.Fatalf("configuration = %#v, want concurrent writer's host and port", configuration)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if string(content) != string(winner) {
		t.Fatalf("config content = %q, want concurrent writer's %q", content, winner)
	}
}

func TestLoadExistingWithOverridesDoesNotCreateMissingConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing", "config.json")

	_, err := LoadExistingWithOverrides(path, LaunchOverrides{})
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("LoadExistingWithOverrides() error = %v, want os.ErrNotExist", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing config was created: %v", err)
	}
}

func TestLoadWithOverridesReappliesExplicitLaunchValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(
		`{"host":"127.0.0.2","port":9123,"allowed_origins":["https://file.example"],"mounts":[]}`,
	), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name       string
		overrides  LaunchOverrides
		wantHost   string
		wantPort   int
		wantOrigin string
	}{
		{
			name:       "unset values preserve file",
			wantHost:   "127.0.0.2",
			wantPort:   9123,
			wantOrigin: "https://file.example",
		},
		{
			name: "explicit values replace file",
			overrides: LaunchOverrides{
				Host:              "127.0.0.3",
				HostSet:           true,
				Port:              9456,
				PortSet:           true,
				AllowedOrigins:    []string{"https://flag.example"},
				AllowedOriginsSet: true,
			},
			wantHost:   "127.0.0.3",
			wantPort:   9456,
			wantOrigin: "https://flag.example",
		},
		{
			name: "explicit empty host remains an override",
			overrides: LaunchOverrides{
				HostSet: true,
			},
			wantPort:   9123,
			wantOrigin: "https://file.example",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			configuration, err := LoadWithOverrides(path, test.overrides)
			if err != nil {
				t.Fatal(err)
			}
			if configuration.Host != test.wantHost {
				t.Errorf("Host = %q, want %q", configuration.Host, test.wantHost)
			}
			if configuration.Port != test.wantPort {
				t.Errorf("Port = %d, want %d", configuration.Port, test.wantPort)
			}
			if len(configuration.AllowedOrigins) != 1 || configuration.AllowedOrigins[0] != test.wantOrigin {
				t.Errorf("AllowedOrigins = %v, want [%s]", configuration.AllowedOrigins, test.wantOrigin)
			}
		})
	}
}

func TestParseAllowedOriginsTreatsExplicitEmptyValueAsEmptyList(t *testing.T) {
	allowedOrigins, err := ParseAllowedOrigins("")
	if err != nil {
		t.Fatal(err)
	}
	if allowedOrigins == nil || len(allowedOrigins) != 0 {
		t.Fatalf("ParseAllowedOrigins(\"\") = %#v, want non-nil empty list", allowedOrigins)
	}
}

func TestInvalidMountNamesAreRejectedFromTheProxyRouteDomain(t *testing.T) {
	for _, name := range []string{
		".", "..", `team\service`, "team\x00service", "team\x1fservice", "team\x7fservice", "team\u0085service",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := validate(fileConfig{Mounts: &[]Mount{{
				Name: name, Command: []string{"service"},
			}}})
			if err == nil {
				t.Fatalf("validate accepted mount name %q", name)
			}
		})
	}
}

func TestMountNamedDocsNeedsOnlyACommand(t *testing.T) {
	configuration, err := validate(fileConfig{Mounts: &[]Mount{{
		Name: "docs", Command: []string{"service", "~/literal"},
	}}})
	if err != nil {
		t.Fatalf("validate mount named docs: %v", err)
	}
	want := []string{"service", "~/literal"}
	if !reflect.DeepEqual(configuration.Mounts[0].Command, want) {
		t.Fatalf("command = %#v, want literal %#v", configuration.Mounts[0].Command, want)
	}
}

func TestAllowedOriginsValidation(t *testing.T) {
	tests := []struct {
		name           string
		allowedOrigins []string
		want           []string
		wantError      bool
	}{
		{
			name:           "named origins",
			allowedOrigins: []string{"https://example.com", "http://bellhop:8770"},
			want:           []string{"https://example.com", "http://bellhop:8770"},
		},
		{
			name:           "wildcard alone",
			allowedOrigins: []string{"*"},
			want:           []string{"*"},
		},
		{
			name:           "wildcard mixed with named origin",
			allowedOrigins: []string{"*", "https://example.com"},
			wantError:      true,
		},
		{
			name:           "wildcard port",
			allowedOrigins: []string{"http://bellhop:*"},
			want:           []string{"http://bellhop:*"},
		},
		{
			name:           "wildcard port mixed with named origin",
			allowedOrigins: []string{"https://example.com", "http://bellhop:*"},
			want:           []string{"https://example.com", "http://bellhop:*"},
		},
		{
			name:           "wildcard port after explicit port",
			allowedOrigins: []string{"http://bellhop:8080:*"},
			wantError:      true,
		},
		{
			name:           "wildcard port on ipv6 host",
			allowedOrigins: []string{"http://[::1]:*"},
			want:           []string{"http://[::1]:*"},
		},
		{
			name:           "wildcard scheme",
			allowedOrigins: []string{"*://example.com:8080"},
			wantError:      true,
		},
		{
			name:           "wildcard port without host",
			allowedOrigins: []string{"http://:*"},
			wantError:      true,
		},
		{
			name:           "wildcard host",
			allowedOrigins: []string{"http://*"},
			wantError:      true,
		},
		{
			name:           "wildcard host with port",
			allowedOrigins: []string{"http://*:8080"},
			wantError:      true,
		},
		{
			name:           "wildcard host and port",
			allowedOrigins: []string{"http://*:*"},
			wantError:      true,
		},
		{
			name:           "origin with path",
			allowedOrigins: []string{"https://example.com/path"},
			wantError:      true,
		},
		{
			name:           "origin with trailing slash",
			allowedOrigins: []string{"https://example.com/"},
			wantError:      true,
		},
		{
			name:           "origin without scheme",
			allowedOrigins: []string{"example.com"},
			wantError:      true,
		},
		{
			name:           "origin with query",
			allowedOrigins: []string{"https://example.com?source=browser"},
			wantError:      true,
		},
		{
			name:           "origin with fragment",
			allowedOrigins: []string{"https://example.com#browser"},
			wantError:      true,
		},
		{
			name:           "origin with credentials",
			allowedOrigins: []string{"https://user@example.com"},
			wantError:      true,
		},
		{
			name:           "origin with nonnumeric port",
			allowedOrigins: []string{"https://example.com:not-a-port"},
			wantError:      true,
		},
		{
			name:           "origin with out of range port",
			allowedOrigins: []string{"https://example.com:65536"},
			wantError:      true,
		},
		{
			name:           "empty origin",
			allowedOrigins: []string{""},
			wantError:      true,
		},
		{
			name:           "empty explicit array",
			allowedOrigins: []string{},
			want:           []string{},
		},
		{
			name: "omitted defaults to empty",
			want: []string{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			configuration, err := validate(fileConfig{
				AllowedOrigins: test.allowedOrigins,
				Mounts:         &[]Mount{},
			})
			if test.wantError {
				if err == nil {
					t.Fatal("validate succeeded, want error")
				}
				if got := err.Error(); len(got) < len("validate config:") || got[:len("validate config:")] != "validate config:" {
					t.Fatalf("error = %q, want validate config: prefix", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("validate: %v", err)
			}
			if !reflect.DeepEqual(configuration.AllowedOrigins, test.want) {
				t.Fatalf("AllowedOrigins = %#v, want %#v", configuration.AllowedOrigins, test.want)
			}
		})
	}
}
