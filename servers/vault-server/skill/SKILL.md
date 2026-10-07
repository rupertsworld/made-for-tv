---
name: vault-server
description: Read, list, write, edit, or watch files and structured records in a vault served over HTTP and WebSocket, given the server base URL. Use when building or updating an artifact, dashboard, script, or service that fetches or edits served vault data.
---

# Consuming a served vault

Use the supplied server URL as `<base>`. If no server is running, run
`vault-server` and use the printed `url:` value. If the command is unavailable,
build it from the repository (Node.js 24 or later; `./setup.sh` links the
CLIs into `~/.local/bin`, or pass another PATH directory as its argument):

```sh
git clone https://github.com/rupertsworld/made-for-tv
cd made-for-tv/servers && ./setup.sh
```

## Base file protocol

- `GET <base>/<path>` reads a file with its real `Content-Type`. Use it
  directly for images, downloads, and `fetch`. Use `Range` for partial reads
  and `ETag` with `If-None-Match` for revalidation.
- A directory URL, with or without a trailing slash, returns `{ path, entries }`
  as `application/vnd.telepath.directory+json`. Base entries are `file` with
  `size` and `modified`, `dir`, or `link`, one level deep. Fetch child
  directories to walk a tree. Links are listed but return `403` if read or
  mutated. Treat an unknown entry `type` as opaque; its `name` remains an
  addressable URL component.
- `PUT` bytes to create or replace a literal file (`201` or `204`), including
  missing parent directories. `DELETE` removes a file or directory tree. The
  root cannot be deleted.
- Edit UTF-8 text with `PATCH`,
  `Content-Type: application/vnd.telepath.edit+json`, and a JSON body with
  `old_string`, `new_string`, and optional `replace_all`. The literal anchor
  must occur exactly once unless `replace_all` is true. Handle `422` for a
  missing or empty anchor, `409` for ambiguity, `415` for media/type/size
  refusal, and `413` when the request or result is too large. Use byte `PUT`
  for binary or large files.
- Query parameters have no base meaning. Dot-prefixed paths and paths above
  the served root are unreachable. Concurrent mutations are last-write-wins;
  after an edit conflict or `422`, reread before retrying.
- The server has no authentication. Treat the base URL as a trusted local
  capability rather than exposing it directly to an untrusted network.

## Records and resolution

A markdown source has a record at the URL without its final `.md`. Record
`GET`, `HEAD`, and successful record `PUT` and `PATCH` responses use
`application/vnd.telepath.record+json; charset=utf-8`. A record is `{ path,
fields, body?, links, updated, error? }`. `body` is text beside `fields` and
has no assumed format. Invalid frontmatter has empty `fields`, an `error` whose
stable code is `invalid_frontmatter`, and the source text as its body. `links`
lists resolved outgoing links and backlinks and is read-only.

A field object with `$type: "ref"` is a reference. Display `label ?? path` and
follow it with `GET <base>/<path>`.

For a URL without a trailing slash, resolution is exact regular file, then the
record backed by `<path>.md`, then exact directory. An exact file can therefore
shadow a record. A trailing slash selects only a directory; use it whenever a
directory shares a name with a record. Append `.md` to a record URL to address
its raw source with the complete base file behavior.

## Record-aware directories

A `record` entry is `{ name, type: "record", modified, fields, body?, error? }`.
It contains the single-record representation without `links`: `path` becomes
the extensionless `name` relative to the listed directory, and `updated`
becomes `modified`. `fields` is always present; `body` and `error` are omitted
under the same conditions as a single-record read. Record entries have no
`size`.

Joining the envelope `path` and any entry `name` forms that resource URL;
append `/` to select a directory in a record/directory name collision. Entries
contain immediate children. To migrate a consumer of the former recursive
record dump, walk `dir` entries and use each full `record` entry in place as
its directory is fetched.

Query parameters do not change directory listings. Filtering, paging, search,
alternate sorting, and recursive traversal remain client work. The one-level
response does not imply a future deeper representation.

## Record writes

Send `{ fields, body }`, separately as served, to the extensionless path with
`Content-Type: application/vnd.telepath.record+json`.

- Prefer `PATCH`. Send only changed fields; `null` deletes a field. A supplied
  `body` replaces the body, `body: null` removes it, and `{}` is a no-op.
- Use `PUT` only with a complete record. It replaces `fields` wholesale and
  replaces the body; an absent body removes it.
- `DELETE <base>/<path>` removes the resource selected by the read-resolution
  order.
- A byte `PUT` without the record media type writes the literal file and may
  shadow a record.

Take the returned record as current truth. Every error is
`{ "error": <message> }` with a meaningful HTTP status; surface it instead of
swallowing it.

## Live and optimistic updates

Open a WebSocket before fetching initial state, mapping an `http` or `https`
base scheme to `ws` or `wss`. `/` and every existing slash-terminated directory
URL subscribe to the same root-wide stream. A message is `{ type, path }`, with
`type` equal to `created`, `modified`, or `deleted`; it is a refetch signal, not
a patch. Schedule a fetch of the resource or listing on every message.

A markdown event normally names the extensionless record. When an exact file
shadows that record URL, the event retains the literal `.md` path. Filter by
path prefix only when the view depends entirely on that subtree. Refetch on
every event when a view renders references because their resolution is
vault-wide.

Keep one fetch in flight and queue at most one more after a burst. The stream
has no history or replay, so reconnect with backoff and fetch initial state
again after every connection.

For optimistic writes, update locally, send the mutation, accept the returned
record as truth, and roll back while surfacing the error on failure. Hold
event-driven refetches while the write is in flight so an unrelated signal
cannot revert the optimistic state.
