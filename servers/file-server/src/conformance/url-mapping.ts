import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRawResponse, rawRequest, rawStatus, rawTcpRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineUrlMappingConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: URL mapping and dotfile hiding", async (context) => {
    const running = await startFixture(context, factory, {
      "café.txt": "unicode",
      "%2e.txt": "decoded once",
      ".env": "hidden",
      "dir/file.txt": "file",
    });
    assert.equal(await (await fetch(`${running.baseUrl}/caf%C3%A9.txt?ignored=1`)).text(), "unicode");
    assert.equal(await (await fetch(`${running.baseUrl}/%252e.txt`)).text(), "decoded once");
    for (const path of ["/.env", "/%2Eenv", "/dir/.hidden", "/.", "/.."]) {
      assert.equal(await rawStatus(running.baseUrl, path), 404, path);
    }
    assert.equal((await fetch(`${running.baseUrl}/dir/file.txt/`)).status, 404);
  });

  test("file-server conformance: invalid paths and hidden segments precede every method", async (context) => {
    const running = await startFixture(context, factory, {
      ".env": "hidden",
      ".obsidian/note.md": "hidden",
      "dir/file.txt": "file",
    });
    for (const path of ["/%", "/%FF", "/nul%00byte", "/a%5Cb", "/a%2Fb", "/a//b", "//a", "/a\\b"]) {
      const response = await rawRequest(running.baseUrl, "POST", path);
      assert.equal(response.status, 400, path);
      assert.deepEqual(JSON.parse(response.body.toString()), { error: "invalid path" });
    }
    for (const path of ["/.", "/..", "/%2e", "/%2E%2E", "/.env", "/%2Eenv", "/.obsidian/note.md", "/dir/.child"]) {
      for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "POST"]) {
        assert.equal((await rawRequest(running.baseUrl, method, path)).status, 404, `${method} ${path}`);
      }
    }
    const connect = parseRawResponse(await rawTcpRequest(
      running.baseUrl,
      "CONNECT /.env HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    ));
    assert.equal(connect.status, 404);
  });
}
