# bellhop

Bellhop mounts local HTTP services under one port. A config file declares mounts, each with a name, a command, and an optional description; bellhop runs every command as a child process, discovers the port it listens on, and relays `/<name>/...` to it. Callers get one base URL for everything; services get started, restarted, and port-managed for free.

Bellhop is deliberately unopinionated: it defines no environment for its children, serves no documentation, and owns no route except `/`, which lists the mounts. Anything a service needs to know is passed in its own command arguments.

The behavioural contract is [`spec/index.md`](spec/index.md).

## Use

Config lives at `~/.bellhop.json`:

```json
{
  "allowed_origins": ["http://localhost:*", "http://127.0.0.1:*"],
  "mounts": [
    {"name": "files", "command": ["file-server", "/home/example/files"]}
  ]
}
```

```sh
bellhop                       # serves http://127.0.0.1:2355
curl localhost:2355/          # {"mounts": [{"name": "files"}]}
curl localhost:2355/files/... # relayed to file-server, /files stripped
```

The default port 2355 spells BELL on a phone keypad.

A child that exits is restarted after a second, running its command afresh — so rebuilding a binary at the same path takes effect by killing the child. A config edit is applied in place with `SIGHUP`, restarting only the mounts whose command changed. Browser access is governed by `allowed_origins` in the config; everything else by the bind address.

## Serving on a tailnet

Bellhop binds `127.0.0.1` by default. To reach it from other devices without exposing it further, front it with [`tailscale serve`](https://tailscale.com/kb/1242/tailscale-serve): with MagicDNS on, one command proxies a tailnet-only port 80 to bellhop, and every mount is reachable by plain path under the machine's name from any device on the tailnet:

```sh
tailscale serve --bg --http=80 localhost:2355
curl http://<hostname>/files/...
```

`--bg` persists the proxy across restarts. `tailscale serve` never leaves the tailnet — public exposure is a separate command (`tailscale funnel`). A browser page loaded this way has origin `http://<hostname>`; allow it with an `allowed_origins` entry of `"http://<hostname>:*"`.

## Install

Linux only — port discovery reads the kernel's process tables.

Build from a clone of made-for-tv. From `servers/`, run `./setup.sh` to build all three servers and link their commands. To build Bellhop alone from `servers/bellhop/`:

```sh
mkdir -p bin
go build -o bin/bellhop ./cmd/bellhop
go test ./...    # unit and end-to-end suites
```
