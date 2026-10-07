import assert from "node:assert/strict";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { nextEvent, openSocket, startVault } from "./helpers.ts";

test("a real watcher record change performs one read and one stat before publication", async (context) => {
  const vault = await startVault({ "note.md": "before" });
  const socket = await openSocket(vault.baseUrl, "/");
  context.after(() => socket.close());

  const implementation = vault.server as unknown as {
    index: {
      fileSystem: {
        readFile(path: string): Promise<Uint8Array>;
        stat(path: string): Promise<{ mtime: Date }>;
      };
    };
  };
  const fileSystem = implementation.index.fileSystem;
  const originalReadFile = fileSystem.readFile;
  const originalStat = fileSystem.stat;
  context.after(() => {
    fileSystem.readFile = originalReadFile;
    fileSystem.stat = originalStat;
  });
  const calls = { readFile: 0, stat: 0 };
  fileSystem.readFile = async (path) => {
    calls.readFile += 1;
    return readFile(path);
  };
  fileSystem.stat = async (path) => {
    calls.stat += 1;
    return stat(path);
  };

  const event = nextEvent(socket);
  await writeFile(join(vault.root, "note.md"), "after");
  assert.deepEqual(await event, { type: "modified", path: "note" });
  assert.deepEqual(calls, { readFile: 1, stat: 1 });
  assert.equal((await (await fetch(`${vault.baseUrl}/note`)).json() as { body: string }).body, "after");
});

test("a parent file event purges the replaced directory subtree from every cached view", async () => {
  const vault = await startVault({
    "global.md": "global",
    "outside.md": "[[tree/source]]",
    "tree/source.md": "[[global]]",
  });
  const implementation = vault.server as unknown as {
    files: { watcher: { close(): Promise<void> } };
    index: {
      read(path: string): unknown;
    };
    change(event: { type: "created" | "modified" | "deleted"; path: string }): Promise<unknown>;
  };
  await implementation.files.watcher.close();

  assert.deepEqual(
    (await (await fetch(`${vault.baseUrl}/global`)).json() as { links: unknown[] }).links,
    [{ path: "tree/source", backlink: true }],
  );
  assert.deepEqual(
    (await (await fetch(`${vault.baseUrl}/outside`)).json() as { links: unknown[] }).links,
    [{ path: "tree/source" }],
  );

  await rm(join(vault.root, "tree"), { recursive: true });
  await writeFile(join(vault.root, "tree"), "literal replacement");
  await implementation.change({ type: "created", path: "tree" });

  assert.deepEqual([...vault.server.paths].sort(), ["global.md", "outside.md", "tree"]);
  assert.throws(
    () => implementation.index.read(join(vault.root, "tree", "source.md")),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
  assert.equal((await fetch(`${vault.baseUrl}/tree/source`)).status, 404);
  const listing = await (await fetch(`${vault.baseUrl}/`)).json() as {
    entries: Array<{ name: string; type: string }>;
  };
  assert.deepEqual(listing.entries.map(({ name, type }) => ({ name, type })), [
    { name: "global", type: "record" },
    { name: "outside", type: "record" },
    { name: "tree", type: "file" },
  ]);
  assert.deepEqual(
    (await (await fetch(`${vault.baseUrl}/global`)).json() as { links: unknown[] }).links,
    [],
  );
  assert.deepEqual(
    (await (await fetch(`${vault.baseUrl}/outside`)).json() as { links: unknown[] }).links,
    [],
  );
});
