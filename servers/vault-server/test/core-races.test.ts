import assert from "node:assert/strict";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { WebSocket } from "ws";

import { nextEvent, noteWrite, openSocket, startVault } from "./helpers.ts";

type ChangeEvent = { type: string; path: string };
type LinkEntry = { path: string; field?: string; backlink?: true };
type RecordView = { path: string; fields: Record<string, unknown>; body?: string; links: LinkEntry[] };
type Listing = { path: string; entries: Array<{ name: string; type: string; fields?: Record<string, unknown>; body?: string }> };

test("a directory rename, delete, and recreate storm converges every record view", async () => {
  const count = 30;
  const initial = Object.fromEntries([
    ["old-target.md", "old target"],
    ["persistent.md", "---\nref: '[[records/old-0]]'\n---"],
    ["target.md", "target"],
    ...Array.from({ length: count }, (_, index) => [
      `records/old-${index}.md`,
      `---\nversion: old\n---\nold ${index} [[old-target]]`,
    ]),
  ]);
  const vault = await startVault(initial);

  const oldTargetBefore = await (await fetch(`${vault.baseUrl}/old-target`)).json() as RecordView;
  assert.equal(oldTargetBefore.links.filter(({ backlink }) => backlink).length, count);
  const persistentBefore = await (await fetch(`${vault.baseUrl}/persistent`)).json() as RecordView;
  assert.deepEqual(persistentBefore.links, [{ path: "records/old-0", field: "ref" }]);

  await rename(join(vault.root, "records"), join(vault.root, "discarded"));
  await rm(join(vault.root, "discarded"), { recursive: true });
  await mkdir(join(vault.root, "records"));
  await Promise.all(Array.from({ length: count }, (_, index) => writeFile(
    join(vault.root, `records/item-${index}.md`),
    `---\nversion: ${index}\n---\nitem ${index} [[target]]`,
  )));

  await eventually(async () => {
    const expectedPaths = ["old-target.md", "persistent.md", "target.md", ...Array.from({ length: count }, (_, index) => `records/item-${index}.md`)].sort();
    assert.deepEqual([...vault.server.paths].sort(), expectedPaths);
    assert.equal((await fetch(`${vault.baseUrl}/records/old-0`)).status, 404);

    const records = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const response = await fetch(`${vault.baseUrl}/records/item-${index}`);
      assert.equal(response.status, 200);
      return response.json() as Promise<RecordView>;
    }));
    for (let index = 0; index < count; index += 1) {
      assert.equal(records[index]?.path, `records/item-${index}`);
      assert.deepEqual(records[index]?.fields, { version: index });
      assert.equal(records[index]?.body, `item ${index} [target](../target)`);
    }

    const listing = await (await fetch(`${vault.baseUrl}/records/`)).json() as Listing;
    assert.equal(listing.entries.length, count);
    for (let index = 0; index < count; index += 1) {
      const entry = listing.entries.find(({ name }) => name === `item-${index}`);
      assert.deepEqual(entry, {
        name: `item-${index}`,
        type: "record",
        modified: (entry as { modified?: string } | undefined)?.modified,
        fields: { version: index },
        body: `item ${index} [target](../target)`,
      });
    }

    const target = await (await fetch(`${vault.baseUrl}/target`)).json() as RecordView;
    const expectedBacklinks = Array.from({ length: count }, (_, index): LinkEntry => ({
      path: `records/item-${index}`,
      backlink: true,
    })).sort(compareLinks);
    assert.deepEqual(target.links, expectedBacklinks);
    assert.deepEqual((await (await fetch(`${vault.baseUrl}/old-target`)).json() as RecordView).links, []);
    assert.deepEqual((await (await fetch(`${vault.baseUrl}/persistent`)).json() as RecordView).links, []);
  });
});

test("concurrent exact-file creation and markdown modification maps every source event literally", async (context) => {
  const count = 30;
  const vault = await startVault(Object.fromEntries(Array.from(
    { length: count },
    (_, index) => [`pair-${index}.md`, "before"],
  )));
  const socket = await openSocket(vault.baseUrl, "/");
  context.after(() => socket.close());
  const events = collectEvents(socket, count * 2);

  await Promise.all(Array.from({ length: count }, async (_, index) => {
    await Promise.all([
      writeFile(join(vault.root, `pair-${index}`), "literal"),
      writeFile(join(vault.root, `pair-${index}.md`), "after"),
    ]);
  }));

  const received = await events;
  assert.deepEqual(received.filter(({ type }) => type === "created").map(({ path }) => path).sort(),
    Array.from({ length: count }, (_, index) => `pair-${index}`).sort());
  assert.deepEqual(received.filter(({ type }) => type === "modified").map(({ path }) => path).sort(),
    Array.from({ length: count }, (_, index) => `pair-${index}.md`).sort());
});

test("references to a shadowed markdown source stay directly fetchable and create no record link", async () => {
  const vault = await startVault({
    foo: "literal shadow",
    "foo.md": "shadowed record source",
    "source.md": "---\nfield: '[[foo.md]]'\n---\n[[foo.md]]",
  });

  const source = await (await fetch(`${vault.baseUrl}/source`)).json() as RecordView;
  assert.deepEqual(source.fields, { field: { $type: "ref", path: "foo.md" } });
  assert.equal(source.body, "[foo.md](foo.md)");
  assert.deepEqual(source.links, []);
  assert.equal(await (await fetch(`${vault.baseUrl}/foo.md`)).text(), "shadowed record source");
  assert.equal(await (await fetch(`${vault.baseUrl}/foo`)).text(), "literal shadow");
});

test("mutation-created .md parent directories keep their literal path when deleted", async (context) => {
  const vault = await startVault();
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/folder.md/child", { body: "child" })).status, 201);
  const socket = await openSocket(vault.baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);

  assert.equal((await fetch(`${vault.baseUrl}/folder.md/`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await event, { type: "deleted", path: "folder.md" });

  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/external.md/child", { body: "child" })).status, 201);
  const externalEvent = nextMatchingEvent(socket, ({ type, path }) => type === "deleted" && path === "external.md");
  await rm(join(vault.root, "external.md"), { recursive: true });
  assert.deepEqual(await externalEvent, { type: "deleted", path: "external.md" });
});

async function eventually(assertion: () => Promise<void>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let failure: unknown;
  while (Date.now() < deadline) {
    try { await assertion(); return; }
    catch (error) { failure = error; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw failure;
}

function collectEvents(socket: WebSocket, count: number): Promise<ChangeEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ChangeEvent[] = [];
    const timer = setTimeout(() => reject(new Error(`timed out after ${events.length}/${count} events`)), 5_000);
    socket.on("message", function onMessage(data) {
      events.push(JSON.parse(data.toString()) as ChangeEvent);
      if (events.length !== count) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(events);
    });
  });
}

function nextMatchingEvent(socket: WebSocket, matches: (event: ChangeEvent) => boolean): Promise<ChangeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("timed out waiting for matching event"));
    }, 5_000);
    function onMessage(data: WebSocket.RawData): void {
      const event = JSON.parse(data.toString()) as ChangeEvent;
      if (!matches(event)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(event);
    }
    socket.on("message", onMessage);
  });
}

function compareLinks(left: LinkEntry, right: LinkEntry): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}
