import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { editRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineEditingConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: anchored text editing", async (context) => {
    const running = await startFixture(context, factory, { "note.txt": "before before", "note.md": "before before" });
    for (const name of ["note.txt", "note.md"] as const) {
      const edit = (document: unknown) => fetch(`${running.baseUrl}/${name}`, {
        method: "PATCH",
        headers: { "content-type": "application/vnd.telepath.edit+json" },
        body: JSON.stringify(document),
      });
      assert.equal((await edit({ old_string: "before", new_string: "after" })).status, 409, name);
      assert.equal((await edit({ old_string: "missing", new_string: "after" })).status, 422, name);
      assert.equal((await edit({ old_string: "before", new_string: "after", replace_all: true })).status, 204, name);
      assert.equal(await readFile(join(running.root, name), "utf8"), "after after", name);
      const unsupported = await fetch(`${running.baseUrl}/${name}`, { method: "PATCH", body: "{}" });
      assert.equal(unsupported.status, 415, name);
      assert.equal(unsupported.headers.get("accept-patch"), "application/vnd.telepath.edit+json", name);
    }
  });

  test("file-server conformance: edit validation, ordering, encoding, and limits", async (context) => {
    const maximumEditBytes = 16_777_216;
    const editType = "application/vnd.telepath.edit+json";
    const invalidUtf8 = Buffer.from([0xff]);
    const oversizedSource = Buffer.alloc(maximumEditBytes + 1, 0x61);
    const expandableSource = Buffer.alloc(9 * 1024 * 1024, 0x61);
    const running = await startFixture(context, factory, {
      "config.md": Buffer.from("\uFEFFaaa\r\nport = 8765\r\n"),
      "dir/child.txt": "child",
      "invalid.txt": invalidUtf8,
      "invalid.md": invalidUtf8,
      "large.txt": oversizedSource,
      "large.md": oversizedSource,
      "result.txt": expandableSource,
      "result.md": expandableSource,
    });
    const edited = await editRequest(running.baseUrl, "/config.md", { old_string: "aa", new_string: "X" }, "APPLICATION/VND.TELEPATH.EDIT+JSON; CHARSET=UTF-8");
    assert.equal(edited.status, 204);
    assert.deepEqual(await readFile(join(running.root, "config.md")), Buffer.from("\uFEFFXa\r\nport = 8765\r\n"));

    const wrongMedia = { method: "PATCH", headers: { "content-type": "text/plain" }, body: "not json" };
    assert.equal((await fetch(`${running.baseUrl}/missing`, wrongMedia)).status, 404);
    assert.equal((await fetch(`${running.baseUrl}/dir`, wrongMedia)).status, 409);
    assert.equal((await fetch(`${running.baseUrl}/missing/`, wrongMedia)).status, 409);
    const invalidMediaRequests: Array<{ headers: Record<string, string>; body: string }> = [
      { headers: {}, body: "{}" },
      { headers: { "content-type": "application/json" }, body: "{}" },
      { headers: { "content-type": `${editType}; charset=latin1` }, body: "{}" },
      { headers: { "content-type": editType, "content-encoding": "identity" }, body: "{}" },
    ];
    for (const options of invalidMediaRequests) {
      const response = await fetch(`${running.baseUrl}/config.md`, { method: "PATCH", ...options });
      assert.equal(response.status, 415);
      assert.equal(response.headers.get("accept-patch"), editType);
    }

    for (const document of [
      null,
      [],
      {},
      { old_string: "a" },
      { old_string: "a", new_string: "b", extra: true },
      { old_string: 1, new_string: "b" },
      { old_string: "a", new_string: "b", replace_all: "true" },
    ]) {
      assert.equal((await editRequest(running.baseUrl, "/config.md", document)).status, 400, JSON.stringify(document));
    }
    assert.equal((await editRequest(running.baseUrl, "/config.md", { old_string: "", new_string: "x" })).status, 422);
    for (const name of ["invalid.txt", "invalid.md"] as const) {
      assert.equal((await editRequest(running.baseUrl, `/${name}`, { old_string: "x", new_string: "y" })).status, 415, name);
      assert.deepEqual(await readFile(join(running.root, name)), invalidUtf8, name);
    }
    for (const name of ["large.txt", "large.md"] as const) {
      assert.equal((await editRequest(running.baseUrl, `/${name}`, {})).status, 400, `${name} validates the document first`);
      assert.equal((await editRequest(running.baseUrl, `/${name}`, { old_string: "", new_string: "x" })).status, 415, name);
      assert.deepEqual(await readFile(join(running.root, name)), oversizedSource, name);
    }
    const oversizedBody = await fetch(`${running.baseUrl}/config.md`, {
      method: "PATCH",
      headers: { "content-type": editType },
      body: Buffer.alloc(maximumEditBytes + 1, 0x20),
    });
    assert.equal(oversizedBody.status, 413);
    for (const name of ["result.txt", "result.md"] as const) {
      const resultBefore = await readFile(join(running.root, name));
      assert.equal((await editRequest(running.baseUrl, `/${name}`, {
        old_string: "a",
        new_string: "aa",
        replace_all: true,
      })).status, 413, name);
      assert.deepEqual(await readFile(join(running.root, name)), resultBefore, name);
    }
  });
}
