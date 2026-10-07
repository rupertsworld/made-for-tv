import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WebSocket } from "ws";

import {
  compareEvents,
  expectNoEvent,
  nextEvent,
  nextEvents,
  openSocket,
  refusedStatus,
  startFixture,
} from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineChangesConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: root-wide change stream", async (context) => {
    const running = await startFixture(context, factory, {
      "scope/existing.txt": "old",
      "tree/a.txt": "a",
      "tree/nested/b.txt": "b",
    });
    const rootSocket = await openSocket(running.baseUrl, "/");
    const socket = await openSocket(running.baseUrl, "/scope/");
    context.after(() => { rootSocket.close(); socket.close(); });
    const rootEvent = nextEvent(rootSocket);
    let event = nextEvent(socket);
    await writeFile(join(running.root, "outside.txt"), "created");
    assert.deepEqual(await rootEvent, { type: "created", path: "outside.txt" });
    assert.deepEqual(await event, { type: "created", path: "outside.txt" });
    event = nextEvent(socket);
    await writeFile(join(running.root, "scope", "existing.txt"), "modified");
    assert.deepEqual(await event, { type: "modified", path: "scope/existing.txt" });
    event = nextEvent(socket);
    assert.equal((await fetch(`${running.baseUrl}/scope/existing.txt`, {
      method: "PATCH",
      headers: { "content-type": "application/vnd.telepath.edit+json" },
      body: JSON.stringify({ old_string: "modified", new_string: "patched" }),
    })).status, 204);
    assert.deepEqual(await event, { type: "modified", path: "scope/existing.txt" });
    await expectNoEvent(socket);
    const renamed = nextEvents(socket, 2);
    await rename(join(running.root, "outside.txt"), join(running.root, "renamed.txt"));
    assert.deepEqual((await renamed).sort(compareEvents), [
      { type: "created", path: "renamed.txt" },
      { type: "deleted", path: "outside.txt" },
    ]);
    event = nextEvent(socket);
    assert.equal((await fetch(`${running.baseUrl}/renamed.txt`, { method: "DELETE" })).status, 204);
    assert.deepEqual(await event, { type: "deleted", path: "renamed.txt" });
    await expectNoEvent(socket);
    event = nextEvent(socket);
    assert.equal((await fetch(`${running.baseUrl}/tree`, { method: "DELETE" })).status, 204);
    assert.deepEqual(await event, { type: "deleted", path: "tree" });
    await expectNoEvent(socket);
  });

  test("file-server conformance: change streams hide unsafe paths and do not replay history", async (context) => {
    const outside = await mkdtemp(join(tmpdir(), "file-server-conformance-change-outside-"));
    context.after(() => rm(outside, { recursive: true, force: true }));
    const running = await startFixture(context, factory, { "dir/file.txt": "file" });
    await writeFile(join(running.root, "before.txt"), "before");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const socket = await openSocket(running.baseUrl, "/dir/");
    context.after(() => socket.close());
    await expectNoEvent(socket);

    await mkdir(join(running.root, ".hidden"));
    await writeFile(join(running.root, ".hidden", "file.txt"), "hidden");
    await writeFile(join(running.root, ".file-server-conformance.tmp"), "temporary");
    await symlink(outside, join(running.root, "visible-link"));
    const invalidPath = Buffer.concat([Buffer.from(`${running.root}/invalid-`), Buffer.from([0xff])]);
    await writeFile(invalidPath, "invalid");
    const special = createNetServer();
    await new Promise<void>((resolve, reject) => {
      special.once("error", reject);
      special.listen(join(running.root, "special.sock"), resolve);
    });
    context.after(() => new Promise<void>((resolve) => special.close(() => resolve())));
    await expectNoEvent(socket, 300);
    await rm(invalidPath);

    let event = nextEvent(socket);
    assert.equal((await fetch(`${running.baseUrl}/direct.txt`, { method: "PUT", body: "created" })).status, 201);
    assert.deepEqual(await event, { type: "created", path: "direct.txt" });
    await expectNoEvent(socket);
    event = nextEvent(socket);
    assert.equal((await fetch(`${running.baseUrl}/direct.txt`, { method: "DELETE" })).status, 204);
    assert.deepEqual(await event, { type: "deleted", path: "direct.txt" });
    await expectNoEvent(socket);
  });

  test("file-server conformance: WebSocket upgrades mirror HTTP path refusals and omit CORS", async (context) => {
    const outside = await mkdtemp(join(tmpdir(), "file-server-conformance-upgrade-outside-"));
    context.after(() => rm(outside, { recursive: true, force: true }));
    const running = await startFixture(context, factory, { "dir/file.txt": "file", ".hidden/file.txt": "hidden" });
    await symlink(outside, join(running.root, "escape"));
    const special = createNetServer();
    await new Promise<void>((resolve, reject) => {
      special.once("error", reject);
      special.listen(join(running.root, "special.sock"), resolve);
    });
    context.after(() => new Promise<void>((resolve) => special.close(() => resolve())));

    const accepted = new WebSocket(`${running.baseUrl.replace(/^http/, "ws")}/`, { origin: "https://example.test" });
    context.after(() => accepted.close());
    const headers = await new Promise<NodeJS.Dict<string | string[]>>((resolve, reject) => {
      accepted.once("upgrade", (response) => resolve(response.headers));
      accepted.once("error", reject);
    });
    assert.equal(headers["access-control-allow-origin"], undefined);
    for (const [path, status] of [
      ["/dir", 404],
      ["/missing/", 404],
      ["/dir/file.txt/", 404],
      ["/.hidden/", 404],
      ["/bad%2Fpath/", 400],
      ["/escape/", 403],
      ["/special.sock/", 404],
    ] as const) {
      assert.equal(await refusedStatus(running.baseUrl, path), status, path);
    }

    const movedRoot = `${running.root}-moved`;
    await rename(running.root, movedRoot);
    await symlink(outside, running.root);
    try {
      assert.equal(await refusedStatus(running.baseUrl, "/"), 404, "canonical path outside root");
    } finally {
      await rm(running.root, { force: true });
      await rename(movedRoot, running.root);
    }
  });

  test("file-server conformance: protocol pings terminate dead peers but retain live peers", async (context) => {
    const running = await startFixture(context, factory, {}, { pingIntervalMs: 20 });
    const dead = await openSocket(running.baseUrl, "/", { autoPong: false });
    const deadClosed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("dead peer was not terminated after a ping round")), 500);
      dead.once("close", () => { clearTimeout(timer); resolve(); });
    });
    const alive = await openSocket(running.baseUrl, "/");
    context.after(() => { dead.close(); alive.close(); });
    await deadClosed;
    assert.equal(alive.readyState, WebSocket.OPEN);
  });
}
