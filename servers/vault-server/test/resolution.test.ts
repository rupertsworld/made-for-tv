import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { expectNoEvent, nextEvent, noteWrite, openSocket, rawRequest, startVault } from "./helpers.ts";

test("record body is a sibling of fields and a body-named header field remains ordinary data", async () => {
  const vault = await startVault({
    "note.md": "---\nstatus: open\nbody: header value\n---\ndocument value",
    "broken.md": "---\ninvalid: [\n---\nwhole source",
  });
  const note = await (await fetch(`${vault.baseUrl}/note`)).json() as Record<string, unknown>;
  assert.deepEqual(note.fields, { status: "open", body: "header value" });
  assert.equal(note.body, "document value");

  const broken = await (await fetch(`${vault.baseUrl}/broken`)).json() as Record<string, unknown>;
  assert.deepEqual(broken.fields, {});
  assert.equal(broken.body, "---\ninvalid: [\n---\nwhole source");
  assert.deepEqual(broken.error, { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" });
});

test("GET resolution prefers exact files, falls back to records and directories, and returns 404", async () => {
  const vault = await startVault({ exact: "literal file", "exact.md": "shadowed note", "fallback.md": "fallback body", "folder/item.md": "item" });
  const exact = await fetch(`${vault.baseUrl}/exact`);
  assert.equal(exact.status, 200);
  assert.equal(await exact.text(), "literal file");
  const note = await fetch(`${vault.baseUrl}/fallback`);
  assert.equal(note.status, 200);
  assert.equal((await note.json() as { body: string }).body, "fallback body");
  const directory = await fetch(`${vault.baseUrl}/folder`, { redirect: "manual" });
  assert.equal(directory.status, 200);
  const listing = await directory.json() as { path: string; entries: Array<{ name: string; type: string }> };
  assert.equal(listing.path, "folder");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [{ name: "item", type: "record" }]);
  assert.deepEqual(await (await fetch(`${vault.baseUrl}/folder/`)).json(), listing);
  assert.equal((await fetch(`${vault.baseUrl}/missing`)).status, 404);
});

test("folder note and directory are disambiguated by the trailing slash", async () => {
  const vault = await startVault({ "journal.md": "folder note", "journal/day.md": "day" });
  assert.equal((await (await fetch(`${vault.baseUrl}/journal`)).json() as { path: string }).path, "journal");
  const listing = await (await fetch(`${vault.baseUrl}/journal/`)).json() as {
    path: string;
    entries: Array<{ name: string; type: string }>;
  };
  assert.equal(listing.path, "journal");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [{ name: "day", type: "record" }]);
});

test("double-.md records use their degenerate extensionless URL unless an exact markdown file shadows it", async () => {
  const vault = await startVault({
    "note.md": "exact markdown file",
    "note.md.md": "shadowed double-suffix record",
    "only.md.md": "addressable double-suffix record",
  });

  assert.equal(await (await fetch(`${vault.baseUrl}/note.md`)).text(), "exact markdown file");
  assert.equal((await (await fetch(`${vault.baseUrl}/note`)).json() as { body: string }).body, "exact markdown file");
  const doubleSuffix = await (await fetch(`${vault.baseUrl}/only.md`)).json() as { path: string; body: string };
  assert.equal(doubleSuffix.path, "only.md");
  assert.equal(doubleSuffix.body, "addressable double-suffix record");
  assert.equal(await (await fetch(`${vault.baseUrl}/only.md.md`)).text(), "addressable double-suffix record");
});

test("the source stays verbatim while record reads resolve both field link syntaxes", async () => {
  const source = "---\nstatus: open\nwiki: '[[Target]]'\nmarkdown: '[Target](Target)'\nexternal: '[Away](https://example.test)'\n---\nHello [[Target|friend]]\n";
  const vault = await startVault({ "note.md": source, "Target.md": "target" });
  const raw = await fetch(`${vault.baseUrl}/note.md`);
  assert.equal(await raw.text(), source);
  assert.match(raw.headers.get("content-type") ?? "", /^text\/markdown/);
  const note = await (await fetch(`${vault.baseUrl}/note`)).json() as Record<string, unknown>;
  assert.equal(note.path, "note");
  assert.deepEqual(note.fields, {
    status: "open",
    wiki: { $type: "ref", path: "Target" },
    markdown: { $type: "ref", path: "Target" },
    external: "[Away](https://example.test)",
  });
  assert.equal(note.body, "Hello [friend](Target)\n");
  assert.equal("created" in note, false);
  assert.equal(note.updated, (await stat(join(vault.root, "note.md"))).mtime.toISOString());
  assert.deepEqual(note.links, [
    { path: "Target", field: "wiki" },
    { path: "Target", field: "markdown" },
    { path: "Target" },
  ]);
  assert.equal("error" in note, false);
});

test("invalid or non-map frontmatter falls back to the whole source body", async () => {
  for (const source of ["---\n[unterminated\n---\nbody", "---\n- one\n- two\n---\nbody"]) {
    const vault = await startVault({ "bad.md": source });
    const note = await (await fetch(`${vault.baseUrl}/bad`)).json() as Record<string, unknown>;
    assert.deepEqual(note.fields, {});
    assert.equal(note.body, source);
    assert.deepEqual(note.error, { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" });
  }
});

test("notes expose body beside fields and omit absent or whitespace-only bodies", async () => {
  const vault = await startVault({ "plain.md": "plain body" });
  const note = await (await fetch(`${vault.baseUrl}/plain`)).json() as Record<string, unknown>;
  assert.deepEqual(note.fields, {});
  assert.equal(note.body, "plain body");
    assert.equal("error" in note, false);
  for (const [path, source, fields] of [["empty", "", {}], ["header", "---\ntag: x\n---", { tag: "x" }], ["space", "---\ntag: x\n---\n  \n", { tag: "x" }]] as const) {
    const isolated = await startVault({ [`${path}.md`]: source });
    const fetched = await (await fetch(`${isolated.baseUrl}/${path}`)).json() as Record<string, unknown>;
    assert.deepEqual(fetched.fields, fields);
    assert.equal("body" in fetched, false);
  }
});

test("unquoted YAML dates and datetimes serve as their literal strings", async () => {
  const vault = await startVault({ "note.md": "---\ndate: 2026-08-04\ndatetime: 2026-08-04T12:34:56Z\ndates:\n  - 2026-08-05\n  - nested: 2026-08-06 12:34:56\n---\nbody" });
  const expected = { date: "2026-08-04", datetime: "2026-08-04T12:34:56Z", dates: ["2026-08-05", { nested: "2026-08-06 12:34:56" }] };
  const note = await (await fetch(`${vault.baseUrl}/note`)).json() as { fields: Record<string, unknown>; body?: string };
  assert.deepEqual(note.fields, expected);
  assert.equal(note.body, "body");
  const listed = await (await fetch(`${vault.baseUrl}/`)).json() as {
    entries: Array<{ fields?: Record<string, unknown>; body?: string }>;
  };
  assert.deepEqual(listed.entries[0]?.fields, expected);
  assert.equal(listed.entries[0]?.body, "body");
});

test("frontmatter parses with JSON value types and without YAML 1.1 scalar semantics", async () => {
  const vault = await startVault({ "note.md": "---\ntime: 12:34:56\noct: 014\nnumber: 12.5\nboolean: true\nnothing: null\narray: [1, false, null, text]\nnested:\n  count: 2\n  enabled: false\n  empty: null\nyes: yes\nno: no\non: on\noff: off\n---" });
  const note = await (await fetch(`${vault.baseUrl}/note`)).json() as { fields: unknown };
  assert.deepEqual(note.fields, {
    time: "12:34:56",
    oct: 14,
    number: 12.5,
    boolean: true,
    nothing: null,
    array: [1, false, null, "text"],
    nested: { count: 2, enabled: false, empty: null },
    yes: "yes",
    no: "no",
    on: "on",
    off: "off",
  });
});

test("unsupported explicit YAML tags make frontmatter unparseable", async () => {
  const source = "---\nvalue: !!binary SGVsbG8=\n---\nbody";
  const vault = await startVault({ "note.md": source });
  const note = await (await fetch(`${vault.baseUrl}/note`)).json() as Record<string, unknown>;
  assert.deepEqual(note.fields, {});
  assert.equal(note.body, source);
  assert.deepEqual(note.error, { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" });
});

test("record bodies serve prose wikilinks as relative Markdown links and leave everything else byte-identical", async () => {
  const body = [
    "Bare [[Target]] and alias [[docs/Page|Readable page]].",
    "Fragment [[docs/Page#Heading]] and missing [[Missing#Part]].",
    "Inline `[[Target]]` and double ``[[docs/Page]]`` stay code.",
    "```md",
    "[[Target]]",
    "```",
    "Authored [link](../Target), autolink <https://example.test/[[Target]]>, and <span data-link=\"[[Target]]\">HTML</span> stay.",
  ].join("\n");
  const source = `---\nstatus: open\n---\n${body}`;
  const vault = await startVault({
    "notes/deep/guide.md": source,
    "notes/deep/Target.md": "near",
    "Target.md": "far",
    "docs/Page.md": "page",
  });

  const note = await (await fetch(`${vault.baseUrl}/notes/deep/guide`)).json() as { fields: unknown; body?: string };
  assert.deepEqual(note.fields, { status: "open" });
  assert.equal(note.body, [
      "Bare [Target](Target) and alias [Readable page](../../docs/Page).",
      "Fragment [docs/Page#Heading](../../docs/Page#Heading) and missing [Missing#Part](Missing#Part).",
      "Inline `[[Target]]` and double ``[[docs/Page]]`` stay code.",
      "```md",
      "[[Target]]",
      "```",
      "Authored [link](../Target), autolink <https://example.test/[[Target]]>, and <span data-link=\"[[Target]]\">HTML</span> stay.",
    ].join("\n"));
  assert.equal(await (await fetch(`${vault.baseUrl}/notes/deep/guide.md`)).text(), source, "the file itself is untouched");
});

test("served wikilinks stay relative across folder-note URL boundaries", async () => {
  const vault = await startVault({
    "dir.md": "folder record",
    "dir/child.md": "[[dir]]",
    "root.md": "[[dir]]",
    "a/b.md": "deep folder record",
    "a/b/child.md": "[[b]]",
  });

  const body = async (path: string): Promise<string> =>
    (await (await fetch(`${vault.baseUrl}/${path}`)).json() as { body: string }).body;
  assert.equal(await body("dir/child"), "[dir](../dir)");
  assert.equal(await body("root"), "[dir](dir)");
  assert.equal(await body("a/b/child"), "[b](../b)");
});

test("served prose links escape labels, encode destinations, carry queries, and render embeds", async () => {
  const source = [
    "[[Page?q=one two#part|*literal*]]",
    "[[docs/a page]]",
    "[[Missing <item>]]",
    "![[assets/photo one.png|Photo *one*]]",
    "![[Page|Record preview]]",
  ].join("\n");
  const vault = await startVault({
    "notes/guide.md": source,
    "notes/Page.md": "page",
    "docs/a page.md": "spaced",
    "assets/photo one.png": "image",
  });

  const response = await fetch(`${vault.baseUrl}/notes/guide`);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { body: string }).body, [
    "[\\*literal\\*](Page?q=one%20two#part)",
    "[docs/a page](../docs/a%20page)",
    "[Missing \\<item\\>](Missing%20%3Citem%3E)",
    "![Photo \\*one\\*](../assets/photo%20one.png)",
    "![Record preview](Page)",
  ].join("\n"));
  assert.equal(await (await fetch(`${vault.baseUrl}/notes/guide.md`)).text(), source);
});

test("non-UTF-8 markdown returns 422 as JSON but remains available raw", async () => {
  const bytes = Uint8Array.from([0x66, 0x80, 0x6f]);
  const vault = await startVault({ "binary.md": bytes });
  const response = await fetch(`${vault.baseUrl}/binary`);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "markdown file is not valid UTF-8" });
  const raw = await fetch(`${vault.baseUrl}/binary.md`);
  assert.equal(raw.status, 200);
  assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), bytes);
});

test("malformed URL paths return 400", async () => {
  const vault = await startVault();
  assert.equal((await fetch(`${vault.baseUrl}/foo%00bar`)).status, 400);
  assert.equal((await fetch(`${vault.baseUrl}/foo%ZZbar`)).status, 400);
});

test("empty and dot interior URL segments are rejected rather than normalized", async () => {
  const vault = await startVault({ "a/b.md": "bee", "a/c.md": "see" });
  assert.equal((await rawRequest(vault.baseUrl, "GET", "/a//b")).status, 400);
  assert.equal((await rawRequest(vault.baseUrl, "GET", "/a/./c")).status, 404);
});

test("dot-prefixed paths are invisible in raw and JSON views", async () => {
  const vault = await startVault({ ".secret.md": "hidden", ".obsidian/note.md": "hidden" });
  assert.equal((await fetch(`${vault.baseUrl}/.secret.md`)).status, 404);
  assert.equal((await fetch(`${vault.baseUrl}/.secret`)).status, 404);
  assert.equal((await fetch(`${vault.baseUrl}/.obsidian/note`)).status, 404);
});

test("encoded traversal is rejected and cannot read or write outside the vault", async () => {
  const vault = await startVault();
  for (const method of ["GET", "PUT"]) {
    assert.equal((await rawRequest(vault.baseUrl, method, "/%2e%2e/SPEC.md", { body: "escape" })).status, 404);
    for (const path of ["/..%2fSPEC.md", "/%2e%2e%2fSPEC.md"]) {
      assert.equal((await rawRequest(vault.baseUrl, method, path, { body: "escape" })).status, 400);
    }
  }
});

test("symlinks cannot expose or modify files outside the vault", async () => {
  const vault = await startVault();
  const outside = await mkdtemp(join(tmpdir(), "vault-server-outside-"));
  await writeFile(join(outside, "secret.md"), "outside secret");
  await symlink(join(outside, "secret.md"), join(vault.root, "secret.md"));
  await symlink(outside, join(vault.root, "escape"));
  assert.equal((await fetch(`${vault.baseUrl}/secret.md`)).status, 403);
  assert.equal((await fetch(`${vault.baseUrl}/secret`)).status, 403);
  const listing = await (await fetch(`${vault.baseUrl}/`)).json() as { entries: Array<{ name: string; type: string }> };
  assert.deepEqual(listing.entries, [
    { name: "escape", type: "link" },
    { name: "secret.md", type: "link" },
  ]);
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/escape/new", { body: "escape" })).status, 403);
  await assert.rejects(readFile(join(outside, "new.md")));
  await rm(outside, { recursive: true, force: true });
});

test("an in-vault symlink is forbidden, listed as a link, and absent from events", async () => {
  const vault = await startVault({ "target.md": "target body" });
  const socket = await openSocket(vault.baseUrl, "/");
  const noEvent = expectNoEvent(socket);
  await symlink(join(vault.root, "target.md"), join(vault.root, "alias.md"));
  await noEvent;
  assert.equal((await fetch(`${vault.baseUrl}/alias.md`)).status, 403);
  assert.equal((await fetch(`${vault.baseUrl}/alias`)).status, 403);
  const listing = await (await fetch(`${vault.baseUrl}/`)).json() as { entries: Array<{ name: string; type: string }> };
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "alias.md", type: "link" },
    { name: "target", type: "record" },
  ]);
  const event = nextEvent(socket);
  await writeFile(join(vault.root, "new.md"), "new");
  assert.deepEqual(await event, { type: "created", path: "new" });
  socket.close();
});

test("exact symlink and special-object collisions are rejected before extensionless record fallback", async (context) => {
  const vault = await startVault({
    "blocked.md": "record body",
    "special.md": "special record body",
    "target.txt": "symlink target",
  });
  await symlink(join(vault.root, "target.txt"), join(vault.root, "blocked"));
  const special = createNetServer();
  await new Promise<void>((resolve, reject) => {
    special.once("error", reject);
    special.listen(join(vault.root, "special"), resolve);
  });
  context.after(() => new Promise<void>((resolve) => special.close(() => resolve())));

  const blocked = await fetch(`${vault.baseUrl}/blocked`);
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), { error: "forbidden" });
  assert.equal(await (await fetch(`${vault.baseUrl}/blocked.md`)).text(), "record body");

  const specialResponse = await fetch(`${vault.baseUrl}/special`);
  assert.equal(specialResponse.status, 404);
  assert.deepEqual(await specialResponse.json(), { error: "not found" });
  assert.equal(await (await fetch(`${vault.baseUrl}/special.md`)).text(), "special record body");
});
