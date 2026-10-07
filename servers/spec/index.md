# Servers specification

The source of truth for the servers' public behaviour — the whole
project is specified from this file and its links. Shared conventions
live here; each server's folder holds the rest. Every spec file must
be reachable from this one; a file that is not is a bug.

Small HTTP and WebSocket servers for agents and UIs: they exist so a
browser page or an agent can work with real data directly — a dashboard,
a view, an automation — without writing a backend for it. Each server serves
one kind of data over a local protocol; a bundled skill teaches an
agent its contract. Built for
[Television](https://television.run).

## Servers

- [file-server](file-server/index.md) — the shared live-directory protocol: read,
  list, write, edit, delete, and subscribe to path changes at real URLs.
- [vault-server](vault-server/index.md) — extends file-server with structured JSON records
  for markdown files, enriched listings, and record mutations.
- [Bellhop](../bellhop/spec/index.md) — runs local services and mounts them
  under one address.

## Project structure

The two Node servers live at `servers/<name>/` in made-for-tv — source in
`src/`, tests in `test/`, skills in `skill/`, and contracts at
`spec/<name>/`. Bellhop lives at `servers/bellhop/` with its own Go
source, tests, and specification.

## Distribution

Each Node server is a private npm workspace package named for its folder.
Each provides a CLI binary and a skill with the same name. Packages are
built from this repository and are not published to a registry. The skill
ships inside the package, so a wire change and its skill update land
in one commit. Both packages also export the server itself for embedding
in another process. Bellhop is a Go module and builds the `bellhop` binary.

## Approval boundary

The spec is the approval boundary for public behaviour. No route,
body, status, header, or flag may change without approval of the
corresponding spec change before implementation. Error message
wording is not part of the boundary.

## Trust model

The Node servers bind localhost by default, require no request authentication,
and leave CORS wide open, so browser pages from any origin call them
directly. The network boundary is the protection; a host that needs
origin or caller policy applies it in front. Browser local-network
rules may still block or prompt a public page reaching a loopback
server; that is the browser's concern, not the server's.

## HTTP conventions

Every Node server response carries `Access-Control-Allow-Origin: *` — safe
alongside no-auth because `*` forbids credentialed requests by
definition. An `OPTIONS` preflight on any path, whether or not the
route exists, returns `204` with no body, carrying the server's
allowed methods and request headers, a cache max-age, and
`Access-Control-Allow-Private-Network: true` when requested, for
browsers that send the legacy header. Each server's spec states its
header values and any exemptions.

Error bodies are `{ "error": "<message>" }`.

## CLI

The shared Node CLI contract — options, startup and banner, color, errors
and signals — lives in [cli.md](cli.md);
the per-server CLI specs state only what is particular and inherit
the rest.

## Skills

The shared contract for the consumer skills lives in
[skill.md](skill.md); each server's skill spec states what its skill
must cover.

## Implementation

The Node servers use Node ≥ 24, TypeScript, and Express. These are the mechanisms behind the
contracts; the contract, not the mechanism, is the approval boundary.
Tests are TypeScript run natively by `node --test` (type stripping),
no compile step; the build exists for the shipped `dist`, via `pretest`. Internal module structure is
the implementer's call.

## Testing

Node test conventions are laid out in [testing.md](testing.md); each
server specification states what its suite covers. Bellhop has Go tests
in `bellhop/internal/` and `bellhop/tests/e2e/`.
