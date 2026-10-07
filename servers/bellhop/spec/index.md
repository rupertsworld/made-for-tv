# Bellhop

Bellhop is a CLI that runs an HTTP relay from a config file. The config declares mounts, each with a name, a command, and an optional description. Bellhop runs every command as a child process, discovers the port it listens on, and proxies `/<name>/...` to it. That is the whole job: bellhop serves no documentation, injects no environment, and owns no route except `/`.

This describes Bellhop's interface and behaviour.

## Invocation

```sh
bellhop
```

The config file is found at `$BELLHOP_CONFIG`, or `~/.bellhop.json` when the environment variable is unset. `--config` overrides both. Paths are taken literally — expanding `~` is the shell's job. The config is the only file bellhop touches; it keeps no other state on disk.

If no config exists at the resolved path, bellhop creates any missing parent directories, writes a starter config there — `{"mounts": []}` and nothing else — and carries on. A first run therefore serves an empty mount list rather than failing, and leaves a file to edit.

Any failure to read, parse, validate, create, or write the config is printed to standard error and causes bellhop to exit with a non-zero status.

Flags are limited to `--config`, `--host`, `--port` and `--allowed-origins`, and take precedence over the file. `--allowed-origins` takes a comma-separated list (`--allowed-origins "*"`), overriding the file's `allowed_origins` wholesale; it pairs with `--host`, the two of them being the machine and browser halves of who may reach bellhop, set together at launch without editing the file. Everything per-mount stays in the file.

## Config

`host` defaults to `127.0.0.1`, `port` to `2355` (BELL on a phone keypad), and `allowed_origins` to empty, so a working config is just its mounts.

```json
{
  "mounts": [
    {"name": "files", "description": "Workspace files", "command": ["file-server", "/home/example/files"]},
    {"name": "scheduler", "command": ["bellhop-scheduler", "--state-dir", "~/.local/state/scheduler"]}
  ]
}
```

Command arguments are never interpreted by bellhop — it runs the command without a shell, so the `~` inside an argument above is the child's to resolve, not bellhop's.

The config is decoded strictly: `mounts` must be present as an array (possibly empty), and an unknown field anywhere in the file is an error rather than being ignored. A stale field from an older bellhop therefore fails validation instead of silently doing nothing.

## URL space

```
GET  /             the mount list
     /<name>/...   proxied to the mount's child, name stripped
```

`GET /` returns the configured mounts as JSON, in config order. Each object contains the mount name and includes its description when non-empty:

```json
{"mounts": [{"name": "files", "description": "Workspace files"}, {"name": "scheduler"}]}
```

Any other method on `/` is `405 Method Not Allowed` with an `Allow: GET` header.

Nothing else is served: a path whose first segment is not a mount name is `404 Not Found`. There are no reserved names — the only path bellhop owns is `/` itself, which can never collide with a mount because names are non-empty.

## Browser origins

A browser is the one caller bellhop governs by origin. Every other caller — a script, a cron job, another agent — is governed by the bind address, which decides what machines can reach bellhop at all. So bellhop owns a single origin policy at its edge, and the mounts behind it never see it: CORS headers a child sets on its own responses are stripped before forwarding, so the edge policy is the only one a browser observes.

`allowed_origins` is a top-level array of exact origins — scheme, host and port, `"http://192.0.2.10:8080"` — permitted as browser callers. `["*"]` allows any origin, and is only valid as the sole element; a `*` mixed with named origins, or a malformed origin, fails validation at startup. An entry may instead give `*` as its port — `"http://example.test:*"` — permitting that scheme and host on any port, and with no port at all. The port is the only part of an origin that can be wildcarded: a `*` in the scheme or host, or an explicit port alongside the `*`, fails validation. Wildcard-port entries are named origins, so they mix freely with exact entries; the sole-element rule applies only to the bare `"*"`. The file is its reviewed home; `--allowed-origins` overrides it at launch, the same file-plus-flag pairing `host` and `port` have.

```json
{
  "allowed_origins": ["*"],
  "mounts": []
}
```

The check is server-side, not merely reflected CORS. A request carrying an `Origin` header is tested against the allowlist and refused with `403 Forbidden` on no match, before it reaches any mount. A request with no `Origin` — curl, a script, another agent, and also a browser's own top-level navigations and simple resource loads — is unaffected. So this governs cross-origin browser access specifically, not every request a browser can make; the boundary for a page loading a file by URL is still the bind address, exactly as for any other caller. Enforcing server-side rather than trusting the browser's own CORS is what stops a DNS-rebound page that looks same-origin to its browser from making a cross-origin call into a mount.

A CORS preflight (`OPTIONS` carrying `Access-Control-Request-Method`) from an allowlisted origin is answered `204`, and `403` otherwise. Because bellhop cannot know each mount's methods, the preflight's requested method and `Access-Control-Request-Headers` are reflected back in `Access-Control-Allow-Methods` and `-Allow-Headers`, with `Authorization` always among the allowed headers so a caller's credential passes. Every origin-dependent response carries `Vary: Origin`, so a shared cache never serves one origin's decision to another. Bellhop does not set `Access-Control-Allow-Credentials`: a credential travels in `Authorization`, not a cookie, so credentialed CORS is neither needed nor offered.

`allowed_origins` defaults to empty: no browser origin is allowed until one is named. `["*"]` on a localhost or tailnet bind makes that bind the sole boundary, which is the case for a single-box or tailnet-only deployment.

## Mounts

A mount is a name plus the command behind it and, optionally, a description for the index.

`name` is one URL path segment identifying where the service appears in bellhop's URL space. It is not `.` or `..` and contains no `/`, `\`, or control characters. Bellhop fails at startup if a name is empty, is not a valid name as defined above, or duplicates another mount's name.

`description` is optional free text about the mount. It is index metadata only: a non-empty description appears in `GET /` and has no effect on the child.

`command` is the service bellhop runs as a child process and forwards to. An array, not a string, so there is no shell parsing or quoting. The child inherits bellhop's environment unchanged; bellhop sets nothing. A service that needs to know anything — a state directory, bellhop's own URL, the name it is mounted under — is told through its own arguments in `command`.

Bellhop forwards the request method, query string, headers, and body to the child, removing the mount name from the path. It returns the child's status, headers, and body. Connection-specific headers are handled according to HTTP proxy rules. A forward that fails in transport — the child stopped accepting connections between discovery and the dial, or dropped mid-request — is answered `502 Bad Gateway`; `503` is reserved for a mount whose child has no listening socket yet.

Bellhop discovers the child's port rather than assigning it: after spawning, it watches for the process to open a listening TCP socket — read from the kernel's process tables, which makes bellhop Linux-only — and forwards to whatever port appears. No flag convention to encode, no parsing of `--port` against `-p` against `--port=`, and it works whatever the service's CLI looks like — including services that take a port from their own config or environment.

The same signal doubles as the readiness check. A mount begins serving when its child has a listening socket, so port discovery and readiness are one mechanism rather than two.

A command may still name a port explicitly when a fixed one is wanted; bellhop finds it either way. Ports do not otherwise appear in config.

Every mount is a local process bellhop owns. A pure-proxy hub would leave the services to be started and port-managed by hand, which is most of the toil bellhop exists to remove.

## Process lifecycle

Bellhop owns its children for as long as it runs.

A child that exits for any reason is started again after one second, so that a service failing immediately does not spin. Starting again runs the mount's `command` afresh rather than reviving the process that exited, so a child picks up whatever its command resolves to at that moment: a rebuilt binary at the same path is served after a restart, without a configuration change. While a mount has no listening child, requests to its name receive `503 Service Unavailable` rather than being queued.

When bellhop exits, it sends `SIGTERM` to each child's process group, then forcibly terminates processes that remain in the group after one second. Descendants that deliberately detach from the group are outside bellhop's lifecycle ownership.

Nothing else is supervised: no health checks beyond the listening socket, no log capture, no restart limits.

## Reloading

`SIGHUP` makes bellhop re-read its configuration from the resolved path and apply the changes in place, without restarting. The point is that a configuration change is surgical: adding or removing one mount leaves every other mount's child untouched, where a restart tears them all down.

The reloaded configuration is validated exactly as at startup, with one difference: the starter file is written only at startup, so a config file missing at reload is an error like any other — reported to standard error, with bellhop keeping the configuration it already had. If the file is invalid in any way — missing, unreadable, malformed, or failing any mount rule — the same applies. A broken edit never takes down a running server.

On a valid reload, bellhop diffs the new mounts against the running ones by name:

- a mount that is new is started, supervised, discovered and served like any mount at startup;
- a mount that is gone has its child stopped — `SIGTERM` to the process group, then `SIGKILL` after one second — and its routes removed;
- a mount whose `command` changed is restarted: the old child stopped, the new one started;
- a mount whose `description` alone changed keeps its child running, while `GET /` reflects the new description;
- a mount that is unchanged keeps running as it is.

`allowed_origins` is re-applied. `host` and `port` are not: rebinding the listener would drop connections in flight, so a change to either is reported to standard error and left for the next restart. Command-line flags that overrode the file at launch keep taking precedence across reloads, so a value set by `--host`, `--port` or `--allowed-origins` is not overridden by the file on reload.

A reload is applied so that no request observes a half-applied configuration: a request is routed by either the mount set before the reload or the one after it, never a mixture. A mount being started or restarted returns `503 Service Unavailable` until its child is listening again, exactly as at startup.

## Terminal output

Bellhop's terminal output is for the person who launched it; callers observe bellhop only through HTTP. Everything bellhop prints goes to standard error — standard output is never written — so redirecting one stream captures everything in order.

At startup, once the listener is bound, bellhop prints where it is serving and one line per mount:

```
bellhop serving http://127.0.0.1:2355
  vault   ● listening :4747
  linear  ○ starting
```

After startup, each lifecycle event is one line as it happens: a child opening its listening socket (with the discovered port), a child exiting (with the restart notice), and a reload's effect on each mount it starts, stops, or restarts. Bellhop does not timestamp lines; that is left to whatever captures the stream.

On a terminal, the startup block is live: a mount's `○ starting` row is rewritten in place to its `● listening` state as discovery completes, so a clean startup settles into one line per mount. The block is only rewritten while it is the most recent output — once any other line has been printed, or when standard error is not a terminal, every state change appends a new line instead.

Errors are single sentences prefixed `bellhop:`, naming the place they arise: a config parse error carries the file path and line, a validation error the offending field or value. A reload error additionally states that the previous configuration is kept.

When standard error is a terminal and `NO_COLOR` is unset, output is colored sparingly. The banner's `bellhop serving` is dim grey with the URL in the default foreground, so the address is the one thing that stands out. On a mount line the name stays in the default foreground; the marker and the state word are colored together — green `● listening`, yellow `○ starting` or `○ restarting` — and the port after `listening` is dim grey. Error lines color only the `bellhop:` prefix red, leaving the sentence readable in the default foreground. Nothing else is colored; without a terminal or with `NO_COLOR` set, the same lines are printed plain.
