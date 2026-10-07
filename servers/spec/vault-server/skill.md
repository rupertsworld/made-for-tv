# Skill

The consumer skill follows the shared [skill conventions](../skill.md) and
includes the complete [file-server skill contract](../file-server/skill.md), then
teaches only the record extension below. Its description triggers on an
artifact, dashboard, script, or service fetching or editing vault data.

The skill must cover:

- **Records.** A record is `{ path, fields, body?, links, updated, error? }`
  at its extensionless URL; `body`, when present, is its own key beside
  `fields`, with no format assumed. Invalid frontmatter carries an `error`
  whose stable code is `invalid_frontmatter`. A field object whose `$type`
  is `"ref"` is a reference, followed by fetching `base + path`; `links`
  lists resolved outgoing links and backlinks and is read-only.
- **Directories.** A directory URL, with or without a trailing slash,
  returns `{ path, entries }` as
  `application/vnd.telepath.directory+json`. The listing contains immediate
  children. Base entries remain `file`, `dir`, and `link`; a record entry is
  `{ name, type: "record", modified, fields, body?, error? }`, with no `size`
  or `links`. Its values match a single-record read, with `path` adapted to
  `name` and `updated` adapted to `modified`. Every `name` joins onto the
  envelope `path` to form the resource URL. Query parameters do not alter a
  listing. A consumer of the former recursive dump walks `dir` entries and
  uses full `record` entries in place. The one-level response does not imply a
  future deeper representation.
- **Raw records.** A `.md`-suffixed URL is the record's literal base file
  resource; non-markdown assets have no vault-specific behavior.
- **Record writing.** Send `{ fields, body }` — separately, as served — with
  `Content-Type: application/vnd.telepath.record+json`, to the
  extensionless path. PATCH first: only changed keys, `null` deletes,
  `{}` is a no-op. PUT only with a complete record, named as a foot-gun:
  it replaces `fields` wholesale and `body` too. DELETE removes the record.
  The returned record is the new current state. A byte PUT without the record
  media type writes the literal file resource instead.
- **Live updates.** Apply the base refetch-on-open and refetch-on-message
  rules. A markdown change normally names the extensionless record path; an
  exact regular file that shadows that record leaves the event at the literal
  `.md` path. A view that renders references refetches on every event rather
  than filtering by prefix, because resolution is vault-wide.
- **Optimistic updates.** Apply the change locally, send the write, take
  the returned record as truth, and roll back and surface the error on
  failure. A view that refetches on events should hold off while its own
  write is in flight, so an unrelated refetch can't revert the optimistic
  state mid-write.
- **Boundaries.** Directory traversal, filtering, and sorting beyond the
  defined entry order remain client responsibilities. Treat `body` as text in
  the context declared by the served record; reference-like strings inside it
  are not field-reference objects.

Beyond the shared must-nots, the skill must not describe storage —
frontmatter serialization, filesystem layout, or how references are stored.
