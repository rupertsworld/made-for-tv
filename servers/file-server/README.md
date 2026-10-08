# file-server

`file-server` serves one directory over HTTP and WebSocket as live file resources. Files
can be read, written, edited, and deleted; directories can be listed and
removed, and a root-wide change stream signals when paths need to be refetched.
It is useful anywhere a browser page, script, or service needs a
directory-shaped web surface without translating the files into another data
model.

## Install and run

Node.js 24 or later is required.
[Get started with the servers](https://github.com/rupertsworld/made-for-tv/blob/main/README.md#get-started-with-the-servers)
walks through using it. Run the npm package without installing it globally:

```sh
npx @rupertsworld/file-server /path/to/directory
```

The first run asks to download the package. It prints an address such as
`url: http://127.0.0.1:8765`. Open that address or run:

```sh
curl http://127.0.0.1:8765/
```

The JSON directory listing means it works. Omit the directory argument to
serve the current directory. For a permanent `file-server` command, run
`npm install -g @rupertsworld/file-server`, then `file-server /path/to/directory`.

`--host` (default `127.0.0.1`) and `--port` (default `8765`) adjust binding.

To hide paths, list `.gitignore` patterns under `ignore` in
`~/.config/file-server/config.json`, or pass `--ignore <pattern>`, which can be
repeated and adds to the patterns in the config:

```json
{ "ignore": ["node_modules/", "*.log"] }
```

```sh
file-server ~/code --ignore node_modules/ --ignore /dist
```

Patterns follow `.gitignore` rules, matched against paths relative to the
served directory without regard to letter case. `node_modules/` hides every
`node_modules` directory and everything inside it. A path that matches is
hidden exactly like a dot-prefixed one. The server does not watch hidden paths,
so ignoring a large tree such as `node_modules` also saves the memory that
watching it would take.

The server binds localhost only by default and has no authentication. CORS is
wide open (`Access-Control-Allow-Origin: *`), so browser pages from any origin
can call it directly.

## Quick start

The URL space mirrors the served directory:

```sh
curl http://127.0.0.1:8765/photos/cat.jpg
curl http://127.0.0.1:8765/photos/
curl -X PUT --data-binary @cat.jpg http://127.0.0.1:8765/photos/copy.jpg
curl -X DELETE http://127.0.0.1:8765/photos/copy.jpg
```

`GET` and `HEAD` read files with media types, validators, and byte ranges.
Directory `GET`s return a one-level JSON listing. `PUT` atomically creates or
replaces any file and creates missing parents; `PATCH` performs an anchored
literal edit of a UTF-8 text file; `DELETE` removes a file or directory tree.
`OPTIONS` provides the CORS preflight response. See [`spec/file-server/`](https://github.com/rupertsworld/made-for-tv/tree/main/servers/spec/file-server) for the
complete wire contract, CLI, and API.

Open a WebSocket at `/`, or at the slash-terminated URL of any existing
directory, to receive `{ "type", "path" }` change signals for the whole served
root. Each signal means that dependent state must be fetched again; the stream
has no history or replay. Dot-prefixed and ignored paths are absent from
listings, return `404` on every method, and never produce change signals.

The package exports `FileServer` and the protocol-extension types from its main
entry point. The built `@rupertsworld/file-server/conformance` subpath
registers the base contract tests against another server factory.

## Confinement

Every request is confined by canonical path beneath the resolved root, and
symbolic links are never served. Confinement uses a canonical-path
check-then-act: after a path is checked, a concurrent local process could swap
an intermediate directory for a symbolic link before the operation. This
accepted race is not reachable through file-server's own operations. If the
threat model includes a hostile local process, use kernel-enforced confinement.

Hard links and bind mounts cannot be detected by path resolution and are
outside this boundary. Within the root, file-server reads, writes, and deletes
whatever it is asked to; use a narrower served root when a caller should reach
less.

## Develop

From a clone of made-for-tv, run these commands in `servers/`:

```sh
npm install
npm run build
npm test
```
