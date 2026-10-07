// Package app composes Bellhop's HTTP relay, child supervision, configuration
// reloads, origin policy, and process-level shutdown lifecycle.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/console"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/proxy"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/supervisor"
)

// Run loads the resolved configuration path, binds Bellhop's listener, and
// serves until SIGINT or SIGTERM.
func Run(configPath string, overrides config.LaunchOverrides) error {
	printer := console.New(os.Stderr, console.IsTerminal(os.Stderr), console.ColorEnabled(os.Stderr))
	configuration, err := config.LoadWithOverrides(configPath, overrides)
	if err != nil {
		return err
	}
	address := net.JoinHostPort(configuration.Host, strconv.Itoa(configuration.Port))
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", address, err)
	}

	signals, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	reloads := make(chan os.Signal, 1)
	signal.Notify(reloads, syscall.SIGHUP)
	defer signal.Stop(reloads)

	manager := supervisor.New(configuration.Mounts)
	lifecycle := newLifecycleOutput(printer)
	manager.OnEvent = lifecycle.handle
	composed, err := composedConfigurationHandler(configuration, manager)
	if err != nil {
		_ = listener.Close()
		return err
	}
	handler := newSwappableHandler(composed)
	server := newHTTPServer(handler, printer)
	mountNames := make([]string, len(configuration.Mounts))
	for index, mount := range configuration.Mounts {
		mountNames[index] = mount.Name
	}
	printer.Startup(address, mountNames)
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- server.Serve(listener)
	}()
	manager.Start(signals)

	for {
		select {
		case err := <-serveResult:
			manager.Shutdown()
			if errors.Is(err, http.ErrServerClosed) {
				return nil
			}
			return fmt.Errorf("serve HTTP: %w", err)
		case err := <-manager.Errors():
			stopSignals()
			_ = stopApplication(server, manager, serveResult)
			return err
		case <-signals.Done():
			err := stopApplication(server, manager, serveResult)
			if err != nil && !errors.Is(err, http.ErrServerClosed) {
				return fmt.Errorf("serve HTTP: %w", err)
			}
			return nil
		case <-reloads:
			reloaded, err := reloadConfiguration(configPath, overrides, configuration, manager, lifecycle, printer)
			if err != nil {
				printer.ReloadError(err)
				continue
			}
			handler.Store(reloaded.handler)
			configuration = reloaded.configuration
		}
	}
}

type reloadEffects struct {
	stopped    []string
	starting   []string
	restarting []string
}

type lifecycleOutput struct {
	mutex          sync.Mutex
	printer        *console.Printer
	bufferedMounts map[string]struct{}
	bufferedEvents []supervisor.Event
}

func newLifecycleOutput(printer *console.Printer) *lifecycleOutput {
	return &lifecycleOutput{printer: printer}
}

func (output *lifecycleOutput) handle(event supervisor.Event) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	if _, buffered := output.bufferedMounts[event.Mount]; buffered {
		output.bufferedEvents = append(output.bufferedEvents, event)
		return
	}
	output.writeEventLocked(event)
}

func (output *lifecycleOutput) beginReload(effects reloadEffects) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	output.bufferedMounts = make(map[string]struct{}, len(effects.starting)+len(effects.restarting))
	for _, mount := range effects.starting {
		output.bufferedMounts[mount] = struct{}{}
	}
	for _, mount := range effects.restarting {
		output.bufferedMounts[mount] = struct{}{}
	}
}

func (output *lifecycleOutput) commitReload(effects reloadEffects) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	for _, mount := range effects.stopped {
		output.printer.Stopped(mount)
	}
	for _, mount := range effects.starting {
		output.printer.Starting(mount)
	}
	for _, mount := range effects.restarting {
		output.printer.Restarting(mount, 0)
	}
	output.flushReloadLocked()
}

func (output *lifecycleOutput) cancelReload() {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	output.flushReloadLocked()
}

func (output *lifecycleOutput) flushReloadLocked() {
	output.bufferedMounts = nil
	for _, event := range output.bufferedEvents {
		output.writeEventLocked(event)
	}
	output.bufferedEvents = nil
}

func (output *lifecycleOutput) writeEventLocked(event supervisor.Event) {
	switch event.Kind {
	case supervisor.ChildListening:
		output.printer.Listening(event.Mount, event.Port)
	case supervisor.ChildExited:
		output.printer.Restarting(event.Mount, event.RestartDelay)
	}
}

func newHTTPServer(handler http.Handler, printer *console.Printer) *http.Server {
	return &http.Server{
		Handler:  handler,
		ErrorLog: log.New(printer, "", 0),
	}
}

type reloadResult struct {
	configuration config.Config
	handler       http.Handler
}

func reloadConfiguration(
	configPath string,
	overrides config.LaunchOverrides,
	current config.Config,
	manager *supervisor.Manager,
	lifecycle *lifecycleOutput,
	printer *console.Printer,
) (reloadResult, error) {
	candidate, err := config.LoadExistingWithOverrides(configPath, overrides)
	if err != nil {
		return reloadResult{}, err
	}
	hostChanged := candidate.Host != current.Host
	requestedHost := candidate.Host
	if hostChanged {
		candidate.Host = current.Host
	}
	portChanged := candidate.Port != current.Port
	requestedPort := candidate.Port
	if portChanged {
		candidate.Port = current.Port
	}

	currentByName := make(map[string]config.Mount, len(current.Mounts))
	for _, mount := range current.Mounts {
		currentByName[mount.Name] = mount
	}
	candidateNames := make(map[string]struct{}, len(candidate.Mounts))
	effects := reloadEffects{}
	mountNames := make([]string, len(candidate.Mounts))
	for index, mount := range candidate.Mounts {
		mountNames[index] = mount.Name
		candidateNames[mount.Name] = struct{}{}
		previous, exists := currentByName[mount.Name]
		switch {
		case !exists:
			effects.starting = append(effects.starting, mount.Name)
		case !slices.Equal(previous.Command, mount.Command):
			effects.restarting = append(effects.restarting, mount.Name)
		}
	}
	for _, mount := range current.Mounts {
		if _, exists := candidateNames[mount.Name]; !exists {
			effects.stopped = append(effects.stopped, mount.Name)
		}
	}
	printer.ReserveMounts(mountNames)
	lifecycle.beginReload(effects)
	if err := manager.Reconcile(context.Background(), candidate.Mounts); err != nil {
		lifecycle.cancelReload()
		return reloadResult{}, fmt.Errorf("reconcile mounts: %w", err)
	}
	lifecycle.commitReload(effects)
	if hostChanged {
		printer.Error(fmt.Errorf("reload: host change from %q to %q ignored until restart", current.Host, requestedHost))
	}
	if portChanged {
		printer.Error(fmt.Errorf("reload: port change from %d to %d ignored until restart", current.Port, requestedPort))
	}
	handler, err := composedConfigurationHandler(candidate, manager)
	if err != nil {
		return reloadResult{}, err
	}
	return reloadResult{
		configuration: candidate,
		handler:       handler,
	}, nil
}

func composedConfigurationHandler(
	configuration config.Config,
	manager *supervisor.Manager,
) (http.Handler, error) {
	targets := make(map[string]*supervisor.Target, len(configuration.Mounts))
	for _, mount := range configuration.Mounts {
		target, exists := manager.Target(mount.Name)
		if !exists {
			return nil, fmt.Errorf("compose handler: mount %q has no supervisor target", mount.Name)
		}
		targets[mount.Name] = target
	}
	handler, err := indexHandler(configuration.Mounts, proxy.Handler(targets))
	if err != nil {
		return nil, fmt.Errorf("compose handler: %w", err)
	}
	return originHandler(configuration.AllowedOrigins, handler), nil
}

type handlerSnapshot struct {
	handler http.Handler
}

type swappableHandler struct {
	current atomic.Pointer[handlerSnapshot]
}

func newSwappableHandler(handler http.Handler) *swappableHandler {
	swappable := &swappableHandler{}
	swappable.Store(handler)
	return swappable
}

func (handler *swappableHandler) Store(next http.Handler) {
	handler.current.Store(&handlerSnapshot{handler: next})
}

func (handler *swappableHandler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	snapshot := handler.current.Load()
	snapshot.handler.ServeHTTP(response, request)
}

func stopApplication(server *http.Server, manager *supervisor.Manager, serveResult <-chan error) error {
	childrenStopped := make(chan struct{})
	go func() {
		manager.Shutdown()
		close(childrenStopped)
	}()

	// Child termination closes any upstream connections first, allowing active
	// proxy handlers to finish during the bounded HTTP drain.
	shutdownContext, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		_ = server.Close()
	}
	<-childrenStopped
	return <-serveResult
}

func indexHandler(mounts []config.Mount, next http.Handler) (http.Handler, error) {
	type indexMount struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
	}

	indexMounts := make([]indexMount, len(mounts))
	for index, mount := range mounts {
		indexMounts[index] = indexMount{Name: mount.Name, Description: mount.Description}
	}
	content, err := json.Marshal(struct {
		Mounts []indexMount `json:"mounts"`
	}{Mounts: indexMounts})
	if err != nil {
		return nil, err
	}

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/" {
			next.ServeHTTP(response, request)
			return
		}
		if request.Method != http.MethodGet {
			response.Header().Set("Allow", http.MethodGet)
			http.Error(response, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write(content)
	}), nil
}

func originHandler(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	var wildcardPortBases []string
	allowAny := false
	for _, origin := range allowedOrigins {
		switch {
		case origin == "*":
			allowAny = true
		case strings.HasSuffix(origin, ":*"):
			wildcardPortBases = append(wildcardPortBases, strings.TrimSuffix(origin, ":*"))
		default:
			allowed[origin] = struct{}{}
		}
	}

	originAllowed := func(origin string) bool {
		if _, exists := allowed[origin]; exists {
			return true
		}
		for _, base := range wildcardPortBases {
			if origin == base {
				return true
			}
			if strings.HasPrefix(origin, base+":") && isValidPort(origin[len(base)+1:]) {
				return true
			}
		}
		return false
	}

	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(response, request)
			return
		}

		response.Header().Add("Vary", "Origin")
		if !allowAny && !originAllowed(origin) {
			http.Error(response, http.StatusText(http.StatusForbidden), http.StatusForbidden)
			return
		}

		allowedOrigin := origin
		if allowAny {
			allowedOrigin = "*"
		}
		response.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		if request.Method == http.MethodOptions && request.Header.Get("Access-Control-Request-Method") != "" {
			response.Header().Set("Access-Control-Allow-Methods", request.Header.Get("Access-Control-Request-Method"))
			response.Header().Set("Access-Control-Allow-Headers", preflightAllowedHeaders(request.Header.Values("Access-Control-Request-Headers")))
			response.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(response, request)
	})
}

// isValidPort reports whether value is a decimal port in 1-65535, the only
// suffix a wildcard-port origin may carry. Digits are checked directly
// because strconv would also accept a sign.
func isValidPort(value string) bool {
	if value == "" {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	number, err := strconv.Atoi(value)
	return err == nil && number >= 1 && number <= 65535
}

func preflightAllowedHeaders(requestedHeaders []string) string {
	reflected := strings.Join(requestedHeaders, ", ")
	for _, value := range requestedHeaders {
		for _, header := range strings.Split(value, ",") {
			if strings.EqualFold(strings.TrimSpace(header), "Authorization") {
				return reflected
			}
		}
	}
	if reflected == "" {
		return "Authorization"
	}
	return reflected + ", Authorization"
}
