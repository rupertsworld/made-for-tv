import assert from "node:assert/strict";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { parseRawResponse, rawRequest, rawTcpRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

const allowedMethods = "GET, HEAD, PUT, PATCH, DELETE, OPTIONS";
const exposedHeaders = "ETag, Accept-Ranges, Content-Range, Accept-Patch";

export function defineErrorsConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: method and JSON error rules", async (context) => {
    const running = await startFixture(context, factory, { "file.txt": "same same", "dir/child.txt": "child" });
    await symlink("file.txt", join(running.root, "link.txt"));
    for (const path of ["/missing", "/file.txt"]) {
      const unsupported = await fetch(`${running.baseUrl}${path}`, { method: "POST" });
      assert.equal(unsupported.status, 405);
      assert.equal(unsupported.headers.get("allow"), allowedMethods);
      assert.equal(unsupported.headers.get("content-type"), "application/json; charset=utf-8");
      assert.deepEqual(await unsupported.json(), { error: "method not allowed" });
    }
    const missing = await fetch(`${running.baseUrl}/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "not found" });
    const head = await fetch(`${running.baseUrl}/missing`, { method: "HEAD" });
    assert.equal(head.status, 404);
    assert.equal(await head.text(), "");

    const rawHead = parseRawResponse(await rawTcpRequest(
      running.baseUrl,
      "HEAD /missing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    ));
    assert.equal(rawHead.status, 404);
    const rawGet = await rawRequest(running.baseUrl, "GET", "/missing");
    assert.equal(rawHead.headers["content-type"], rawGet.headers["content-type"]);
    assert.equal(rawHead.headers["content-length"], rawGet.headers["content-length"]);
    assert.equal(rawHead.body.length, 0);

    const connectResponse = parseRawResponse(await rawTcpRequest(
      running.baseUrl,
      "CONNECT /missing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    ));
    assert.equal(connectResponse.status, 405);
    assert.equal(connectResponse.headers.allow, allowedMethods);
    assert.equal(connectResponse.headers["access-control-allow-origin"], "*");
    assert.equal(connectResponse.headers["access-control-expose-headers"], exposedHeaders);
    assert.equal(connectResponse.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(connectResponse.headers["content-length"], String(connectResponse.body.length));
    assert.deepEqual(JSON.parse(connectResponse.body.toString()), { error: "method not allowed" });

    for (const [path, status] of [["/bad%2Fpath", 400], ["/link.txt", 403]] as const) {
      const refused = parseRawResponse(await rawTcpRequest(
        running.baseUrl,
        `CONNECT ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
      ));
      assert.equal(refused.status, status, path);
      assert.equal(refused.headers["access-control-allow-origin"], "*");
      assert.equal(refused.headers["access-control-expose-headers"], exposedHeaders);
      assert.equal(refused.headers["content-type"], "application/json; charset=utf-8");
      assert.equal(refused.headers["content-length"], String(refused.body.length));
      assert.equal(typeof JSON.parse(refused.body.toString()).error, "string");
    }

    const errorResponses = [
      await fetch(`${running.baseUrl}/file.txt`, {
        method: "PATCH",
        headers: { "content-type": "application/vnd.telepath.edit+json" },
        body: "{",
      }),
      await fetch(`${running.baseUrl}/missing`),
      await fetch(`${running.baseUrl}/link.txt`),
      await fetch(`${running.baseUrl}/dir`, { method: "PUT", body: "body" }),
      await fetch(`${running.baseUrl}/file.txt`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }),
      await fetch(`${running.baseUrl}/file.txt`, {
        method: "PATCH",
        headers: { "content-type": "application/vnd.telepath.edit+json" },
        body: JSON.stringify({ old_string: "missing", new_string: "new" }),
      }),
      await fetch(`${running.baseUrl}/file.txt`, {
        method: "PATCH",
        headers: { "content-type": "application/vnd.telepath.edit+json" },
        body: JSON.stringify({
          old_string: "same",
          new_string: "x".repeat(9 * 1024 * 1024),
          replace_all: true,
        }),
      }),
    ];
    assert.deepEqual(errorResponses.map(({ status }) => status), [400, 404, 403, 409, 415, 422, 413]);
    for (const response of errorResponses) {
      assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(typeof (await response.json() as { error: unknown }).error, "string");
    }
  });
}
