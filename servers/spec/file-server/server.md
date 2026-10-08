# Server

The base wire contract over HTTP and WebSocket. Every path below is relative
to the served directory, called the root. A protocol extension inherits this
contract and documents only the resources, representations, or event-path
mapping it adds.

## URL mapping

The resource is the request-target's undecoded path — or, when the
exported app is mounted beneath a host's prefix, the path remaining after
that prefix. The query is ignored. Each segment is percent-decoded exactly
once. A malformed escape, invalid
UTF-8, a null byte, a backslash (raw or encoded), an encoded `/`, or an
empty interior segment (`/a//b`) is `400 Bad Request`. A decoded segment
that begins with `.` is `404 Not Found` — rejected, never normalised into a
different target. This includes `.` and `..` and hides names such as `.env`
and `.obsidian` from every protocol surface. A path matching one of the
server's [ignore patterns](cli.md#config) is hidden the same way.
Hidden paths are left out of directory listings and the change stream, and
the server does not watch them.

`/` is the root. `/dir` and `/dir/` both address an existing directory;
`/file/` is `404`. `PUT` or `PATCH` to `/` or to any slash-terminated path
is `409 Conflict`. `DELETE` accepts either spelling of a directory, except
the root, which is `409`.

## Routes

```
GET     /<path>   read a file, or list a directory
HEAD    /<path>   the same headers without the body
PUT     /<path>   write a whole file
PATCH   /<path>   replace an anchored span within a text file
DELETE  /<path>   remove a file or directory
OPTIONS /<path>   CORS preflight
WS      /<dir>/   subscribe to root-wide change signals
```

Every syntactically valid path supports this method set and no other;
file-server adds no prefix and reserves no route, so a host that mounts it
under a name (`/photos/2026/cat.jpg`) produces no redundant segment. There
is no health endpoint: readiness is the listening socket and, for a child
process, the CLI's machine-readable `url:` announcement.

## Reading

`GET /<path>` on a regular file returns its bytes with:

- `Content-Type` from the extension via the `mime-db` database, with
  `; charset=utf-8` appended for `text/*`, `application/json`, and any
  `+json` subtype, and `application/octet-stream` when the extension is
  unknown;
- `Content-Length`, `Last-Modified` (HTTP-date), and a weak `ETag` that
  changes whenever the file's size or modification time changes;
- `Accept-Ranges: bytes`.

There is no application-level size limit on a file.

**Ranges.** One `bytes` range is supported, in closed (`0-99`),
open-ended (`100-`), or suffix (`-100`) form. A satisfiable range is
`206 Partial Content` with `Content-Range: bytes <first>-<last>/<size>`
and the selected `Content-Length`. A syntactically valid but unsatisfiable
range — including any range on an empty file — is `416 Range Not
Satisfiable` with `Content-Range: bytes */<size>`. A malformed range,
multiple ranges, or a unit other than `bytes` is ignored and the full
`200` representation is returned; `bytes=5-4` is malformed, `bytes=-0` is
valid and unsatisfiable. `If-Range` is compared against `Last-Modified`
(the `ETag` is weak and so never matches); a match permits `206`, and a
mismatch or an invalid value returns the full `200`.

**Conditionals.** `If-None-Match` supports `*` and comma-separated tags
with weak comparison; when it is present, `If-Modified-Since` is ignored
whether or not a tag matches. Otherwise `If-Modified-Since` applies. Both
are evaluated before `Range`. A match is `304 Not Modified` with the
validator headers and no body. An unparseable date is ignored. Mutation
precondition headers (`If-Match`, `If-Unmodified-Since`) are ignored.

`HEAD` applies the conditionals, ignores `Range`, and returns the status
and headers a full `GET` would, without a body. A missing path is `404`.

## Directories

`GET` on a directory — including `/`, the root — returns a listing as
`Content-Type: application/vnd.telepath.directory+json; charset=utf-8`,
so a listing and a `.json` file are distinguishable by type:

```json
{
  "path": "notes",
  "entries": [
    { "name": "archive", "type": "dir" },
    { "name": "photos", "type": "link" },
    { "name": "todo.md", "type": "file", "size": 812, "modified": "2026-07-24T10:02:11.000Z" }
  ]
}
```

`path` is the decoded path with no leading or trailing slash, `""` for the
root. `entries` is one level deep, sorted by `name` in JavaScript's default
string order. A regular file is exactly `{ name, type: "file", size,
modified }` with `size` in bytes and `modified` as `Date.toISOString()`; a
directory is exactly `{ name, type: "dir" }`; a symbolic link is exactly
`{ name, type: "link" }` and nothing about its target. Sockets, devices,
and other objects are omitted, as are entries whose names are not valid
UTF-8 or contain `\` (they cannot be addressed) and file-server's own
in-progress temporary files (see [Writing](#writing)). Dot-prefixed and
ignored entries are omitted because their paths are hidden protocol-wide.
Joining `path` and an entry's `name` with `/` (or using `name` alone at the
root), then percent-encoding each segment, forms a fetchable URL for that
entry; directory URLs may add the optional trailing `/`. A caller walks a
tree by reading directories as it goes.

Extensions may add entry types. A client must tolerate an unrecognized
`type` by treating the entry as opaque rather than rejecting the listing;
its `name` remains addressable by the rule above.

`Range` and the conditional headers do not apply to directories. `HEAD` on
a directory returns the listing's `Content-Type` and the exact serialised
`Content-Length` without a body.

## Writing

`PUT /<path>` writes the request body as the whole file, creating missing
parent directories. Any bytes are accepted; `Content-Type` may be absent;
a zero-length body creates or replaces an empty file. There is no
application-level size limit. It returns
`201 Created` for a new file and `204 No Content` for an overwrite. A
`PUT` whose path is an existing directory is `409 Conflict`; a directory
is not replaced with a file.

The write is atomic to readers: a concurrent `GET` sees the old content or
the new, never a mixture, and a transfer that fails leaves the existing
file intact and no new file behind. While a write is in progress its
temporary file is invisible: omitted from listings and `404` if addressed;
its name never collides with or replaces an existing entry. On platforms
with POSIX mode bits an overwrite preserves the file's permission bits and
a new file takes the process umask. A successful write updates the
modification time and the `ETag`.

`DELETE /<path>` removes a file, or a directory and everything beneath it,
returning `204 No Content`, or `404 Not Found` if the path does not exist.
`DELETE /` is `409 Conflict`; the root is configuration, not a deletable
resource.

## Editing

`PATCH /<path>` replaces an anchored span of a text file without resending
it. The body is JSON sent as
`Content-Type: application/vnd.telepath.edit+json` (matched
case-insensitively; an optional `charset=utf-8` parameter is permitted):

```json
{ "old_string": "port = 8765", "new_string": "port = 0", "replace_all": false }
```

The body must be an object with exactly a string `old_string`, a string
`new_string`, and an optional boolean `replace_all` (default false); any
other shape — wrong types, extra keys, an array, `null` — is
`400 Bad Request`. The names are the ones agent edit tools use, so an
agent maps them without reading further.

The file is decoded as UTF-8 and `old_string` is matched as a literal
substring: no pattern syntax, no whitespace or line-ending normalisation;
occurrences are counted non-overlapping from left to right, so `"aa"`
occurs once in `"aaa"`. It must appear, and exactly once unless
`replace_all` is true. The result is the decoded text with the
replacement, re-encoded as UTF-8; nothing else in the file — a byte-order
mark, CRLF endings — is touched. In an empty file every non-empty
`old_string` is not found.

Statuses, evaluated in this order after the path resolves: a missing file
is `404 Not Found`; a directory is `409 Conflict`; a body with any other
`Content-Type`, or with a `Content-Encoding`, is `415 Unsupported Media
Type`; a body larger than 16 MiB (16,777,216 bytes) is `413 Content Too
Large`; a malformed body is `400`; a target file larger than 16 MiB, or one
that is not valid UTF-8, is `415` — binary or very large content is
written by whole-file `PUT`; an empty `old_string` is `422 Unprocessable
Content` (it anchors nothing); one not found is `422`; one that is
ambiguous (more than one match, `replace_all` false) is `409`; a result
that would exceed 16 MiB once re-encoded is `413` and nothing is written.
Success is `204 No Content`, written atomically as for `PUT`. Every `415`
and every `OPTIONS` response carries
`Accept-Patch: application/vnd.telepath.edit+json`.

This is the anchored, must-be-unique contract a coding agent's edit tool
uses, so its failure modes are ones an agent already understands. It is a
`PATCH` because it is a partial modification of the resource, and `PATCH`
carries no idempotency requirement — an edit that fails to re-match on a
second application fits it. `PATCH` dispatches on the body's media type,
so other patch documents can be added beside this one without changing it.

## Confinement

Every path resolves beneath the root and cannot escape it. The root is
resolved through symbolic links once, at startup. A `..` segment, or a
path whose canonical location is outside the root, is `404 Not Found` —
refused, never normalised into a different target. For a `PUT` that
creates a new file or directories, the deepest component that already
exists is what is resolved and checked; the rest is created beneath it.

**Symbolic links are not served.** A path any of whose components is a
symbolic link — including one whose target is inside the root — is
`403 Forbidden` for every method, `OPTIONS` and unsupported methods
included: the link check runs before method dispatch. Listings show a link
as `type: "link"` (see [Directories](#directories)) so it is not invisible,
and nothing else. Objects that are neither files nor directories are `404`
for every method. Hard links and bind mounts cannot be detected by path
resolution and are outside the boundary.

The escape that matters is on the write path: a read that slips out of the
root discloses a file; a `PUT` or `DELETE` that does overwrites or removes
one elsewhere on the machine. The guarantee is canonical-path confinement
with one stated limit: between the check and the operation, another
process on the machine could swap an intermediate directory for a symbolic
link. That window requires a concurrent local actor and is not reachable
through file-server's own operations, which never create links. The
package README must state this limit. If the threat model ever includes a
hostile local process,
the answer is a native binary with kernel-enforced confinement, not a
tighter check.

Confinement is the only boundary. Within the root file-server reads,
writes and deletes whatever it is asked to; a caller that should reach
less gets a second file-server on a narrower directory, rather than a
restriction on this one.

## Concurrency

Mutations are not serialised and accept no preconditions. Concurrent
writes to one path are last-write-wins — the write whose atomic commit
completes last determines the final state, not the request received last —
each atomic on its own; a `PATCH` can lose a change made between its read
and its write.

## Change stream

A WebSocket upgrade on `/`, or on any other existing directory's
slash-terminated URL, subscribes to the same root-wide stream. The upgraded
URL does not scope the subscription. A malformed, hidden, confined-out, or
non-directory path refuses the upgrade under the corresponding HTTP path
rule.

Each text message is one JSON dirty signal:

```json
{ "type": "created", "path": "notes/todo.md" }
```

`type` is `"created"`, `"modified"`, or `"deleted"`; `path` is the decoded
root-relative path with no leading or trailing slash. Joining it onto the
base URL forms the resource URL. The signal means only that something at
that path changed in the named way. It carries no content, metadata, object
type, or patch, and a consumer does not use it to update local state
directly: it refetches the resource or directory view it depends on.

The stream reports successful HTTP mutations and changes made outside the
server. Hidden paths, special objects, symbolic links, and in-progress
temporary files do not produce signals.
Renaming a visible resource produces `deleted` for its old path and
`created` for its new one. Closely spaced changes to one path may be
coalesced; event order across different paths carries no transaction or
causality meaning.

There is no history, cursor, or replay. A consumer opens the socket and then
fetches its initial state; on every message it schedules another fetch. It
does not overlap refreshes: signals received during a fetch collapse into
one following fetch. On disconnect it reconnects with backoff and fetches
initial state again, because changes during the gap cannot be recovered from
the stream.

The server sends protocol-level pings and terminates a connection that fails
to answer a round, so vanished peers do not accumulate buffered signals.
WebSockets are exempt from CORS.

## CORS

The shared [HTTP conventions](../index.md#http-conventions), with
these header values on the preflight:

```
Access-Control-Allow-Methods: GET, HEAD, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Range, If-None-Match, If-Modified-Since, If-Range
Access-Control-Expose-Headers: ETag, Accept-Ranges, Content-Range, Accept-Patch
Access-Control-Max-Age: 86400
Accept-Patch: application/vnd.telepath.edit+json
```

Non-`OPTIONS` responses carry `Access-Control-Expose-Headers` too, so
a page can read the validators and range headers.

## Errors

A method outside the set above is `405 Method Not Allowed` with
`Allow: GET, HEAD, PUT, PATCH, DELETE, OPTIONS`, whether or not the path
exists. Checks are applied in the order: URL syntax (`400`); hidden segments
(`404`); symbolic links (`403`) and special objects (`404`), which therefore
apply to every method; method (`405`, and `OPTIONS` → `204` regardless of
existence); confinement and resource type (`404`, `409`); then the
operation's own validation. Filesystem failures map
`ENOENT`/`ENOTDIR` to
`404`, `EACCES`/`EPERM` to `403`, and anything unexpected to `500`.

Every error response except to `HEAD` has a body: `application/json;
charset=utf-8` in the shared [shape](../index.md#http-conventions), so
a caller reads one shape whether the failure is a `404`, a `405`, or
an edit's `422`. `HEAD` errors carry the same status and headers with
no body; `204` and `304` responses have no body.

## API

The package exports the server and its extension types, so a host can run or
extend the protocol in its own process instead of spawning the binary.

```js
import { FileServer } from "@rupertsworld/file-server";

const server = new FileServer({ root: "/path/to/directory" });
await server.listen({ port: 8765 });
console.log(server.url);
```

`listen` resolves with the server itself, so it chains:
`await new FileServer({ root }).listen()`. The address is read from the
server rather than the resolved value, so it is available wherever the
instance is held.

- `new FileServer({ root, defaultPort?, pingIntervalMs?, ignore?, extension? })` —
  `root` is the directory to serve, resolved through symbolic links; it must
  exist and be a directory. `ignore` is an array of
  [ignore patterns](cli.md#config) and defaults to none. `defaultPort` sets
  the base port used when `listen` receives no explicit port and defaults
  to `8765`. `pingIntervalMs` controls WebSocket keepalive and defaults to
  30 seconds. `extension` is the protocol-extension seam below.
- `ready` — resolves once the root has been resolved and checked and the
  change watcher is ready; it rejects if either fails. `listen` awaits it,
  and so does every request handled through `app`, so a host that mounts
  `app` without calling `listen` gets the same readiness check.
- `listen({ host?, port? })` — `host` defaults to `127.0.0.1`. With no
  `port`, it binds from the configured `defaultPort` according to the
  [shared CLI conventions](../cli.md). With an explicit `port` it binds that
  port or rejects if it is in use — an explicit choice never moves.
  Port `0` binds one the operating system chooses. Rejects if the root does
  not resolve. An instance listens once; after `close`, make a new instance.
- `close(): Promise<void>` — stops the watcher, terminates subscriptions,
  and resolves after the listener has released its port. Idempotent: a no-op
  after closing. Calling it before `listen` still stops the watcher and closes
  the instance; a closed instance cannot subsequently listen.
- `url` and `port` — the address bound, `undefined` before listening and
  after closing. `url` is a valid URL for the bound address — an IPv6
  literal is bracketed — and reflects the bind address, so binding
  `0.0.0.0` reports `http://0.0.0.0:<port>`, which names the interface
  rather than a reachable host.
- `app` and `server` — the Express app and Node server, for mounting or
  inspection. `app` carries HTTP only. `server` forwards upgrades to
  `handleUpgrade` automatically.
- `handleUpgrade(request, socket, head, requestTarget?): Promise<void>` — the
  bound WebSocket upgrade handler. The first three arguments are the Node
  `upgrade` event's `http.IncomingMessage`, `stream.Duplex`, and `Buffer`;
  `requestTarget` is an optional string containing the request target as seen
  inside the mount, including any query, and defaults to `request.url`. The
  method awaits readiness, accepts or rejects the upgrade using the same path
  and error rules as the standalone server,
  and resolves after the WebSocket owns the socket or an HTTP error has been
  written and the socket closed. It does not reject: readiness, protocol, and
  unexpected server failures use the base status mapping on the socket.
  When a host mounts `app` under a prefix, its own `upgrade` listener filters
  that prefix and forwards the request with the prefix-stripped request target:

  ```js
  host.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/files" && !url.pathname.startsWith("/files/")) return;
    const target = `${url.pathname.slice("/files".length) || "/"}${url.search}`;
    void files.handleUpgrade(request, socket, head, target);
  });
  ```

  The host remains responsible for selecting only requests inside the mount;
  `handleUpgrade` interprets the supplied target as mount-relative and never
  strips a prefix itself.

### Extension seam

The package exports `FileServerExtension`, `FileServerExtensionContext`,
`DirectoryListing`, `DirectoryEntry`, and `FileChangeEvent` beside
`FileServer`. `VaultServer` uses this seam; an extension does not replace or
copy the base router. It handles only the deltas its own wire spec names and
must delegate every other request and representation unchanged.

The exported wire shapes have the meanings established above:

- `DirectoryListing` is `{ path, entries }`: `path` is the decoded
  root-relative string without leading or trailing slash, empty for the root,
  and `entries` is an array of `DirectoryEntry` values.
- `DirectoryEntry` has a decoded `name` string and `type` string. For core
  values it is exactly `{ name, type: "dir" }`, `{ name, type: "link" }`, or
  `{ name, type: "file", size, modified }`, with `size` a byte count and
  `modified` an ISO 8601 string. The type permits other type values and
  JSON-compatible properties so an extension can add a representation
  without making base clients reject it.
- `FileChangeEvent` is an object with `type` equal to `created`, `modified`,
  or `deleted`, and a decoded root-relative `path` string, exactly as in
  [Change stream](#change-stream). It has no other properties.

`FileServerExtension` is an object with any of these three optional hooks.
Each hook may return its result directly or return a promise for it; the
server awaits either form:

- `handle(request, response, context): boolean | Promise<boolean>` runs after
  URL hygiene, confinement, common headers, method validation, and `OPTIONS`,
  but before base resource dispatch. `request` and `response` are the Express
  request and response. It returns a boolean: `true` only after ending the
  response, or `false` without having changed the response to delegate to the
  base handler. Returning
  `true` with an open response, or `false` after headers or bytes have been
  written, is an extension error and produces `500 Internal Server Error`
  where the response can still be written; otherwise the connection is
  closed.
- `listing(request, listing, context): DirectoryListing |
  Promise<DirectoryListing>` receives the base one-level `DirectoryListing`
  immediately before serialization. `request` is the Express request, and
  `context` identifies the directory being listed. The hook returns the
  `DirectoryListing` to serialize. This is where an extension decorates
  entries or selects a named alternate listing
  representation. A return value that is not a valid listing is an extension
  error and produces `500 Internal Server Error`.
- `change(event): FileChangeEvent | null | Promise<FileChangeEvent | null>`
  receives a `FileChangeEvent` immediately before broadcast and returns a
  `FileChangeEvent` to publish or `null` to suppress it. The hook completes
  before subscribers see the signal.

An exception from `handle` or `listing` follows the normal [error
mapping](#errors): a failure raised by a context operation keeps that
operation's status, while any other exception is `500 Internal Server Error`.
If the response has already started, it is closed instead of attempting a
second response. If `change` throws or its promise rejects, the original base
event is published unchanged and the failure is reported on stderr; an
extension failure cannot erase the base dirty signal. A `change` return value
other than a valid event or `null` is handled as the same failure.

`FileServerExtensionContext` is a per-request object. Its values are
read-only:

- `path` is the decoded root-relative request path without a leading slash;
  the root is the empty string.
- `segments` is the corresponding array of decoded path segments.
- `trailingSlash` says whether the request path ended in `/`.
- `resource` is the already-inspected exact resource. It is `{ type:
  "missing" }`, `{ type: "dir" }`, or `{ type: "file", size, modified }`,
  where `size` is bytes and `modified` is the ISO 8601 mtime. Symlinks and
  special objects do not reach an extension hook because the base checks
  reject them first.

The context has four awaited operations. Every `path` argument is a decoded,
root-relative path without a leading slash; the empty string denotes the
root. The operations apply the same URL-mapping, confinement, permission, and
filesystem error rules as a request. They never return an absolute filesystem
path.

- `inspect(path)` is asynchronous. It takes one path string and resolves with
  the same resource object as `resource`. Absence resolves as `{ type:
  "missing" }`; a malformed, escaping, or inaccessible path rejects with its
  base `400`, `403`, or `404` failure.
- `list(path): Promise<DirectoryListing>` takes one path string and resolves
  with the base, one-level listing for that directory. It does not call the
  extension's `listing` hook. A missing path or a path that is not a directory
  rejects with `404`; other failures keep their base mapping.
- `replace(path, bytes): Promise<"created" | "replaced">` atomically creates
  or replaces a regular file using the base byte-write behavior. `bytes` is a
  `Uint8Array` or `Readable` from `node:stream`. It creates missing parent
  directories and emits the corresponding base change signal. A root,
  slash-terminated, or directory target rejects with `409`; path, permission,
  stream, and I/O failures keep the base mapping and preserve any old file.
- `remove(path): Promise<void>` recursively deletes the exact file or
  directory using the base delete behavior and emits a `deleted` signal. The
  root rejects with `409`, a missing resource with `404`, and other failures
  keep the base mapping.

Mutations through the context use the base concurrency and event machinery,
including suppression of the duplicate watcher signal. An uncaught operation
failure is mapped by the calling hook as described above; an extension that
catches it owns the response or alternate result from that point.

The base wire behavior has no other configuration: what it serves is the
root, less any paths matching its [ignore patterns](cli.md#config), and how
is [the server contract](server.md).
