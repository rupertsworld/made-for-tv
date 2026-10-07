package proxy

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fixedTarget string

func (target fixedTarget) Address() string {
	return string(target)
}

func TestPublishedTargetDialFailureReturnsBadGateway(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}

	handler := handlerForTargets(map[string]proxyTarget{"service": fixedTarget(address)})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/service", nil))
	if response.Code != http.StatusBadGateway {
		t.Fatalf("dial failure status = %d, want 502", response.Code)
	}
}

func TestStripCORSHeaders(t *testing.T) {
	response := &http.Response{Header: http.Header{
		"Access-Control-Allow-Origin":      {"*"},
		"Access-Control-Allow-Methods":     {"GET"},
		"Access-Control-Allow-Headers":     {"Content-Type"},
		"Access-Control-Allow-Credentials": {"true"},
		"Access-Control-Expose-Headers":    {"X-Child"},
		"Access-Control-Max-Age":           {"600"},
		"access-control-private-network":   {"true"},
		"Content-Type":                     {"application/json"},
	}}

	if err := stripCORSHeaders(response); err != nil {
		t.Fatalf("stripCORSHeaders() error = %v", err)
	}
	for _, header := range []string{
		"Access-Control-Allow-Origin",
		"Access-Control-Allow-Methods",
		"Access-Control-Allow-Headers",
		"Access-Control-Allow-Credentials",
		"Access-Control-Expose-Headers",
		"Access-Control-Max-Age",
		"access-control-private-network",
	} {
		if got := response.Header.Values(header); len(got) != 0 {
			t.Errorf("%s = %q, want absent", header, got)
		}
	}
	for header := range response.Header {
		if strings.HasPrefix(strings.ToLower(header), "access-control-") {
			t.Errorf("%s remained after CORS stripping", header)
		}
	}
	if got := response.Header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want preserved", got)
	}
}
