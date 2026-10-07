import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { VaultServer, type VaultServerOptions } from "../src/server.ts";
import { noteWrite, openSocket, startVault } from "./helpers.ts";

const stringLinkFormatOptions: Omit<VaultServerOptions, "root"> = { linkFormat: "markdown" };
// @ts-expect-error linkFormat is a value, not a callback
const functionLinkFormatOptions: Omit<VaultServerOptions, "root"> = { linkFormat: () => "markdown" };
void stringLinkFormatOptions;
void functionLinkFormatOptions;

test("validate receives stored fields and sibling body in the candidate record", async () => {
  const seen: unknown[] = [];
  const vault = await startVault({}, { validate: (record) => { seen.push(record); } });
  const response = await noteWrite(vault.baseUrl, "PUT", "/candidate", {
    fields: { body: "header", link: { $type: "ref", path: "Target" } },
    body: "[Target](/docs/Target)",
  });
  assert.equal(response.status, 201);
  assert.deepEqual(seen, [{
    path: "candidate",
    fields: { body: "header", link: "[[Target]]" },
    body: "[[docs/Target|Target]]",
  }]);
});

async function vaultRoot(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vault-server-api-"));
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

test("paths exposes visible indexed disk paths as a repeatable view", async (context) => {
  const root = await vaultRoot({
    "note.md": "note",
    "assets/photo.jpg": "photo",
    ".root.md": "hidden",
    ".obsidian/config.json": "{}",
  });
  const server = new VaultServer({ root });
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  await server.ready;

  const paths = server.paths;
  assert.deepEqual([...paths].sort(), ["assets/photo.jpg", "note.md"]);
  assert.deepEqual([...paths].sort(), ["assets/photo.jpg", "note.md"], "the same view can be iterated again");
  assert.equal("recordCount" in server, false);
});

test("paths tracks API writes and watcher renames", async (context) => {
  const root = await vaultRoot({ "before.md": "before" });
  const server = new VaultServer({ root });
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  await server.listen({ port: 0 });
  const paths = server.paths;

  assert.equal((await noteWrite(server.url as string, "PUT", "/created", { body: "created" })).status, 201);
  assert.deepEqual([...paths].sort(), ["before.md", "created.md"]);
  assert.equal((await fetch(`${server.url}/created`, { method: "DELETE" })).status, 204);
  assert.deepEqual([...paths], ["before.md"]);

  const socket = await openSocket(server.url as string, "/");
  context.after(() => socket.close());
  const renamed = new Promise<void>((resolve, reject) => {
    const seen = new Set<string>();
    const timer = setTimeout(() => reject(new Error("timed out waiting for rename events")), 3_000);
    socket.on("message", (data) => {
      const event = JSON.parse(data.toString()) as { type: string; path: string };
      seen.add(`${event.type}:${event.path}`);
      if (seen.has("deleted:before") && seen.has("created:after")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  await rename(join(root, "before.md"), join(root, "after.md"));
  await renamed;
  assert.deepEqual([...paths], ["after.md"]);
});

test("constructor options are flat", async (context) => {
  const root = await vaultRoot();
  const options: VaultServerOptions = {
    root,
    linkFormat: "wikilink",
    jsonLimit: "1kb",
    pingIntervalMs: 50,
  };
  const server = new VaultServer(options);
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  await server.listen({ port: 0 });

  const response = await noteWrite(server.url as string, "PUT", "/large", { body: "x".repeat(2_000) });
  assert.equal(response.status, 413);
});

test("linkFormat strings configure writes in both supported syntaxes", async () => {
  for (const linkFormat of ["wikilink", "markdown"] as const) {
    const vault = await startVault({ "targets/One.md": "one" }, { linkFormat });
    const response = await noteWrite(vault.baseUrl, "PUT", `/writes/${linkFormat}`, {
      fields: { link: { $type: "ref", path: "targets/One", label: "One" } },
      body: linkFormat === "wikilink" ? "[One](/targets/One)" : "[[targets/One|One]]",
    });
    assert.equal(response.status, 201, linkFormat);
    const stored = await readFile(join(vault.root, `writes/${linkFormat}.md`), "utf8");
    const expected = linkFormat === "wikilink" ? "[[targets/One|One]]" : "[One](../targets/One)";
    assert.equal((stored.match(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 2, linkFormat);
  }
});

test("configure replaces linkFormat for later writes while reads and earlier files stay unchanged", async () => {
  const vault = await startVault({
    "targets/One.md": "one",
    "read.md": "---\nwiki: '[[targets/One]]'\nmarkdown: '[One](targets/One)'\n---\n[[targets/One|Wiki]] and [Markdown](targets/One)",
  }, { linkFormat: "wikilink" });

  const readRecord = async (): Promise<unknown> => {
    const response = await fetch(`${vault.baseUrl}/read`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const expectedRead = {
    path: "read",
    fields: {
      wiki: { $type: "ref", path: "targets/One" },
      markdown: { $type: "ref", path: "targets/One", label: "One" },
    },
    body: "[Wiki](targets/One) and [Markdown](targets/One)",
  };
  const beforeConfigure = await readRecord() as Record<string, unknown>;
  assert.deepEqual({ path: beforeConfigure.path, fields: beforeConfigure.fields, body: beforeConfigure.body }, expectedRead);
  assert.deepEqual(beforeConfigure.links, [
    { path: "targets/One", field: "wiki" },
    { path: "targets/One", field: "markdown" },
    { path: "targets/One" },
    { path: "targets/One" },
  ], "both syntaxes are indexed independently of the write format");

  const first = await noteWrite(vault.baseUrl, "PUT", "/writes/first", {
    fields: { link: { $type: "ref", path: "targets/One", label: "One" } },
    body: "[One](/targets/One)",
  });
  assert.equal(first.status, 201);
  const firstStored = await readFile(join(vault.root, "writes/first.md"), "utf8");
  assert.equal((firstStored.match(/\[\[targets\/One\|One\]\]/g) ?? []).length, 2);

  vault.server.configure({ linkFormat: "markdown" });
  const afterConfigure = await readRecord() as Record<string, unknown>;
  assert.deepEqual({ path: afterConfigure.path, fields: afterConfigure.fields, body: afterConfigure.body, links: afterConfigure.links }, {
    ...expectedRead,
    links: beforeConfigure.links,
  }, "changing write syntax does not affect reads or link extraction");

  const second = await noteWrite(vault.baseUrl, "PUT", "/writes/second", {
    fields: { link: { $type: "ref", path: "targets/One", label: "One" } },
    body: "[[targets/One|One]]",
  });
  assert.equal(second.status, 201);
  const secondStored = await readFile(join(vault.root, "writes/second.md"), "utf8");
  assert.equal((secondStored.match(/\[One\]\(\.\.\/targets\/One\)/g) ?? []).length, 2);
  assert.equal(await readFile(join(vault.root, "writes/first.md"), "utf8"), firstStored, "the first write stays in its original syntax");
});

test("constructor rejects unknown options without directing callers to removed groups", async () => {
  const root = await vaultRoot();
  let server: VaultServer | undefined;
  try {
    assert.throws(
      () => { server = new VaultServer({ root, vault: { linkFormat: "wikilink" } } as unknown as VaultServerOptions); },
      /^Error: unknown VaultServer option "vault"$/,
    );
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("configure rejects unknown options with the constructor's message shape", async (context) => {
  const root = await vaultRoot();
  const server = new VaultServer({ root });
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  await server.listen({ port: 0 });

  assert.throws(
    () => server.configure({ linkFormat: "markdown", vault: {} } as unknown as Parameters<VaultServer["configure"]>[0]),
    /^Error: unknown VaultServer option "vault"$/,
  );

  const response = await noteWrite(server.url as string, "PUT", "/after-rejection", {
    fields: { link: { $type: "ref", path: "target" } },
  });
  assert.equal(response.status, 201);
  assert.match(await readFile(join(root, "after-rejection.md"), "utf8"), /link: ['"]\[\[target\]\]['"]/);
});

test("listen resolves with the server and exposes the address it bound", async (context) => {
  const root = await vaultRoot();
  const server = new VaultServer({ root });
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  assert.equal(server.url, undefined, "no address before listening");
  assert.equal(server.port, undefined);

  const returned = await server.listen({ port: 0 });
  assert.equal(returned, server, "resolves with the instance, so it chains");
  assert.equal(typeof server.port, "number");
  assert.notEqual(server.port, 0, "port 0 reports the port the OS actually chose");
  assert.equal(server.url, `http://127.0.0.1:${server.port}`);
  assert.equal((await fetch(`${server.url}/`)).status, 200);

  await server.close();
  assert.equal(server.url, undefined, "no address once closed");
});

test("listen rejects when an explicit port is taken", async (context) => {
  const root = await vaultRoot();
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const { port } = occupied.address() as { port: number };
  const server = new VaultServer({ root });
  context.after(async () => {
    await server.close();
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(server.listen({ port }), (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
});

test("validate sees exactly what the write will store, for a create and for a merge", async () => {
  const seen: Array<{ path: string; fields: Record<string, unknown>; body?: string }> = [];
  const vault = await startVault(
    { "target.md": "target", "note.md": "---\nkeep: yes\nlink: '[[target]]'\n---\nold body" },
    { validate: (record) => { seen.push(record); } },
  );

  // A reference submitted in API form is stored as the link a file carries, and
  // that is what is judged — not the resolved form a read would hand back.
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/fresh", { fields: { link: { $type: "ref", path: "target" } }, body: "new" })).status, 201);
  assert.deepEqual(seen.at(-1), { path: "fresh", fields: { link: "[[target]]" }, body: "new" });
  assert.match(await readFile(join(vault.root, "fresh.md"), "utf8"), /link: ['"]\[\[target\]\]['"]/);

  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { added: 1 } })).status, 200);
  assert.deepEqual(seen.at(-1), { path: "note", fields: { keep: "yes", link: "[[target]]", added: 1 }, body: "old body" });
});

test("a link is the same shape to validate whether or not it resolves", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const vault = await startVault({ "target.md": "target" }, { validate: ({ fields }) => { seen.push(fields); } });
  await noteWrite(vault.baseUrl, "PUT", "/resolving", { fields: { link: "[[target]]" } });
  await noteWrite(vault.baseUrl, "PUT", "/dangling", { fields: { link: "[[nobody]]" } });
  // Resolution must not decide a field's type: a schema written for links would
  // otherwise accept every broken one and reject every working one.
  assert.deepEqual(seen.map((fields) => fields.link), ["[[target]]", "[[nobody]]"]);
});

test("validate sees body after write normalization", async () => {
  const seen: unknown[] = [];
  const vault = await startVault({}, { validate: (record) => { seen.push(record); } });
  const response = await noteWrite(vault.baseUrl, "PUT", "/journal/note", { body: "[Target](/docs/target)" });
  assert.equal(response.status, 201);
  assert.deepEqual(seen, [{ path: "journal/note", fields: {}, body: "[[docs/target|Target]]" }]);
});

test("a refused write is answered 422 and never reaches disk", async () => {
  const vault = await startVault(
    { "note.md": "---\ntag: original\n---\nbody" },
    { validate: ({ fields }) => { if (fields.tag === "bad") throw new Error("tag is not allowed"); } },
  );

  const patched = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { tag: "bad" } });
  assert.equal(patched.status, 422);
  assert.deepEqual(await patched.json(), { error: "tag is not allowed" });
  assert.equal(await readFile(join(vault.root, "note.md"), "utf8"), "---\ntag: original\n---\nbody", "file untouched");

  const created = await noteWrite(vault.baseUrl, "PUT", "/new", { fields: { tag: "bad" } });
  assert.equal(created.status, 422);
  await assert.rejects(readFile(join(vault.root, "new.md")), "nothing was created");
  const listing = await (await fetch(`${vault.baseUrl}/`)).json() as { entries: Array<{ name: string; type: string }> };
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [{ name: "note", type: "record" }]);
});

test("validate may be async, and a non-Error refusal still reports a message", async () => {
  const vault = await startVault({}, {
    validate: async ({ path }) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (path === "refused") throw "not this one";
    },
  });
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/allowed", { body: "fine" })).status, 201);
  const refused = await noteWrite(vault.baseUrl, "PUT", "/refused", { body: "no" });
  assert.equal(refused.status, 422);
  assert.deepEqual(await refused.json(), { error: "not this one" });
});

test("deletes are not validated, and without a validate nothing changes", async () => {
  const calls: string[] = [];
  const vault = await startVault({ "gone.md": "body" }, { validate: ({ path }) => { calls.push(path); } });
  assert.equal((await fetch(`${vault.baseUrl}/gone`, { method: "DELETE" })).status, 204);
  assert.deepEqual(calls, [], "DELETE carries no record to validate");

  const plain = await startVault({ "note.md": "---\ntag: x\n---\nbody" });
  assert.equal((await noteWrite(plain.baseUrl, "PATCH", "/note", { fields: { tag: "y" } })).status, 200);
  const result = await (await fetch(`${plain.baseUrl}/note`)).json() as { fields: unknown; body?: string };
  assert.deepEqual(result.fields, { tag: "y" });
  assert.equal(result.body, "body");
});
