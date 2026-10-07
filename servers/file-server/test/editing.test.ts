import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { startFileServer } from "./helpers.ts";

const editType = "application/vnd.telepath.edit+json";
const maximumEditBytes = 16_777_216;

test("PATCH returns 413 before an oversized chunked request ends", async (context) => {
  const { baseUrl } = await startFileServer({ "file.txt": "old" });
  const pending = beginChunkedPatch(baseUrl, "/file.txt");
  context.after(() => pending.request.destroy());
  pending.request.write(Buffer.alloc(maximumEditBytes + 1, 0x20));

  const response = await Promise.race([
    pending.response,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("PATCH did not reject the open oversized body")), 2_000)),
  ]);
  assert.equal(response.status, 413);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(typeof JSON.parse(response.body.toString()).error, "string");
});

test("PATCH opens the validated target without following a concurrent replacement symlink", async (context) => {
  const { baseUrl, root } = await startFileServer({ "file.txt": "inside" });
  const outside = await mkdtemp(join(tmpdir(), "file-server-patch-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(`${outside}/secret.txt`, "outside secret");
  const document = Buffer.from(JSON.stringify({ old_string: "outside", new_string: "leaked" }));
  const pending = beginChunkedPatch(baseUrl, "/file.txt", document.length);
  context.after(() => pending.request.destroy());
  pending.request.write(document.subarray(0, 1));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await unlink(`${root}/file.txt`);
  await symlink(`${outside}/secret.txt`, `${root}/file.txt`);
  pending.request.end(document.subarray(1));

  const response = await pending.response;
  assert.equal(response.status, 403);
  assert.equal((await lstat(`${root}/file.txt`)).isSymbolicLink(), true);
  assert.equal(await readFile(`${outside}/secret.txt`, "utf8"), "outside secret");
});

function beginChunkedPatch(baseUrl: string, path: string, contentLength?: number): {
  request: ClientRequest;
  response: Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>;
} {
  const base = new URL(baseUrl);
  let request: ClientRequest;
  const response = new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve) => {
    request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method: "PATCH",
      path,
      headers: {
        "content-type": editType,
        ...(contentLength === undefined ? {} : { "content-length": String(contentLength) }),
      },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        status: incoming.statusCode ?? 0,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", () => undefined);
  });
  return { request: request!, response };
}
