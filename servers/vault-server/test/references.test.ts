import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

test("reference objects use path everywhere and reject the former href key", async () => {
  const vault = await startVault({
    "notes/guide.md": "---\ncontact: '[[Page|Readable]]'\n---",
    "notes/Page.md": "page",
  });
  const read = await (await fetch(`${vault.baseUrl}/notes/guide`)).json() as { fields: { contact: Record<string, unknown> } };
  assert.deepEqual(read.fields.contact, { $type: "ref", path: "notes/Page", label: "Readable" });
  assert.equal("href" in read.fields.contact, false);

  const written = await noteWrite(vault.baseUrl, "PUT", "/written", {
    fields: { contact: { $type: "ref", path: "notes/Page", label: "Readable" } },
  });
  assert.equal(written.status, 201);
  assert.match(await readFile(join(vault.root, "written.md"), "utf8"), /\[\[notes\/Page\|Readable\]\]/);

  for (const invalid of [
    { $type: "ref", href: "notes/Page" },
    { $type: "ref" },
    { $type: "ref", path: 3 },
    { $type: "ref", path: "notes/Page", href: "notes/Page" },
  ]) {
    assert.equal((await noteWrite(vault.baseUrl, "PUT", "/invalid", { fields: { contact: invalid } })).status, 400);
  }
});

test("markdown link format reads both field syntaxes and writes and echoes markdown references", async () => {
  const source = "---\ncontact: '[Contact](../contacts/sample%20contact?q=1#bio)'\nencodedSlash: '[Contact](../contacts%2Fsample%20contact)'\nhashName: '[Hash](../docs/hash%23name)'\nclamped: '[Root](..%2F..%2F..%2Fx)'\nfuture: '[Future](../future/person)'\nwiki: '[[contacts/sample contact]]'\nexternal: '[Away](https://example.test/person)'\nprotocolRelative: '[CDN](//cdn.example.test/person)'\n---";
  const vault = await startVault({
    "journal/note.md": source,
    "contacts/sample contact.md": "contact",
    "docs/hash#name.md": "hash",
    "x.md": "root",
  }, { linkFormat: "markdown" });

  const fetched = await (await fetch(`${vault.baseUrl}/journal/note`)).json() as { fields: Record<string, unknown> };
  assert.deepEqual(fetched.fields, {
    contact: { $type: "ref", path: "contacts/sample contact?q=1#bio", label: "Contact" },
    encodedSlash: { $type: "ref", path: "contacts/sample contact", label: "Contact" },
    hashName: { $type: "ref", path: "docs/hash#name", label: "Hash" },
    clamped: { $type: "ref", path: "x", label: "Root" },
    future: { $type: "ref", path: "future/person", label: "Future" },
    wiki: { $type: "ref", path: "contacts/sample contact" },
    external: "[Away](https://example.test/person)",
    protocolRelative: "[CDN](//cdn.example.test/person)",
  });

  const echoed = await noteWrite(vault.baseUrl, "PUT", "/journal/note", { fields: fetched.fields });
  assert.equal(echoed.status, 200);
  assert.equal(await readFile(join(vault.root, "journal/note.md"), "utf8"), source);

  const changed = await noteWrite(vault.baseUrl, "PUT", "/journal/note", {
    fields: {
      contact: { $type: "ref", path: "contacts/sample contact?q=2#bio", label: "Contact" },
      plain: { $type: "ref", path: "contacts/sample contact" },
    },
  });
  assert.equal(changed.status, 200);
  const written = await readFile(join(vault.root, "journal/note.md"), "utf8");
  assert.match(written, /contact: ['"]\[Contact\]\(\.\.\/contacts\/sample%20contact\?q=2#bio\)['"]/);
  assert.match(written, /plain: ['"]\[contacts\/sample contact\]\(\.\.\/contacts\/sample%20contact\)['"]/);
});

test("whole-value links in both syntaxes convert to references at every field depth", async () => {
  const vault = await startVault({
    "guide.md": "---\nscalar: '[[Page]]'\nmarkdownScalar: '[Page](Page)'\naliased: '[[Page|The page]]'\nlist:\n  - '[[Page]]'\n  - '[Page](Page)'\n  - ordinary\narrayObjects:\n  - contact: '[Target](folder/Target)'\nnested:\n  contact: '[[folder/Target]]'\ntext: 'before [[Page]] after'\nmarkdownText: 'before [Page](Page) after'\n---\nBody [[Page]] appears in prose.\n",
    "Page.md": "page",
    "folder/Target.md": "target",
  });
  const note = await (await fetch(`${vault.baseUrl}/guide`)).json() as { fields: Record<string, unknown> } & Record<string, unknown>;
  assert.deepEqual(note.fields, {
    scalar: { $type: "ref", path: "Page" },
    markdownScalar: { $type: "ref", path: "Page" },
    aliased: { $type: "ref", path: "Page", label: "The page" },
    list: [{ $type: "ref", path: "Page" }, { $type: "ref", path: "Page" }, "ordinary"],
    arrayObjects: [{ contact: { $type: "ref", path: "folder/Target", label: "Target" } }],
    nested: { contact: { $type: "ref", path: "folder/Target" } },
    text: "before [[Page]] after",
    markdownText: "before [Page](Page) after",
  });
  assert.equal(note.body, "Body [Page](Page) appears in prose.\n");
  assert.equal((note.links as unknown[]).length, 8);
});

test("explicit paths, bare basenames, nearest neighbours, and lexicographic ties resolve exactly", async () => {
  const vault = await startVault({
    "a/linker.md": "---\nexplicit: '[[docs/Page]]'\nbare: '[[Target]]'\nwithExtension: '[[Other.md]]'\ntie: '[[Equal]]'\n---",
    "docs/Page.md": "page",
    "Target.md": "far",
    "a/sub/Target.md": "near",
    "Other.md": "far",
    "a/Other.md": "near",
    "a/x/Equal.md": "x",
    "a/y/Equal.md": "y",
  });
  const fields = (await (await fetch(`${vault.baseUrl}/a/linker`)).json() as { fields: Record<string, unknown> }).fields;
  assert.deepEqual(fields, {
    explicit: { $type: "ref", path: "docs/Page" },
    bare: { $type: "ref", path: "a/sub/Target", label: "Target" },
    withExtension: { $type: "ref", path: "a/Other", label: "Other.md" },
    tie: { $type: "ref", path: "a/x/Equal", label: "Equal" },
  });
});

test("wikilinks resolve by whole path suffix segments with nearest and lexicographic ordering", async () => {
  const vault = await startVault({
    "near/guide.md": "---\nsuffix: '[[acts/sample]]'\nfull: '[[archive/acts/sample]]'\ndecoy: '[[teams/sample]]'\n---\n[[acts/sample]]",
    "near/acts/sample.md": "nearest suffix",
    "archive/acts/sample.md": "far suffix",
    "contacts/sample.md": "basename-only decoy",
  });
  const note = await (await fetch(`${vault.baseUrl}/near/guide`)).json() as { fields: unknown; body?: string };
  assert.deepEqual(note.fields, {
    suffix: { $type: "ref", path: "near/acts/sample", label: "acts/sample" },
    full: { $type: "ref", path: "archive/acts/sample" },
    decoy: { $type: "ref", path: "teams/sample" },
  });
  assert.equal(note.body, "[acts/sample](acts/sample)");
});

test("query suffixes survive field and prose reads and writes in both link formats", async () => {
  for (const linkFormat of ["wikilink", "markdown"] as const) {
    const fieldLink = linkFormat === "wikilink"
      ? "[[Page?q=one two#part]]"
      : "[Page?q=one two#part](Page?q=one%20two#part)";
    const vault = await startVault({
      "Page.md": "page",
      [`${linkFormat}.md`]: `---\nlink: '${fieldLink}'\n---\n[[Page?q=one two#part]]`,
    }, { linkFormat });

    const fetched = await (await fetch(`${vault.baseUrl}/${linkFormat}`)).json() as {
      fields: { link: unknown };
      body?: string;
    };
    assert.deepEqual(fetched.fields.link, linkFormat === "wikilink"
      ? { $type: "ref", path: "Page?q=one two#part" }
      : { $type: "ref", path: "Page?q=one%20two#part", label: "Page?q=one two#part" }, linkFormat);
    assert.equal(fetched.body, "[Page?q=one two#part](Page?q=one%20two#part)", linkFormat);

    const response = await noteWrite(vault.baseUrl, "PUT", `/${linkFormat}`, {
      fields: { link: { $type: "ref", path: "Page?q=two words#next" } },
      body: linkFormat === "wikilink"
        ? "[Query](Page?q=two%20words#next)"
        : "[[Page?q=two words#next|Query]]",
    });
    assert.equal(response.status, 200, linkFormat);
    const written = await readFile(join(vault.root, `${linkFormat}.md`), "utf8");
    if (linkFormat === "wikilink") {
      assert.match(written, /link: ['"]\[\[Page\?q=two words#next\]\]['"]/);
      assert.equal(written.endsWith("---\n[[Page?q=two%20words#next|Query]]"), true);
    } else {
      assert.match(written, /link: ['"]\[Page\?q=two words#next\]\(Page\?q=two%20words#next\)['"]/);
      assert.equal(written.endsWith("---\n[Query](Page?q=two%20words#next)"), true);
    }
  }
});

test("empty-path fragment and query references resolve to the linking record in both formats", async () => {
  for (const linkFormat of ["wikilink", "markdown"] as const) {
    const fragment = linkFormat === "wikilink" ? "[[#part]]" : "[Here](#part)";
    const query = linkFormat === "wikilink" ? "[[?q=1]]" : "[Query](?q=1)";
    const vault = await startVault({
      "notes/note.md": `---\nfragment: '${fragment}'\nquery: '${query}'\n---\n[[#part|Here]] and [[?q=1|Query]]`,
    }, { linkFormat });

    const record = await (await fetch(`${vault.baseUrl}/notes/note`)).json() as {
      fields: Record<string, unknown>;
      body?: string;
    };
    assert.deepEqual(record.fields, {
      fragment: { $type: "ref", path: "notes/note#part", label: linkFormat === "wikilink" ? "#part" : "Here" },
      query: { $type: "ref", path: "notes/note?q=1", label: linkFormat === "wikilink" ? "?q=1" : "Query" },
    });
    assert.equal(record.body, "[Here](#part) and [Query](?q=1)");
  }
});

test("literal files win before markdown fallback and assets retain their extensions", async () => {
  const vault = await startVault({
    "guide.md": "---\ndottedNote: '[[docs/v1.2]]'\ndottedBare: '[[Node.js]]'\nasset: '[[photo.jpg]]'\n---",
    "docs/v1.2.md": "note",
    "Node.js.md": "note",
    "photo.jpg": "asset",
    "photo.jpg.md": "shadowed note",
  });
  assert.deepEqual((await (await fetch(`${vault.baseUrl}/guide`)).json() as { fields: unknown }).fields, {
    dottedNote: { $type: "ref", path: "docs/v1.2" },
    dottedBare: { $type: "ref", path: "Node.js" },
    asset: { $type: "ref", path: "photo.jpg" },
  });
});

test("a wikilink is a reference whether or not it finds anything", async () => {
  const vault = await startVault({
    "guide.md": "---\nfragment: '[[Page#Heading]]'\nmissing: '[[Missing]]'\nhiddenExplicit: '[[.obsidian/Private]]'\nhiddenBare: '[[Private]]'\n---",
    "Page.md": "page",
    ".obsidian/Private.md": "hidden",
  });
  assert.deepEqual((await (await fetch(`${vault.baseUrl}/guide`)).json() as { fields: unknown }).fields, {
    // The path resolves and the fragment rides along, as it would in a URL.
    fragment: { $type: "ref", path: "Page#Heading" },
    // Nothing to find, so the target stands as written: a dead reference,
    // not a value that quietly stops being a reference at all.
    missing: { $type: "ref", path: "Missing" },
    hiddenExplicit: { $type: "ref", path: ".obsidian/Private" },
    hiddenBare: { $type: "ref", path: "Private" },
  });
  assert.equal((await fetch(`${vault.baseUrl}/Missing`)).status, 404, "a dead reference reads as a dead link");
});

test("a record keeps its shape when a link's target appears and goes away", async () => {
  const vault = await startVault({ "guide.md": "---\nlink: '[[Later]]'\n---" });
  const shape = async (): Promise<unknown> => (await (await fetch(`${vault.baseUrl}/guide`)).json() as { fields: { link: unknown } }).fields.link;
  assert.deepEqual(await shape(), { $type: "ref", path: "Later" });
  await writeFile(join(vault.root, "Later.md"), "now it exists");
  await pollFor(async () => JSON.stringify(await shape()) === JSON.stringify({ $type: "ref", path: "Later" }));
  assert.deepEqual(await shape(), { $type: "ref", path: "Later" }, "still a reference, now a live one");
  await rm(join(vault.root, "Later.md"));
  await pollFor(async () => JSON.stringify(await shape()) === JSON.stringify({ $type: "ref", path: "Later" }));
  assert.deepEqual(await shape(), { $type: "ref", path: "Later" }, "still a reference once the target is gone");
});

test("reference labels preserve aliases and authored targets changed by resolution", async () => {
  const vault = await startVault({
    "notes/guide.md": "---\naliased: '[[Page|Readable page]]'\naliasedFragment: '[[Page#Heading|Section]]'\nqueryFragment: '[[Page?q=1#Heading]]'\nresolvedBare: '[[Page#Heading]]'\nunresolvedAlias: '[[Missing#Part|Missing part]]'\nunresolved: '[[Missing#Part]]'\nsameAlias: '[[notes/Page|notes/Page]]'\n---",
    "notes/Page.md": "page",
  });
  const fields = (await (await fetch(`${vault.baseUrl}/notes/guide`)).json() as { fields: Record<string, unknown> }).fields;
  assert.deepEqual(fields, {
    aliased: { $type: "ref", path: "notes/Page", label: "Readable page" },
    aliasedFragment: { $type: "ref", path: "notes/Page#Heading", label: "Section" },
    queryFragment: { $type: "ref", path: "notes/Page?q=1#Heading", label: "Page?q=1#Heading" },
    resolvedBare: { $type: "ref", path: "notes/Page#Heading", label: "Page#Heading" },
    unresolvedAlias: { $type: "ref", path: "Missing#Part", label: "Missing part" },
    unresolved: { $type: "ref", path: "Missing#Part" },
    sameAlias: { $type: "ref", path: "notes/Page" },
  });
});

async function pollFor(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

test("PUT serializes reference objects at depth with path exactly as submitted", async () => {
  const vault = await startVault({ "folder/Page.md": "page" });
  const fields = {
    scalar: { $type: "ref", path: "Page" },
    list: [{ $type: "ref", path: "folder/Page" }],
    nested: { target: { $type: "ref", path: "Page#Heading", label: "The heading" } },
    ordinary: { $ref: "folder/Page", label: "Page" },
  };
  const response = await noteWrite(vault.baseUrl, "PUT", "/written", { fields });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json() as { fields: unknown }).fields, {
    scalar: { $type: "ref", path: "folder/Page", label: "Page" },
    list: [{ $type: "ref", path: "folder/Page" }],
    nested: { target: { $type: "ref", path: "folder/Page#Heading", label: "The heading" } },
    ordinary: { $ref: "folder/Page", label: "Page" },
  });
  const source = await readFile(join(vault.root, "written.md"), "utf8");
  assert.match(source, /scalar: ['"]\[\[Page\]\]['"]/);
  assert.match(source, /target: ['"]\[\[Page#Heading\|The heading\]\]['"]/);
  assert.match(source, /ordinary:\n\s+\$ref: folder\/Page\n\s+label: Page/);
});

test("a newly created record resolves references against itself in its response", async () => {
  const vault = await startVault();
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/self", {
    fields: { link: { $type: "ref", path: "self" } },
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json() as { fields: unknown }).fields, {
    link: { $type: "ref", path: "notes/self", label: "self" },
  });
});

test("writes reject every invalid object carrying $type", async () => {
  const invalid = [
    [{ $type: "unknown", path: "Page" }, "invalid $type object"],
    [{ $type: "ref" }, "reference path must be a string"],
    [{ $type: "ref", path: 3 }, "reference path must be a string"],
    [{ $type: "ref", path: "Page", label: 3 }, "invalid $type object"],
    [{ $type: "ref", path: "Page", extra: true }, "invalid $type object"],
  ];
  for (const [index, [value, error]] of invalid.entries()) {
    const vault = await startVault();
    const response = await noteWrite(vault.baseUrl, "PUT", `/invalid-${index}`, { fields: { nested: [{ value }] } });
    assert.equal(response.status, 400, JSON.stringify(value));
    assert.deepEqual(await response.json(), { error });
  }

  const vault = await startVault();
  for (const fields of [{ $type: "ref" }, { $type: "ref", path: 3 }]) {
    const response = await noteWrite(vault.baseUrl, "PUT", "/invalid-field-map", { fields });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "reference path must be a string" });
  }
});

test("PATCH rejects an invalid $type object before merge can repair its shape", async () => {
  const source = "---\nmissingHref:\n  href: Page\nextraKey:\n  extra: old\n---";
  const vault = await startVault({ "note.md": source });
  for (const [patch, error] of [
    [{ missingHref: { $type: "ref" } }, "reference path must be a string"],
    [{ extraKey: { $type: "ref", path: "Page", extra: null } }, "invalid $type object"],
  ]) {
    const response = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: patch });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
    assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), source);
  }
});

test("PUT echo keeps an equivalent stored wikilink spelling at the same position", async () => {
  const original = "---\ncontact: '[[Page]]'\nlist:\n  - '[[Page#Heading]]'\nstatus: old\n---";
  const vault = await startVault({ "notes/note.md": original, "notes/Page.md": "page" });
  const fetched = await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { fields: Record<string, unknown> };
  assert.deepEqual(fetched.fields.contact, { $type: "ref", path: "notes/Page", label: "Page" });

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { fields: { ...fetched.fields, status: "new" } });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /contact: ['"]\[\[Page\]\]['"]/);
  assert.match(written, /- ['"]\[\[Page#Heading\]\]['"]/);
  assert.equal(written.includes("[[notes/Page|Page]]"), false);
});

test("PUT echo keeps markdown-spelled field links under wikilink write format", async () => {
  const original = "---\ncontact: '[Page](Page)'\nstatus: old\n---";
  const vault = await startVault({ "notes/note.md": original, "notes/Page.md": "page" });
  const fetched = await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { fields: Record<string, unknown> };
  assert.deepEqual(fetched.fields.contact, { $type: "ref", path: "notes/Page", label: "Page" });

  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { fields: { ...fetched.fields, status: "new" } });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /contact: ['"]\[Page\]\(Page\)['"]/);
  assert.equal(written.includes("[[notes/Page|Page]]"), false);
});

test("PATCH merges against served references and serializes changed rendered text", async () => {
  const vault = await startVault({ "notes/note.md": "---\ncontact: '[[Page]]'\n---", "notes/Page.md": "page" });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/notes/note", { fields: { contact: { label: "The page" } } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { fields: unknown }).fields, {
    contact: { $type: "ref", path: "notes/Page", label: "The page" },
  });
  assert.match(await readFile(join(vault.root, "notes/note.md"), "utf8"), /contact: ['"]\[\[notes\/Page\|The page\]\]['"]/);

  const withoutLabel = await noteWrite(vault.baseUrl, "PATCH", "/notes/note", { fields: { contact: { label: null } } });
  assert.equal(withoutLabel.status, 200);
  assert.deepEqual((await withoutLabel.json() as { fields: unknown }).fields, {
    contact: { $type: "ref", path: "notes/Page" },
  });
  assert.match(await readFile(join(vault.root, "notes/note.md"), "utf8"), /contact: ['"]\[\[notes\/Page\]\]['"]/);
});

test("moving or reordering references writes the submitted spelling", async () => {
  const vault = await startVault({
    "notes/note.md": "---\nfirst: '[[Page]]'\nlist:\n  - '[[Page]]'\n  - '[[Other]]'\n---",
    "notes/Page.md": "page",
    "notes/Other.md": "other",
  });
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", {
    fields: {
      second: { $type: "ref", path: "notes/Page", label: "Page" },
      list: [
        { $type: "ref", path: "notes/Other", label: "Other" },
        { $type: "ref", path: "notes/Page", label: "Page" },
      ],
    },
  });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /second: ['"]\[\[notes\/Page\|Page\]\]['"]/);
  assert.match(written, /- ['"]\[\[notes\/Other\|Other\]\]['"]\n  - ['"]\[\[notes\/Page\|Page\]\]['"]/);
});

test("only submitted $type nodes are validated during PATCH and PUT", async () => {
  const source = "---\ndata:\n  $type: custom # preserve this stored data exactly\n  value: '[[Page]]'\nstatus: old\n---";
  const vault = await startVault({ "note.md": source, "Page.md": "page" });
  const fetched = await (await fetch(`${vault.baseUrl}/note`)).json() as { fields: Record<string, unknown> };
  assert.deepEqual(fetched.fields, {
    data: { $type: "custom", value: { $type: "ref", path: "Page" } },
    status: "old",
  });

  const unrelated = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { status: "new" } });
  assert.equal(unrelated.status, 200);
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), `${source.replace("status: old", "status: \"new\"")}\n`);

  const replacement = await noteWrite(vault.baseUrl, "PUT", "/note", { fields: { data: { value: "ordinary" } } });
  assert.equal(replacement.status, 200);
  assert.deepEqual((await replacement.json() as { fields: unknown }).fields, { data: { value: "ordinary" } });

  const invalid = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { data: { $type: "custom" } } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid $type object" });
});

test("reference echo is positional for duplicates and objects nested in arrays", async () => {
  const source = "---\nlist:\n  - '[[Page]]'\n  - '[[Page]]'\nrows:\n  - contact: '[[Page]]'\n---";
  const vault = await startVault({ "notes/note.md": source, "notes/Page.md": "page" });
  const fields = (await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { fields: Record<string, unknown> }).fields;
  assert.deepEqual(fields, {
    list: [
      { $type: "ref", path: "notes/Page", label: "Page" },
      { $type: "ref", path: "notes/Page", label: "Page" },
    ],
    rows: [{ contact: { $type: "ref", path: "notes/Page", label: "Page" } }],
  });
  const response = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { fields });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.equal((written.match(/\[\[Page\]\]/g) ?? []).length, 3);
  assert.equal(written.includes("[[notes/Page|Page]]"), false);
});

test("reference echo does not cross a scalar-list shape change", async () => {
  const vault = await startVault({
    "notes/note.md": "---\nchanging: '[[Page]]'\n---",
    "notes/Page.md": "page",
  });
  const reference = (await (await fetch(`${vault.baseUrl}/notes/note`)).json() as { fields: { changing: unknown } }).fields.changing;

  const toList = await noteWrite(vault.baseUrl, "PUT", "/notes/note", { fields: { changing: [reference] } });
  assert.equal(toList.status, 200);
  assert.match(await readFile(join(vault.root, "notes/note.md"), "utf8"), /\[\[notes\/Page\|Page\]\]/);

  const toScalar = await noteWrite(vault.baseUrl, "PUT", "/notes/note", {
    fields: { changing: { $type: "ref", path: "Page" } },
  });
  assert.equal(toScalar.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /changing: ['"]\[\[Page\]\]['"]/);
  assert.equal(written.includes("[[notes/Page|Page]]"), false);
});

test("PATCH preserves untouched wikilink spelling byte-for-byte while rewriting changed keys", async () => {
  const original = "---\ncontact: '[[Page]]'\nstatus: old\n---\nbody\n";
  const vault = await startVault({ "notes/note.md": original, "notes/Page.md": "page" });
  const response = await noteWrite(vault.baseUrl, "PATCH", "/notes/note", { fields: { status: "new" } });
  assert.equal(response.status, 200);
  const written = await readFile(join(vault.root, "notes/note.md"), "utf8");
  assert.match(written, /contact: '\[\[Page\]\]'/);
  assert.equal(written.includes("[[notes/Page]]"), false);
  assert.match(written, /status: ["']?new["']?/);
});
