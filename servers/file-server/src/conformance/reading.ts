import assert from "node:assert/strict";
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineReadingConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: file reads, media types, validators, and HEAD", async (context) => {
    const running = await startFixture(context, factory, {
      "file.txt": "0123456789",
      "raw.md": "0123456789",
      "data.json": "{}",
      "app.webmanifest": "{}",
      "photo.jpg": Uint8Array.from([0xff, 0xd8, 0xff]),
      "unknown.telepath-no-mime": "bytes",
    });
    await utimes(join(running.root, "file.txt"), new Date("2026-01-02T03:04:05Z"), new Date("2026-01-02T03:04:05Z"));
    await utimes(join(running.root, "raw.md"), new Date("2026-01-02T03:04:05Z"), new Date("2026-01-02T03:04:05Z"));
    for (const [name, contentType] of [
      ["file.txt", "text/plain; charset=utf-8"],
      ["raw.md", "text/markdown; charset=utf-8"],
    ] as const) {
      const full = await fetch(`${running.baseUrl}/${name}`);
      assert.equal(full.status, 200, name);
      assert.equal(full.headers.get("content-type"), contentType, name);
      assert.equal(full.headers.get("content-length"), "10", name);
      assert.equal(full.headers.get("accept-ranges"), "bytes", name);
      assert.equal(full.headers.get("last-modified"), "Fri, 02 Jan 2026 03:04:05 GMT", name);
      assert.match(full.headers.get("etag") ?? "", /^W\//, name);
      assert.equal(await full.text(), "0123456789", name);
      const ranged = await fetch(`${running.baseUrl}/${name}`, { headers: { range: "bytes=2-4" } });
      assert.equal(ranged.status, 206, name);
      assert.equal(ranged.headers.get("content-range"), "bytes 2-4/10", name);
      assert.equal(await ranged.text(), "234", name);
      const cached = await fetch(`${running.baseUrl}/${name}`, { headers: { "if-none-match": full.headers.get("etag") as string } });
      assert.equal(cached.status, 304, name);
      const head = await fetch(`${running.baseUrl}/${name}`, { method: "HEAD", headers: { range: "bytes=2-4" } });
      assert.equal(head.status, 200, name);
      assert.equal(head.headers.get("content-type"), contentType, name);
      assert.equal(head.headers.get("content-length"), "10", name);
      assert.equal(head.headers.get("accept-ranges"), "bytes", name);
      assert.equal(head.headers.get("last-modified"), full.headers.get("last-modified"), name);
      assert.equal(head.headers.get("etag"), full.headers.get("etag"), name);
      assert.equal(head.headers.get("content-range"), null, name);
      assert.equal(await head.text(), "", name);
    }
    assert.equal((await fetch(`${running.baseUrl}/data.json`)).headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal((await fetch(`${running.baseUrl}/app.webmanifest`)).headers.get("content-type"), "application/manifest+json; charset=utf-8");
    assert.equal((await fetch(`${running.baseUrl}/photo.jpg`)).headers.get("content-type"), "image/jpeg");
    assert.equal((await fetch(`${running.baseUrl}/unknown.telepath-no-mime`)).headers.get("content-type"), "application/octet-stream");
  });

  test("file-server conformance: range and conditional edge cases", async (context) => {
    const running = await startFixture(context, factory, {
      "digits.txt": "0123456789",
      "digits.md": "0123456789",
      "empty.txt": "",
      "empty.md": "",
    });
    await utimes(join(running.root, "digits.txt"), new Date("2026-02-03T04:05:06Z"), new Date("2026-02-03T04:05:06Z"));
    await utimes(join(running.root, "digits.md"), new Date("2026-02-03T04:05:06Z"), new Date("2026-02-03T04:05:06Z"));
    for (const name of ["digits.txt", "digits.md"] as const) {
      for (const [range, body, contentRange] of [
        ["bytes=2-5", "2345", "bytes 2-5/10"],
        ["bytes=7-", "789", "bytes 7-9/10"],
        ["bytes=-4", "6789", "bytes 6-9/10"],
        ["bytes=8-99", "89", "bytes 8-9/10"],
        ["BYTES=1-2", "12", "bytes 1-2/10"],
      ] as const) {
        const response = await fetch(`${running.baseUrl}/${name}`, { headers: { range } });
        assert.equal(response.status, 206, `${name}: ${range}`);
        assert.equal(response.headers.get("content-range"), contentRange, name);
        assert.equal(response.headers.get("content-length"), String(body.length), name);
        assert.equal(await response.text(), body, name);
      }
    }
    for (const [path, range, size] of [
      ["/digits.txt", "bytes=10-", 10],
      ["/digits.md", "bytes=10-", 10],
      ["/digits.txt", "bytes=-0", 10],
      ["/digits.md", "bytes=-0", 10],
      ["/empty.txt", "bytes=0-0", 0],
      ["/empty.md", "bytes=0-0", 0],
    ] as const) {
      const response = await fetch(`${running.baseUrl}${path}`, { headers: { range } });
      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get("content-range"), `bytes */${size}`);
      assert.deepEqual(await response.json(), { error: "range not satisfiable" });
    }
    for (const name of ["digits.txt", "digits.md"] as const) {
      for (const range of ["not-a-range", "items=0-1", "bytes=0-1,4-5", "bytes=5-4", "bytes=-", "bytes=1-2x"]) {
        const response = await fetch(`${running.baseUrl}/${name}`, { headers: { range } });
        assert.equal(response.status, 200, `${name}: ${range}`);
        assert.equal(response.headers.get("content-range"), null, name);
        assert.equal(await response.text(), "0123456789", name);
      }
    }

    for (const name of ["digits.txt", "digits.md"] as const) {
      const initial = await fetch(`${running.baseUrl}/${name}`);
      const etag = initial.headers.get("etag") as string;
      const lastModified = initial.headers.get("last-modified") as string;
      const matchingDate = await fetch(`${running.baseUrl}/${name}`, {
        headers: { range: "bytes=0-2", "if-range": lastModified },
      });
      assert.equal(matchingDate.status, 206, name);
      for (const ifRange of ["Mon, 01 Jan 1990 00:00:00 GMT", "invalid", etag]) {
        const response = await fetch(`${running.baseUrl}/${name}`, {
          headers: { range: "bytes=0-2", "if-range": ifRange },
        });
        assert.equal(response.status, 200, `${name}: ${ifRange}`);
      }
      for (const ifNoneMatch of ["*", etag.replace(/^W\//, ""), `"other", ${etag}`]) {
        const response = await fetch(`${running.baseUrl}/${name}`, {
          headers: { "if-none-match": ifNoneMatch, range: "bytes=0-1" },
        });
        assert.equal(response.status, 304, `${name}: ${ifNoneMatch}`);
        assert.equal(await response.text(), "", name);
      }
      const precedence = await fetch(`${running.baseUrl}/${name}`, {
        headers: { "if-none-match": "\"not-current\"", "if-modified-since": lastModified },
      });
      assert.equal(precedence.status, 200, name);
      assert.equal((await fetch(`${running.baseUrl}/${name}`, { headers: { "if-modified-since": lastModified } })).status, 304, name);
      assert.equal((await fetch(`${running.baseUrl}/${name}`, { headers: { "if-modified-since": "invalid" } })).status, 200, name);
    }
  });
}
