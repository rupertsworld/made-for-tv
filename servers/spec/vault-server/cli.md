# CLI

`vault-server [path]` — the vault root, with the positional-path and
readiness behavior of [`file-server`](../file-server/cli.md) and the shared
[CLI conventions](../cli.md). The base port is `4747`. The record
index joins the readiness gate alongside the change watcher: the listener
binds and the banner prints only after initial indexing succeeds.

## Terminal output

On successful start (the count is records — markdown files in the
index):

```
vault-server 0.5.0
vault:  /home/example/vault (1,598 records)
url:    http://127.0.0.1:4747
```

```
Usage: vault-server [path] [options]

Serve a live vault as files and structured markdown records.

  path         vault root (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 4747, or the next free port up to 4846; 0 for any free port)
  --help       show this help
  --version    print the version
```
