import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { test } from "node:test";

import { startFileServer } from "./helpers.ts";

test("a failed rename removes the temporary file after it has been created", async () => {
  const { baseUrl, root } = await startFileServer();
  const upload = beginUpload(baseUrl, "/blocked", 128 * 1024);
  upload.request.write(Buffer.alloc(64 * 1024, 0x78));
  await waitForTemporaryName(root);
  await mkdir(`${root}/blocked`);
  upload.request.end(Buffer.alloc(64 * 1024, 0x79));

  const response = await upload.response;
  assert.equal(response.status, 500);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(typeof JSON.parse(response.body.toString()).error, "string");
  assert.deepEqual(await readdir(root), ["blocked"]);
});

test("concurrent PUTs use distinct temporary files and commit one complete body", async () => {
  const { baseUrl, root } = await startFileServer();
  const bodies = Array.from({ length: 24 }, (_, index) => Buffer.from(`complete body ${index}`));
  const responses = await Promise.all(bodies.map((body) => putRequest(baseUrl, "/race.txt", body)));
  assert.equal(responses.every(({ status }) => status === 201 || status === 204), true);
  const stored = await readFile(`${root}/race.txt`);
  assert.equal(bodies.some((body) => body.equals(stored)), true);
  assert.deepEqual(await readdir(root), ["race.txt"]);
});

function beginUpload(baseUrl: string, path: string, contentLength: number): {
  request: ClientRequest;
  response: Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>;
} {
  const base = new URL(baseUrl);
  let request: ClientRequest;
  const response = new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve) => {
    request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method: "PUT",
      path,
      headers: { "content-length": String(contentLength) },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body: Buffer.concat(chunks) }));
    });
    request.once("error", () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0) }));
  });
  return { request: request!, response };
}

async function putRequest(baseUrl: string, path: string, body: Uint8Array): Promise<{ status: number }> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method: "PUT",
      path,
      headers: { "content-length": String(body.length) },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function waitForTemporaryName(root: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const temporary = (await readdir(root)).find((name) => name !== "blocked");
    if (temporary !== undefined) return temporary;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("temporary file did not appear");
}
