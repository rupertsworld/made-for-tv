// Package supervisor owns configured child processes and the currently
// published proxy target for each mount. A monotonically increasing generation
// prevents asynchronous discovery from publishing an address after its child
// has exited or been replaced.
package supervisor

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"slices"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/discovery"
)

const (
	discoveryInterval = 20 * time.Millisecond
	restartDelay      = time.Second
	terminationGrace  = time.Second
)

// Discoverer finds a direct child's listening address.
type Discoverer func(pid int) (string, error)

// EventKind identifies a child lifecycle transition.
type EventKind uint8

const (
	ChildListening EventKind = iota + 1
	ChildExited
)

// Event describes one child lifecycle transition.
type Event struct {
	Kind         EventKind
	Mount        string
	Port         int
	RestartDelay time.Duration
}

// Target is the concurrency-safe proxy destination for one mount.
type Target struct {
	mutex      sync.RWMutex
	address    string
	generation uint64
}

// Address returns the currently published child address.
func (target *Target) Address() string {
	target.mutex.RLock()
	defer target.mutex.RUnlock()
	return target.address
}

func (target *Target) beginGeneration() uint64 {
	target.mutex.Lock()
	defer target.mutex.Unlock()
	target.generation++
	target.address = ""
	return target.generation
}

func (target *Target) publish(generation uint64, address string) {
	target.mutex.Lock()
	defer target.mutex.Unlock()
	if target.generation == generation {
		target.address = address
	}
}

func (target *Target) clear(generation uint64) {
	target.mutex.Lock()
	defer target.mutex.Unlock()
	if target.generation == generation {
		target.address = ""
	}
}

// Manager supervises all mounts until its context is cancelled.
type Manager struct {
	OnEvent        func(Event)
	mutex          sync.Mutex
	operationMutex sync.Mutex
	mounts         map[string]*mountState
	discover       Discoverer
	stopGrace      time.Duration
	context        context.Context
	cancel         context.CancelFunc
	errors         chan error
	started        bool
	shuttingDown   bool
}

type mountState struct {
	mount  config.Mount
	target *Target
	cancel context.CancelFunc
	done   chan struct{}
}

// New constructs a manager without starting child processes.
func New(mounts []config.Mount) *Manager {
	states := make(map[string]*mountState, len(mounts))
	for _, mount := range mounts {
		states[mount.Name] = &mountState{mount: mount, target: &Target{}}
	}
	return &Manager{
		mounts:    states,
		discover:  discovery.Discover,
		stopGrace: terminationGrace,
		errors:    make(chan error, 1),
	}
}

// Target returns the live destination holder for a configured mount.
func (manager *Manager) Target(name string) (*Target, bool) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	state, exists := manager.mounts[name]
	if !exists {
		return nil, false
	}
	return state.target, true
}

// Errors reports persistent discovery failures that make supervision unsafe.
func (manager *Manager) Errors() <-chan error {
	return manager.errors
}

// Start launches every configured direct child. Callers deliberately invoke it
// only after Bellhop's own listener has bound successfully.
func (manager *Manager) Start(parent context.Context) {
	manager.operationMutex.Lock()
	defer manager.operationMutex.Unlock()
	manager.mutex.Lock()
	if manager.started || manager.shuttingDown {
		manager.mutex.Unlock()
		return
	}
	manager.started = true
	manager.context, manager.cancel = context.WithCancel(parent)
	for _, state := range manager.mounts {
		manager.startMountLocked(state)
	}
	manager.mutex.Unlock()
}

// Reconcile applies a complete mount set while preserving unchanged children.
// Once reconciliation begins, cancellation does not interrupt required teardown.
func (manager *Manager) Reconcile(reconcileContext context.Context, mounts []config.Mount) error {
	if err := reconcileContext.Err(); err != nil {
		return err
	}

	manager.operationMutex.Lock()
	defer manager.operationMutex.Unlock()
	if err := reconcileContext.Err(); err != nil {
		return err
	}

	requested := make(map[string]config.Mount, len(mounts))
	for _, mount := range mounts {
		requested[mount.Name] = mount
	}

	manager.mutex.Lock()
	if manager.shuttingDown {
		manager.mutex.Unlock()
		return errors.New("supervisor is shutting down")
	}
	if manager.started && manager.context.Err() != nil {
		err := manager.context.Err()
		manager.mutex.Unlock()
		return err
	}

	var stopped []*mountState
	for name, state := range manager.mounts {
		mount, exists := requested[name]
		if exists && mountsEqual(state.mount, mount) {
			continue
		}
		if state.cancel != nil {
			state.cancel()
			stopped = append(stopped, state)
		}
	}
	manager.mutex.Unlock()

	for _, state := range stopped {
		<-state.done
	}

	manager.mutex.Lock()
	defer manager.mutex.Unlock()
	if manager.started && manager.context.Err() != nil {
		return manager.context.Err()
	}
	for name, state := range manager.mounts {
		mount, exists := requested[name]
		if !exists || !mountsEqual(state.mount, mount) {
			delete(manager.mounts, name)
		}
	}
	for _, mount := range mounts {
		if _, exists := manager.mounts[mount.Name]; exists {
			continue
		}
		state := &mountState{mount: mount, target: &Target{}}
		manager.mounts[mount.Name] = state
		if manager.started {
			manager.startMountLocked(state)
		}
	}
	return nil
}

func mountsEqual(first, second config.Mount) bool {
	return first.Name == second.Name &&
		slices.Equal(first.Command, second.Command)
}

func (manager *Manager) startMountLocked(state *mountState) {
	mountContext, cancel := context.WithCancel(manager.context)
	state.cancel = cancel
	state.done = make(chan struct{})
	go func() {
		defer close(state.done)
		manager.supervise(mountContext, state.mount, state.target)
	}()
}

// Shutdown prevents restarts, sends SIGTERM to each managed process group,
// waits for the grace period, then kills the group and reaps its direct child.
func (manager *Manager) Shutdown() {
	manager.operationMutex.Lock()
	defer manager.operationMutex.Unlock()
	manager.mutex.Lock()
	if manager.shuttingDown {
		manager.mutex.Unlock()
		return
	}
	manager.shuttingDown = true
	cancel := manager.cancel
	var running []*mountState
	for _, state := range manager.mounts {
		if state.done != nil {
			running = append(running, state)
		}
	}
	manager.mutex.Unlock()
	if cancel != nil {
		cancel()
	}
	for _, state := range running {
		<-state.done
	}
}

func (manager *Manager) supervise(context context.Context, mount config.Mount, target *Target) {
	for {
		if context.Err() != nil {
			return
		}
		generation := target.beginGeneration()
		command := exec.Command(mount.Command[0], mount.Command[1:]...)
		// A dedicated process group gives Bellhop one stable target for both
		// the direct command and every descendant it starts. Command arguments
		// still pass directly to exec without shell interpretation.
		command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		if err := command.Start(); err != nil {
			if !waitForRestart(context) {
				return
			}
			continue
		}
		exited := make(chan error, 1)
		go func() {
			exited <- observeProcessExit(command.Process.Pid)
		}()

		childExited := false
		publishedAddress := ""
		var restartDeadline time.Time
		ticker := time.NewTicker(discoveryInterval)
		for !childExited {
			select {
			case <-context.Done():
				ticker.Stop()
				target.clear(generation)
				stopChild(command, exited, false, manager.stopGrace)
				return
			case observationError := <-exited:
				restartDeadline = time.Now().Add(restartDelay)
				ticker.Stop()
				target.clear(generation)
				if observationError == nil && context.Err() == nil {
					manager.reportEvent(Event{Kind: ChildExited, Mount: mount.Name, RestartDelay: restartDelay})
				}
				if observationError != nil && context.Err() == nil {
					manager.reportFatal(fmt.Errorf("observe mount %q child exit: %w", mount.Name, observationError))
				}
				stopChild(command, nil, true, manager.stopGrace)
				childExited = true
			case <-ticker.C:
				address, err := manager.discover(command.Process.Pid)
				switch {
				case err == nil:
					// Discovery can overlap child exit. Prefer the already
					// completed Wait result before making this generation
					// reachable, so a dead PID is never published.
					select {
					case observationError := <-exited:
						restartDeadline = time.Now().Add(restartDelay)
						ticker.Stop()
						target.clear(generation)
						if observationError == nil && context.Err() == nil {
							manager.reportEvent(Event{Kind: ChildExited, Mount: mount.Name, RestartDelay: restartDelay})
						}
						if observationError != nil && context.Err() == nil {
							manager.reportFatal(fmt.Errorf("observe mount %q child exit: %w", mount.Name, observationError))
						}
						stopChild(command, nil, true, manager.stopGrace)
						childExited = true
						continue
					default:
					}
					target.publish(generation, address)
					if address != publishedAddress {
						if _, portText, err := net.SplitHostPort(address); err == nil {
							if port, err := strconv.Atoi(portText); err == nil {
								manager.reportEvent(Event{Kind: ChildListening, Mount: mount.Name, Port: port})
							}
						}
						publishedAddress = address
					}
				case errors.Is(err, discovery.ErrNotReady):
					// Readiness is not permanent: a live service can replace
					// its listener. Unpublish immediately and keep polling so
					// the same generation can become ready again.
					target.clear(generation)
					publishedAddress = ""
				default:
					ticker.Stop()
					target.clear(generation)
					if context.Err() != nil {
						stopChild(command, exited, false, manager.stopGrace)
						return
					}
					manager.reportFatal(fmt.Errorf("discover mount %q child listener: %w", mount.Name, err))
					stopChild(command, exited, false, manager.stopGrace)
					return
				}
			}
		}
		if !waitForRestartDeadline(context, restartDeadline) {
			return
		}
	}
}

func (manager *Manager) reportEvent(event Event) {
	if manager.OnEvent != nil {
		manager.OnEvent(event)
	}
}

func (manager *Manager) reportFatal(err error) {
	select {
	case manager.errors <- err:
	default:
	}
	manager.mutex.Lock()
	cancel := manager.cancel
	manager.mutex.Unlock()
	if cancel != nil {
		cancel()
	}
}

func stopChild(command *exec.Cmd, exited <-chan error, exitObserved bool, grace time.Duration) {
	cleanupProcessGroup(
		grace,
		func(signal syscall.Signal) {
			_ = syscall.Kill(-command.Process.Pid, signal)
		},
		func() {
			if !exitObserved {
				<-exited
			}
		},
		func() {
			// Wait is deliberately called exactly once, after group signaling.
			// Until here the exited leader retains ownership of its PGID.
			_ = command.Wait()
		},
	)
}

func cleanupProcessGroup(
	grace time.Duration,
	signalGroup func(syscall.Signal),
	awaitExit func(),
	reap func(),
) {
	signalGroup(syscall.SIGTERM)
	timer := time.NewTimer(grace)
	defer timer.Stop()
	<-timer.C
	signalGroup(syscall.SIGKILL)
	awaitExit()
	reap()
}

func waitForRestart(context context.Context) bool {
	return waitForRestartDeadline(context, time.Now().Add(restartDelay))
}

func waitForRestartDeadline(context context.Context, deadline time.Time) bool {
	timer := time.NewTimer(remainingRestartDelay(time.Now(), deadline))
	defer timer.Stop()
	select {
	case <-context.Done():
		return false
	case <-timer.C:
		return true
	}
}

func remainingRestartDelay(now, deadline time.Time) time.Duration {
	if remaining := deadline.Sub(now); remaining > 0 {
		return remaining
	}
	return 0
}
