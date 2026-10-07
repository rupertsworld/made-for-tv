package app

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/supervisor"
)

func TestSwappableHandlerPinsOneSnapshotForEntireRequest(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	oldHandler := http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		close(entered)
		<-release
		response.Header().Set("X-Configuration", "old")
		_, _ = response.Write([]byte("old"))
	})
	handler := newSwappableHandler(oldHandler)

	oldResponse := httptest.NewRecorder()
	oldRequestDone := make(chan struct{})
	go func() {
		handler.ServeHTTP(oldResponse, httptest.NewRequest(http.MethodGet, "/", nil))
		close(oldRequestDone)
	}()
	<-entered

	handler.Store(configurationHandler("new"))
	close(release)
	<-oldRequestDone
	assertConfigurationResponse(t, oldResponse, "old")

	newResponse := httptest.NewRecorder()
	handler.ServeHTTP(newResponse, httptest.NewRequest(http.MethodGet, "/", nil))
	assertConfigurationResponse(t, newResponse, "new")
}

func TestSwappableHandlerConcurrentRequestsObserveOnlyCompleteSnapshots(t *testing.T) {
	handler := newSwappableHandler(configurationHandler("old"))
	const requestWorkers = 8
	const requestsPerWorker = 500
	const swaps = 2000

	start := make(chan struct{})
	failures := make(chan string, requestWorkers*requestsPerWorker)
	var requests sync.WaitGroup
	for range requestWorkers {
		requests.Add(1)
		go func() {
			defer requests.Done()
			<-start
			for range requestsPerWorker {
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
				configuration := response.Header().Get("X-Configuration")
				body := response.Body.String()
				if (configuration != "old" && configuration != "new") || body != configuration {
					failures <- fmt.Sprintf("header=%q body=%q", configuration, body)
				}
			}
		}()
	}

	swappingDone := make(chan struct{})
	go func() {
		defer close(swappingDone)
		<-start
		for index := range swaps {
			configuration := "old"
			if index%2 == 0 {
				configuration = "new"
			}
			handler.Store(configurationHandler(configuration))
		}
	}()

	close(start)
	requests.Wait()
	<-swappingDone
	close(failures)
	for failure := range failures {
		t.Errorf("request observed an invalid handler snapshot: %s", failure)
	}
}

func TestComposedConfigurationHandlerRequiresEveryMountTarget(t *testing.T) {
	mount := config.Mount{Name: "service", Command: []string{"service"}}
	configuration := config.Config{Mounts: []config.Mount{mount}}
	manager := supervisor.New(nil)

	if _, err := composedConfigurationHandler(configuration, manager); err == nil {
		t.Fatal("composition without mount target succeeded")
	}

	if err := manager.Reconcile(context.Background(), []config.Mount{mount}); err != nil {
		t.Fatalf("reconcile target: %v", err)
	}
	handler, err := composedConfigurationHandler(configuration, manager)
	if err != nil {
		t.Fatalf("composition with complete targets: %v", err)
	}
	if handler == nil {
		t.Fatal("composition returned a nil handler")
	}
}

func configurationHandler(configuration string) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("X-Configuration", configuration)
		_, _ = response.Write([]byte(configuration))
	})
}

func assertConfigurationResponse(t *testing.T, response *httptest.ResponseRecorder, configuration string) {
	t.Helper()
	if got := response.Header().Get("X-Configuration"); got != configuration {
		t.Errorf("X-Configuration = %q, want %q", got, configuration)
	}
	if got := response.Body.String(); got != configuration {
		t.Errorf("body = %q, want %q", got, configuration)
	}
}
