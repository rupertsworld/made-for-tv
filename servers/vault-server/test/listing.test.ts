import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { VaultIndex } from "../src/notes.ts";
import { noteWrite, startVault } from "./helpers.ts";

test("record listing entries always contain the full single-record representation except links", async () => {
  const vault = await startVault({ "notes/item.md": "---\nbody: header\nstatus: open\n---\ndocument" });
  const listing = await fetchListing(vault.baseUrl, "/notes/");
  assert.equal(listing.path, "notes");
  assert.equal(listing.entries.length, 1);
  const fetched = await (await fetch(`${vault.baseUrl}/notes/item`)).json() as Record<string, unknown>;
  assert.deepEqual(listing.entries[0], {
    name: "item",
    type: "record",
    modified: fetched.updated,
    fields: fetched.fields,
    body: fetched.body,
  });
  assert.deepEqual(listing.entries[0]?.fields, { body: "header", status: "open" });
  assert.equal(listing.entries[0]?.body, "document");
  assert.equal("size" in (listing.entries[0] ?? {}), false);
  assert.deepEqual(fetched.links, []);
  assert.equal("links" in (listing.entries[0] ?? {}), false);

  const listingGet = await fetch(`${vault.baseUrl}/notes/`);
  const listingBytes = await listingGet.arrayBuffer();
  const listingHead = await fetch(`${vault.baseUrl}/notes/`, { method: "HEAD" });
  assert.equal(listingHead.status, 200);
  assert.equal(listingHead.headers.get("content-type"), "application/vnd.telepath.directory+json; charset=utf-8");
  assert.equal(listingHead.headers.get("content-length"), String(listingBytes.byteLength));
  assert.equal(await listingHead.text(), "");
});

test("directory listings stay one level and ignore every query parameter", async () => {
  const vault = await startVault({ "notes/z.md": "---\ntag: z\n---\nz body", "notes/nested/a.md": "a body", "notes/asset.png": "asset", "outside.md": "outside" });
  const listing = await fetchListing(vault.baseUrl, "/notes/");
  assert.equal(listing.path, "notes");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "asset.png", type: "file" },
    { name: "nested", type: "dir" },
    { name: "z", type: "record" },
  ]);
  assert.deepEqual(listing.entries.find(({ name }) => name === "z")?.fields, { tag: "z" });
  assert.equal(listing.entries.find(({ name }) => name === "z")?.body, "z body");

  for (const query of [
    "?fields&deep&bodies",
    "?deep=false&deep=true&fields=ignored&bodies=0",
    "?search=item&search=other&limit=1",
    "?filter=status&sort=modified&page=2&limit=1",
  ]) {
    assert.deepEqual(await fetchListing(vault.baseUrl, `/notes/${query}`), listing, query);
  }
  for (const entry of listing.entries) {
    const suffix = entry.type === "dir" ? "/" : "";
    assert.equal((await fetch(`${vault.baseUrl}/${listing.path}/${entry.name}${suffix}`)).status, 200, `${entry.type} ${entry.name} is addressable`);
  }
  const nestedListing = await fetchListing(vault.baseUrl, "/notes/nested/");
  const nestedRecord = await (await fetch(`${vault.baseUrl}/notes/nested/a`)).json() as Record<string, unknown>;
  assert.deepEqual(nestedListing.entries, [{
    name: "a",
    type: "record",
    modified: nestedRecord.updated,
    fields: nestedRecord.fields,
    body: nestedRecord.body,
  }]);
  assert.equal((await fetch(`${vault.baseUrl}/missing/`)).status, 404);
});

test("a large nested tree does not expand a one-level listing", async () => {
  const files = Object.fromEntries([
    ["many/visible.md", "visible"],
    ...Array.from({ length: 1_000 }, (_, index) => [`many/nested/${index}.md`, String(index)]),
  ]);
  const vault = await startVault(files);
  const listing = await fetchListing(vault.baseUrl, "/many/?deep&bodies&limit=1");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "nested", type: "dir" },
    { name: "visible", type: "record" },
  ]);
});

test("same-name directories and records sort by type and remain separately addressable", async () => {
  const vault = await startVault({ "same.md": "record", "same/child.md": "child" });
  const listing = await fetchListing(vault.baseUrl, "/");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "same", type: "dir" },
    { name: "same", type: "record" },
  ]);
  assert.equal((await (await fetch(`${vault.baseUrl}/same`)).json() as { path: string }).path, "same");
  assert.equal((await (await fetch(`${vault.baseUrl}/same/`)).json() as DirectoryListing).path, "same");
});

test("one-level listings use JavaScript string order for uppercase and non-ASCII names", async () => {
  const vault = await startVault({
    "Z.md": "Z record",
    "Z/nested.md": "nested Z",
    "a.md": "a record",
    "a/child.md": "child a",
    "é.md": "accented record",
    "é/inside.txt": "accented file",
  });

  const listing = await fetchListing(vault.baseUrl, "/");
  assert.deepEqual(listing.entries.map(({ name, type }) => [name, type]), [
    ["Z", "dir"],
    ["Z", "record"],
    ["a", "dir"],
    ["a", "record"],
    ["é", "dir"],
    ["é", "record"],
  ]);

  for (const { name, type } of listing.entries) {
    assert.equal(
      (await fetch(`${vault.baseUrl}/${encodeURI(name)}${type === "dir" ? "/" : ""}`)).status,
      200,
      `${type} ${name} is directly addressable`,
    );
  }
});

test("listing omits the non-UTF-8 record view while retaining its raw file", async () => {
  const vault = await startVault({ "mixed/good.md": "good", "mixed/bad.md": Uint8Array.from([0x66, 0x80, 0x6f]) });
  const response = await fetch(`${vault.baseUrl}/mixed/`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as DirectoryListing).entries.map(({ name, type }) => ({ name, type })), [
    { name: "bad.md", type: "file" },
    { name: "good", type: "record" },
  ]);
});

test("listing excludes dot-prefixed files and directories", async () => {
  const vault = await startVault({ "visible.md": "visible", ".hidden.md": "hidden", ".obsidian/note.md": "hidden", "folder/.nested.md": "hidden" });
  assert.deepEqual((await fetchListing(vault.baseUrl, "/")).entries.map(({ name, type }) => ({ name, type })), [
    { name: "folder", type: "dir" },
    { name: "visible", type: "record" },
  ]);
});

test("one-level listings include symbolic links without following them", async () => {
  const vault = await startVault({ "tree/inside.md": "inside", "target/outside.md": "outside" });
  await symlink("../target", join(vault.root, "tree/alias"));

  const listing = await fetchListing(vault.baseUrl, "/tree/?deep");
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "alias", type: "link" },
    { name: "inside", type: "record" },
  ]);
  assert.equal((await fetch(`${vault.baseUrl}/tree/alias`)).status, 403);
});

test("external note changes refresh listing metadata through the watcher", async () => {
  const vault = await startVault({ "note.md": "---\ntag: old\n---\nbody" });
  await writeFile(join(vault.root, "note.md"), "---\ntag: new\n---\nbody");
  const listing = await pollListing(vault.baseUrl, (entries) => entries[0]?.fields?.tag === "new");
  assert.deepEqual(listing[0]?.fields, { tag: "new" });
  assert.equal(listing[0]?.body, "body");
});

test("external note deletion removes its cached listing entry", async () => {
  const vault = await startVault({ "keep.md": "keep", "remove.md": "remove" });
  await rm(join(vault.root, "remove.md"));
  const listing = await pollListing(vault.baseUrl, (entries) => entries.every(({ name }) => name !== "remove"));
  assert.deepEqual(listing.map(({ name }) => name), ["keep"]);
});

test("listing references resolve against the index without rereading the linking note", async () => {
  const vault = await startVault({ "guide.md": "---\nref: '[[Page]]'\n---" });
  const guideFields = (entries: ListingEntry[]): unknown => entries.find(({ name }) => name === "guide")?.fields;
  // Unresolved, the reference stands as written; resolution only ever changes
  // where it points, never whether it is a reference.
  assert.deepEqual(guideFields((await fetchListing(vault.baseUrl, "/")).entries), { ref: { $type: "ref", path: "Page" } });
  await mkdir(join(vault.root, "docs"), { recursive: true });
  await writeFile(join(vault.root, "docs/Page.md"), "page");
  const added = await pollListing(vault.baseUrl, (entries) => (
    (guideFields(entries) as { ref?: { path?: string } } | undefined)?.ref?.path === "docs/Page"
  ));
  assert.deepEqual(guideFields(added), { ref: { $type: "ref", path: "docs/Page", label: "Page" } });
  await rm(join(vault.root, "docs/Page.md"));
  const deleted = await pollListing(vault.baseUrl, (entries) => (
    (guideFields(entries) as { ref?: { path?: string } } | undefined)?.ref?.path === "Page"
  ));
  assert.deepEqual(guideFields(deleted), { ref: { $type: "ref", path: "Page" } });
});

test("reference resolution uses the suffix index maintained by refresh, delete, and add", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-index-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "notes"));
  const guidePath = join(root, "notes/guide.md");
  const farPath = join(root, "Target.md");
  const nearPath = join(root, "notes/Target.md");
  await writeFile(guidePath, "---\nref: '[[Target]]'\n---");
  await writeFile(farPath, "far");
  await writeFile(nearPath, "near");
  const index = new VaultIndex(root);
  await index.refresh(guidePath);
  await index.refresh(farPath);
  await index.refresh(nearPath);
  const guideFields = (): unknown => index.listingEntry("notes/guide.md")?.fields;
  assert.deepEqual(guideFields(), { ref: { $type: "ref", path: "notes/Target", label: "Target" } });

  index.delete(nearPath);
  assert.deepEqual(guideFields(), { ref: { $type: "ref", path: "Target" } });
  index.add(nearPath);
  assert.deepEqual(guideFields(), { ref: { $type: "ref", path: "notes/Target", label: "Target" } });

  Object.defineProperty(index.files, Symbol.iterator, {
    configurable: true,
    value: () => { throw new Error("bare lookup scanned every file"); },
  });
  assert.deepEqual(guideFields(), { ref: { $type: "ref", path: "notes/Target", label: "Target" } });
});

test("multi-segment suffix lookups stay fast with many files named index.md", async () => {
  const root = "/vault";
  const index = new VaultIndex(root);
  const size = 8_000;
  for (let item = 0; item < size; item += 1) index.add(join(root, `groups/group-${item}/index.md`));

  const started = performance.now();
  for (let item = 0; item < size; item += 1) {
    assert.equal(index.resolveReference("notes/source.md", `group-${item}/index`), `groups/group-${item}/index.md`);
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2_000, `8,000 common-basename lookups took ${Math.round(elapsed)}ms`);
});

test("a listing entry resolves only the requested record", async () => {
  const root = "/vault";
  class CountingIndex extends VaultIndex {
    calls = 0;
    override resolveReference(linkingNotePath: string, target: string): string | null {
      this.calls += 1;
      return super.resolveReference(linkingNotePath, target);
    }
  }
  const index = new CountingIndex(root);
  const updated = new Date(0).toISOString();
  for (let item = 0; item < 100; item += 1) {
    const path = `outside/${item}`;
    index.updateFromNote({ updated }, join(root, `${path}.md`), { fields: { link: "[[Target]]" } }, "[[Target]]");
  }
  index.updateFromNote(
    { updated },
    join(root, "inside/note.md"),
    { fields: { link: "[[Target]]" } },
    "[[Target]]",
  );

  index.calls = 0;
  assert.equal("list" in index, false);
  assert.equal(index.listingEntry("inside/note.md")?.path, "inside/note");
  assert.equal(index.calls, 1);
});

test("API PUT updates the listing cache before responding", async () => {
  const vault = await startVault();
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/new", { fields: { source: "api" }, body: "body" })).status, 201);
  const listing = await fetchListing(vault.baseUrl, "/");
  assert.deepEqual(listing.entries.map(({ name, type, fields, body }) => ({ name, type, fields, body })), [
    { name: "new", type: "record", fields: { source: "api" }, body: "body" },
  ]);
});

test("listing retains notes whose frontmatter cannot be parsed", async () => {
  const vault = await startVault({ "broken.md": "---\ninvalid: [\n---\nbody" });
  const listing = await fetchListing(vault.baseUrl, "/");
  assert.equal(listing.entries.length, 1);
  const entry = listing.entries[0];
  assert.deepEqual(entry?.fields, {});
  assert.equal(entry?.body, "---\ninvalid: [\n---\nbody");
  assert.deepEqual(entry?.error, { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" });
  const fetched = await (await fetch(`${vault.baseUrl}/broken`)).json() as Record<string, unknown>;
  assert.equal(entry?.modified, fetched.updated);
  assert.deepEqual(entry?.fields, fetched.fields);
  assert.equal(entry?.body, fetched.body);
  assert.deepEqual(fetched.links, []);
  assert.equal("links" in (entry ?? {}), false);
});

test("a populated directory response performs no record filesystem reads", async () => {
  const vault = await startVault(Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`many/${index}.md`, `---\nindex: ${index}\n---\nbody`])));
  const calls = { readFile: 0, stat: 0 };
  const indexFileSystem = (vault.server as unknown as {
    index: {
      fileSystem: {
        readFile(path: string): Promise<Uint8Array>;
        stat(path: string): Promise<{ mtime: Date }>;
      };
    };
  }).index.fileSystem;
  const originalReadFile = indexFileSystem.readFile;
  const originalStat = indexFileSystem.stat;
  try {
    indexFileSystem.readFile = async (path) => { calls.readFile += 1; return originalReadFile(path); };
    indexFileSystem.stat = async (path) => { calls.stat += 1; return originalStat(path); };
    const listing = await fetchListing(vault.baseUrl, "/many/");
    assert.equal(listing.entries.length, 500);
    assert.deepEqual(listing.entries.find(({ name }) => name === "250")?.fields, { index: 250 });
    assert.deepEqual(calls, { readFile: 0, stat: 0 });
  } finally {
    indexFileSystem.readFile = originalReadFile;
    indexFileSystem.stat = originalStat;
  }
});

test("refresh performs one read and one stat for each record change", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-refresh-count-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const notePath = join(root, "note.md");
  await writeFile(notePath, "before");
  const calls = { readFile: 0, stat: 0 };
  const index = new VaultIndex(root, {
    readFile: async (path) => { calls.readFile += 1; return readFile(path); },
    stat: async (path) => { calls.stat += 1; return stat(path); },
  });

  await index.refresh(notePath);
  assert.deepEqual(calls, { readFile: 1, stat: 1 });
  calls.readFile = 0;
  calls.stat = 0;
  await writeFile(notePath, "after");
  await index.refresh(notePath);
  assert.deepEqual(calls, { readFile: 1, stat: 1 });
});

test("refresh keeps cached metadata during I/O and atomically replaces or removes it", async () => {
  const vault = await startVault({ "note.md": "---\ntag: old\n---\nbody" });
  let deferredRead: Promise<Uint8Array> | undefined;
  const index = new VaultIndex(vault.root, {
    readFile: (path) => deferredRead ?? readFile(path),
    stat,
  });
  const notePath = join(vault.root, "note.md");
  await index.refresh(notePath);

  let releaseRead: ((bytes: Uint8Array) => void) | undefined;
  deferredRead = new Promise((resolve) => { releaseRead = resolve; });
  const validRefresh = index.refresh(notePath);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "old" });
  assert.equal(index.listingEntry("note.md")?.body, "body");
  releaseRead?.(Buffer.from("---\ntag: new\n---\nbody"));
  await validRefresh;
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "new" });
  assert.equal(index.listingEntry("note.md")?.body, "body");

  let rejectRead: ((error: Error) => void) | undefined;
  deferredRead = new Promise((_resolve, reject) => { rejectRead = reject; });
  const failedRefresh = index.refresh(notePath);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "new" });
  assert.equal(index.listingEntry("note.md")?.body, "body");
  rejectRead?.(new Error("temporary read failure"));
  await assert.rejects(failedRefresh, /temporary read failure/);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "new" });
  assert.equal(index.listingEntry("note.md")?.body, "body");

  deferredRead = new Promise((resolve) => { releaseRead = resolve; });
  const invalidRefresh = index.refresh(notePath);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "new" });
  assert.equal(index.listingEntry("note.md")?.body, "body");
  releaseRead?.(Uint8Array.from([0x66, 0x80, 0x6f]));
  await invalidRefresh;
  assert.equal(index.listingEntry("note.md"), undefined);
});

test("a listed body applies the same prose-link transform as a single read", async () => {
  const vault = await startVault({ "guide.md": "---\nref: '[[Page|The page]]'\n---\n[[Page]]", "Page.md": "page" });
  const listing = await fetchListing(vault.baseUrl, "/");
  const guide = listing.entries.find(({ name }) => name === "guide");
  assert.deepEqual(guide?.fields, { ref: { $type: "ref", path: "Page", label: "The page" } });
  assert.equal(guide?.body, "[Page](Page)");
  const fetched = await (await fetch(`${vault.baseUrl}/guide`)).json() as { fields: unknown; body?: string };
  assert.deepEqual({ fields: fetched.fields, body: fetched.body }, { fields: guide?.fields, body: guide?.body });
});

test("a listed record omits body exactly when a single read does", async () => {
  const vault = await startVault({ "header.md": "---\ntag: x\n---", "space.md": "---\ntag: y\n---\n  \n", "empty.md": "" });
  const listing = await fetchListing(vault.baseUrl, "/");
  for (const entry of listing.entries) {
    const fetched = await (await fetch(`${vault.baseUrl}/${entry.name}`)).json() as { fields: unknown; body?: string };
    assert.deepEqual(entry.fields, fetched.fields, entry.name);
    assert.equal("body" in entry, false, entry.name);
    assert.equal("body" in fetched, false, entry.name);
  }
});

test("a whitespace-only body written through the API is omitted from its response, read, and listing", async () => {
  const validated: unknown[] = [];
  const vault = await startVault({}, { validate: (record) => { validated.push(record); } });
  const response = await noteWrite(vault.baseUrl, "PUT", "/space", { fields: { status: "open" }, body: " \n\t" });
  assert.equal(response.status, 201);
  const written = await response.json() as { fields: unknown; body?: string };
  assert.deepEqual(written.fields, { status: "open" });
  assert.equal("body" in written, false);
  assert.deepEqual(validated, [{ path: "space", fields: { status: "open" } }]);
  assert.equal(await readFile(join(vault.root, "space.md"), "utf8"), "---\nstatus: open\n---");
  assert.deepEqual((await (await fetch(`${vault.baseUrl}/space`)).json() as { fields: unknown }).fields, { status: "open" });
  const listing = await fetchListing(vault.baseUrl, "/");
  assert.deepEqual(listing.entries.map(({ name, fields }) => ({ name, fields })), [{ name: "space", fields: { status: "open" } }]);
  assert.equal("body" in (listing.entries[0] ?? {}), false);
});

type ListingEntry = {
  name: string;
  type: string;
  modified?: string;
  size?: number;
  fields?: Record<string, unknown>;
  body?: string;
  error?: { code: string; message: string };
  links?: unknown;
};
type DirectoryListing = { path: string; entries: ListingEntry[] };

async function fetchListing(baseUrl: string, path: string): Promise<DirectoryListing> {
  return (await (await fetch(`${baseUrl}${path}`)).json()) as DirectoryListing;
}

async function pollListing(
  baseUrl: string,
  predicate: (entries: ListingEntry[]) => boolean,
  path = "/",
): Promise<ListingEntry[]> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const { entries } = await fetchListing(baseUrl, path);
    if (predicate(entries)) return entries;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for listing update");
}

test("a later watcher refresh replaces an incomplete cached file", async () => {
  // Reproduces the production symptom: a watcher refresh read the file while it
  // was still being written, cached empty fields, and nothing ever corrected it,
  // so the collection kept serving {} while an individual read was complete.
  const vault = await startVault({ "plans/strength.md": "---\ntitle: Strength\nstatus: active\n---\nbody" });
  const notePath = join(vault.root, "plans/strength.md");
  const settled = await readFile(notePath, "utf8");
  let midWrite = true;
  const index = new VaultIndex(vault.root, {
    readFile: async (path) => (midWrite ? Buffer.from("") : readFile(path)),
    stat: async (path) => (midWrite ? { mtime: new Date(0) } : stat(path)),
  });

  await index.refresh(notePath);
  assert.deepEqual(index.listingEntry("plans/strength.md")?.fields, {}, "reproduces the empty cached entry");

  midWrite = false;
  await index.refresh(notePath);
  assert.deepEqual(index.listingEntry("plans/strength.md")?.fields, { title: "Strength", status: "active" });
  assert.equal(index.listingEntry("plans/strength.md")?.body, "body");
  assert.equal(settled, await readFile(notePath, "utf8"), "vault file untouched");
});

test("a failed refresh retains cached data until a later refresh succeeds", async () => {
  const vault = await startVault({ "note.md": "---\ntag: current\n---\nbody" });
  const notePath = join(vault.root, "note.md");
  let failing = false;
  const index = new VaultIndex(vault.root, {
    readFile: async (path) => { if (failing) throw Object.assign(new Error("transient"), { code: "EIO" }); return readFile(path); },
    stat,
  });

  await index.refresh(notePath);
  failing = true;
  await assert.rejects(index.refresh(notePath), /transient/);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "current" }, "keeps the last good entry");
  assert.equal(index.listingEntry("note.md")?.body, "body");

  failing = false;
  await writeFile(notePath, "---\ntag: updated\n---\nbody");
  await index.refresh(notePath);
  assert.deepEqual(index.listingEntry("note.md")?.fields, { tag: "updated" });
  assert.equal(index.listingEntry("note.md")?.body, "body");
});
