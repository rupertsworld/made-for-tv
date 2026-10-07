package e2e

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"
)

func TestRootIndexAndRouteBoundary(t *testing.T) {
	port := availablePort(t)
	description := "Quoted \"text\", path C:\\files\nnext line"
	content, err := json.Marshal(map[string]any{
		"port": port,
		"mounts": []map[string]any{
			{"name": "files", "description": description, "command": []string{os.Args[0], "files"}},
			{"name": "docs", "description": "", "command": []string{os.Args[0], "docs"}},
			{"name": "scheduler", "command": []string{os.Args[0], "scheduler"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	process := startBellhop(t, []string{"--config", configPath}, map[string]string{
		"BELLHOP_E2E_HELPER": "service",
	})
	defer process.stop(t)
	waitForListener(t, port)

	index := runtimeRequest(t, port, http.MethodGet, "/", "", nil)
	if index.status != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", index.status)
	}
	if contentType := index.header.Get("Content-Type"); contentType != "application/json" {
		t.Errorf("GET / Content-Type = %q, want application/json", contentType)
	}
	if index.body != `{"mounts":[{"name":"files","description":"Quoted \"text\", path C:\\files\nnext line"},{"name":"docs"},{"name":"scheduler"}]}` {
		t.Errorf("GET / body = %q, want ordered mount list", index.body)
	}

	methodNotAllowed := runtimeRequest(t, port, http.MethodPost, "/", "", nil)
	if methodNotAllowed.status != http.StatusMethodNotAllowed {
		t.Errorf("POST / status = %d, want 405", methodNotAllowed.status)
	}
	if allow := methodNotAllowed.header.Get("Allow"); allow != http.MethodGet {
		t.Errorf("POST / Allow = %q, want GET", allow)
	}

	unknown := runtimeRequest(t, port, http.MethodGet, "/unknown/path", "", nil)
	if unknown.status != http.StatusNotFound {
		t.Errorf("GET /unknown/path status = %d, want 404", unknown.status)
	}

	waitForRuntimeStatus(t, port, "/docs", http.StatusCreated)
}
