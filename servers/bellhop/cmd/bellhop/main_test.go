package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExplicitEmptyPortFailsFlagValidation(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(configPath, []byte(`{"mounts":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}

	err := run([]string{"--config", configPath, "--port="})
	if err == nil {
		t.Fatal("run succeeded, want invalid empty --port")
	}
	if !strings.Contains(err.Error(), `invalid --port ""`) {
		t.Fatalf("error = %q, want invalid empty --port", err)
	}
}

func TestExplicitEmptyHostRetainsSetProvenance(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	resolvedPath, overrides, err := parseInvocation([]string{"--config", configPath, "--host="})
	if err != nil {
		t.Fatal(err)
	}
	if resolvedPath != configPath {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, configPath)
	}
	if !overrides.HostSet || overrides.Host != "" {
		t.Fatalf("host override = %#v, want explicitly set empty host", overrides)
	}
}
