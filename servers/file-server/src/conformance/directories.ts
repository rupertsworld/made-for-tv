import assert from "node:assert/strict";
import { mkdir, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { rawRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineDirectoriesConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: one-level directory listings", async (context) => {
    const running = await startFixture(context, factory, {
      ".hidden": "hidden",
      "notes/Z.txt": "zed",
      "notes/a.txt": "a",
      "notes/b.txt": "bb",
      "notes/café.txt": "coffee",
    });
    await utimes(join(running.root, "notes", "a.txt"), new Date("2026-01-02T03:04:05Z"), new Date("2026-01-02T03:04:05Z"));
    await mkdir(join(running.root, "notes", "archive"));
    await symlink("archive", join(running.root, "notes", "latest"));
    const response = await fetch(`${running.baseUrl}/notes/`);
    assert.equal(response.headers.get("content-type"), "application/vnd.telepath.directory+json; charset=utf-8");
    const listing = await response.json() as {
      path: string;
      entries: Array<{ name: string; type: string; size?: number; modified?: string }>;
    };
    assert.equal(listing.path, "notes");
    assert.deepEqual(listing.entries.map(({ name }) => name), ["Z.txt", "a.txt", "archive", "b.txt", "café.txt", "latest"]);
    assert.deepEqual(listing.entries.find(({ name }) => name === "archive"), { name: "archive", type: "dir" });
    assert.deepEqual(listing.entries.find(({ name }) => name === "latest"), { name: "latest", type: "link" });
    assert.deepEqual(listing.entries.find(({ name }) => name === "a.txt"), {
      name: "a.txt",
      type: "file",
      size: 1,
      modified: "2026-01-02T03:04:05.000Z",
    });
    assert.deepEqual(await (await fetch(`${running.baseUrl}/notes`)).json(), listing);
    const root = await (await fetch(`${running.baseUrl}/`)).json() as { path: string; entries: Array<{ name: string }> };
    assert.equal(root.path, "");
    assert.deepEqual(root.entries.map(({ name }) => name), ["notes"]);

    await writeFile(join(running.root, "notes", ".nested"), "hidden");
    await writeFile(join(running.root, "notes", "back\\slash"), "hidden");
    const invalidName = Buffer.concat([Buffer.from(`${running.root}/notes/invalid-`), Buffer.from([0xff])]);
    await writeFile(invalidName, "hidden");
    const filtered = await (await fetch(`${running.baseUrl}/notes/`)).json() as { entries: Array<{ name: string }> };
    assert.deepEqual(filtered.entries.map(({ name }) => name), ["Z.txt", "a.txt", "archive", "b.txt", "café.txt", "latest"]);

    const conditional = await fetch(`${running.baseUrl}/notes/`, {
      headers: { range: "bytes=0-1", "if-none-match": "*", "if-modified-since": "Tue, 05 Mar 2030 00:00:00 GMT" },
    });
    assert.equal(conditional.status, 200);
    assert.equal(conditional.headers.get("content-range"), null);
    assert.equal(conditional.headers.get("accept-ranges"), null);

    const rawGet = await rawRequest(running.baseUrl, "GET", "/notes/");
    const rawHead = await rawRequest(running.baseUrl, "HEAD", "/notes/");
    assert.equal(rawHead.status, 200);
    assert.equal(rawHead.headers["content-type"], rawGet.headers["content-type"]);
    assert.equal(rawHead.headers["content-length"], String(rawGet.body.length));
    assert.equal(rawHead.headers["content-length"], rawGet.headers["content-length"]);
    assert.equal(rawHead.body.length, 0);

    const bomName = "\uFEFFbom.txt";
    await writeFile(join(running.root, "notes", bomName), "bom");
    const withBom = await (await fetch(`${running.baseUrl}/notes/`)).json() as { entries: Array<{ name: string }> };
    assert.equal(withBom.entries.some(({ name }) => name === bomName), true);
    assert.equal(await (await fetch(`${running.baseUrl}/notes/%EF%BB%BFbom.txt`)).text(), "bom");
  });
}
