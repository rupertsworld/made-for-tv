// Package e2e verifies Bellhop's browser-origin policy through the compiled
// command, its real HTTP edge, and a supervised mount.
package e2e

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	allowedOrigin    = "https://allowed.example"
	disallowedOrigin = "https://disallowed.example"
)

func TestBrowserOriginPolicyAtHTTPServerEdge(t *testing.T) {
	port := availablePort(t)
	requestsFile := filepath.Join(t.TempDir(), "requests")
	process := startOriginBellhop(t, port, []string{allowedOrigin}, nil, requestsFile)
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	tests := []struct {
		name          string
		path          string
		origin        string
		wantStatus    int
		wantReached   bool
		wantAllow     string
		wantVary      bool
		wantBodyMatch string
	}{
		{
			name:          "allowed origin reaches mount",
			path:          "/service/allowed",
			origin:        allowedOrigin,
			wantStatus:    http.StatusCreated,
			wantReached:   true,
			wantAllow:     allowedOrigin,
			wantVary:      true,
			wantBodyMatch: "path=/allowed",
		},
		{
			name:          "allowed origin reaches index",
			path:          "/",
			origin:        allowedOrigin,
			wantStatus:    http.StatusOK,
			wantAllow:     allowedOrigin,
			wantVary:      true,
			wantBodyMatch: "service",
		},
		{
			name:        "disallowed origin cannot reach mount",
			path:        "/service/rejected",
			origin:      disallowedOrigin,
			wantStatus:  http.StatusForbidden,
			wantReached: false,
			wantVary:    true,
		},
		{
			name:       "disallowed origin cannot reach index",
			path:       "/",
			origin:     disallowedOrigin,
			wantStatus: http.StatusForbidden,
			wantVary:   true,
		},
		{
			name:          "request without origin is untouched",
			path:          "/service/no-origin",
			wantStatus:    http.StatusCreated,
			wantReached:   true,
			wantBodyMatch: "path=/no-origin",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := map[string]string{}
			if test.origin != "" {
				headers["Origin"] = test.origin
			}
			before := len(readLines(t, requestsFile))
			response := runtimeRequest(t, port, http.MethodGet, test.path, "", headers)
			if response.status != test.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", response.status, test.wantStatus, response.body)
			}
			if got := response.header.Get("Access-Control-Allow-Origin"); got != test.wantAllow {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, test.wantAllow)
			}
			if got := response.header.Get("Access-Control-Allow-Credentials"); got != "" {
				t.Errorf("Access-Control-Allow-Credentials = %q, want absent", got)
			}
			if got := headerContainsToken(response.header.Values("Vary"), "Origin"); got != test.wantVary {
				t.Errorf("Vary contains Origin = %t, want %t; Vary: %v", got, test.wantVary, response.header.Values("Vary"))
			}
			if test.wantBodyMatch != "" && !strings.Contains(response.body, test.wantBodyMatch) {
				t.Errorf("body does not contain %q: %s", test.wantBodyMatch, response.body)
			}
			after := len(readLines(t, requestsFile))
			if test.wantReached && strings.HasPrefix(test.path, "/service") && after != before+1 {
				t.Errorf("mount requests = %d after request, want %d", after, before+1)
			}
			if !test.wantReached && after != before {
				t.Errorf("mount was invoked for rejected request: count changed from %d to %d", before, after)
			}
		})
	}
}

func TestAllowedOriginPreflightIsAnsweredAtTheEdge(t *testing.T) {
	port := availablePort(t)
	requestsFile := filepath.Join(t.TempDir(), "requests")
	process := startOriginBellhop(t, port, []string{allowedOrigin}, nil, requestsFile)
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	before := len(readLines(t, requestsFile))
	response := runtimeRequest(t, port, http.MethodOptions, "/service/preflight", "", map[string]string{
		"Origin":                         allowedOrigin,
		"Access-Control-Request-Method":  http.MethodPatch,
		"Access-Control-Request-Headers": "X-Trace, Content-Type",
	})
	if response.status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", response.status, response.body)
	}
	if got := response.header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	if got := response.header.Get("Access-Control-Allow-Methods"); got != http.MethodPatch {
		t.Errorf("Access-Control-Allow-Methods = %q, want %q", got, http.MethodPatch)
	}
	for _, header := range []string{"X-Trace", "Content-Type", "Authorization"} {
		if !headerContainsToken(response.header.Values("Access-Control-Allow-Headers"), header) {
			t.Errorf("Access-Control-Allow-Headers %q does not contain %q", response.header.Values("Access-Control-Allow-Headers"), header)
		}
	}
	if !headerContainsToken(response.header.Values("Vary"), "Origin") {
		t.Errorf("Vary does not contain Origin: %v", response.header.Values("Vary"))
	}
	if got := response.header.Get("Access-Control-Allow-Credentials"); got != "" {
		t.Errorf("Access-Control-Allow-Credentials = %q, want absent", got)
	}
	if after := len(readLines(t, requestsFile)); after != before {
		t.Errorf("mount handled preflight: count changed from %d to %d", before, after)
	}
}

func TestDisallowedOriginPreflightIsRejectedBeforeMount(t *testing.T) {
	port := availablePort(t)
	requestsFile := filepath.Join(t.TempDir(), "requests")
	process := startOriginBellhop(t, port, []string{allowedOrigin}, nil, requestsFile)
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	before := len(readLines(t, requestsFile))
	response := runtimeRequest(t, port, http.MethodOptions, "/service/preflight", "", map[string]string{
		"Origin":                        disallowedOrigin,
		"Access-Control-Request-Method": http.MethodDelete,
	})
	if response.status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body: %s", response.status, response.body)
	}
	if !headerContainsToken(response.header.Values("Vary"), "Origin") {
		t.Errorf("Vary does not contain Origin: %v", response.header.Values("Vary"))
	}
	if after := len(readLines(t, requestsFile)); after != before {
		t.Errorf("mount handled rejected preflight: count changed from %d to %d", before, after)
	}
}

func TestWildcardAllowsPreviouslyUnseenOrigin(t *testing.T) {
	port := availablePort(t)
	process := startOriginBellhop(t, port, []string{"*"}, nil, "")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	response := runtimeRequest(t, port, http.MethodGet, "/service/wildcard", "", map[string]string{
		"Origin": "https://previously-unseen.example",
	})
	if response.status != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", response.status, response.body)
	}
	if got := response.header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want *", got)
	}
	if !headerContainsToken(response.header.Values("Vary"), "Origin") {
		t.Errorf("Vary does not contain Origin: %v", response.header.Values("Vary"))
	}
}

func TestWildcardPortOriginAllowsAnyPortOnItsHost(t *testing.T) {
	port := availablePort(t)
	process := startOriginBellhop(t, port, []string{"http://app.example:*"}, nil, "")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	tests := []struct {
		name       string
		origin     string
		wantStatus int
		wantAllow  string
	}{
		{
			name:       "any port on the host",
			origin:     "http://app.example:8080",
			wantStatus: http.StatusCreated,
			wantAllow:  "http://app.example:8080",
		},
		{
			name:       "no port on the host",
			origin:     "http://app.example",
			wantStatus: http.StatusCreated,
			wantAllow:  "http://app.example",
		},
		{
			name:       "different host",
			origin:     "http://app.example.evil.example:8080",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "different scheme",
			origin:     "https://app.example:8080",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "nonnumeric port suffix",
			origin:     "http://app.example:not-a-port",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "userinfo trick after port",
			origin:     "http://app.example:8080@evil.example",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "different casing of host",
			origin:     "http://APP.example:8080",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "null origin",
			origin:     "null",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := runtimeRequest(t, port, http.MethodGet, "/service/wildcard-port", "", map[string]string{"Origin": test.origin})
			if response.status != test.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", response.status, test.wantStatus, response.body)
			}
			if got := response.header.Get("Access-Control-Allow-Origin"); got != test.wantAllow {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, test.wantAllow)
			}
			if !headerContainsToken(response.header.Values("Vary"), "Origin") {
				t.Errorf("Vary does not contain Origin: %v", response.header.Values("Vary"))
			}
		})
	}
}

func TestWildcardPortOriginPreflightIsAnsweredAtTheEdge(t *testing.T) {
	port := availablePort(t)
	process := startOriginBellhop(t, port, []string{"http://app.example:*"}, nil, "")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	origin := "http://app.example:9090"
	response := runtimeRequest(t, port, http.MethodOptions, "/service/preflight", "", map[string]string{
		"Origin":                        origin,
		"Access-Control-Request-Method": "PUT",
	})
	if response.status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", response.status, response.body)
	}
	if got := response.header.Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, origin)
	}
	if got := response.header.Get("Access-Control-Allow-Methods"); got != "PUT" {
		t.Errorf("Access-Control-Allow-Methods = %q, want PUT", got)
	}
	if !headerContainsToken(response.header.Values("Vary"), "Origin") {
		t.Errorf("Vary does not contain Origin: %v", response.header.Values("Vary"))
	}
}

func TestAllowedOriginsFlagAcceptsWildcardPort(t *testing.T) {
	port := availablePort(t)
	process := startOriginBellhop(t, port, []string{allowedOrigin}, []string{"--allowed-origins", "http://flag.example:*"}, "")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	origin := "http://flag.example:5000"
	response := runtimeRequest(t, port, http.MethodGet, "/service/flag-wildcard-port", "", map[string]string{"Origin": origin})
	if response.status != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", response.status, response.body)
	}
	if got := response.header.Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, origin)
	}
}

func TestAllowedOriginsFlagOverridesFileWholesale(t *testing.T) {
	port := availablePort(t)
	flagOrigin := "https://flag.example"
	process := startOriginBellhop(t, port, []string{allowedOrigin}, []string{"--allowed-origins", flagOrigin}, "")
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	fileResponse := runtimeRequest(t, port, http.MethodGet, "/service/file-origin", "", map[string]string{"Origin": allowedOrigin})
	if fileResponse.status != http.StatusForbidden {
		t.Errorf("file origin status = %d, want 403", fileResponse.status)
	}
	flagResponse := runtimeRequest(t, port, http.MethodGet, "/service/flag-origin", "", map[string]string{"Origin": flagOrigin})
	if flagResponse.status != http.StatusCreated {
		t.Fatalf("flag origin status = %d, want 201; body: %s", flagResponse.status, flagResponse.body)
	}
	if got := flagResponse.header.Get("Access-Control-Allow-Origin"); got != flagOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, flagOrigin)
	}
}

// A mount that emits its own CORS headers must not have them reach the client:
// bellhop owns CORS at its edge, so a child's Access-Control-* headers are
// stripped from the proxied response before the edge applies its own decision.
func TestChildCORSHeadersAreStrippedAtTheEdge(t *testing.T) {
	port := availablePort(t)
	content, err := json.Marshal(map[string]any{
		"port":            port,
		"allowed_origins": []string{allowedOrigin},
		"mounts": []map[string]any{{
			"name": "service", "command": []string{os.Args[0]},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	process := startBellhop(t, []string{"--config", configPath}, map[string]string{
		"BELLHOP_E2E_HELPER":       "service",
		"BELLHOP_HELPER_EMIT_CORS": "1",
	})
	defer process.stop(t)
	waitForListener(t, port)
	waitForRuntimeStatus(t, port, "/service", http.StatusCreated)

	childManaged := []string{
		"Access-Control-Allow-Methods",
		"Access-Control-Allow-Headers",
		"Access-Control-Allow-Credentials",
		"Access-Control-Expose-Headers",
		"Access-Control-Max-Age",
		"Access-Control-Private-Network",
	}

	t.Run("allowed origin sees only bellhop's edge decision", func(t *testing.T) {
		response := runtimeRequest(t, port, http.MethodGet, "/service/cors", "", map[string]string{"Origin": allowedOrigin})
		if response.status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body: %s", response.status, response.body)
		}
		// Exactly one value, bellhop's own — not the child's, and not both. The
		// edge Sets its value while ReverseProxy Adds the child's, so a leak
		// shows up as two Access-Control-Allow-Origin values on the wire.
		if got := response.header.Values("Access-Control-Allow-Origin"); len(got) != 1 || got[0] != allowedOrigin {
			t.Errorf("Access-Control-Allow-Origin = %v, want exactly [%q]", got, allowedOrigin)
		}
		for _, header := range childManaged {
			if got := response.header.Values(header); len(got) != 0 {
				t.Errorf("%s = %v, want absent (child's header must not leak)", header, got)
			}
		}
		// Only CORS headers are stripped: an ordinary upstream header still passes.
		if got := response.header.Get("X-Upstream"); got != "preserved" {
			t.Errorf("X-Upstream = %q, want %q (non-CORS headers must pass through)", got, "preserved")
		}
	})

	t.Run("request without origin gets no leaked CORS header", func(t *testing.T) {
		// No Origin means the edge adds no CORS header at all; the child's must
		// still be gone, so a browser can never rely on the mount's own policy.
		response := runtimeRequest(t, port, http.MethodGet, "/service/no-origin", "", nil)
		if response.status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body: %s", response.status, response.body)
		}
		for _, header := range append([]string{"Access-Control-Allow-Origin"}, childManaged...) {
			if got := response.header.Values(header); len(got) != 0 {
				t.Errorf("%s = %v, want absent", header, got)
			}
		}
		if got := response.header.Get("X-Upstream"); got != "preserved" {
			t.Errorf("X-Upstream = %q, want %q (non-CORS headers must pass through)", got, "preserved")
		}
	})
}

func startOriginBellhop(t *testing.T, port int, allowedOrigins []string, extraArguments []string, requestsFile string) *bellhopProcess {
	t.Helper()
	content, err := json.Marshal(map[string]any{
		"port":            port,
		"allowed_origins": allowedOrigins,
		"mounts": []map[string]any{{
			"name": "service", "command": []string{os.Args[0]},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	configPath := writeConfig(t, t.TempDir(), "config.json", string(content))
	arguments := append([]string{"--config", configPath}, extraArguments...)
	return startBellhop(t, arguments, map[string]string{
		"BELLHOP_E2E_HELPER":      "service",
		"BELLHOP_HELPER_REQUESTS": requestsFile,
	})
}

func headerContainsToken(values []string, want string) bool {
	for _, value := range values {
		for _, token := range strings.Split(value, ",") {
			if strings.EqualFold(strings.TrimSpace(token), want) {
				return true
			}
		}
	}
	return false
}
