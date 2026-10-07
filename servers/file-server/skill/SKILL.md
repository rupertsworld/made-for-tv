---
name: file-server
description: Read, list, write, edit, delete, and watch files in a directory served by file-server over HTTP and WebSocket. Use when building or updating an artifact, script, or service that fetches, displays, uploads, modifies, walks, removes, or reacts to changes in served files given the server's base URL.
---

# Consuming a served directory

Make every request against the base URL you are given (`<base>`). Encode each
path segment for URLs. Query parameters do not select or change resources.

## Install

If no directory is being served yet and the `file-server` binary is missing,
build it from the repository (Node.js 24 or later; `./setup.sh` links the
CLIs into `~/.local/bin`, or pass another PATH directory as its argument):

```sh
git clone https://github.com/rupertsworld/made-for-tv
cd made-for-tv/servers && ./setup.sh
file-server /path/to/directory
```

To hide paths such as dependency folders, add `--ignore` with a `.gitignore`
pattern; it can be repeated. `--ignore node_modules/` hides every
`node_modules` directory and everything inside it.

Use the printed `url:` value as `<base>`. Source and full spec:
`servers/file-server/` in `github.com/rupertsworld/made-for-tv`.

## Read files

- `GET <base>/<path>` returns the file's bytes with its real `Content-Type`.
  Use the URL directly as an image `src` or link, or fetch it as bytes or text
  according to that media type.
- Send `Range: bytes=<start>-<end>` for a partial read. Handle `206` and
  `Content-Range`; a valid but unavailable range returns `416`.
- Save the response's `ETag`, then send it in `If-None-Match` to revalidate
  cheaply. Reuse cached bytes when the response is `304`.

## Walk directories

`GET <base>/<dir>` and `GET <base>/<dir>/` both return UTF-8
`application/vnd.telepath.directory+json`:

```json
{
  "path": "photos",
  "entries": [
    { "name": "archive", "type": "dir" },
    { "name": "latest", "type": "link" },
    { "name": "cat.jpg", "type": "file", "size": 812, "modified": "2026-07-24T10:02:11.000Z" }
  ]
}
```

The listing is one level deep. Fetch `dir` entries as you walk the tree. A
`file` entry includes `size` and `modified`; a `dir` or `link` does not. Links
are visible in listings but cannot be read, written, edited, or deleted: expect
`403`. An extension may add another entry `type`; treat an unrecognized type as
opaque instead of rejecting the listing. Its `name` remains an addressable URL
component.

## Write and delete

- `PUT <base>/<path>` with any byte body creates a file (`201`) or replaces it
  (`204`). It accepts binary and empty bodies and creates missing parent
  directories.
- `DELETE <base>/<path>` removes a file or a whole directory tree (`204`). The
  served root cannot be deleted.

## Edit text

Use an anchored edit when changing a UTF-8 text file:

```js
const response = await fetch(`${base}/config/app.toml`, {
  method: "PATCH",
  headers: { "content-type": "application/vnd.telepath.edit+json" },
  body: JSON.stringify({
    old_string: "port = 8765",
    new_string: "port = 0",
    replace_all: false,
  }),
});
```

The match is literal and must occur exactly once unless `replace_all` is true.
Handle `422` for an empty or missing anchor, `409` for an ambiguous anchor,
`415` for the wrong media type or a non-text or over-limit target, and `413`
for an over-limit request or result. Use whole-file `PUT` for binary or large
content.

## Follow live changes

Open a WebSocket at the base URL root, changing the `http` or `https` scheme to
`ws` or `wss`. Each text message is `{ "type", "path" }`, where `type` is
`created`, `modified`, or `deleted`. It is only a dirty signal: fetch the file
or directory view again rather than applying the message as a patch.

Open the socket before fetching initial state. After every connection, fetch
that state even if no message arrives because the stream has no history or
replay. On a message, schedule another fetch. Keep at most one fetch in flight;
if signals arrive during it, collapse them into one following fetch. On
disconnect, reconnect with backoff and fetch initial state again. Filter by a
path prefix only when the entire view depends on that subtree.

## Handle errors and concurrent changes

Every error body is `{ "error": "<message>" }` with a meaningful HTTP status.
Surface the message instead of swallowing it.

There is no authentication. Dot-prefixed paths, paths matching the server's
ignore patterns, and anything above the served directory are unreachable: they
return `404` and are absent from listings and change signals.
Concurrent mutations are last-write-wins. Read before editing. Treat a
`422` from `PATCH` as a sign that the file may have changed: re-read it and
retry the anchored edit instead of forcing a replacement.
