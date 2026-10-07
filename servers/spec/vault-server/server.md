# Server

The vault-server extension to the [file-server wire
contract](../file-server/server.md). Every file-server rule applies unless this
document replaces it. This document defines only the structured record
resource, enriched directory representations, record mutations, and the
record-path mapping applied to change signals.

Root self-description, governance, and described-corpus behavior are outside
this extension; a higher-level host such as `autofile serve` may add them.
`GET /` is simply the root directory listing described below.

## Record representation

A record is the structured view of a UTF-8 markdown file in the vault. Its
JSON shape:

```json
{
  "path": "journal/2026-08-07",
  "fields": {
    "status": "open",
    "contact": { "$type": "ref", "path": "contacts/sample-contact" }
  },
  "body": "Raw text below the header.\n",
  "links": [{ "path": "contacts/sample-contact", "field": "contact" }],
  "updated": "2026-08-07T09:15:00.000Z",
  "error": {
    "code": "invalid_frontmatter",
    "message": "Frontmatter could not be parsed"
  }
}
```

`error` is omitted for a valid record; it is shown above to document its shape.

- `path` is the record's API identifier: vault-relative and extensionless,
  identical to its URL (`journal/2026-08-07`). The `.md`-suffixed path
  still addresses the file itself; it never appears in payloads.
- `fields` is the markdown file's YAML header keys — the header and
  nothing else, so no field name is reserved: a header key named `body`
  is an ordinary field.
- `body` is the region below the header, a sibling of `fields`: document
  text and structured fields travel separately, so a storage model with
  no document text simply has no `body`. Absent when nothing (or only
  whitespace) sits below the header. On disk, a record with no `body` is
  its header alone; a record with no fields and no body is an empty
  file.
- Header values parse to JSON values and nothing richer — null,
  booleans, numbers, strings, arrays, objects. YAML's legacy types are
  not applied, so an unquoted date or a `12:34:56` stays the string it
  was written as. Values round-trip through YAML parse/serialize on
  write — preserved as values, byte-level formatting and key order not
  guaranteed.
- If the header fails to parse or is not a map, the record serves the whole
  file (bad header included) as `body`, empty `fields`, and `error: { "code":
  "invalid_frontmatter", "message": "Frontmatter could not be parsed" }`.
  `error` is present only when the structured record could not be produced
  normally; `code` is stable and `message` is human-readable.
- A markdown file that doesn't decode as UTF-8 fails the record view
  with 422; serving the file is unaffected.
- `links` is every internal link touching the record, in both
  directions — derived, never stored; see below.
- `updated` is the file's mtime, ISO 8601. There is no `created` — real
  creation dates belong in `fields`.

## Links

Internal links appear in two containers — field values and body prose —
and one mechanism handles both. The containers differ only in how links
are detected, represented, and echoed; syntax, resolution, and
canonicalization are shared.

### Syntax and resolution

Both syntaxes are read everywhere: a wikilink and a markdown link are
each a link, in fields and in prose, whatever the vault mostly uses.
Nothing has to be configured to read a vault.

The server's link format ([the API](api.md)) governs writing alone —
the syntax the server spells a link in when it writes one, `wikilink`
or `markdown`. It is given when the server is created; the standalone
CLI default is `wikilink`.

- A wikilink target is matched against the vault as a path suffix: it
  resolves where some file's path ends with the target's segments — as
  written first, then with `.md` appended — a bare name being the
  one-segment case. Where several paths carry the suffix, the nearest
  neighbour wins: the candidate with the shortest relative path from
  the linking record's directory, remaining ties breaking
  lexicographically. A resolved record yields its extensionless path, a
  resolved file its file path. Dot-prefixed paths never match.
- A markdown target resolves as a URL resolves: against the record's
  folder, percent-decoding applied and traversal past the vault root
  clamped at the root. A scheme'd destination, `//` included, is
  external and untouched everywhere.
- A link is a link because of how it is written, not because of what it
  finds: an unresolved target is carried as written and reads as a dead
  link — a `GET` of it answers 404 — so nothing changes type or meaning
  when an unrelated file appears or is removed.
- A `#fragment` or `?query` is carried on the end of the target, as a
  URL carries one, so nothing an author wrote is lost.
- A link's display text is its authored alias or link text, else the
  target as written.
- Resolution depends on vault-wide state: filing a record can change
  what an existing short link resolves to, without an event for the
  records that reference it. Clients re-render on events and refetch
  what they display.

### In fields: references

A field value that is *entirely* an internal link — in either syntax —
is a reference, served as an object. Conversion runs at any depth, so a
list of links becomes a list of references. A value merely containing a
link is a string, as is a link to a scheme'd destination.

```json
{ "$type": "ref", "path": "contacts/sample-contact", "label": "Contact" }
```

- `path` is where the target resolves — directly fetchable when it
  does.
- `label` is the display text whenever that differs from `path`
  (`[[sample-contact]]` renders "sample-contact"; `[[…|Contact]]` renders
  "Contact"). Consumers display `label ?? path` and match what a
  wikilink-aware editor shows.

The `$type` key is reserved API-wide: an object carrying it is
API-interpreted, and data must not use it. `"ref"` is the only `$type`.
References arise only from link scalars — a stored YAML mapping
that itself carries a `$type` key serves as the data it is, and is
refused if written back, the cost of the reservation.

On write, a reference object must be exactly `{ $type: "ref" }` with a
string `path` and an optional string `label` — anything else, unknown
`$type` values included, is rejected with 400. It serializes back as
one link in the vault's syntax: under `wikilink`, `"[[<path>]]"` or
`"[[<path>|<label>]]"`, with `path` exactly as submitted — the server
never resolves or rewrites a submitted `path`; under `markdown`,
`"[<label ?? path>](<target>)"`, the target being the submitted `path`
spelled relative to the record's folder — a change of spelling, not of
meaning. Canonical spellings spread without write-time resolution
because reads serve resolved `path`s: a reference that round-trips
through any client lands as its resolved path.

The field echo rule: **a written reference whose target resolves to the
same path as the stored link in the same position — same field, same
array index — with the same display text, leaves that field's stored
link text unchanged.** Anything else — a changed target or label, a
reordered list, a reference moved between fields — is an authored
change, written as submitted. A PUT that changes other fields therefore
rewrites no links, and a stale read pins the target the writer actually
saw. Merge-patch applies to the record as served — references in object
form — so patching `{"label": …}` onto a reference field updates its
label and keeps its `path`.

### In prose

Bodies are markdown. Reads transform their links one way, writes
canonicalize the other, and `<path>.md` always serves the file
verbatim, so the untransformed body is one request away.
Records whose body the caller declares raw ([the API](api.md)) are
exempt from both directions: their bodies are not markdown to this
server, so they pass through untouched, and what such a body is — HTML,
plain text — is the record's own business to declare in its fields.

**On read**, each whole prose wikilink outside code becomes a standard
relative markdown link: target resolved as above, destination
relativized against the record's folder, display text as the link
text. An embed (`![[…]]`) serves as the corresponding markdown image —
record targets included; transclusion is not a wire concept, and a
client wanting the record fetches it. Emitted link text is escaped so
it renders as the authored text; destinations are percent-encoded where
URL syntax requires. Everything else — authored markdown links, URLs,
HTML, code — passes as stored. Clients therefore render prose with any
markdown renderer and no vault knowledge, and the transform is the same
whatever the vault's link syntax.

**On write** — only when the write supplies a `body` — internal links
are canonicalized by shape toward the vault's syntax:

- Under `wikilink` (the default): an internal inline markdown link or
  image destination — relative, or vault-root `/` — becomes the
  wikilink it denotes, its target computed positionally against the
  record's folder (no index consulted, so unfiled targets convert
  deterministically), the link text kept as the alias when it differs
  from the target. Wikilinks pass through as written.
- Under `markdown`: a prose wikilink becomes the standard markdown link
  it denotes, relative to the record's folder, and a `/`-rooted
  destination is rewritten relative to the record. Relative markdown links pass
  through as written.
- A link whose text or target the target syntax cannot carry (a `]]` or
  `|` wikilink grammar has no spelling for) passes through as
  authored — canonicalization is by shape and never lossy.
- The scan is CommonMark-aware only enough to skip fenced code blocks
  and inline code spans, and reads only inline `](…)` destinations:
  reference definitions, autolinks, HTML, and all other text pass byte
  for byte.

The body echo rule: **a written body equal to the served form of the
stored body leaves the stored bytes untouched.** A body fetched and PUT
back unchanged rewrites nothing, whatever mix of spellings the stored
text holds.

### The link list

A record serves `links`: one entry per internal link touching it — the
links it makes and the links made to it — so a client renders what a
record connects to, and what connects to it, without parsing anything.

```json
"links": [
  { "path": "contacts/sample-participant", "field": "participants" },
  { "path": "items/sample-item" },
  { "path": "events/sample-event", "field": "related", "backlink": true }
]
```

Each entry is one link, and `path` names the record at its other end —
the target of a link this record makes, or the source of a link made to
it, marked `backlink`. `field` is the frontmatter key carrying the
link — in this record for its own links, in the other record for a
backlink — and its absence means the link is written in prose. So
`{ "path": "events/…", "field": "participants", "backlink": true }`
says that event lists this record among its participants.

Only resolved links appear; a link to nothing has no record at its
other end, and stays visible as the dead link it is in `fields`.
External URLs are not links in this sense — they navigate away from the vault, and a
`url` field already sits in `fields`. A body declared raw ([the
API](api.md)) is not parsed, so it contributes nothing: an archived
email's tracking URLs never reach this list.

One entry per occurrence, so a mutual link yields two entries, one each
direction, and a record linked from two fields yields two. A client
wanting one row per neighbour dedupes on `path`.

`links` is derived and read-only. Writes ignore it, as they ignore
`updated`, and it is served on single-record reads only — a listing
carrying every record's edges is a different object, built for a graph
rather than a view.

## Record paths

Every visible regular file remains a [base file
resource](../file-server/server.md) at its literal path; non-markdown assets have no
vault-specific handling. A markdown file has one added resource: dropping
its final `.md` suffix addresses its record. At the markdown source's full
literal path, it retains every base byte-read, write, edit, delete, range, and
validator behavior.

For a `GET` or `HEAD` without a trailing slash, the extension tries the
following in order and serves the first that exists:

1. an exact regular file, served by the base protocol;
2. the record backed by `<path>.md`;
3. an exact directory, served as the listing below;
4. the base `404 Not Found`.

A trailing slash selects an exact directory or returns `404`. This preserves
both resources when `journal.md` and `journal/` coexist: `/journal` is the
record and `/journal/` the directory. An exact regular file at the
extensionless path shadows the same-named record, which remains available
only as its raw `.md` file. Symbolic links and special objects are rejected by
the base protocol's earlier checks and never shadow a record.
A directory without a colliding record retains the base protocol's equivalent
`/dir` and `/dir/` spellings.

`GET` on a record returns the [record representation](#record-representation)
as `application/vnd.telepath.record+json; charset=utf-8`, distinguishing the
structured resource from a JSON file. `HEAD` returns the headers, including
the same media type and exact serialized `Content-Length`, without the body.
The `path` field and event paths use the API spelling: extensionless for
records and literal for base files. Only the raw source URL carries the
record's `.md` suffix.

Directory `GET` and `HEAD` use the [listing extension](#directory-listings).
Every other request delegates to the base protocol except for the record
mutations below.

## Record mutations

`PUT` and `PATCH` with
`Content-Type: application/vnd.telepath.record+json` select the record
resource at an extensionless, non-slash-terminated path. Media-type matching
is case-insensitive; parameters such as `charset=utf-8` are permitted and
ignored. This media type is the dispatch boundary: a `PUT` with any other
content type, or none, is the base byte upload at the literal path and can
create an exact regular file that shadows the intended record. Callers
intending a record write therefore send the record media type explicitly.
The base protocol does not otherwise interpret `Content-Type`. For `PUT` and
`PATCH`, a literal `.md` path is always a base file path. A double-suffixed
source such as `note.md.md` consequently has the record URL `/note.md`: it is
readable and deletable there, but record `PUT` and `PATCH` cannot target it;
it is writable only as raw bytes at its literal `/note.md.md` path. This
degenerate naming is best avoided. If an exact regular file occupies a
selected record URL, the record write is `409 Conflict` because its result
could not be read back at that URL.

The record request body is `{ "fields": <object>, "body": <string|null> }`,
each key optional. Every other key is ignored, including `path`, `links`,
`updated`, and `error`, so a caller may submit a previously fetched record
object without removing its read-only properties. `PUT` replaces the record:
`fields` becomes the whole header (absent means empty), while an absent or
null `body` means no body. It creates missing parent directories and returns
the resulting record with `201 Created` for a create or `200 OK` for a
replacement.

`PATCH` partially updates an existing record. It applies RFC 7386 merge-patch
to `fields`, replaces `body` only when that key is present, and removes the
body when its value is null. `{}` is a no-op returning the current record.
Success returns the resulting record with `200 OK`; a missing record is
`404`.

Every successful `PUT` or `PATCH` response that carries the resulting record
uses `application/vnd.telepath.record+json; charset=utf-8`, the same media type
as record `GET` and `HEAD`.

Malformed JSON, a non-object `fields`, or a non-string non-null `body` is
`400 Bad Request`. Record request bodies are capped at 32 MB; an over-limit
write is `413 Content Too Large`. A server with a `validate` hook ([the
API](api.md)) returns `422 Unprocessable Content` with the refusal's message
when the hook rejects a write.

`DELETE` uses the read-resolution order above: it deletes an exact regular
file through the base protocol, otherwise the record at `<path>.md`, otherwise
an exact directory. A trailing slash selects the directory. Record deletion
is `204 No Content`, or `404` when the record does not exist. It does not run
the record validation hook.

Record writes use the base protocol's atomic replacement guarantee. External
sync handles propagation; conflict resolution is out of scope. Record writes
accept no preconditions and are not serialized, so concurrent `PATCH`
requests can race at read-merge-write and all mutations are last-write-wins
as described by the base [concurrency contract](../file-server/server.md#concurrency).

## Directory listings

Directory `GET` returns the one-level base listing envelope as
`application/vnd.telepath.directory+json; charset=utf-8`. `HEAD` returns the
same media type and serialized `Content-Length` without a body.

```json
{
  "path": "projects",
  "entries": [
    { "name": "archive", "type": "dir" },
    { "name": "diagram.png", "type": "file", "size": 18432, "modified": "2026-08-07T09:10:00.000Z" },
    {
      "name": "roadmap",
      "type": "record",
      "modified": "2026-08-07T09:15:00.000Z",
      "fields": { "status": "open" },
      "body": "Next milestone.\n"
    }
  ]
}
```

`path` has the base meaning. `entries` contains immediate children and is
sorted by `name` in JavaScript default string order, with ties sorted by
`type` in that order. Base `dir`, `file`, and `link` entries are unchanged.

A markdown file whose extensionless resource resolves as a record contributes
the full record representation in place, adapted to the directory-entry
contract. The record `path` becomes an extensionless `name` relative to the
listed directory, `updated` becomes `modified`, `type` is `record`, and
`links` is omitted. `fields` is always present. `body` and `error` follow the
same omission rules and use the same values as a single-record read. A record
entry has no `size`.

If an exact regular file shadows the record URL, the markdown source remains
an ordinary `file` entry under its literal `.md` name. A same-named directory
does not shadow a record: both entries have the same `name`, with the directory
at the slash-terminated spelling. Invalid frontmatter does not change the
record entry type. A markdown file that is not valid UTF-8 remains a raw file
entry and its record `GET` returns `422`.

The base addressability invariant remains: joining the envelope `path` and an
entry `name` forms the entry URL, with a trailing slash selecting a directory
when it shares a name with a record.

Directory listings accept no vault-specific query parameters. Arbitrary query
parameters are ignored under the base protocol and do not change listing depth
or record content. Listings provide no server-side filtering, paging, search,
or alternate sorting.

Consumers of the former recursive record dump walk entries with `type: "dir"`
and use each full `record` entry in place as its directory is fetched. This
one-level contract does not define or imply a future deeper representation.

## Change-event paths

The extension maps the base [change signal](../file-server/server.md#change-stream)
for a markdown source to the extensionless record path a subscriber
refetches. If an exact regular file shadows that record URL, the
event keeps the literal `.md` path instead. Every other event path and all
stream, lifecycle, reconnection, and dirty-signal semantics are inherited
unchanged.
