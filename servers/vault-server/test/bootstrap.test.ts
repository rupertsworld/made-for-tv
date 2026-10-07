import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import { VaultIndex } from "../src/notes.ts";
import { VaultServer } from "../src/server.ts";

test("bootstrap hands create, modify, rename, delete, and a slow write to the live change hook", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-bootstrap-handoff-"));
  await mkdir(join(root, "deleted-directory"));
  await Promise.all([
    writeFile(join(root, "000-gate.md"), "gate"),
    writeFile(join(root, "asset-delete.txt"), "delete"),
    writeFile(join(root, "asset-rename-before.txt"), "rename"),
    writeFile(join(root, "deleted-directory/child.txt"), "delete tree"),
    writeFile(join(root, "modify.md"), "before"),
    writeFile(join(root, "rename-before.md"), "rename"),
    writeFile(join(root, "delete.md"), "delete"),
    writeFile(join(root, "slow.md"), "old"),
    writeFile(join(root, "zzz-tail.md"), "tail"),
  ]);

  const originalRefresh = VaultIndex.prototype.refresh;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  let gateEnteredResolve!: () => void;
  const gateEntered = new Promise<void>((resolve) => { gateEnteredResolve = resolve; });
  let slowCachedResolve!: () => void;
  const slowCached = new Promise<void>((resolve) => { slowCachedResolve = resolve; });
  let releaseTail!: () => void;
  const tail = new Promise<void>((resolve) => { releaseTail = resolve; });
  let tailEnteredResolve!: () => void;
  const tailEntered = new Promise<void>((resolve) => { tailEnteredResolve = resolve; });
  let heldGate = false;
  let sawSlow = false;
  let heldTail = false;
  VaultIndex.prototype.refresh = async function (path): ReturnType<VaultIndex["refresh"]> {
    const name = basename(path);
    if (name === "000-gate.md" && !heldGate) {
      heldGate = true;
      gateEnteredResolve();
      await gate;
    }
    const result = await originalRefresh.call(this, path);
    if (name === "slow.md" && !sawSlow) {
      sawSlow = true;
      slowCachedResolve();
    }
    if (name === "zzz-tail.md" && !heldTail) {
      heldTail = true;
      tailEnteredResolve();
      await tail;
    }
    return result;
  };
  context.after(() => { VaultIndex.prototype.refresh = originalRefresh; });

  const server = new VaultServer({ root });
  context.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  await gateEntered;

  await Promise.all([
    writeFile(join(root, "created.md"), "created"),
    writeFile(join(root, "asset-created.txt"), "created"),
    writeFile(join(root, "modify.md"), "after"),
    rm(join(root, "asset-delete.txt")),
    rm(join(root, "deleted-directory"), { recursive: true }),
    rename(join(root, "asset-rename-before.txt"), join(root, "asset-rename-after.txt")),
    rename(join(root, "rename-before.md"), join(root, "rename-after.md")),
    unlink(join(root, "delete.md")),
  ]);
  const slow = await open(join(root, "slow.md"), "w");
  await slow.write("incomplete");
  releaseGate();
  await slowCached;
  await slow.write(" but complete");
  await slow.close();
  await tailEntered;
  releaseTail();
  await server.ready;
  const indexed = (): string | undefined => {
    try { return (server as unknown as { index: VaultIndex }).index.read(join(root, "slow.md")).body; }
    catch { return undefined; }
  };
  assert.equal(indexed(), "incomplete but complete");
  assert.equal(await readFile(join(root, "slow.md"), "utf8"), indexed());
  assert.deepEqual([...server.paths].sort(), [
    "000-gate.md",
    "asset-created.txt",
    "asset-rename-after.txt",
    "created.md",
    "modify.md",
    "rename-after.md",
    "slow.md",
    "zzz-tail.md",
  ]);

  await server.listen({ port: 0 });
  assert.equal((await (await fetch(`${server.url}/modify`)).json() as { body: string }).body, "after");
  assert.equal((await fetch(`${server.url}/rename-before`)).status, 404);
  assert.equal((await (await fetch(`${server.url}/rename-after`)).json() as { body: string }).body, "rename");
  assert.equal((await fetch(`${server.url}/delete`)).status, 404);
  assert.equal((await (await fetch(`${server.url}/created`)).json() as { body: string }).body, "created");
});

test("a mounted app holds OPTIONS and unsupported methods behind vault readiness", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-bootstrap-mounted-app-"));
  await writeFile(join(root, "gate.md"), "gate");
  const originalRefresh = VaultIndex.prototype.refresh;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  let gateEnteredResolve!: () => void;
  const gateEntered = new Promise<void>((resolve) => { gateEnteredResolve = resolve; });
  let held = false;
  VaultIndex.prototype.refresh = async function (path): ReturnType<VaultIndex["refresh"]> {
    if (!held && basename(path) === "gate.md") {
      held = true;
      gateEnteredResolve();
      await gate;
    }
    return originalRefresh.call(this, path);
  };

  const server = new VaultServer({ root });
  const host = createServer(server.app);
  context.after(async () => {
    releaseGate();
    VaultIndex.prototype.refresh = originalRefresh;
    await server.close();
    if (host.listening) await new Promise<void>((resolve, reject) => host.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  await gateEntered;
  await new Promise<void>((resolve, reject) => {
    host.once("error", reject);
    host.listen(0, "127.0.0.1", resolve);
  });
  const address = host.address();
  assert(address !== null && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let settled = false;
  const requests = Promise.all([
    fetch(baseUrl, { method: "OPTIONS" }),
    fetch(baseUrl, { method: "POST" }),
  ]).then((responses) => { settled = true; return responses; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);

  releaseGate();
  const [options, unsupported] = await requests;
  assert.equal(options.status, 204);
  assert.equal(unsupported.status, 405);
});

test("ready does not allow the listener to bind before the record index is complete", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-bootstrap-ready-"));
  await mkdir(join(root, "records"));
  await writeFile(join(root, "records/item.md"), "item");

  const originalRefresh = VaultIndex.prototype.refresh;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let refreshEnteredResolve!: () => void;
  const refreshEntered = new Promise<void>((resolve) => { refreshEnteredResolve = resolve; });
  VaultIndex.prototype.refresh = async function (path): ReturnType<VaultIndex["refresh"]> {
    refreshEnteredResolve();
    await refreshGate;
    return originalRefresh.call(this, path);
  };
  context.after(() => { releaseRefresh(); VaultIndex.prototype.refresh = originalRefresh; });

  const server = new VaultServer({ root });
  context.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  let readySettled = false;
  void server.ready.then(() => { readySettled = true; }, () => { readySettled = true; });
  const listening = server.listen({ port: 0 });
  await refreshEntered;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readySettled, false);
  assert.equal(server.server.listening, false);

  releaseRefresh();
  await listening;
  assert.equal(readySettled, true);
  assert.equal(server.server.listening, true);
  assert.deepEqual([...server.paths], ["records/item.md"]);
});

test("close after a vault bootstrap failure tears down the embedded watcher", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-bootstrap-failure-close-"));
  await writeFile(join(root, "broken.md"), "broken");
  const originalRefresh = VaultIndex.prototype.refresh;
  VaultIndex.prototype.refresh = async function (): ReturnType<VaultIndex["refresh"]> {
    throw new Error("forced vault bootstrap failure");
  };
  let server: VaultServer | undefined;
  context.after(async () => {
    VaultIndex.prototype.refresh = originalRefresh;
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });

  server = new VaultServer({ root });
  await assert.rejects(server.ready, /forced vault bootstrap failure/);
  const watcher = (server as unknown as {
    files: { watcher: { close(): Promise<void>; getWatched(): Record<string, string[]> } };
  }).files.watcher;
  assert.notDeepEqual(watcher.getWatched(), {}, "the embedded watcher was live during vault bootstrap");
  const closeWatcher = watcher.close.bind(watcher);
  let closeCalls = 0;
  watcher.close = async () => {
    closeCalls += 1;
    await closeWatcher();
  };

  await server.close();
  assert.equal(closeCalls, 1);
  assert.deepEqual(watcher.getWatched(), {});
  assert.equal(server.server.listening, false);
});
