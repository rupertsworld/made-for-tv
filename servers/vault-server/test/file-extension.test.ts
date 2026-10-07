import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { RawData } from "ws";

import { nextEvent, noteWrite, openSocket, startVault } from "./helpers.ts";

type Listing = { path: string; entries: Array<Record<string, unknown>> };

test("record resolution extends exact files and directories without weakening raw file reads", async () => {
  const vault = await startVault({
    exact: "literal",
    "exact.md": "shadowed",
    "journal.md": "record",
    "journal/day.md": "day",
    "double.md.md": "double",
  });

  assert.equal(await (await fetch(`${vault.baseUrl}/exact`)).text(), "literal");
  assert.equal((await (await fetch(`${vault.baseUrl}/journal`)).json() as { path: string }).path, "journal");
  assert.equal((await (await fetch(`${vault.baseUrl}/journal/`)).json() as Listing).path, "journal");
  assert.equal((await (await fetch(`${vault.baseUrl}/double.md`)).json() as { path: string }).path, "double.md");
  const rawRange = await fetch(`${vault.baseUrl}/journal.md`, { headers: { range: "bytes=0-5" } });
  assert.equal(rawRange.status, 206);
  assert.equal(rawRange.headers.get("content-range"), "bytes 0-5/6");
  assert.equal(await rawRange.text(), "record");
  assert.equal((await fetch(`${vault.baseUrl}/exact/`)).status, 404);

  const head = await fetch(`${vault.baseUrl}/journal`, { method: "HEAD" });
  const get = await fetch(`${vault.baseUrl}/journal`);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(await get.text())));
  assert.equal(await head.text(), "");
});

test("directory listings preserve the base envelope, embed full records, and ignore query parameters", async () => {
  const vault = await startVault({
    literal: "shadow",
    "literal.md": "raw source",
    "bad.md": "---\ninvalid: [\n---\nbody",
    "journal.md": "---\nstatus: open\n---\nrecord body",
    "journal/day.md": "---\nkind: day\n---\nday body",
    "nested/asset.txt": "asset",
  });

  const basic = await (await fetch(`${vault.baseUrl}/`)).json() as Listing;
  assert.equal(basic.path, "");
  assert.deepEqual(basic.entries.map(({ name, type }) => [name, type]), [
    ["bad", "record"],
    ["journal", "dir"],
    ["journal", "record"],
    ["literal", "file"],
    ["literal.md", "file"],
    ["nested", "dir"],
  ]);
  assert.deepEqual(basic.entries[0]?.error, { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" });
  assert.deepEqual(basic.entries[0]?.fields, {});
  assert.equal(basic.entries[0]?.body, "---\ninvalid: [\n---\nbody");
  assert.equal("size" in (basic.entries.find(({ type }) => type === "record") ?? {}), false);
  const journal = basic.entries.find(({ name, type }) => name === "journal" && type === "record") ?? {};
  assert.deepEqual(journal.fields, { status: "open" });
  assert.equal(journal.body, "record body");
  assert.equal("links" in journal, false);

  const queried = await (await fetch(`${vault.baseUrl}/?fields=0&deep&bodies=false&ignored=yes`)).json() as Listing;
  assert.deepEqual(queried, basic);

  const nested = await (await fetch(`${vault.baseUrl}/journal/`)).json() as Listing;
  const day = nested.entries.find(({ name, type }) => name === "day" && type === "record") ?? {};
  assert.deepEqual(day.fields, { kind: "day" });
  assert.equal(day.body, "day body");
  assert.equal("links" in day, false);
});

test("record media type dispatch is parameter-tolerant while other writes retain base semantics", async () => {
  const vault = await startVault({ "double.md.md": "double", "raw.md": "hello world" });
  const created = await noteWrite(vault.baseUrl, "PUT", "/record", {
    fields: { status: "open" },
    body: "body",
    path: "ignored",
    links: ["ignored"],
    updated: "ignored",
    error: "ignored",
    extra: "ignored",
  }, "Application/Vnd.Telepath.Record+Json; Charset=UTF-8; ignored=value");
  assert.equal(created.status, 201);
  const record = await created.json() as Record<string, unknown>;
  assert.equal(record.path, "record");
  assert.deepEqual(record.fields, { status: "open" });
  assert.deepEqual(record.links, []);
  assert.notEqual(record.updated, "ignored");
  assert.equal("error" in record, false);
  assert.equal("extra" in record, false);
  assert.equal(
    await readFile(join(vault.root, "record.md"), "utf8"),
    "---\nstatus: open\n---\nbody",
    "ignored response-only keys never reach storage",
  );

  const literal = await fetch(`${vault.baseUrl}/literal`, { method: "PUT", body: "bytes" });
  assert.equal(literal.status, 201);
  assert.equal(await (await fetch(`${vault.baseUrl}/literal`)).text(), "bytes");
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/literal", { body: "record" })).status, 409);

  const edit = await fetch(`${vault.baseUrl}/raw.md`, {
    method: "PATCH",
    headers: { "content-type": "application/vnd.telepath.edit+json" },
    body: JSON.stringify({ old_string: "world", new_string: "vault" }),
  });
  assert.equal(edit.status, 204);
  assert.equal(await (await fetch(`${vault.baseUrl}/raw.md`)).text(), "hello vault");
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/double.md", { body: "cannot target" })).status, 201);
  assert.equal(await (await fetch(`${vault.baseUrl}/double.md`)).text(), JSON.stringify({ body: "cannot target" }));
});

test("markdown change events map to the addressable resource after the cache refresh", async () => {
  const vault = await startVault({ "note.md": "old" });
  const socket = await openSocket(vault.baseUrl, "/");
  const modified = nextEvent(socket);
  await writeFile(join(vault.root, "note.md"), "new");
  assert.deepEqual(await modified, { type: "modified", path: "note" });
  assert.equal((await (await fetch(`${vault.baseUrl}/note`)).json() as { body: string }).body, "new");

  const shadow = nextEvent(socket);
  await writeFile(join(vault.root, "note"), "literal");
  assert.deepEqual(await shadow, { type: "created", path: "note" });
  const shadowedMarkdown = nextEvent(socket);
  await writeFile(join(vault.root, "note.md"), "newer");
  assert.deepEqual(await shadowedMarkdown, { type: "modified", path: "note.md" });

  const renamed = new Promise<Array<{ type: string; path: string }>>((resolve, reject) => {
    const events: Array<{ type: string; path: string }> = [];
    const timer = setTimeout(() => reject(new Error("timed out waiting for rename events")), 3_000);
    const onMessage = (data: RawData): void => {
      events.push(JSON.parse(data.toString()) as { type: string; path: string });
      if (events.length === 2) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(events);
      }
    };
    socket.on("message", onMessage);
  });
  await rename(join(vault.root, "note.md"), join(vault.root, "renamed.md"));
  assert.deepEqual((await renamed).sort((left, right) => left.path.localeCompare(right.path)), [
    { type: "deleted", path: "note.md" },
    { type: "created", path: "renamed" },
  ]);
  assert.equal((await fetch(`${vault.baseUrl}/note`)).status, 200, "the exact literal remains addressable");
  socket.close();
});
