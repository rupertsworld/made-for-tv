# Programmatic API

The package exports the server for embedding. `VaultServer` has the base
[`FileServer` lifecycle and composition API](../file-server/server.md#api), with
the record options below and a default listen range of `4747` through `4846`
instead of the base range.

```js
import { VaultServer } from "@rupertsworld/vault-server";

const server = new VaultServer({ root: "/path/to/vault" });
await server.listen({ port: 4747 });
console.log(server.url);
```

- `new VaultServer({ root, pingIntervalMs?, … })` — `root` and
  `pingIntervalMs` have their base option meanings. The remaining options
  are the record options below, each carrying its scope in its own shape: a
  value settles the vault, a function of a path answers per record, and a
  function of a record judges a write.
- `ready`, `listen`, `close`, `url`, `port`, `app`, `server`, and
  `handleUpgrade` have their base API meanings. `ready` additionally waits
  for the initial record index.
- `linkFormat` — `"wikilink"` (default) or `"markdown"` — the syntax
  the server writes internal links in: how a submitted reference is
  serialized, and the form written bodies are canonicalized toward
  ([the server contract](server.md)). Reads consult it for nothing.
  Both syntaxes are recognized wherever a link can appear, references
  serve as `$type` objects, and prose arrives as standard markdown —
  so reading a vault needs no configuration at all.
- `bodyFormat` — whether a record's body is markdown to this server
  (below). `"markdown"` (the default), `"raw"`, or a function of the
  record's path returning one of them.
- `validate` — the write-approval hook below.
- `jsonLimit` — request body cap, default 32 MB.
- `configure({ linkFormat?, bodyFormat? })` — replace either setting on
  a running server, for a caller whose own configuration changes while
  it serves. Omitted keys keep their current value. Replacing
  `bodyFormat` changes which bodies are interpreted, so anything derived
  from bodies — the link lists — is rebuilt before the call resolves:
  the settings and everything computed from them move together, and no
  cached answer outlives the input it came from.
- `paths` — every vault path currently indexed, as an iterable of
  vault-relative paths. Records appear with their `.md` extension and
  other files with their own, so this is the one place the programmatic
  API speaks disk paths rather than the extensionless spelling used in
  payloads, events, `validate`, and `bodyFormat`. Dot-prefixed paths are
  absent under the base visibility rule. It exists so a `validate` hook can
  ask what else the vault holds — whether a name is taken, or taken by
  something differing only in case — which no single record can answer. It
  is a view over the live index rather than a copy, so a caller that needs a
  stable set makes one.

## Uninterpreted bodies

Most bodies are markdown, and the server treats them so: resolving
their links on read, canonicalizing them on write, counting them in
`links`. `bodyFormat` names the records where none of that applies.

```js
new VaultServer({
  root,
  bodyFormat: (path) => path.startsWith("emails/") ? "raw" : "markdown",
});
```

- `"raw"` means the server does not interpret that body: it is served
  and stored verbatim, and never scanned, so it contributes nothing to
  `links`. What such a body actually is — HTML, plain text, a
  transcript — is the record's own business, declared in its fields
  where a consumer needs to know. `<path>.md` still serves the file, as
  it does for every record.
- A string settles the whole vault. A function is called with the
  record's extensionless path — the spelling `validate` receives — and
  returns one of the two values. It is consulted while serving and
  indexing, so it must be synchronous.
- The string form is the constant case: equivalent to a function that
  always returns that value.

## Approving record writes

`validate` is the vault-side seam a governing host uses to approve record
writes. Before `PUT` or `PATCH` mutates anything, the server awaits it with
the exact candidate that would be stored:
`{ path, fields, body? }`, with an extensionless `path`, merged fields for a
patch, and reference serialization and body canonicalization already
applied. Throwing refuses the write with `422` and the thrown message, with no
filesystem change or dirty signal. `DELETE` does not call the hook, and the
server supplies no validation policy of its own.
