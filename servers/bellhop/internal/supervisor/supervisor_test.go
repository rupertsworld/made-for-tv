// Package supervisor tests lifecycle races at the process/discovery boundary
// with real child processes and controllable discovery results.
package supervisor

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/discovery"
)

func TestMain(testMain *testing.M) {
	if os.Getenv("BELLHOP_SUPERVISOR_HELPER") == "record-environment" {
		content := fmt.Sprintf("%s\n%s\n%s\n",
			os.Getenv("BELLHOP_URL"),
			os.Getenv("BELLHOP_STATE_DIR"),
			os.Getenv("BELLHOP_MOUNT"),
		)
		if err := os.WriteFile(os.Getenv("BELLHOP_SUPERVISOR_ENV_FILE"), []byte(content), 0o600); err != nil {
			panic(err)
		}
		select {}
	}
	if os.Getenv("BELLHOP_SUPERVISOR_HELPER") == "record-signals" {
		appendSupervisorMarker(os.Getenv("BELLHOP_SUPERVISOR_PID_FILE"), fmt.Sprint(os.Getpid()))
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, syscall.SIGTERM)
		for signal := range signals {
			appendSupervisorMarker(os.Getenv("BELLHOP_SUPERVISOR_SIGNAL_FILE"), signal.String())
		}
	}
	if os.Getenv("BELLHOP_SUPERVISOR_HELPER") == "ignore-term" {
		signal.Ignore(syscall.SIGTERM)
		if readyFile := os.Getenv("BELLHOP_SUPERVISOR_READY_FILE"); readyFile != "" {
			_ = os.WriteFile(readyFile, []byte(fmt.Sprint(os.Getpid())), 0o600)
		}
		select {}
	}
	os.Exit(testMain.Run())
}

func appendSupervisorMarker(path, value string) {
	if path == "" {
		return
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		panic(err)
	}
	if _, err := fmt.Fprintln(file, value); err != nil {
		panic(err)
	}
	if err := file.Close(); err != nil {
		panic(err)
	}
}

func TestManagerLeavesChildEnvironmentUnchanged(t *testing.T) {
	environmentFile := t.TempDir() + "/environment"
	t.Setenv("BELLHOP_SUPERVISOR_HELPER", "record-environment")
	t.Setenv("BELLHOP_SUPERVISOR_ENV_FILE", environmentFile)
	t.Setenv("BELLHOP_URL", "http://inherited.example")
	t.Setenv("BELLHOP_STATE_DIR", "/inherited/state")
	t.Setenv("BELLHOP_MOUNT", "inherited-mount")
	manager := New([]config.Mount{{Name: "service", Command: []string{os.Args[0]}}})
	manager.stopGrace = time.Millisecond
	manager.discover = func(int) (string, error) { return "127.0.0.1:1", nil }
	manager.Start(context.Background())
	defer manager.Shutdown()
	values := waitForSupervisorLines(t, environmentFile, 3)
	want := "http://inherited.example\n/inherited/state\ninherited-mount\n"
	if content := strings.Join(values, "\n") + "\n"; content != want {
		t.Fatalf("child environment = %q, want inherited %q", content, want)
	}
}

func TestManagerReportsChildLifecycleEvents(t *testing.T) {
	manager := New([]config.Mount{{Name: "service", Command: []string{"sleep", "10"}}})
	manager.stopGrace = time.Millisecond
	processIDs := make(chan int, 2)
	manager.discover = func(processID int) (string, error) {
		select {
		case processIDs <- processID:
		default:
		}
		return "127.0.0.1:4747", nil
	}
	events := make(chan Event, 10)
	manager.OnEvent = func(event Event) {
		events <- event
	}
	manager.Start(context.Background())
	t.Cleanup(manager.Shutdown)

	assertSupervisorEvent(t, events, Event{Kind: ChildListening, Mount: "service", Port: 4747})
	select {
	case event := <-events:
		t.Fatalf("duplicate listener event = %#v", event)
	case <-time.After(60 * time.Millisecond):
	}

	processID := <-processIDs
	if err := syscall.Kill(processID, syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	assertSupervisorEvent(t, events, Event{Kind: ChildExited, Mount: "service", RestartDelay: time.Second})
}

func assertSupervisorEvent(t *testing.T, events <-chan Event, want Event) {
	t.Helper()
	select {
	case event := <-events:
		if event != want {
			t.Fatalf("event = %#v, want %#v", event, want)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("event %#v was not reported", want)
	}
}

func TestExitedGenerationCannotPublishDelayedDiscoveryResult(t *testing.T) {
	manager := New([]config.Mount{{Name: "service", Command: []string{"sleep", "10"}}})
	pid := make(chan int, 1)
	release := make(chan struct{})
	manager.discover = func(processID int) (string, error) {
		pid <- processID
		<-release
		return "127.0.0.1:12345", nil
	}
	manager.Start(context.Background())

	processID := <-pid
	if err := syscall.Kill(processID, syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	// Give exec.Cmd.Wait time to publish the exit result while discovery is
	// deliberately stale, then release the obsolete address.
	time.Sleep(50 * time.Millisecond)
	close(release)
	time.Sleep(50 * time.Millisecond)

	target, _ := manager.Target("service")
	if address := target.Address(); address != "" {
		t.Errorf("target after exited generation = %q, want unavailable", address)
	}
	manager.Shutdown()
}

func TestPersistentDiscoveryFailureIsReported(t *testing.T) {
	manager := New([]config.Mount{{Name: "service", Command: []string{"sleep", "10"}}})
	manager.discover = func(int) (string, error) {
		return "", discovery.ErrUnsupported
	}
	manager.Start(context.Background())

	select {
	case err := <-manager.Errors():
		if !errors.Is(err, discovery.ErrUnsupported) {
			t.Fatalf("reported error = %v, want ErrUnsupported", err)
		}
	case <-time.After(time.Second):
		t.Fatal("persistent discovery failure was not reported")
	}
	manager.Shutdown()
}

func TestLiveChildListenerCanDisappearAndBeRepublished(t *testing.T) {
	manager := New([]config.Mount{{Name: "service", Command: []string{"sleep", "10"}}})
	var discoveryState atomic.Int32
	manager.discover = func(int) (string, error) {
		switch discoveryState.Load() {
		case 0:
			return "127.0.0.1:12345", nil
		case 1:
			return "", discovery.ErrNotReady
		case 2:
			return "127.0.0.1:23456", nil
		default:
			return "", errors.New("TCP table became unreadable")
		}
	}
	manager.Start(context.Background())
	target, _ := manager.Target("service")

	waitForSupervisorTarget(t, target, "127.0.0.1:12345")
	discoveryState.Store(1)
	waitForSupervisorTarget(t, target, "")
	discoveryState.Store(2)
	waitForSupervisorTarget(t, target, "127.0.0.1:23456")

	discoveryState.Store(3)
	select {
	case err := <-manager.Errors():
		if !strings.Contains(err.Error(), "TCP table became unreadable") {
			t.Fatalf("reported error = %v, want post-readiness discovery failure", err)
		}
	case <-time.After(time.Second):
		t.Fatal("post-readiness discovery failure was not reported")
	}
	manager.Shutdown()
}

func TestProcessGroupIsSignaledBeforeDirectChildIsReaped(t *testing.T) {
	var events []string
	cleanupProcessGroup(
		time.Millisecond,
		func(signal syscall.Signal) {
			events = append(events, signal.String())
		},
		func() {
			events = append(events, "observed")
		},
		func() {
			events = append(events, "reaped")
		},
	)
	got := strings.Join(events, ",")
	want := "terminated,killed,observed,reaped"
	if got != want {
		t.Fatalf("cleanup order = %q, want %q", got, want)
	}
}

func TestRemainingRestartDelay(t *testing.T) {
	exitTime := time.Unix(100, 0)
	deadline := exitTime.Add(time.Second)
	for _, test := range []struct {
		name string
		now  time.Time
		want time.Duration
	}{
		{name: "full window", now: exitTime, want: time.Second},
		{name: "cleanup consumed part", now: exitTime.Add(650 * time.Millisecond), want: 350 * time.Millisecond},
		{name: "cleanup consumed window", now: deadline.Add(time.Millisecond), want: 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := remainingRestartDelay(test.now, deadline); got != test.want {
				t.Fatalf("remaining delay = %s, want %s", got, test.want)
			}
		})
	}
}

func TestFatalDiscoveryIsReportedBeforeIgnoringChildIsForciblyReaped(t *testing.T) {
	readyFile := t.TempDir() + "/ready"
	t.Setenv("BELLHOP_SUPERVISOR_HELPER", "ignore-term")
	t.Setenv("BELLHOP_SUPERVISOR_READY_FILE", readyFile)
	manager := New([]config.Mount{{Name: "service", Command: []string{os.Args[0]}}})
	manager.stopGrace = 200 * time.Millisecond
	manager.discover = func(int) (string, error) {
		if err := waitForSupervisorMarker(readyFile); err != nil {
			return "", err
		}
		return "", errors.New("malformed proc table")
	}
	manager.Start(context.Background())

	select {
	case err := <-manager.Errors():
		if err == nil {
			t.Fatal("fatal discovery error is nil")
		}
	case <-time.After(time.Second):
		t.Fatal("fatal discovery was hidden behind child cleanup")
	}

	content, err := os.ReadFile(readyFile)
	if err != nil {
		t.Fatal(err)
	}
	var childPID int
	if _, err := fmt.Sscan(string(content), &childPID); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Kill(childPID, 0); err != nil {
		t.Fatalf("fatal error was not reported before forced reap: %v", err)
	}

	manager.Shutdown()
	if err := syscall.Kill(childPID, 0); !errors.Is(err, syscall.ESRCH) {
		t.Errorf("ignoring child %d still exists after shutdown: %v", childPID, err)
	}
}

func TestReconcileMounts(t *testing.T) {
	for _, test := range []struct {
		name          string
		initial       []config.Mount
		reconciled    []config.Mount
		initialTarget bool
		wantPresent   bool
		wantSameChild bool
		wantNewChild  bool
		wantOldDead   bool
	}{
		{
			name:    "add",
			initial: []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}},
			reconciled: []config.Mount{
				{Name: "sibling", Command: []string{"sleep", "10"}},
				{Name: "service", Command: []string{"sleep", "10"}},
			},
			wantPresent: true,
		},
		{
			name:          "remove",
			initial:       []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}, {Name: "service", Command: []string{"sleep", "10"}}},
			reconciled:    []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}},
			initialTarget: true,
			wantOldDead:   true,
		},
		{
			name:          "change command",
			initial:       []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}, {Name: "service", Command: []string{"sleep", "10"}}},
			reconciled:    []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}, {Name: "service", Command: []string{"sleep", "11"}}},
			initialTarget: true,
			wantPresent:   true,
			wantNewChild:  true,
			wantOldDead:   true,
		},
		{
			name:          "unchanged",
			initial:       []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}, {Name: "service", Command: []string{"sleep", "10"}}},
			reconciled:    []config.Mount{{Name: "sibling", Command: []string{"sleep", "10"}}, {Name: "service", Command: []string{"sleep", "10"}}},
			initialTarget: true,
			wantPresent:   true,
			wantSameChild: true,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			manager := New(test.initial)
			manager.stopGrace = 10 * time.Millisecond
			manager.discover = func(processID int) (string, error) {
				return strconv.Itoa(processID), nil
			}
			manager.Start(context.Background())
			t.Cleanup(manager.Shutdown)

			siblingTarget, _ := manager.Target("sibling")
			siblingPID := waitForSupervisorPID(t, siblingTarget)
			var initialTarget *Target
			var initialPID int
			if test.initialTarget {
				initialTarget, _ = manager.Target("service")
				initialPID = waitForSupervisorPID(t, initialTarget)
			}

			stopSampling := make(chan struct{})
			samplingDone := make(chan struct{})
			samplingFailure := make(chan string, 1)
			samplingReady := make(chan struct{})
			var samplingReadyOnce sync.Once
			var stopSamplingOnce sync.Once
			stopSampler := func() {
				stopSamplingOnce.Do(func() {
					close(stopSampling)
					<-samplingDone
				})
			}
			defer stopSampler()
			var sampleCount atomic.Int64
			go func() {
				defer close(samplingDone)
				for {
					select {
					case <-stopSampling:
						return
					default:
					}
					sampleCount.Add(1)
					currentTarget, exists := manager.Target("sibling")
					if !exists || currentTarget != siblingTarget || currentTarget.Address() != strconv.Itoa(siblingPID) {
						select {
						case samplingFailure <- fmt.Sprintf("exists=%t target=%p address=%q", exists, currentTarget, currentTargetAddress(currentTarget)):
						default:
						}
						continue
					}
					samplingReadyOnce.Do(func() { close(samplingReady) })
				}
			}()
			select {
			case <-samplingReady:
			case <-time.After(time.Second):
				t.Fatal("unchanged sibling sampler did not complete an initial successful sample")
			}
			if err := manager.Reconcile(context.Background(), test.reconciled); err != nil {
				t.Fatalf("Reconcile() error = %v", err)
			}
			stopSampler()
			if sampleCount.Load() == 0 {
				t.Fatal("unchanged sibling was not sampled during Reconcile")
			}
			select {
			case failure := <-samplingFailure:
				t.Fatalf("unchanged sibling was interrupted during Reconcile: %s", failure)
			default:
			}
			currentSiblingTarget, exists := manager.Target("sibling")
			if !exists || currentSiblingTarget != siblingTarget {
				t.Fatalf("unchanged sibling target = %p, present %t; want %p", currentSiblingTarget, exists, siblingTarget)
			}
			if currentSiblingPID := waitForSupervisorPID(t, currentSiblingTarget); currentSiblingPID != siblingPID {
				t.Fatalf("unchanged sibling PID = %d, want %d", currentSiblingPID, siblingPID)
			}

			reconciledTarget, present := manager.Target("service")
			if present != test.wantPresent {
				t.Fatalf("Target(service) present = %t, want %t", present, test.wantPresent)
			}
			if test.wantPresent {
				reconciledPID := waitForSupervisorPID(t, reconciledTarget)
				switch {
				case test.wantSameChild && reconciledPID != initialPID:
					t.Errorf("unchanged child PID = %d, want original %d", reconciledPID, initialPID)
				case test.wantSameChild && reconciledTarget != initialTarget:
					t.Errorf("unchanged target pointer changed from %p to %p", initialTarget, reconciledTarget)
				case test.wantNewChild && reconciledPID == initialPID:
					t.Errorf("changed child PID = original PID %d, want restart", initialPID)
				}
			}
			if test.wantOldDead {
				waitForProcessExit(t, initialPID)
			}
		})
	}
}

func TestTargetLookupIsSafeDuringReconcile(t *testing.T) {
	manager := New(nil)
	manager.stopGrace = time.Millisecond
	manager.discover = func(processID int) (string, error) {
		return strconv.Itoa(processID), nil
	}
	manager.Start(context.Background())
	t.Cleanup(manager.Shutdown)

	stopLookups := make(chan struct{})
	var lookups sync.WaitGroup
	for range 4 {
		lookups.Add(1)
		go func() {
			defer lookups.Done()
			for {
				select {
				case <-stopLookups:
					return
				default:
					target, exists := manager.Target("service")
					if exists {
						_ = target.Address()
					}
				}
			}
		}()
	}
	defer func() {
		close(stopLookups)
		lookups.Wait()
	}()

	mount := config.Mount{Name: "service", Command: []string{"sleep", "10"}}
	for range 10 {
		if err := manager.Reconcile(context.Background(), []config.Mount{mount}); err != nil {
			t.Fatal(err)
		}
		if err := manager.Reconcile(context.Background(), nil); err != nil {
			t.Fatal(err)
		}
	}
}

func TestShutdownConcurrentWithReconcileLeavesNoChildren(t *testing.T) {
	directory := t.TempDir()
	processFile := directory + "/pids"
	signalFile := directory + "/signals"
	t.Setenv("BELLHOP_SUPERVISOR_HELPER", "record-signals")
	t.Setenv("BELLHOP_SUPERVISOR_PID_FILE", processFile)
	t.Setenv("BELLHOP_SUPERVISOR_SIGNAL_FILE", signalFile)
	command := []string{os.Args[0]}
	manager := New([]config.Mount{{Name: "first", Command: command}})
	manager.stopGrace = 200 * time.Millisecond
	manager.discover = func(processID int) (string, error) {
		return strconv.Itoa(processID), nil
	}
	manager.Start(context.Background())
	first, _ := manager.Target("first")
	firstPID := waitForSupervisorPID(t, first)
	waitForSupervisorLines(t, processFile, 1)
	t.Cleanup(func() {
		manager.Shutdown()
		for _, processID := range readSupervisorPIDs(t, processFile) {
			_ = syscall.Kill(processID, syscall.SIGKILL)
		}
	})

	reconcileResult := make(chan error, 1)
	shutdownDone := make(chan struct{})
	go func() {
		reconcileResult <- manager.Reconcile(context.Background(), []config.Mount{
			{Name: "first", Command: []string{os.Args[0], "changed"}},
			{Name: "second", Command: command},
		})
	}()
	waitForSupervisorLines(t, signalFile, 1)
	go func() {
		manager.Shutdown()
		close(shutdownDone)
	}()

	select {
	case <-shutdownDone:
	case <-time.After(time.Second):
		t.Fatal("Shutdown deadlocked with Reconcile")
	}
	select {
	case err := <-reconcileResult:
		if err != nil {
			t.Fatalf("Reconcile() error = %v, want nil for work begun before shutdown", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Reconcile deadlocked with Shutdown")
	}

	processIDs := readSupervisorPIDs(t, processFile)
	if len(processIDs) < 1 {
		t.Fatal("helper recorded no child processes")
	}
	if processIDs[0] != firstPID {
		t.Fatalf("first recorded PID = %d, want discovered PID %d", processIDs[0], firstPID)
	}
	for _, processID := range processIDs {
		waitForProcessExit(t, processID)
	}
}

func waitForSupervisorMarker(path string) error {
	deadline := time.Now().Add(time.Second)
	for {
		if _, err := os.Stat(path); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("helper did not create ready marker %s", path)
		}
		time.Sleep(time.Millisecond)
	}
}

func waitForSupervisorTarget(t *testing.T, target *Target, expected string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if target.Address() == expected {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("target = %q, want %q", target.Address(), expected)
}

func waitForSupervisorPID(t *testing.T, target *Target) int {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if address := target.Address(); address != "" {
			processID, err := strconv.Atoi(address)
			if err != nil {
				t.Fatalf("target address %q is not a PID: %v", address, err)
			}
			return processID
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("target did not publish a child PID")
	return 0
}

func waitForProcessExit(t *testing.T, processID int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(processID, 0); errors.Is(err, syscall.ESRCH) {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("process %d still exists", processID)
}

func currentTargetAddress(target *Target) string {
	if target == nil {
		return ""
	}
	return target.Address()
}

func waitForSupervisorLines(t *testing.T, path string, count int) []string {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			lines := strings.Fields(string(content))
			if len(lines) >= count {
				return lines
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("file %s did not reach %d lines", path, count)
	return nil
}

func readSupervisorPIDs(t *testing.T, path string) []int {
	t.Helper()
	lines := waitForSupervisorLines(t, path, 1)
	processIDs := make([]int, 0, len(lines))
	for _, line := range lines {
		processID, err := strconv.Atoi(line)
		if err != nil {
			t.Fatalf("parse helper PID %q: %v", line, err)
		}
		processIDs = append(processIDs, processID)
	}
	return processIDs
}
