import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readNote, VaultIndex } from "../src/notes.ts";
import { startVault } from "./helpers.ts";

test("a slower refresh cannot overwrite a newer cached record", async (context) => {
  for (const delayed of ["read", "stat"] as const) {
    await context.test(delayed, async () => {
      const root = await mkdtemp(join(tmpdir(), "vault-server-refresh-generation-"));
      const path = join(root, "note.md");
      const original = "---\ntag: original\n---\nbody";
      await writeFile(path, original);
      let reads = 0;
      let stats = 0;
      let releaseRead: ((bytes: Uint8Array) => void) | undefined;
      let releaseStat: ((value: { mtime: Date }) => void) | undefined;
      let start: (() => void) | undefined;
      const started = new Promise<void>((resolve) => { start = resolve; });
      const index = new VaultIndex(root, {
        readFile: async (wanted) => {
          reads += 1;
          if (delayed === "read" && reads === 1) {
            start?.();
            return new Promise<Uint8Array>((resolve) => { releaseRead = resolve; });
          }
          return readFile(wanted);
        },
        stat: async (wanted) => {
          stats += 1;
          if (delayed === "stat" && stats === 1) {
            start?.();
            return new Promise((resolve) => { releaseStat = resolve; });
          }
          return stat(wanted);
        },
      });
      try {
        const older = index.refresh(path);
        await started;
        await writeFile(path, "---\ntag: updated\n---\nbody");
        await index.refresh(path);
        releaseRead?.(Buffer.from(original));
        releaseStat?.({ mtime: new Date(0) });
        assert.equal(await older, "superseded");
        assert.deepEqual(index.listingEntry("note.md"), {
          path: "note",
          fields: { tag: "updated" },
          body: "body",
          updated: (await stat(path)).mtime.toISOString(),
        });
      } finally {
        releaseRead?.(Buffer.from(original));
        releaseStat?.({ mtime: new Date(0) });
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("deletion prevents an in-flight refresh from resurrecting a record", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-refresh-delete-"));
  const path = join(root, "note.md");
  await writeFile(path, "stale");
  let release: ((bytes: Uint8Array) => void) | undefined;
  let start: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const index = new VaultIndex(root, {
    readFile: async () => {
      start?.();
      return new Promise<Uint8Array>((resolve) => { release = resolve; });
    },
    stat,
  });
  try {
    const refresh = index.refresh(path);
    await started;
    index.delete(path);
    release?.(Buffer.from("stale"));
    assert.equal(await refresh, "superseded");
    assert.equal(index.listingEntry("note.md"), undefined);
  } finally {
    release?.(Buffer.from(""));
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing refresh removes the path and a failed refresh retains cached data", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-refresh-outcomes-"));
  const missing = join(root, "missing.md");
  const present = join(root, "present.md");
  await writeFile(present, "present");
  let failing = false;
  const index = new VaultIndex(root, {
    readFile: async (path) => {
      if (failing) throw Object.assign(new Error("transient"), { code: "EIO" });
      return readFile(path);
    },
    stat,
  });
  try {
    index.add(missing);
    assert.equal(await index.refresh(missing), "removed");
    await assert.rejects(readNote(root, missing, index), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
    await index.refresh(present);
    failing = true;
    await assert.rejects(index.refresh(present), /transient/);
    assert.equal((await readNote(root, present, index)).body, "present");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structured record values in reads and directory responses use cached data without record filesystem I/O", async () => {
  const vault = await startVault({ "note.md": "---\ntag: cached\n---\nbody" });
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
    const record = await (await fetch(`${vault.baseUrl}/note`)).json() as { body?: string };
    const listing = await (await fetch(`${vault.baseUrl}/`)).json() as {
      entries: Array<{ name: string; type: string; body?: string }>;
    };
    assert.equal(record.body, "body");
    assert.deepEqual(listing.entries, [{
      name: "note",
      type: "record",
      modified: (listing.entries[0] as { modified?: string } | undefined)?.modified,
      fields: { tag: "cached" },
      body: "body",
    }]);
    assert.deepEqual(calls, { readFile: 0, stat: 0 });
  } finally {
    indexFileSystem.readFile = originalReadFile;
    indexFileSystem.stat = originalStat;
  }
});
