import assert from "node:assert/strict";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

const allowedMethods = "GET, HEAD, PUT, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Content-Type, Range, If-None-Match, If-Modified-Since, If-Range";
const exposedHeaders = "ETag, Accept-Ranges, Content-Range, Accept-Patch";

test("OPTIONS preflight succeeds on note and directory URLs", async () => {
  const { baseUrl } = await startVault({ "note.md": "hello", "folder/child.md": "child" });

  for (const path of ["/note", "/folder/"]) {
    const response = await fetch(`${baseUrl}${path}`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-methods"), allowedMethods);
    assert.equal(response.headers.get("access-control-allow-headers"), allowedHeaders);
    assert.equal(response.headers.get("access-control-expose-headers"), exposedHeaders);
    assert.equal(response.headers.get("access-control-max-age"), "86400");
    assert.equal(response.headers.get("accept-patch"), "application/vnd.telepath.edit+json");
  }
});

test("every HTTP response carries Access-Control-Allow-Origin", async () => {
  const { baseUrl } = await startVault({ "note.md": "hello", "photo.jpg": "image" });
  const responses = [
    await fetch(`${baseUrl}/note`),
    await fetch(`${baseUrl}/photo.jpg`),
    await noteWrite(baseUrl, "PUT", "/written", { body: "written" }),
    await fetch(`${baseUrl}/missing`),
  ];

  assert.deepEqual(responses.map(({ status }) => status), [200, 200, 201, 404]);
  for (const response of responses) {
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-expose-headers"), exposedHeaders);
  }
});

test("private-network access is allowed only when requested", async () => {
  const { baseUrl } = await startVault();
  const requested = await fetch(`${baseUrl}/note`, {
    method: "OPTIONS",
    headers: { "access-control-request-private-network": "true" },
  });
  const notRequested = await fetch(`${baseUrl}/note`, { method: "OPTIONS" });

  assert.equal(requested.headers.get("access-control-allow-private-network"), "true");
  assert.equal(notRequested.headers.get("access-control-allow-private-network"), null);
});
