# CLI

`file-server [path]` — the directory to serve as an optional positional
argument, defaulting to the current directory. Everything not stated
here follows the [shared CLI conventions](../cli.md); the base
port is `8765`. The root is resolved through symbolic links at
startup, so a symlinked directory serves its target; it must resolve
to a real directory, so a mistyped path fails immediately rather than
404-ing every later request. A leading `~` or `~/` expands to the
invoking user's home directory; any other tilde is literal. Exactly
one positional argument is accepted.

Readiness includes the change watcher: it is running before the
listener binds, so no change between bind and watch can be missed, and
shutdown closes the watcher and the open subscriptions along with the
listener.

## Config

The [config](../cli.md#config) schema has one optional member:

- `ignore` — an array of patterns in `.gitignore` syntax. Paths that
  match are [hidden](server.md#url-mapping), exactly like dot-prefixed
  ones.

`--ignore <pattern>` adds a pattern for one run and may be repeated; its
patterns are added to those in the config. With neither, nothing is
ignored.

Patterns follow `.gitignore` rules, matched against paths relative to the
root without regard to letter case, as git does with `core.ignorecase`.
For example, `node_modules/` hides every `node_modules` directory and
everything inside it.

## Terminal output

On successful start:

```
file-server 0.2.0
root:   /home/example/Pictures
url:    http://127.0.0.1:8765
```

```
Usage: file-server [path] [options]

Serve a live directory over HTTP and WebSocket: read, list, write, edit, delete.

  path         directory to serve (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 8765, or the next free port up to 8864; 0 for any free port)
  --ignore     hide paths matching a .gitignore pattern; repeatable (added to the config's ignore list)
  --help       show this help
  --version    print the version
```
