import assert from "node:assert/strict";
import { createServer } from "node:http";
import { rm, symlink } from "node:fs/promises";
import { test } from "node:test";
import express from "express";

import { FileServer } from "../src/server.ts";
import { makeRoot } from "./helpers.ts";

test("ready resolves a symlinked root", async (context) => {
  const root = await makeRoot({ "hello.txt": "hello" });
  const link = `${root}-link`;
  await symlink(root, link);
  context.after(() => rm(link, { force: true }));
  const fileServer = new FileServer({ root: link });
  context.after(() => fileServer.close());

  await fileServer.ready;
  await fileServer.listen({ port: 0 });
  assert.equal(await (await fetch(`${fileServer.url}/hello.txt`)).text(), "hello");
});

test("mounted app requests wait for readiness before dispatch", async (context) => {
  const files = Object.fromEntries([
    ["hello.txt", "hello"],
    ...Array.from({ length: 256 }, (_, index) => [`initial/${index}.txt`, String(index)]),
  ]);
  const root = await makeRoot(files);
  let readySettled = false;
  let readyAtArrival: boolean | undefined;
  let readyAtDispatch: boolean | undefined;
  let mountedApp: express.Express | undefined;
  const hostApp = express();
  hostApp.use((request, response, next) => {
    readyAtArrival = readySettled;
    if (mountedApp === undefined) { next(new Error("file app is not mounted")); return; }
    mountedApp(request, response, next);
  });
  const hostServer = createServer(hostApp);
  await new Promise<void>((resolve) => hostServer.listen(0, "127.0.0.1", resolve));
  const fileServer = new FileServer({
    root,
    extension: {
      handle() {
        readyAtDispatch = readySettled;
        return false;
      },
    },
  });
  void fileServer.ready.then(() => { readySettled = true; });
  mountedApp = fileServer.app;
  context.after(async () => {
    await fileServer.close();
    if (hostServer.listening) await new Promise<void>((resolve) => hostServer.close(() => resolve()));
  });
  const address = hostServer.address();
  assert(address && typeof address === "object");

  assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/hello.txt`)).text(), "hello");
  assert.equal(readyAtArrival, false);
  assert.equal(readyAtDispatch, true);
});

test("ready rejects missing roots and roots that are not directories", async () => {
  const root = await makeRoot({ "file.txt": "file" });
  await assert.rejects(new FileServer({ root: `${root}/missing` }).ready);
  await assert.rejects(new FileServer({ root: `${root}/file.txt` }).ready, /directory/i);
});

test("an invalid ready promise stays observable when app is mounted before a request", async (context) => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root: `${root}/missing` });
  const hostApp = express();
  hostApp.use(fileServer.app);
  const hostServer = createServer(hostApp);
  context.after(async () => {
    await fileServer.close();
    if (hostServer.listening) await new Promise<void>((resolve) => hostServer.close(() => resolve()));
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => hostServer.listen(0, "127.0.0.1", resolve));
  const address = hostServer.address();
  assert(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/file.txt`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not found" });
});

test("listen resolves with the instance and exposes app, server, url, and port", async (context) => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root });
  context.after(() => fileServer.close());

  assert.equal(typeof fileServer.app, "function");
  assert.equal(typeof fileServer.server.listen, "function");
  assert.equal(fileServer.url, undefined);
  assert.equal(fileServer.port, undefined);

  assert.equal(await fileServer.listen({ host: "0.0.0.0", port: 0 }), fileServer);
  assert.equal(typeof fileServer.port, "number");
  assert.notEqual(fileServer.port, 0);
  assert.equal(fileServer.url, `http://0.0.0.0:${fileServer.port}`);
  await assert.rejects(fileServer.listen({ port: 0 }), /new instance/i);

  await fileServer.close();
  assert.equal(fileServer.url, undefined);
  assert.equal(fileServer.port, undefined);
  await fileServer.close();
});

test("listen does not bind until watcher readiness has resolved", async (context) => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root });
  context.after(() => fileServer.close());
  let readyResolved = false;
  void fileServer.ready.then(() => { readyResolved = true; });
  const readyAtBind = new Promise<boolean>((resolve) => {
    fileServer.server.once("listening", () => resolve(readyResolved));
  });

  await fileServer.listen({ port: 0 });
  assert.equal(await readyAtBind, true);
});

test("close before listening awaits watcher teardown and leaves the instance closed", async () => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root });
  await fileServer.ready;
  const watcher = (fileServer as unknown as {
    watcher: { close(): Promise<void>; getWatched(): Record<string, string[]> };
  }).watcher;
  const closeWatcher = watcher.close.bind(watcher);
  let watcherCloseStarted = false;
  let finishWatcherClose: (() => void) | undefined;
  const watcherMayClose = new Promise<void>((resolve) => { finishWatcherClose = resolve; });
  watcher.close = async () => {
    watcherCloseStarted = true;
    await watcherMayClose;
    await closeWatcher();
  };

  const closing = fileServer.close();
  let closeSettled = false;
  void closing.then(() => { closeSettled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    assert.equal(watcherCloseStarted, true);
    assert.equal(closeSettled, false);
  } finally {
    finishWatcherClose?.();
  }
  await closing;
  assert.deepEqual(watcher.getWatched(), {});
  await fileServer.close();
  await assert.rejects(fileServer.listen({ port: 0 }), /new instance/i);
});

test("a watcher initialization rejection still permits complete teardown", async () => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root });
  type TestWatcher = {
    close(): Promise<void>;
    emit(event: "error", error: Error): boolean;
    getWatched(): Record<string, string[]>;
  };
  let watcher: TestWatcher | undefined;
  const allocationDeadline = Date.now() + 5_000;
  while (watcher === undefined && Date.now() < allocationDeadline) {
    watcher = (fileServer as unknown as { watcher?: TestWatcher }).watcher;
    if (watcher === undefined) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (watcher === undefined) assert.fail("watcher was not allocated within 5 seconds");

  watcher.emit("error", new Error("synthetic initialization failure"));
  await assert.rejects(fileServer.ready, /synthetic initialization failure/);
  await fileServer.close();
  assert.deepEqual(watcher.getWatched(), {});
  await fileServer.close();
});

test("listen rejects an occupied explicit port", async (context) => {
  const root = await makeRoot();
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => occupied.close(() => resolve())));
  const address = occupied.address();
  assert(address && typeof address === "object");
  const fileServer = new FileServer({ root });
  context.after(() => fileServer.close());
  await assert.rejects(fileServer.listen({ port: address.port }), (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
});

test("close awaits shared watcher teardown while a listen attempt fails", async (context) => {
  const root = await makeRoot();
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve) => occupied.close(() => resolve())));
  const address = occupied.address();
  assert(address && typeof address === "object");
  const fileServer = new FileServer({ root });
  await fileServer.ready;
  const watcher = (fileServer as unknown as { watcher: { close(): Promise<void> } }).watcher;
  const closeWatcher = watcher.close.bind(watcher);
  let beginWatcherClose: (() => void) | undefined;
  const watcherCloseStarted = new Promise<void>((resolve) => { beginWatcherClose = resolve; });
  let finishWatcherClose: (() => void) | undefined;
  const watcherMayClose = new Promise<void>((resolve) => { finishWatcherClose = resolve; });
  watcher.close = async () => {
    beginWatcherClose?.();
    await watcherMayClose;
    await closeWatcher();
  };

  const listening = fileServer.listen({ port: address.port });
  await watcherCloseStarted;
  const closing = fileServer.close();
  let closeSettled = false;
  void closing.then(() => { closeSettled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    assert.equal(closeSettled, false);
  } finally {
    finishWatcherClose?.();
  }
  await assert.rejects(listening, (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
  await closing;
});

test("IPv6 literals are bracketed in url", async (context) => {
  const root = await makeRoot();
  const fileServer = new FileServer({ root });
  context.after(() => fileServer.close());
  try {
    await fileServer.listen({ host: "::1", port: 0 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRNOTAVAIL") return;
    throw error;
  }
  assert.equal(fileServer.url, `http://[::1]:${fileServer.port}`);
});
