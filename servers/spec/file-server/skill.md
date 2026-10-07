# Skill

The consumer skill follows the shared
[skill conventions](../skill.md), instructing clients of a served
directory. Its description triggers on an artifact, script, or
service reading, listing, writing, editing, or watching files over HTTP and
WebSocket.

The skill must cover:

- **Reading.** A file is its bytes at its path with a real `Content-Type`,
  so it can be an `<img src>`, a link, or a `fetch`; `Range` for partial
  reads and `ETag`/`If-None-Match` for cheap revalidation.
- **Directories.** A directory URL, with or without a trailing slash,
  returns `{ path, entries }` as `application/vnd.telepath.directory+json`
  (UTF-8). Entries are `file` (with `size` and `modified`), `dir`, or `link`,
  one level deep — walk by fetching directories as you go. Links are listed
  but cannot be read or written (`403`). Treat an unrecognized entry type as
  opaque rather than rejecting the listing; its `name` is still an
  addressable URL component.
- **Writing.** `PUT` any bytes to a path to create or replace a file
  (`201`/`204`; parent directories are created); `DELETE` a file or a whole
  directory (`204`); the root cannot be deleted.
- **Editing.** `PATCH` with `Content-Type: application/vnd.telepath.edit+json`
  and `{ old_string, new_string, replace_all? }` — literal match, must be
  unique unless `replace_all`, text files only; the failure modes to
  handle: `422` not found or empty anchor, `409` ambiguous, `415` wrong
  media type, not a text file, or a file too large to edit, `413` body or
  result too large. Whole-file `PUT` for anything binary or large.
- **Live updates.** Subscribe by WebSocket to `/`, mapping the scheme from
  the base URL. A message is only `{ type, path }`, where `type` is
  `created`, `modified`, or `deleted`; treat it as "refetch", never as a
  patch. Fetch initial state after every connection, because there is no
  history or replay; do not overlap refreshes; reconnect with backoff. A
  client may filter by path prefix only when its whole view depends on that
  subtree.
- **Boundaries.** No authentication; query parameters are ignored;
  dot-prefixed paths, paths matching the server's ignore patterns, and
  anything above the served directory are unreachable; concurrent writers
  are last-write-wins, so read before you edit and treat a `422` on `PATCH`
  as "the file changed underneath you" — re-read and retry rather than
  forcing.
