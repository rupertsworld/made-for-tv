package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/console"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/supervisor"
)

func TestHTTPServerDiagnosticsUseConsolePrinter(t *testing.T) {
	var output bytes.Buffer
	printer := console.New(&output, false, false)
	server := newHTTPServer(http.NotFoundHandler(), printer)
	server.ErrorLog.Print("http: temporary Accept failure\nretrying")
	if got, want := output.String(), "bellhop: http: temporary Accept failure retrying\n"; got != want {
		t.Fatalf("server diagnostic = %q, want %q", got, want)
	}
}

func TestReloadEffectPrecedesImmediateChildExit(t *testing.T) {
	var output bytes.Buffer
	printer := console.New(&output, false, false)
	lifecycle := newLifecycleOutput(printer)
	effects := reloadEffects{restarting: []string{"service"}}
	lifecycle.beginReload(effects)
	lifecycle.handle(supervisor.Event{
		Kind:         supervisor.ChildExited,
		Mount:        "service",
		RestartDelay: time.Second,
	})
	lifecycle.commitReload(effects)

	want := "  service  ○ restarting\n" +
		"  service  ○ restarting in 1s\n"
	if got := output.String(); got != want {
		t.Fatalf("reload and child output = %q, want causally ordered %q", got, want)
	}
}

func TestConfigurationHandlerOwnsOnlyTheRootIndex(t *testing.T) {
	mounts := []config.Mount{
		{Name: "files", Description: "File access", Command: []string{"files"}},
		{Name: "docs", Command: []string{"docs"}},
	}
	manager := supervisor.New(mounts)
	handler, err := composedConfigurationHandler(config.Config{Mounts: mounts}, manager)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name            string
		method          string
		path            string
		wantStatus      int
		wantContentType string
		wantAllow       string
		wantBody        string
	}{
		{
			name:            "ordered mount index",
			method:          http.MethodGet,
			path:            "/",
			wantStatus:      http.StatusOK,
			wantContentType: "application/json",
			wantBody:        `{"mounts":[{"name":"files","description":"File access"},{"name":"docs"}]}`,
		},
		{
			name:       "root rejects other methods",
			method:     http.MethodPost,
			path:       "/",
			wantStatus: http.StatusMethodNotAllowed,
			wantAllow:  http.MethodGet,
		},
		{
			name:       "configured first segment goes to proxy",
			method:     http.MethodGet,
			path:       "/docs",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "unknown first segment goes to proxy",
			method:     http.MethodGet,
			path:       "/unknown/path",
			wantStatus: http.StatusNotFound,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			if got := response.Header().Get("Content-Type"); test.wantContentType != "" && got != test.wantContentType {
				t.Errorf("Content-Type = %q, want %q", got, test.wantContentType)
			}
			if got := response.Header().Get("Allow"); got != test.wantAllow {
				t.Errorf("Allow = %q, want %q", got, test.wantAllow)
			}
			if test.wantBody != "" && response.Body.String() != test.wantBody {
				t.Errorf("body = %q, want %q", response.Body.String(), test.wantBody)
			}
		})
	}
}
