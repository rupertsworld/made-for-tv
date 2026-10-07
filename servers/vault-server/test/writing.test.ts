import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { noteWrite, rawRequest, startVault } from "./helpers.ts";

test("record write envelopes keep body beside fields and PUT replaces both wholesale", async () => {
  const vault = await startVault();
  const created = await noteWrite(vault.baseUrl, "PUT", "/note", {
    fields: { status: "open", body: "header body" },
    body: "document body",
  });
  assert.equal(created.status, 201);
  const first = await created.json() as { path: string; fields: unknown; body?: string; updated: string };
  assert.equal(first.path, "note");
  assert.deepEqual(first.fields, { status: "open", body: "header body" });
  assert.equal(first.body, "document body");
  assert.match(first.updated, /^\d{4}-/);

  const bodyOnly = await noteWrite(vault.baseUrl, "PUT", "/note", { body: "replacement" });
  assert.equal(bodyOnly.status, 200);
  assert.deepEqual((await bodyOnly.json() as { fields: unknown; body?: string }), {
    path: "note",
    fields: {},
    body: "replacement",
    links: [],
    updated: (await stat(join(vault.root, "note.md"))).mtime.toISOString(),
  });

  const fieldsOnly = await noteWrite(vault.baseUrl, "PUT", "/note", { fields: { body: "ordinary" } });
  assert.equal(fieldsOnly.status, 200);
  const final = await fieldsOnly.json() as { fields: unknown; body?: string };
  assert.deepEqual(final.fields, { body: "ordinary" });
  assert.equal("body" in final, false);
});

test("PATCH merge-patches only envelope fields and touches body only when submitted", async () => {
  const vault = await startVault({ "note.md": "---\nstatus: old\nnested:\n  keep: yes\n---\nold body" });
  const fieldsOnly = await noteWrite(vault.baseUrl, "PATCH", "/note", {
    fields: { status: "new", nested: { added: true } },
  });
  assert.equal(fieldsOnly.status, 200);
  assert.deepEqual(await fieldsOnly.json(), {
    path: "note",
    fields: { status: "new", nested: { keep: "yes", added: true } },
    body: "old body",
    links: [],
    updated: (await stat(join(vault.root, "note.md"))).mtime.toISOString(),
  });

  const removed = await noteWrite(vault.baseUrl, "PATCH", "/note", { body: null });
  assert.equal(removed.status, 200);
  const final = await removed.json() as { fields: unknown; body?: string };
  assert.deepEqual(final.fields, { status: "new", nested: { keep: "yes", added: true } });
  assert.equal("body" in final, false);
});

test("PATCH preserves an untouched whitespace-only body even though the record view omits it", async () => {
  const source = "---\nstatus: old\n---\n \n\t";
  const vault = await startVault({ "note.md": source });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { status: "new" } });
  assert.equal(response.status, 200);
  assert.equal("body" in await response.json(), false);
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), source.replace("status: old", 'status: "new"'));
});

test("write envelopes reject invalid fields and body members", async () => {
  const vault = await startVault({ "note.md": "body" });
  for (const fields of [null, [], "fields", 3]) {
    assert.equal((await noteWrite(vault.baseUrl, "PUT", "/invalid", { fields })).status, 400);
  }
  for (const body of [{}, [], 3, true]) {
    assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/note", { body })).status, 400);
  }
});

test("PUT creates parent directories with 201 and replaces existing notes with 200", async () => {
  const vault = await startVault();
  const created = await noteWrite(vault.baseUrl, "PUT", "/deep/new", { fields: { n: 1 }, body: "first" });
  assert.equal(created.status, 201);
  assert.equal((await created.json() as { path: string }).path, "deep/new");
  assert.equal(await readFile(join(vault.root, "deep/new.md"), "utf8"), "---\nn: 1\n---\nfirst");
  const replaced = await noteWrite(vault.baseUrl, "PUT", "/deep/new", { body: "second" });
  assert.equal(replaced.status, 200);
  assert.equal((await replaced.json() as { body: string }).body, "second");
});

test("PUT replaces a record whose previous bytes are invalid UTF-8", async () => {
  const vault = await startVault({ "invalid.md": new Uint8Array([0xff, 0xfe, 0x61]) });
  assert.equal((await fetch(`${vault.baseUrl}/invalid`)).status, 422, "the invalid read view still rejects");

  const response = await noteWrite(vault.baseUrl, "PUT", "/invalid", { fields: { status: "replaced" }, body: "valid" });
  assert.equal(response.status, 200);
  const replaced = await response.json() as { fields: unknown; body?: string };
  assert.deepEqual(replaced.fields, { status: "replaced" });
  assert.equal(replaced.body, "valid");
  assert.equal(await readFile(join(vault.root, "invalid.md"), "utf8"), "---\nstatus: replaced\n---\nvalid");
});

test("PUT treats a null body as absent and writes no bytes below the header", async () => {
  const vault = await startVault();
  const created = await noteWrite(vault.baseUrl, "PUT", "/header-only", { fields: { status: "open" }, body: null });
  assert.equal(created.status, 201);
  assert.deepEqual((await created.json() as { fields: unknown }).fields, { status: "open" });
  assert.equal(await readFile(join(vault.root, "header-only.md"), "utf8"), "---\nstatus: open\n---");

  const empty = await noteWrite(vault.baseUrl, "PUT", "/empty", { body: null });
  assert.equal(empty.status, 201);
  assert.deepEqual((await empty.json() as { fields: unknown }).fields, {});
  assert.equal(await readFile(join(vault.root, "empty.md"), "utf8"), "");
});

test("PATCH merge-patches fields, deletes null keys, replaces body, and treats {} as a no-op", async () => {
  const vault = await startVault({ "note.md": "---\na: 1\nnested:\n  keep: yes\n  remove: no\n---\nold" });
  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { a: null, nested: { remove: null, added: true } }, body: "new" });
  assert.equal(patched.status, 200);
  const result = await patched.json() as { fields: Record<string, unknown>; body?: string };
  assert.deepEqual(result.fields, { nested: { keep: "yes", added: true } });
  assert.equal(result.body, "new");
  const before = await stat(join(vault.root, "note.md"));
  const noOp = await noteWrite(vault.baseUrl, "PATCH", "/note", {});
  assert.equal(noOp.status, 200);
  assert.equal((await noOp.json() as { body: string }).body, "new");
  assert.equal((await stat(join(vault.root, "note.md"))).mtimeMs, before.mtimeMs);
});

test("PATCH applies RFC 7386 recursively when an object replaces a scalar", async () => {
  const vault = await startVault({ "note.md": "---\nvalue: scalar\n---\nbody" });
  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { value: { removed: null, kept: true } } });
  assert.equal(patched.status, 200);
  const result = await patched.json() as { fields: unknown; body?: string };
  assert.deepEqual(result.fields, { value: { kept: true } });
  assert.equal(result.body, "body");
});

test("PATCH body null removes the body sibling without changing fields", async () => {
  const vault = await startVault({ "note.md": "---\nstatus: open\n---\nbody" });
  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { body: null });
  assert.equal(patched.status, 200);
  assert.deepEqual((await patched.json() as { fields: unknown }).fields, { status: "open" });
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), "---\nstatus: open\n---\n");
});

test("writes canonicalize internal Markdown links and images to positional wikilinks", async () => {
  const vault = await startVault({
    "contacts/sample.md": "contact",
    "journal/local.md": "local",
    "assets/pic.png": "asset",
  });
  const body = [
    "[Relative](../contacts/sample)",
    "[Rooted](/contacts/sample)",
    "![Portrait](/assets/pic.png)",
    "[Local](local)",
    "[journal/local](local)",
    "[Future](../future/note)",
    "[Spaced](</docs/a page>)",
    "[Escaped](/docs/a\\(b\\))",
    "[Scheme relative](//cdn.example.test/image.png)",
    "[URL](https://example.test/path)",
    "[Email](mailto:person@example.test)",
    "[definition]: /definitions/stays",
    "</autolink-stays>",
    '<a href="/html-stays">HTML</a>',
    "[[Written|Wiki]]",
  ].join("\n");
  const response = await noteWrite(vault.baseUrl, "PUT", "/journal/entry", { body });
  assert.equal(response.status, 201);
  const stored = [
    "[[contacts/sample|Relative]]",
    "[[contacts/sample|Rooted]]",
    "![[assets/pic.png|Portrait]]",
    "[[journal/local|Local]]",
    "[[journal/local]]",
    "[[future/note|Future]]",
    "[[docs/a page|Spaced]]",
    "[[docs/a(b)|Escaped]]",
    "[Scheme relative](//cdn.example.test/image.png)",
    "[URL](https://example.test/path)",
    "[Email](mailto:person@example.test)",
    "[definition]: /definitions/stays",
    "</autolink-stays>",
    '<a href="/html-stays">HTML</a>',
    "[[Written|Wiki]]",
  ].join("\n");
  assert.equal(await readFile(join(vault.root, "journal/entry.md"), "utf8"), stored);
  assert.equal((await response.json() as { body: string }).body, [
    "[Relative](../contacts/sample)",
    "[Rooted](../contacts/sample)",
    "![Portrait](../assets/pic.png)",
    "[Local](local)",
    "[journal/local](local)",
    "[Future](future/note)",
    "[Spaced](docs/a%20page)",
    "[Escaped](docs/a\\(b\\))",
    "[Scheme relative](//cdn.example.test/image.png)",
    "[URL](https://example.test/path)",
    "[Email](mailto:person@example.test)",
    "[definition]: /definitions/stays",
    "</autolink-stays>",
    '<a href="/html-stays">HTML</a>',
    "[Wiki](Written)",
  ].join("\n"));
});

test("body canonicalization URL-decodes paths, clamps traversal, and carries query and fragment suffixes", async () => {
  const vault = await startVault({
    "docs/a page.md": "space",
    "x.md": "root",
    "a/target.md": "target",
  });
  const body = [
    "[space](../../docs/a%20page)",
    "[rooted](/docs/a%20page)",
    "[clamped](../../../x)",
    "[both](../target?q=one%20two#part)",
    "[external](//cdn.example.test/a%20page)",
  ].join("\n");
  const response = await noteWrite(vault.baseUrl, "PUT", "/a/b/note", { body });
  assert.equal(response.status, 201);
  assert.equal(await readFile(join(vault.root, "a/b/note.md"), "utf8"), [
    "[[docs/a page|space]]",
    "[[docs/a page|rooted]]",
    "[[x|clamped]]",
    "[[a/target?q=one%20two#part|both]]",
    "[external](//cdn.example.test/a%20page)",
  ].join("\n"));
  assert.equal((await response.json() as { body: string }).body, [
    "[space](../../docs/a%20page)",
    "[rooted](../../docs/a%20page)",
    "[clamped](../../x)",
    "[both](../target?q=one%20two#part)",
    "[external](//cdn.example.test/a%20page)",
  ].join("\n"));
});

test("body canonicalization never emits unrepresentable wikilinks and decodes escaped label text", async () => {
  const vault = await startVault({ "good.md": "target" });
  const body = String.raw`[pipe target](../bad%7Ctarget)
[closing target](../bad%5D%5Dtarget)
[bad|label](../good)
[bad\]\]label](../good)
[a\]b](../good)`;
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { body });
  assert.equal(response.status, 201);
  assert.equal(await readFile(join(vault.root, "notes/note.md"), "utf8"), String.raw`[pipe target](../bad%7Ctarget)
[closing target](../bad%5D%5Dtarget)
[bad|label](../good)
[bad\]\]label](../good)
[[good|a]b]]`);
  assert.equal((await response.json() as { body: string }).body, body);
});

test("markdown link format resolves prose wikilinks before relativizing and leaves unresolved destinations as written", async () => {
  const vault = await startVault({
    "notes/Page.md": "near page",
    "docs/root.md": "root",
    "assets/pic.png": "image",
  }, { linkFormat: "markdown" });
  const body = [
    "[[Page]]",
    "[[Missing]]",
    "[[docs/root?q=one two#part|Readable]]",
    "![[assets/pic.png|Portrait]]",
    "[relative](../legacy%20path)",
    '[rooted](/docs/root?q=one%20two#part "Title")',
    "[external](//cdn.example.test/image.png)",
  ].join("\n");
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { body });
  assert.equal(response.status, 201);
  const expected = [
    "[Page](Page)",
    "[Missing](Missing)",
    "[Readable](../docs/root?q=one%20two#part)",
    "![Portrait](../assets/pic.png)",
    "[relative](../legacy%20path)",
    '[rooted](../docs/root?q=one%20two#part "Title")',
    "[external](//cdn.example.test/image.png)",
  ].join("\n");
  assert.equal(await readFile(join(vault.root, "notes/note.md"), "utf8"), expected);
  assert.equal((await response.json() as { body?: string }).body, expected);
});

test("markdown link format retains a stored wikilink on whole-body echo", async () => {
  const vault = await startVault({
    "notes/note.md": "[[Page|Readable]]",
    "notes/Page.md": "page",
  }, { linkFormat: "markdown" });
  const served = (await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { body: string }).body;
  assert.equal(served, "[Readable](Page)");

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { body: served });
  assert.equal(response.status, 200);
  assert.equal(await readFile(join(vault.root, "notes/note.md"), "utf8"), "[[Page|Readable]]");
});

test("body normalization skips CommonMark fenced blocks and inline code spans", async () => {
  const vault = await startVault();
  const body = [
    "`[inline](/keep-inline)` and [outside](/change)",
    "``code with ` and [link](/keep-double)``",
    "` unmatched delimiter and [still a link](/change-unmatched)",
    "\\[escaped label](/keep-escaped)",
    '<span data-example="[not a link](/keep-html)">HTML</span>',
    "```md",
    "[fenced](/keep-fenced)",
    "```",
    "   ~~~~",
    "![also fenced](/keep-tilde)",
    "   ~~~~",
    "<div>",
    "[HTML block text](/keep-html-block)",
    "</div>",
    "",
    "[after](/change-after)",
  ].join("\n");
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/code", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body, body
    .replace("[outside](/change)", "[outside](change)")
    .replace("[still a link](/change-unmatched)", "[still a link](change-unmatched)")
    .replace("[after](/change-after)", "[after](change-after)"));
  assert.equal(await readFile(join(vault.root, "notes/code.md"), "utf8"), body
    .replace("[outside](/change)", "[[change|outside]]")
    .replace("[still a link](/change-unmatched)", "[[change-unmatched|still a link]]")
    .replace("[after](/change-after)", "[[change-after|after]]"));
});

test("body normalization preserves CommonMark type-7 HTML blocks byte-for-byte", async () => {
  const vault = await startVault();
  const body = "<x-card>\n[inside](/keep-html)\n</x-card>\n\n[outside](/change)";
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/html-block", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body,
    "<x-card>\n[inside](/keep-html)\n</x-card>\n\n[outside](change)");
  assert.equal(await readFile(join(vault.root, "notes/html-block.md"), "utf8"),
    "<x-card>\n[inside](/keep-html)\n</x-card>\n\n[[change|outside]]");
});

test("body normalization preserves multiline CommonMark inline HTML tags byte-for-byte", async () => {
  const vault = await startVault();
  const body = "before <x-card\n  data-example=\"[inside](/keep-html)\">after</x-card> and [outside](/change)";
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/inline-html", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body,
    "before <x-card\n  data-example=\"[inside](/keep-html)\">after</x-card> and [outside](change)");
  assert.equal(await readFile(join(vault.root, "notes/inline-html.md"), "utf8"),
    "before <x-card\n  data-example=\"[inside](/keep-html)\">after</x-card> and [[change|outside]]");
});

test("body normalization recognizes fenced code with CR line endings", async () => {
  const vault = await startVault();
  const body = "```md\r[fenced](/keep-fenced)\r```\r[outside](/change)";
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/cr-fence", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body,
    "```md\r[fenced](/keep-fenced)\r```\r[outside](change)");
  assert.equal(await readFile(join(vault.root, "notes/cr-fence.md"), "utf8"),
    "```md\r[fenced](/keep-fenced)\r```\r[[change|outside]]");
});

test("body normalization skips container-nested fences and every line of reference definitions", async () => {
  const vault = await startVault();
  const body = [
    "- ```md",
    "  [inside list fence](/keep-list)",
    "  ```",
    "",
    "  > ~~~",
    "  > [inside quote fence](/keep-quote)",
    "  > ~~~",
    "",
    "[definition]:",
    "  /definition-target",
    '  "title [inside definition](/keep-definition)"',
    "[outside](/change)",
  ].join("\n");
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/containers", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body,
    body.replace("[outside](/change)", "[outside](change)"));
  assert.equal(await readFile(join(vault.root, "notes/containers.md"), "utf8"),
    body.replace("[outside](/change)", "[[change|outside]]"));
});

test("root-record destinations to root fragments and queries stay root-targeted", async () => {
  const vault = await startVault();
  const response = await noteWrite(vault.baseUrl, "PUT", "/root-note", {
    body: "[fragment](/#frag)\n[query](/?q=1)",
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body,
    "[fragment](./#frag)\n[query](./?q=1)");
  assert.equal(await readFile(join(vault.root, "root-note.md"), "utf8"),
    "[[./#frag|fragment]]\n[[./?q=1|query]]");
});

test("a served body PUT back unchanged preserves the whole stored body byte-for-byte", async () => {
  const original = "[Legacy](/absolute/path)\nProse [[Page|Readable]].\n`[[Page]]`\n";
  const vault = await startVault({ "notes/note.md": original, "notes/Page.md": "page" });
  const served = (await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { body: string }).body;
  assert.equal(served, "[Legacy](/absolute/path)\nProse [Readable](Page).\n`[[Page]]`\n");

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { body: served });
  assert.equal(response.status, 200);
  assert.equal(await readFile(join(vault.root, "notes/note.md"), "utf8"), original);
  assert.equal((await response.json() as { body: string }).body, served);
});

test("whole-body echo composes with positional field echo and ordinary field writes", async () => {
  const source = "---\ncontact: '[[Page]]'\nstatus: old\n---\n[[Page]]\n";
  const vault = await startVault({ "notes/note.md": source, "notes/Page.md": "page" });
  const fetched = await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { fields: Record<string, unknown>; body?: string };
  assert.deepEqual(fetched.fields, {
    contact: { $type: "ref", path: "notes/Page", label: "Page" },
    status: "old",
  });
  assert.equal(fetched.body, "[Page](Page)\n");

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", {
    fields: { ...fetched.fields, status: "new" },
    body: fetched.body,
  });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /contact: ['"]\[\[Page\]\]['"]/);
  assert.equal(written.endsWith("---\n[[Page]]\n"), true, "body echo keeps the stored wikilink bytes");
  const rewritten = await response.json() as { fields: unknown; body?: string };
  assert.deepEqual(rewritten.fields, { ...fetched.fields, status: "new" });
  assert.equal(rewritten.body, fetched.body);
});

test("a one-character edit canonicalizes eligible links while preserving code, HTML, and canonical wikilinks", async () => {
  const source = [
    "Intro.",
    "[Legacy](../docs/page)",
    "`[Code](../docs/code)`",
    '<span data-link="[HTML](../docs/html)">HTML</span>',
    "[[notes/Target|Wiki]]",
  ].join("\n");
  const vault = await startVault({
    "notes/note.md": source,
    "docs/page.md": "page",
    "notes/Target.md": "target",
  });
  const fetched = (await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { body: string }).body;
  const edited = fetched.replace("Intro.", "Intro!");
  assert.equal(edited.length, fetched.length, "the edit replaces exactly one character");

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { body: edited });
  assert.equal(response.status, 200);
  assert.equal(await readFile(join(vault.root, "notes/note.md"), "utf8"), [
    "Intro!",
    "[[docs/page|Legacy]]",
    "`[Code](../docs/code)`",
    '<span data-link="[HTML](../docs/html)">HTML</span>',
    "[[notes/Target|Wiki]]",
  ].join("\n"));
  assert.equal((await response.json() as { body: string }).body, edited);
});

test("PATCH merges raw header values and preserves quoted keys and untouched comments", async () => {
  const source = "---\n# leading\n\"odd:key\": old\nnested:\n  contact: '[[Page]]'\n  status: old\n# keep with next\nuntouched: yes\n---\n[[Page]]";
  const vault = await startVault({ "note.md": source, "Page.md": "page" });
  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { "odd:key": "new", nested: { status: "new" } } });
  assert.equal(patched.status, 200);
  const result = await patched.json() as { fields: unknown; body?: string };
  assert.deepEqual(result.fields, {
    "odd:key": "new",
    nested: { contact: { $type: "ref", path: "Page" }, status: "new" },
    untouched: "yes",
  });
  assert.equal(result.body, "[Page](Page)");
  const written = await readFile(join(vault.root, "note.md"), "utf8");
  assert.match(written, /# leading/);
  assert.match(written, /contact: ['"]\[\[Page\]\]['"]/);
  assert.match(written, /# keep with next\nuntouched: yes/);
});

test("PATCH inserts a space when replacing empty-valued keys", async () => {
  const vault = await startVault({ "note.md": "---\ndraft:\nnested:\n  empty:\nkept: 1\n---\nbody" });
  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { draft: true, nested: { empty: 5 } } });
  assert.equal(patched.status, 200);
  const result = await patched.json() as { fields: Record<string, unknown>; error?: unknown };
  assert.equal("error" in result, false);
  assert.deepEqual(result.fields, { draft: true, nested: { empty: 5 }, kept: 1 });
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), "---\ndraft: true\nnested:\n  empty: 5\nkept: 1\n---\nbody");
});

test("PATCH safely edits and extends alternate YAML map spellings", async () => {
  for (const [name, source, patch, expected] of [
    ["added", "---\nstatus: old\n---\nbody", { added: true }, { status: "old", added: true, body: "body" }],
    ["flow", "---\n{foo: old, keep: yes}\n---\nbody", { foo: "new", added: true }, { foo: "new", keep: "yes", added: true, body: "body" }],
    ["explicit", "---\n? foo\n: old\nkeep: yes\n---\nbody", { foo: "new" }, { foo: "new", keep: "yes", body: "body" }],
    ["escaped", "---\n\"odd\\x3Akey\": old\nkeep: yes\n---\nbody", { "odd:key": "new" }, { "odd:key": "new", keep: "yes", body: "body" }],
  ] as const) {
    const vault = await startVault({ [`${name}.md`]: source });
    const response = await noteWrite(vault.baseUrl, "PATCH", `/${name}`, { fields: patch });
    assert.equal(response.status, 200, name);
    const note = await response.json() as { fields: unknown; error?: unknown };
    const { body: expectedBody, ...expectedFields } = expected;
    assert.deepEqual(note.fields, expectedFields, name);
    assert.equal((note as { body?: string }).body, expectedBody, name);
    assert.equal(note.error, undefined, name);
  }
});

test("PATCH deletes first, middle, and last members of nested flow maps", async () => {
  for (const key of ["first", "middle", "last"] as const) {
    const vault = await startVault({ [`${key}.md`]: "---\nnested: {first: 1, middle: 2, last: 3}\n---" });
    const response = await noteWrite(vault.baseUrl, "PATCH", `/${key}`, { fields: { nested: { [key]: null } } });
    assert.equal(response.status, 200, key);
    const expected = { first: 1, middle: 2, last: 3 } as Record<string, number>;
    delete expected[key];
    assert.deepEqual((await response.json() as { fields: unknown }).fields, { nested: expected }, key);
  }
});

test("PATCH deletion from a nested flow map cannot consume a later map", async () => {
  const vault = await startVault({ "note.md": "---\nnested: {only: 1}\nother: {a: 1, b: 2}\n---" });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { nested: { only: null } } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { fields: unknown }).fields, { nested: {}, other: { a: 1, b: 2 } });
});

test("PATCH can delete every member of a flow map", async () => {
  const vault = await startVault({ "note.md": "---\nnested: {a: 1, b: 2}\n---" });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { nested: { a: null, b: null } } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { fields: unknown }).fields, { nested: {} });
});

test("PATCH validation, representation, and missing-note behavior follow the contract", async () => {
  const vault = await startVault({ "note.md": "body" });
  const deleted = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { arbitrary: null } });
  assert.equal(deleted.status, 200);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/note", { body: 3 })).status, 400);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/missing", {})).status, 404);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/note", {}, "application/json")).status, 404);
});

test("DELETE returns 204 once and 404 thereafter", async () => {
  const vault = await startVault({ "note.md": "body" });
  assert.equal((await fetch(`${vault.baseUrl}/note`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/note`, { method: "DELETE" })).status, 404);
});

test("raw markdown paths retain base PUT, PATCH, and DELETE while directory paths follow base mutation rules", async () => {
  const vault = await startVault({ "dir/existing.md": "body", "note.md": "before before" });
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/dir/", { body: "x" })).status, 409);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/dir/", {})).status, 409);

  const replaced = await fetch(`${vault.baseUrl}/note.md`, {
    method: "PUT",
    headers: { "content-type": "application/vnd.telepath.record+json" },
    body: "after before",
  });
  assert.equal(replaced.status, 204, "even the record media type delegates at a literal .md path");
  const edited = await fetch(`${vault.baseUrl}/note.md`, {
    method: "PATCH",
    headers: { "content-type": "application/vnd.telepath.edit+json" },
    body: JSON.stringify({ old_string: "before", new_string: "after" }),
  });
  assert.equal(edited.status, 204);
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), "after after");
  assert.equal((await fetch(`${vault.baseUrl}/note.md`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/note`)).status, 404);

  assert.equal((await fetch(`${vault.baseUrl}/dir/`, { method: "DELETE" })).status, 204);
  await assert.rejects(readFile(join(vault.root, "dir/existing.md")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
});

test("path and method errors precede malformed record JSON while literal .md paths delegate", async () => {
  const vault = await startVault({ "dir/item.md": "body", "raw.md": "body" });
  for (const [path, status] of [["/.hidden", 404], ["/dir/", 409]] as const) {
    const response = await fetch(`${vault.baseUrl}${path}`, { method: "PUT", headers: { "content-type": "application/vnd.telepath.record+json" }, body: "{" });
    assert.equal(response.status, status);
  }
  const raw = await fetch(`${vault.baseUrl}/raw.md`, {
    method: "PUT",
    headers: { "content-type": "application/vnd.telepath.record+json" },
    body: "{",
  });
  assert.equal(raw.status, 204);
  assert.equal(await readFile(join(vault.root, "raw.md"), "utf8"), "{");
  const post = await fetch(`${vault.baseUrl}/note`, { method: "POST", headers: { "content-type": "application/vnd.telepath.record+json" }, body: "{" });
  assert.equal(post.status, 405);
});

test("literal files conflict with record writes, while DELETE follows the file-record-directory ladder", async () => {
  const vault = await startVault({
    occupied: "literal",
    "occupied.md": "note",
    "folder.md": "folder record",
    "folder/child.txt": "child",
  });
  const response = await noteWrite(vault.baseUrl, "PUT", "/occupied", { body: "x" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "literal file occupies record URL" });
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/occupied", {})).status, 409);
  assert.equal((await fetch(`${vault.baseUrl}/occupied`, { method: "DELETE" })).status, 204);
  assert.equal((await (await fetch(`${vault.baseUrl}/occupied`)).json() as { body: string }).body, "note");
  assert.equal((await fetch(`${vault.baseUrl}/occupied`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/occupied`, { method: "DELETE" })).status, 404);

  assert.equal((await fetch(`${vault.baseUrl}/folder`, { method: "DELETE" })).status, 204, "record precedes directory");
  assert.equal((await (await fetch(`${vault.baseUrl}/folder`)).json() as { path: string }).path, "folder");
  assert.equal((await fetch(`${vault.baseUrl}/folder`, { method: "DELETE" })).status, 204, "directory is the final rung");
  assert.equal((await fetch(`${vault.baseUrl}/folder`)).status, 404);
});

test("record writes support dotted basenames and enforce valid envelopes", async () => {
  const vault = await startVault();
  const dotted = await noteWrite(vault.baseUrl, "PUT", "/notes/v1.2", { body: "dot" });
  assert.equal(dotted.status, 201);
  assert.equal(await readFile(join(vault.root, "notes/v1.2.md"), "utf8"), "dot");
  assert.equal((await (await fetch(`${vault.baseUrl}/notes/v1.2`)).json() as { body: string }).body, "dot");
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/invalid", { body: 5 })).status, 400);
  for (const invalid of [null, [], "text", 3]) assert.equal((await noteWrite(vault.baseUrl, "PUT", "/invalid", invalid)).status, 400);
  const malformed = await fetch(`${vault.baseUrl}/invalid`, { method: "PUT", headers: { "content-type": "application/vnd.telepath.record+json" }, body: "{" });
  assert.equal(malformed.status, 400);
});

test("non-record PUT media types delegate to a literal base file upload", async () => {
  const vault = await startVault();
  const response = await fetch(`${vault.baseUrl}/literal`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "literal bytes",
  });
  assert.equal(response.status, 201);
  assert.equal(await (await fetch(`${vault.baseUrl}/literal`)).text(), "literal bytes");
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/literal", { body: "record" })).status, 409);
});

test("record PUT and PATCH cannot target a double-.md record URL", async () => {
  const vault = await startVault({
    "put.md.md": "put record source",
    "patch.md.md": "patch record source",
  });
  const put = await noteWrite(vault.baseUrl, "PUT", "/put.md", { body: "replacement" });
  assert.equal(put.status, 201);
  assert.equal(await readFile(join(vault.root, "put.md"), "utf8"), JSON.stringify({ body: "replacement" }));
  assert.equal(await readFile(join(vault.root, "put.md.md"), "utf8"), "put record source");

  const patch = await noteWrite(vault.baseUrl, "PATCH", "/patch.md", {});
  assert.equal(patch.status, 404);
  assert.equal(await readFile(join(vault.root, "patch.md.md"), "utf8"), "patch record source");
});

test("DELETE applies the ladder to double-.md records and trailing-slash .md directories", async () => {
  const vault = await startVault({
    "double.md": "exact markdown file",
    "double.md.md": "double-suffix record",
    "folder.md.md": "folder-name record",
    "folder.md/child.txt": "child",
  });

  assert.equal((await fetch(`${vault.baseUrl}/double.md`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/double`)).status, 404, "the exact .md file was the first rung");
  assert.equal(
    (await (await fetch(`${vault.baseUrl}/double.md`)).json() as { body: string }).body,
    "double-suffix record",
    "removing the shadow reveals the double-suffix record",
  );
  assert.equal((await fetch(`${vault.baseUrl}/double.md`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/double.md`)).status, 404);

  assert.equal((await fetch(`${vault.baseUrl}/folder.md/`, { method: "DELETE" })).status, 204);
  assert.equal(
    (await (await fetch(`${vault.baseUrl}/folder.md`)).json() as { body: string }).body,
    "folder-name record",
    "a trailing slash deletes only the colliding directory",
  );
  assert.equal((await fetch(`${vault.baseUrl}/folder.md`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${vault.baseUrl}/folder.md`)).status, 404);
});

test("POST is not supported", async () => {
  const vault = await startVault();
  assert.equal((await fetch(`${vault.baseUrl}/note`, { method: "POST" })).status, 405);
});

test("writes above 100KB succeed", async () => {
  const vault = await startVault();
  const body = "x".repeat(128 * 1024);
  const response = await noteWrite(vault.baseUrl, "PUT", "/large", { body });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { body: string }).body.length, body.length);
});

test("payloads over 32MB return 413", async () => {
  const vault = await startVault();
  const response = await noteWrite(vault.baseUrl, "PUT", "/too-large", { body: "x".repeat(32 * 1024 * 1024) });
  assert.equal(response.status, 413);
});

test("YAML fields with dates and lists round-trip through PUT and GET", async () => {
  const vault = await startVault();
  const fields = { due: "2026-08-07", tags: ["one", "two"], nested: [{ date: "2026-08-08" }] };
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/yaml", { fields, body: "body" })).status, 201);
  const note = await (await fetch(`${vault.baseUrl}/yaml`)).json() as { fields: unknown; body?: string };
  assert.deepEqual(note.fields, fields);
  assert.equal(note.body, "body");
});

test("PATCH of an unrelated key preserves unquoted date and datetime text", async () => {
  const source = "---\ndate: 2026-08-04\ndatetime: 2026-08-04T12:34:56Z\ntime: 12:34:56\noct: 014\nstatus: open\n---\nbody";
  const vault = await startVault({ "note.md": source });
  const before = await (await fetch(`${vault.baseUrl}/note`)).json() as { fields: unknown; body?: string };
  assert.deepEqual(before.fields, { date: "2026-08-04", datetime: "2026-08-04T12:34:56Z", time: "12:34:56", oct: 14, status: "open" });
  assert.equal(before.body, "body");

  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { status: "closed" } });
  assert.equal(patched.status, 200);
  assert.deepEqual((await patched.json() as { fields: unknown }).fields, {
    date: "2026-08-04",
    datetime: "2026-08-04T12:34:56Z",
    time: "12:34:56",
    oct: 14,
    status: "closed",
  });
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), "---\ndate: 2026-08-04\ndatetime: 2026-08-04T12:34:56Z\ntime: 12:34:56\noct: 014\nstatus: \"closed\"\n---\nbody");
});

test("record writes reject empty and dot interior URL segments rather than normalizing them", async () => {
  const vault = await startVault();
  assert.equal((await rawRequest(vault.baseUrl, "PUT", "/a//b", { body: "body" })).status, 400);
  assert.equal((await rawRequest(vault.baseUrl, "PUT", "/a/./c", { body: "body" })).status, 404);
  await assert.rejects(readFile(join(vault.root, "a/b.md")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  await assert.rejects(readFile(join(vault.root, "a/c.md")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
});

test("dot-prefixed paths reject all writes with 404", async () => {
  const vault = await startVault({ ".hidden.md": "body" });
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/.hidden", { body: "x" })).status, 404);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/.hidden", {})).status, 404);
  assert.equal((await fetch(`${vault.baseUrl}/.hidden`, { method: "DELETE" })).status, 404);
});

test("concurrent note writes all succeed and leave the record readable", async () => {
  const vault = await startVault();
  const responses = await Promise.all(Array.from({ length: 40 }, (_, index) => noteWrite(vault.baseUrl, "PUT", "/race", { fields: { index }, body: `body ${index}` })));
  assert.equal(responses.every(({ status }) => status === 200 || status === 201), true);
  assert.equal((await fetch(`${vault.baseUrl}/race`)).status, 200);
});

test("record writes cannot replace a source directory and leave no temporary file", async () => {
  const vault = await startVault();
  await mkdir(join(vault.root, "blocked.md"));
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/blocked", { body: "body" })).status, 409);
  assert.deepEqual(await readdir(vault.root), ["blocked.md"]);
});

test("PATCH of a nested collection stays block YAML and keeps the following key intact", async () => {
  // The workout agent patched a nested workouts[] and the serializer wrote inline
  // JSON while swallowing the newline before `related:`, leaving a header that no
  // longer parsed — the record then read as one long body.
  const source = "---\ntitle: Fixture\nstatus: active\nworkouts:\n  - key: workout-a\n    title: Workout A\n    exercises:\n      - key: squat\n        sets: 5\nrelated:\n  - \"[[plans/other]]\"\n---\nBody text.\n";
  const vault = await startVault({ "plans/fixture.md": source });
  const patch = { workouts: [{ key: "workout-a", title: "Workout A", exercises: [{ key: "squat", sets: 6 }] }] };

  const response = await noteWrite(vault.baseUrl, "PATCH", "/plans/fixture", { fields: patch });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "plans/fixture.md"), "utf8");
  assert.equal(written, source.replace("sets: 5", "sets: 6"), "block layout and every untouched line survive");

  const record = await response.json() as { fields: Record<string, unknown> } & Record<string, unknown>;
  assert.equal("error" in record, false, "the written header parses");
  assert.deepEqual(record.fields.workouts, patch.workouts);
  assert.deepEqual(record.fields.related, [{ $type: "ref", path: "plans/other" }]);
  assert.equal(record.body, "Body text.\n");

  const individual = await (await fetch(`${vault.baseUrl}/plans/fixture`)).json() as { fields: unknown };
  const listing = await (await fetch(`${vault.baseUrl}/plans/`)).json() as {
    entries: Array<{ name: string; type: string; fields?: unknown }>;
  };
  assert.deepEqual(individual.fields, record.fields, "individual read round-trips");
  assert.deepEqual(listing.entries[0]?.fields, record.fields, "listing agrees with the individual read");
});

test("PATCH of a nested map keeps block YAML and the following key intact", async () => {
  const source = "---\nplan:\n  sets: 5\n  reps: 5\nrelated:\n  - \"[[plans/other]]\"\n---\nbody\n";
  const vault = await startVault({ "plans/map.md": source });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/plans/map", { fields: { plan: { sets: 6, reps: 5 } } });
  assert.equal(response.status, 200);
  assert.equal(await readFile(join(vault.root, "plans/map.md"), "utf8"), source.replace("sets: 5", "sets: 6"));
  const record = await response.json() as { fields: Record<string, unknown> } & Record<string, unknown>;
  assert.equal("error" in record, false);
  assert.deepEqual(record.fields.plan, { sets: 6, reps: 5 });
});

test("a patched header that cannot be spliced safely is written whole rather than broken", async () => {
  const vault = await startVault({ "plans/deep.md": "---\nplan:\n  - key: a\n    steps:\n      - one\nrelated: keep\n---\nbody\n" });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/plans/deep", { fields: { plan: [{ key: "b", steps: ["two", "three"] }] } });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "plans/deep.md"), "utf8");
  const reread = await (await fetch(`${vault.baseUrl}/plans/deep`)).json() as { fields: Record<string, unknown> } & Record<string, unknown>;
  assert.equal("error" in reread, false, `header must parse, got:\n${written}`);
  assert.deepEqual(reread.fields.plan, [{ key: "b", steps: ["two", "three"] }]);
  assert.equal(reread.fields.related, "keep");
});
