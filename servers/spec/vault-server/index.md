# vault-server

`vault-server` extends the [file-server protocol](../file-server/server.md) for an
Obsidian vault — or any directory of markdown files; Obsidian conventions
are honored but the app is never required. Every base file operation remains
available. The extension adds a structured record view of each markdown
file, record writes, enriched directory listings, and record-path mapping in
the inherited change stream. The vault root is configuration and may be
externally synced, so changes can arrive outside the API.

- [Server](server.md) — the extension contract: records, references,
  listings, record writes, and event-path mapping. Read it with the
  [base server contract](../file-server/server.md).
- [CLI](cli.md) — invocation, configuration, terminal output.
- [Programmatic API](api.md) — running a server in your own process, and
  approving record writes.
- [Skill](skill.md) — what the bundled consumer skill must cover.

The shared [approval boundary](../index.md#approval-boundary) applies.


## Distribution

The package is `@rupertsworld/vault-server`, distributed
[as shared](../index.md#distribution); it also exports the server
itself — see [the API](api.md). It depends on
`@rupertsworld/file-server`: `VaultServer` embeds its exported
`FileServer`, supplies its documented extension hooks for record routing,
listing decoration, and event-path mapping, and delegates everything else to
it. Byte serving, ranges, validators, raw writes and deletion, confinement,
change watching, lifecycle, and the rest of the base protocol therefore have
one implementation.

## Implementation

The shared [baseline](../index.md#implementation), plus `gray-matter` for
frontmatter. The embedded file server owns HTTP, WebSocket, filesystem, and
lifecycle behavior. The vault layer maintains an in-memory record cache,
built before `ready` resolves and refreshed through the base change hook. A
record entry owns its parsed data, timestamp, and unreadable state; reference
indexes derive from this cache rather than owning path state separately.

Structured record reads and directory decoration use the cache: no
per-request vault walks or markdown parsing. Processing one external record
change performs one file read and one stat. A record mutation refreshes the
cache before its base dirty signal is published, so an immediate refetch sees
the new representation.

## Testing

The shared [conventions](../testing.md); the tests cover:

- in-process, running against temp-dir vaults — the inherited
  file-server contract, record resolution and writing, listing
  representations, references, record event-path mapping, write
  approval, and the CLI.
- through the built binary, speaking real HTTP and WebSocket against a
  realistic checked-in example vault — `.obsidian` directory, a
  markdown file sharing its name with a directory, dotted names,
  assets, and field references in all supported shapes.
