import assert from "node:assert/strict";
import { test } from "node:test";

import { rawRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

const exposedHeaders = "ETag, Accept-Ranges, Content-Range, Accept-Patch";

export function defineCorsConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: CORS headers and preflight", async (context) => {
    const running = await startFixture(context, factory, { "file.txt": "file" });
    for (const path of ["/missing", "/file.txt"]) {
      const response = await fetch(`${running.baseUrl}${path}`, {
        method: "OPTIONS",
        headers: { "access-control-request-private-network": "true" },
      });
      assert.equal(response.status, 204);
      assert.equal(await response.text(), "");
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, PUT, PATCH, DELETE, OPTIONS");
      assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, Range, If-None-Match, If-Modified-Since, If-Range");
      assert.equal(response.headers.get("access-control-expose-headers"), exposedHeaders);
      assert.equal(response.headers.get("access-control-max-age"), "86400");
      assert.equal(response.headers.get("access-control-allow-private-network"), "true");
      assert.equal(response.headers.get("accept-patch"), "application/vnd.telepath.edit+json");
    }
    for (const [method, path] of [["GET", "/file.txt"], ["POST", "/file.txt"]] as const) {
      const response = await fetch(`${running.baseUrl}${path}`, { method });
      assert.equal(response.status, method === "GET" ? 200 : 405);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("access-control-expose-headers"), exposedHeaders);
    }
    const missing = await fetch(`${running.baseUrl}/missing`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("access-control-allow-origin"), "*");
    assert.equal(missing.headers.get("access-control-expose-headers"), exposedHeaders);
    const ordinary = await fetch(`${running.baseUrl}/missing`, { method: "OPTIONS" });
    assert.equal(ordinary.headers.get("access-control-allow-private-network"), null);
    assert.equal((await rawRequest(running.baseUrl, "OPTIONS", "/bad%2Fpath")).status, 400);
  });
}
