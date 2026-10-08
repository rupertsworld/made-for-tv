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

## Project structure

The two Node servers live at `servers/<name>/` in made-for-tv — source in
`src/`, tests in `test/`, skills in `skill/`, and contracts at
`spec/<name>/`.

## Distribution

The public npm packages are `@rupertsworld/file-server` and
`@rupertsworld/vault-server`. Their binaries and bundled skills are named
`file-server` and `vault-server`. Both packages require Node.js 24 or later.
Run either package with `npx @rupertsworld/<name> <folder>`, or install it
globally with `npm install -g @rupertsworld/<name>`. Each package builds before
packing and includes its built code, skill, README, and MIT licence. Both
packages also export the server for embedding in another process.

For development, `servers/` is a private npm workspace root. Run `npm install`,
`npm run build`, and `npm test` there. The vault-server package depends on
`@rupertsworld/file-server`, resolved from the workspace during development.

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
with no compile step. `pretest` and `prepack` build the shipped `dist`.
Internal module structure is the implementer's call.

## Testing

Node test conventions are laid out in [testing.md](testing.md); each
server specification states what its suite covers.
