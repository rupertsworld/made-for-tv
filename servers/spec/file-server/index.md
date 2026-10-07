# file-server

`file-server` serves one directory as resources at real URLs: read, list,
write, edit, delete, and subscribe to path changes. Its purpose is to let
anything that speaks HTTP and WebSocket — a browser page, a script, an
agent's http tool — treat a directory as a live web resource without
translating files into another format: an `<img src>`, a ranged download, a
cached asset, an anchored edit, or a refetched view after a dirty signal.
One server serves one directory; several directories are several servers,
named and composed by whatever host mounts them.

- [Server](server.md) — the wire contract: URL mapping, reading,
  directories, writing, editing, confinement, concurrency, change signals,
  CORS, errors — and the programmatic API and extension seam.
- [CLI](cli.md) — invocation, terminal output, errors.
- [Skill](skill.md) — what the bundled consumer skill must cover.

The shared [approval boundary](../index.md#approval-boundary) applies.

## Distribution

The package is `file-server`, distributed
[as shared](../index.md#distribution); it also exports the server and its
protocol-extension types — see [the API](server.md#api).

## Implementation

The shared [baseline](../index.md#implementation), plus `ws` for WebSockets
and `chokidar` for filesystem changes, behind the [server
contract](server.md):

- **Media types** come from `mime-types` (the `mime-db` dataset).
- **Writes** go to a temporary file in the target's directory and are
  renamed into place. That is what makes a write atomic to readers and
  leaves the existing file intact when a transfer fails; a failed write
  removes its temporary file.
- **Confinement** is canonical-path checking. The root is resolved once at
  startup. For each request the deepest existing component of the path is
  resolved with `realpath`, checked to lie beneath the resolved root, and
  each existing component is `lstat`ed to reject symbolic links; anything
  to be created is then created beneath the checked directory. Node has no
  `openat2`, so this is check-then-act; the contract states the resulting
  guarantee and its limit.
- **`ETag`** is the weak size-and-mtime tag Express's `send` generates
  (`W/"<size>-<mtime>"`), so caching behaves as any Node static server's.
- **Streaming.** `GET` bodies are streamed from disk with `Range` mapped
  to a start/end read; `PUT` bodies are streamed to the temporary file. The
  only buffered payloads are `PATCH` documents, the files they edit, and
  the edited result, each capped at 16 MiB.
- **Temporary files** are created with a collision-resistant name in the
  target's directory, excluded from listings and from addressing, and
  removed if the write fails.
- **Directory listings** are built from one `readdir` with file types plus
  one `stat` per regular file.
- **Change signals** come from one watcher on the root. External events are
  debounced per path; once a path has been quiet for the debounce period,
  one dirty signal is published from the path's net transition and final disk
  state: creation followed by changes remains `created`, delete followed by
  recreation is `created`, an existing path that remains is `modified`, and a
  path that ends absent is `deleted`. HTTP mutations publish directly when
  their atomic change completes and suppress the watcher's duplicate, so they
  do not wait for the debounce. Initial indexing does not publish events or
  incur the debounce delay.
- **CLI** is a thin wrapper over the exported server: parse flags, read the
  config, construct, `listen`, print, and close on signals.

## Testing

The shared [conventions](../testing.md); the tests cover:

- in-process, running against temporary directories — URL mapping,
  ignore patterns, reading (media types, ranges, conditional requests,
  `HEAD`), directories, writing, editing, confinement, change signals,
  CORS, errors, and the extension hooks.
- through the built binary, startup output and the `url:` line, flag
  errors, `--help`/`--version`, the config file and `--ignore`, clean
  shutdown on `SIGTERM`, one round trip per method, and one WebSocket
  refetch cycle.

Four properties are stated as invariants and covered by targeted tests and
review rather than proven black-box: that a reader never observes a
partially written file; that bodies are streamed rather than buffered; that
the server never watches an ignored path, which a test checks by reading
the paths the watcher holds; and confinement, whose stated limit is a race
no test can close.
