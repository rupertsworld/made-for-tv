# vault-server

`vault-server` serves a directory over HTTP and WebSocket as files, directories,
and structured markdown records. It extends the `file-server` protocol, so every
base file operation remains available while a markdown file also gains an
extensionless JSON resource.

## Install and run

Node.js 24 or later is required. Go 1.22 is also needed for `./setup.sh`.
From `servers/`, `./setup.sh` builds every server and links the CLIs onto
your PATH, or build just this one:

```sh
npm install
npm -w vault-server run build
ln -s "$PWD/vault-server/dist/src/cli.js" ~/.local/bin/vault-server   # or anywhere on your PATH
```

Check it works:

```sh
vault-server /path/to/vault
# prints  url: http://127.0.0.1:4747
curl http://127.0.0.1:4747/
# a JSON directory listing means it is working
```

The default address is `http://127.0.0.1:4747`. `--host` changes the bind
address and `--port` selects a port. Without `--port`, the server tries ports
4747 through 4846.

The server has no authentication and allows HTTP requests from any origin.
Keep the default localhost binding unless another boundary protects the
service.

## Resources

Every visible regular file is available at its literal path with the complete
`file-server` behavior: media types, ranges, validators, byte `PUT`, anchored text
`PATCH`, and `DELETE`. A markdown file also has a structured record at the path
without the final `.md` suffix.

For a path without a trailing slash, `GET` and `HEAD` select the first existing
resource in this order:

1. the exact regular file;
2. the record backed by `<path>.md`;
3. the exact directory;
4. `404 Not Found`.

A trailing slash selects only the exact directory. Use it whenever a directory
shares a name with a record. An exact regular file shadows the same-named
record, while a directory does not. Appending `.md` to a record URL addresses
its literal source file.

Record JSON has this shape:

```json
{
  "path": "journal/today",
  "fields": {
    "status": "open",
    "contact": { "$type": "ref", "path": "contacts/sample-contact" }
  },
  "body": "Text below the header.\n",
  "links": [{ "path": "contacts/sample-contact", "field": "contact" }],
  "updated": "2026-08-07T09:15:00.000Z"
}
```

Record `GET` and `HEAD` responses, and the record bodies returned by successful
`PUT` and `PATCH`, use
`application/vnd.telepath.record+json; charset=utf-8`. A JSON asset at its
literal file path keeps its ordinary JSON media type.

`body` is omitted when no non-whitespace text is present. References in fields
are objects with `$type: "ref"`; fetch their `path` to follow them. `links`
contains resolved outgoing links and backlinks and appears only on a
single-record read. Invalid frontmatter produces empty `fields`, the entire
source as `body`, and `error.code: "invalid_frontmatter"`. A markdown file that
is not UTF-8 returns `422` at the record URL and remains readable at its raw
URL.

## Directory listings

A directory `GET`, with or without a trailing slash, returns the base envelope:

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

Listings contain immediate children. Base `file`, `dir`, and `link` entries are
unchanged. A `record` entry contains the full single-record representation
without `links`: `path` becomes the extensionless `name` relative to the listed
directory, `updated` becomes `modified`, and `type` is `record`. `fields` is
always present. `body` and `error` follow the same omission rules as a
single-record read. Record entries have no `size`.

Entry names are sorted by JavaScript string order, then by `type` when names
match. Joining the envelope `path` and an entry `name` forms the resource URL;
append `/` to select a directory that shares a record name.

Query parameters do not change directory listings. Filtering, paging, search,
alternate sorting, and recursive traversal remain client work. Consumers of
the former recursive record dump walk `dir` entries and use each full `record`
entry in place as its directory is fetched. This one-level response does not
imply a future deeper representation.

## Mutations

Send record `PUT` and `PATCH` requests to the extensionless path with
`Content-Type: application/vnd.telepath.record+json`. Matching is
case-insensitive and permits media-type parameters. The body is
`{ "fields": <object>, "body": <string|null> }`; other keys are ignored.

`PATCH` applies JSON merge-patch semantics to `fields` and changes `body` only
when supplied. `PUT` replaces all fields and the body, creating parent
directories when required. Successful writes return the current record.
`DELETE` follows the same exact-file, record, then directory resolution order
as reads. Record writes are atomic and last-write-wins.

A `PUT` without the record media type writes bytes to the literal URL. For
`PUT` and `PATCH`, a literal `.md` path always uses the base file behavior. A
double-suffixed source such as `note.md.md` therefore has the readable and
deletable record URL `/note.md`, but record `PUT` and `PATCH` cannot target it.
If an exact regular file shadows a record URL, a record `PUT` or `PATCH`
returns `409`.

## Change stream

Open a WebSocket at `/` or at any existing slash-terminated directory URL. The
subscription is root-wide. Each message is a dirty signal:

```json
{ "type": "modified", "path": "journal/today" }
```

Types are `created`, `modified`, and `deleted`. A markdown source normally
signals its extensionless record path. When an exact regular file shadows that
record, the signal retains the literal `.md` path. Signals have no content,
history, cursor, or replay: connect, fetch initial state, refetch on messages,
and fetch again after reconnecting.

Dot-prefixed paths are absent from reads, listings, writes, and signals.

## Programmatic API

The package exports `VaultServer`. Its constructor accepts `root`,
`pingIntervalMs`, `linkFormat`, `bodyFormat`, `jsonLimit`, and `validate`.
Instances expose `ready`, `listen`, `close`, `url`, `port`, `app`, `server`,
`handleUpgrade`, the live `paths` iterable, and `configure({ linkFormat?,
bodyFormat? })`. `ready` includes both the base watcher and the initial record
index.

```js
import { VaultServer } from "vault-server";

const server = new VaultServer({ root: "/path/to/vault" });
await server.listen({ port: 4747 });
console.log(server.url);
```

## Confinement

Every request is confined beneath the resolved root, and symbolic links are
never served. The check is canonical-path check-then-act: a hostile local
process could replace an intermediate directory with a symbolic link between
the check and the operation. This race is not reachable through server
operations. Use kernel-enforced confinement when the threat model includes a
hostile local process. Hard links and bind mounts are outside this boundary.

The complete contract is in [`spec/vault-server/`](../spec/vault-server/), read together
with [`spec/file-server/server.md`](../spec/file-server/server.md).
