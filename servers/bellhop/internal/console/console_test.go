package console

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStartupOutput(t *testing.T) {
	for _, test := range []struct {
		name  string
		color bool
		want  string
	}{
		{
			name: "plain",
			want: "bellhop serving http://127.0.0.1:8770\n" +
				"  vault   ○ starting\n" +
				"  linear  ○ starting\n",
		},
		{
			name:  "color",
			color: true,
			want: "\x1b[2;90mbellhop serving\x1b[0m http://127.0.0.1:8770\n" +
				"  vault   \x1b[33m○ starting\x1b[0m\n" +
				"  linear  \x1b[33m○ starting\x1b[0m\n",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			printer := New(&output, test.color, test.color)
			printer.Startup("127.0.0.1:8770", []string{"vault", "linear"})
			if got := output.String(); got != test.want {
				t.Fatalf("startup output = %q, want %q", got, test.want)
			}
		})
	}
}

func TestStartupPadsUnicodeMountNamesByCharacters(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, false, false)
	printer.Startup("127.0.0.1:8770", []string{"éé", "abc"})
	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  éé   ○ starting\n" +
		"  abc  ○ starting\n"
	if got := output.String(); got != want {
		t.Fatalf("startup output = %q, want character-aligned %q", got, want)
	}
}

func TestTerminalStartupListeningRewritesRows(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, true, true)
	printer.terminalWidth = 28
	printer.terminalHeight = 24
	printer.Startup("127.0.0.1:8770", []string{"vault", "linear"})
	printer.Listening("vault", 4747)
	printer.Listening("linear", 8080)

	want := "\x1b[2;90mbellhop serving\x1b[0m http://127.0.0.1:8770\n" +
		"  vault   \x1b[33m○ starting\x1b[0m\n" +
		"  linear  \x1b[33m○ starting\x1b[0m\n" +
		"\x1b[2A\r\x1b[2K  vault   \x1b[32m● listening\x1b[0m \x1b[2;90m:4747\x1b[0m\x1b[2B\r" +
		"\x1b[1A\r\x1b[2K  linear  \x1b[32m● listening\x1b[0m \x1b[2;90m:8080\x1b[0m\x1b[1B\r"
	if got := output.String(); got != want {
		t.Fatalf("terminal startup output = %q, want %q", got, want)
	}
}

func TestTerminalStartupRewriteFreezesAfterEveryOtherWritePath(t *testing.T) {
	tests := []struct {
		name  string
		write func(*Printer)
		line  string
	}{
		{
			name:  "error",
			write: func(printer *Printer) { printer.Error(errors.New("temporary diagnostic")) },
			line:  "bellhop: temporary diagnostic\n",
		},
		{
			name: "server error log writer",
			write: func(printer *Printer) {
				_, _ = printer.Write([]byte("http: temporary Accept failure\n"))
			},
			line: "bellhop: http: temporary Accept failure\n",
		},
		{
			name:  "reload error",
			write: func(printer *Printer) { printer.ReloadError(errors.New("invalid config")) },
			line:  "bellhop: reload: invalid config; previous configuration is kept\n",
		},
		{
			name:  "reload stopped",
			write: func(printer *Printer) { printer.Stopped("vault") },
			line:  "  vault   ○ stopped\n",
		},
		{
			name:  "reload starting",
			write: func(printer *Printer) { printer.Starting("vault") },
			line:  "  vault   ○ starting\n",
		},
		{
			name:  "reload restarting",
			write: func(printer *Printer) { printer.Restarting("vault", 0) },
			line:  "  vault   ○ restarting\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			printer := New(&output, true, false)
			printer.terminalWidth = 80
			printer.terminalHeight = 24
			printer.Startup("127.0.0.1:8770", []string{"vault", "linear"})
			test.write(printer)
			printer.Listening("linear", 8080)

			want := "bellhop serving http://127.0.0.1:8770\n" +
				"  vault   ○ starting\n" +
				"  linear  ○ starting\n" +
				test.line +
				"  linear  ● listening :8080\n"
			if got := output.String(); got != want {
				t.Fatalf("terminal output = %q, want frozen startup block %q", got, want)
			}
		})
	}
}

func TestTerminalStartupListeningAppendsWhenRowIsNotProvablySingleLine(t *testing.T) {
	tests := []struct {
		name          string
		mount         string
		terminalWidth int
		want          string
	}{
		{
			name:          "non-ASCII mount name",
			mount:         "café",
			terminalWidth: 80,
			want: "bellhop serving http://127.0.0.1:8770\n" +
				"  café  ○ starting\n" +
				"  café  ● listening :4747\n",
		},
		{
			name:          "mount name exceeds terminal width",
			mount:         "longer-name",
			terminalWidth: 8,
			want: "bellhop serving http://127.0.0.1:8770\n" +
				"  longer-name  ○ starting\n" +
				"  longer-name  ● listening :4747\n",
		},
		{
			name:          "ambiguous marker needs a spare cell",
			mount:         "vault",
			terminalWidth: 26,
			want: "bellhop serving http://127.0.0.1:8770\n" +
				"  vault  ○ starting\n" +
				"  vault  ● listening :4747\n",
		},
		{
			name:  "terminal width unknown",
			mount: "vault",
			want: "bellhop serving http://127.0.0.1:8770\n" +
				"  vault  ○ starting\n" +
				"  vault  ● listening :4747\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			printer := New(&output, true, false)
			printer.terminalWidth = test.terminalWidth
			printer.terminalHeight = 24
			printer.Startup("127.0.0.1:8770", []string{test.mount})
			printer.Listening(test.mount, 4747)
			if got := output.String(); got != test.want {
				t.Fatalf("terminal startup output = %q, want appended state %q", got, test.want)
			}
		})
	}
}

func TestTerminalStartupListeningAppendsWhenCursorDistanceReachesTerminalHeight(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, true, false)
	printer.terminalWidth = 80
	printer.terminalHeight = 3
	printer.Startup("127.0.0.1:8770", []string{"one", "two", "six"})
	printer.Listening("one", 4747)
	printer.Listening("six", 8080)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  one  ○ starting\n" +
		"  two  ○ starting\n" +
		"  six  ○ starting\n" +
		"  one  ● listening :4747\n" +
		"  six  ● listening :8080\n"
	if got := output.String(); got != want {
		t.Fatalf("short-terminal output = %q, want appended state %q", got, want)
	}
}

func TestTerminalStartupRewriteWithMixedSafeAndUnsafeRows(t *testing.T) {
	tests := []struct {
		name       string
		mounts     []string
		listening  []string
		wantEvents string
	}{
		{
			name:      "unsafe row above safe row",
			mounts:    []string{"ééé", "one", "two"},
			listening: []string{"one"},
			wantEvents: "\x1b[2A\r\x1b[2K  one  ● listening :4747" +
				"\x1b[2B\r",
		},
		{
			name:       "unsafe row below safe row",
			mounts:     []string{"one", "two", "ééé"},
			listening:  []string{"one"},
			wantEvents: "  one  ● listening :4747\n",
		},
		{
			name:      "unsafe row between safe rows",
			mounts:    []string{"one", "ééé", "two"},
			listening: []string{"two", "one"},
			wantEvents: "\x1b[1A\r\x1b[2K  two  ● listening :4747" +
				"\x1b[1B\r" +
				"  one  ● listening :4747\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			printer := New(&output, true, false)
			printer.terminalWidth = 80
			printer.terminalHeight = 24
			printer.Startup("127.0.0.1:8770", test.mounts)
			for _, mount := range test.listening {
				printer.Listening(mount, 4747)
			}

			want := "bellhop serving http://127.0.0.1:8770\n"
			for _, mount := range test.mounts {
				want += "  " + mount + "  ○ starting\n"
			}
			want += test.wantEvents
			if got := output.String(); got != want {
				t.Fatalf("mixed-row terminal output = %q, want %q", got, want)
			}
		})
	}
}

func TestTerminalStartupRewriteKeepsOriginalWidthAfterReserveMounts(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, true, false)
	printer.terminalWidth = 80
	printer.terminalHeight = 24
	printer.Startup("127.0.0.1:8770", []string{"vault", "linear"})
	printer.ReserveMounts([]string{"much-longer-mount"})
	printer.Listening("vault", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault   ○ starting\n" +
		"  linear  ○ starting\n" +
		"\x1b[2A\r\x1b[2K  vault   ● listening :4747\x1b[2B\r"
	if got := output.String(); got != want {
		t.Fatalf("terminal startup output = %q, want original-width rewrite %q", got, want)
	}
}

func TestNonTerminalStartupListeningAppendsUnchanged(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, false, false)
	printer.Startup("127.0.0.1:8770", []string{"vault", "linear"})
	printer.Listening("vault", 4747)

	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault   ○ starting\n" +
		"  linear  ○ starting\n" +
		"  vault   ● listening :4747\n"
	if got := output.String(); got != want {
		t.Fatalf("non-terminal startup output = %q, want byte-identical appended output %q", got, want)
	}
}

func TestLifecycleAndReloadOutput(t *testing.T) {
	tests := []struct {
		name  string
		write func(*Printer)
		plain string
		color string
	}{
		{
			name:  "child listening",
			write: func(printer *Printer) { printer.Listening("vault", 4747) },
			plain: "  vault   ● listening :4747\n",
			color: "  vault   \x1b[32m● listening\x1b[0m \x1b[2;90m:4747\x1b[0m\n",
		},
		{
			name:  "child starting",
			write: func(printer *Printer) { printer.Starting("vault") },
			plain: "  vault   ○ starting\n",
			color: "  vault   \x1b[33m○ starting\x1b[0m\n",
		},
		{
			name:  "child exit",
			write: func(printer *Printer) { printer.Restarting("vault", time.Second) },
			plain: "  vault   ○ restarting in 1s\n",
			color: "  vault   \x1b[33m○ restarting\x1b[0m in 1s\n",
		},
		{
			name:  "reload restart",
			write: func(printer *Printer) { printer.Restarting("vault", 0) },
			plain: "  vault   ○ restarting\n",
			color: "  vault   \x1b[33m○ restarting\x1b[0m\n",
		},
		{
			name:  "reload stop",
			write: func(printer *Printer) { printer.Stopped("vault") },
			plain: "  vault   ○ stopped\n",
			color: "  vault   ○ stopped\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			for _, color := range []bool{false, true} {
				var output bytes.Buffer
				printer := New(&output, color, color)
				printer.mountNameWidth = len("linear")
				test.write(printer)
				want := test.plain
				if color {
					want = test.color
				}
				if got := output.String(); got != want {
					t.Fatalf("color %t output = %q, want %q", color, got, want)
				}
			}
		})
	}
}

func TestErrorOutput(t *testing.T) {
	for _, test := range []struct {
		name  string
		color bool
		want  string
	}{
		{
			name: "plain",
			want: "bellhop: read config \"/tmp/bellhop.json\": permission denied\n" +
				"bellhop: reload: parse config \"/tmp/bellhop.json\" line 3: unexpected end of JSON; previous configuration is kept\n",
		},
		{
			name:  "color",
			color: true,
			want: "\x1b[31mbellhop:\x1b[0m read config \"/tmp/bellhop.json\": permission denied\n" +
				"\x1b[31mbellhop:\x1b[0m reload: parse config \"/tmp/bellhop.json\" line 3: unexpected end of JSON; previous configuration is kept\n",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			printer := New(&output, test.color, test.color)
			printer.Error(errors.New(`read config "/tmp/bellhop.json": permission denied`))
			printer.ReloadError(errors.New(`parse config "/tmp/bellhop.json" line 3: unexpected end of JSON`))
			if got := output.String(); got != test.want {
				t.Fatalf("error output = %q, want %q", got, test.want)
			}
		})
	}
}

func TestErrorOutputRemainsOneLine(t *testing.T) {
	var output bytes.Buffer
	printer := New(&output, false, false)
	printer.Error(errors.New("first line\nsecond line"))
	if got, want := output.String(), "bellhop: first line second line\n"; got != want {
		t.Fatalf("error output = %q, want %q", got, want)
	}
}

func TestColorEnabledRequiresCharacterDeviceAndUnsetNoColor(t *testing.T) {
	regularFile, err := os.OpenFile(filepath.Join(t.TempDir(), "stderr"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = regularFile.Close() })
	if ColorEnabled(regularFile) {
		t.Fatal("color enabled for regular file")
	}

	characterDevice, err := os.Open("/dev/null")
	if err != nil {
		t.Skipf("open character device: %v", err)
	}
	t.Cleanup(func() { _ = characterDevice.Close() })
	t.Setenv("NO_COLOR", "1")
	if ColorEnabled(characterDevice) {
		t.Fatal("color enabled with NO_COLOR set")
	}
}

func TestColorDisabledForNonTerminalCharacterDevice(t *testing.T) {
	unsetEnvironment(t, "NO_COLOR")
	characterDevice, err := os.Open("/dev/null")
	if err != nil {
		t.Skipf("open /dev/null: %v", err)
	}
	t.Cleanup(func() { _ = characterDevice.Close() })
	if ColorEnabled(characterDevice) {
		t.Fatal("color enabled for non-terminal character device")
	}
}

func TestColorEnabledForTerminalDevice(t *testing.T) {
	unsetEnvironment(t, "NO_COLOR")
	terminal, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		t.Skipf("open pseudoterminal: %v", err)
	}
	t.Cleanup(func() { _ = terminal.Close() })
	if !ColorEnabled(terminal) {
		t.Fatal("color disabled for terminal device")
	}
}

func TestNoColorTerminalDisablesColorButStillRewritesStartup(t *testing.T) {
	terminal, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		t.Skipf("open pseudoterminal: %v", err)
	}
	t.Cleanup(func() { _ = terminal.Close() })
	t.Setenv("NO_COLOR", "")
	if ColorEnabled(terminal) {
		t.Fatal("color enabled with empty NO_COLOR set")
	}

	var output bytes.Buffer
	printer := New(&output, IsTerminal(terminal), ColorEnabled(terminal))
	printer.terminalWidth = 27
	printer.terminalHeight = 24
	printer.Startup("127.0.0.1:8770", []string{"vault"})
	printer.Listening("vault", 4747)
	want := "bellhop serving http://127.0.0.1:8770\n" +
		"  vault  ○ starting\n" +
		"\x1b[1A\r\x1b[2K  vault  ● listening :4747\x1b[1B\r"
	if got := output.String(); got != want {
		t.Fatalf("NO_COLOR terminal output = %q, want plain rewrite %q", got, want)
	}
}

func unsetEnvironment(t *testing.T, name string) {
	t.Helper()
	previous, existed := os.LookupEnv(name)
	if err := os.Unsetenv(name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv(name, previous)
		} else {
			_ = os.Unsetenv(name)
		}
	})
}
