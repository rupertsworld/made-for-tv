import assert from "node:assert/strict";
import { chmod, readFile, readdir, stat, symlink, utimes } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  beginUpload,
  expectNoEvent,
  nextEvent,
  openSocket,
  rawRequest,
  startFixture,
  waitForNoTemporaryFiles,
  waitForTemporaryName,
} from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineWritingConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: whole-file writes and recursive deletion", async (context) => {
    const running = await startFixture(context, factory, {
      "existing.txt": "old",
      "dir/child.txt": "child",
      "parent.txt": "parent",
      "second/child.txt": "second",
      "target.txt": "outside tree",
      "delete-tree/child.txt": "inside tree",
    });
    assert.equal((await fetch(`${running.baseUrl}/nested/new.bin`, { method: "PUT", body: new Uint8Array([0, 1, 2]) })).status, 201);
    assert.deepEqual(await readFile(join(running.root, "nested", "new.bin")), Buffer.from([0, 1, 2]));
    await chmod(join(running.root, "existing.txt"), 0o640);
    const oldTime = new Date("2020-01-02T03:04:05Z");
    await utimes(join(running.root, "existing.txt"), oldTime, oldTime);
    const oldEtag = (await fetch(`${running.baseUrl}/existing.txt`)).headers.get("etag");
    assert.equal((await fetch(`${running.baseUrl}/existing.txt`, { method: "PUT", body: "new" })).status, 204);
    assert.equal(await readFile(join(running.root, "existing.txt"), "utf8"), "new");
    const replacedStats = await stat(join(running.root, "existing.txt"));
    if (process.platform !== "win32") assert.equal(replacedStats.mode & 0o777, 0o640);
    assert.notEqual(replacedStats.mtimeMs, oldTime.getTime());
    assert.notEqual((await fetch(`${running.baseUrl}/existing.txt`)).headers.get("etag"), oldEtag);
    assert.equal((await fetch(`${running.baseUrl}/nested`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(`${running.baseUrl}/nested/new.bin`)).status, 404);
    assert.equal((await fetch(`${running.baseUrl}/second/`, { method: "DELETE" })).status, 204);
    await symlink("../target.txt", join(running.root, "delete-tree", "link.txt"));
    assert.equal((await fetch(`${running.baseUrl}/delete-tree`, { method: "DELETE" })).status, 204);
    assert.equal(await readFile(join(running.root, "target.txt"), "utf8"), "outside tree");
    assert.equal((await fetch(`${running.baseUrl}/`, { method: "DELETE" })).status, 409);
    const empty = await rawRequest(running.baseUrl, "PUT", "/empty.bin");
    assert.equal(empty.status, 201);
    assert.equal((await stat(join(running.root, "empty.bin"))).size, 0);
    for (const path of ["/", "/new/", "/dir", "/dir/", "/existing.txt/"]) {
      assert.equal((await fetch(`${running.baseUrl}${path}`, { method: "PUT", body: "body" })).status, 409, path);
    }
    assert.equal((await fetch(`${running.baseUrl}/parent.txt/child.txt`, { method: "PUT", body: "body" })).status, 404);
    assert.equal((await fetch(`${running.baseUrl}/missing`, { method: "DELETE" })).status, 404);

    const previousUmask = process.umask(0o027);
    try {
      assert.equal((await fetch(`${running.baseUrl}/umask.txt`, { method: "PUT", body: "new" })).status, 201);
    } finally {
      process.umask(previousUmask);
    }
    if (process.platform !== "win32") assert.equal((await stat(join(running.root, "umask.txt"))).mode & 0o777, 0o640);
  });

  test("file-server conformance: streamed writes keep temporary paths silent and publish only the atomic target", async (context) => {
    const oldBody = Buffer.alloc(128 * 1024, 0x6f);
    const newBody = Buffer.alloc(256 * 1024, 0x6e);
    const running = await startFixture(context, factory, { "atomic": "literal shadow", "atomic.md": oldBody });
    const socket = await openSocket(running.baseUrl, "/");
    context.after(() => socket.close());
    const upload = beginUpload(running.baseUrl, "/atomic.md", newBody.length);
    upload.request.write(newBody.subarray(0, 32 * 1024));
    const temporaryName = await waitForTemporaryName(running.root, ["atomic", "atomic.md"]);
    const listing = await (await fetch(`${running.baseUrl}/`)).json() as { entries: Array<{ name: string }> };
    assert.deepEqual(listing.entries.map(({ name }) => name), ["atomic", "atomic.md"]);
    assert.equal((await fetch(`${running.baseUrl}/${encodeURIComponent(temporaryName)}`)).status, 404);
    assert.deepEqual(Buffer.from(await (await fetch(`${running.baseUrl}/atomic.md`)).arrayBuffer()), oldBody);
    await expectNoEvent(socket);
    const event = nextEvent(socket);
    upload.request.end(newBody.subarray(32 * 1024));
    assert.equal((await upload.response).status, 204);
    assert.deepEqual(await event, { type: "modified", path: "atomic.md" });
    await expectNoEvent(socket);
    assert.deepEqual(await readFile(join(running.root, "atomic.md")), newBody);
    assert.deepEqual(await readdir(running.root), ["atomic", "atomic.md"]);

    const interrupted = beginUpload(running.baseUrl, "/atomic.md", 512 * 1024);
    interrupted.request.write(Buffer.alloc(32 * 1024, 0x78));
    await waitForTemporaryName(running.root, ["atomic", "atomic.md"]);
    interrupted.request.destroy();
    await interrupted.response;
    await waitForNoTemporaryFiles(running.root, ["atomic", "atomic.md"]);
    assert.deepEqual(await readFile(join(running.root, "atomic.md")), newBody);
  });
}
