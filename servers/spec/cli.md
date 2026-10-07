# CLI conventions

The contract the `file-server` and `vault-server` binaries share. The per-server CLI
specs state only what is particular — positional arguments, the base
port, the banner's middle lines, any subcommands — and inherit the
rest.

## Options

Every binary accepts:

- `--host <host>` (default `127.0.0.1`) — the bind address; must be
  non-empty.
- `--port <port>` — a decimal integer from 0 through 65535. Each
  server owns a hundred-port range starting at its base port. Without
  `--port` the server binds the base port, or the next free port in
  the range when that is taken; with `--port N` it binds `N` or
  fails — an explicit choice never moves; `--port 0` binds a port the
  operating system chooses, for hosts that discover it from the
  listening socket.
- `--help` — the usage block to stdout, exit 0.
- `--version` — the bare version to stdout, exit 0.

Flags take their value as the following argument.

## Startup and banner

A server verifies that the served path resolves before binding, and prints its
banner to stdout only once the listener is accepting connections. The
first line is `<name> <version>`; the middle lines are aligned
`label: value` pairs the server's own spec defines; the last is
`url:    http://<host>:<port>`, reporting the port actually bound. The
`url:` line is the machine-parseable readiness signal: once it is
printed, the server is accepting connections and handling signals.

## Color

When the stream is a TTY and `NO_COLOR` is unset, output is colored
with raw ANSI escapes (no dependency): the program name bold, labels
dim, the URL cyan, and the error prefix red. Piped output is always
plain, so the `url:` line stays parseable.

## Errors and signals

Errors go to stderr as one `<name>: <message>` line and exit 1 —
e.g. `file-server: port 8765 is already in use`; an unknown argument's
error is followed by the usage block. `SIGINT`/`SIGTERM` shut down
cleanly and silently with exit 0.

## Config

`file-server` reads `~/.config/file-server/config.json`; its schema is in
[the file server CLI specification](file-server/cli.md#config). An
unreadable, malformed, or invalid config file is an error naming the file,
never a silent fallback.
