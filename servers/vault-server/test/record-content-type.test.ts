import assert from "node:assert/strict";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

const recordType = "application/vnd.telepath.record+json; charset=utf-8";

test("GET HEAD PUT and PATCH record representations use the record vendor media type", async () => {
  const vault = await startVault({
    "note.md": "---\nstatus: open\n---\nbody",
    "asset.json": JSON.stringify({ kind: "asset" }),
  });

  const get = await fetch(`${vault.baseUrl}/note`);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("content-type"), recordType);
  const getBody = await get.text();

  const head = await fetch(`${vault.baseUrl}/note`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), recordType);
  assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(getBody)));
  assert.equal(await head.text(), "");

  const put = await noteWrite(vault.baseUrl, "PUT", "/created", { body: "created" });
  assert.equal(put.status, 201);
  assert.equal(put.headers.get("content-type"), recordType);
  assert.equal((await put.json() as { path: string }).path, "created");

  const replacement = await noteWrite(vault.baseUrl, "PUT", "/created", { body: "replaced" });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.headers.get("content-type"), recordType);
  assert.equal((await replacement.json() as { body: string }).body, "replaced");

  const patch = await noteWrite(vault.baseUrl, "PATCH", "/note", { fields: { status: "closed" } });
  assert.equal(patch.status, 200);
  assert.equal(patch.headers.get("content-type"), recordType);
  assert.deepEqual((await patch.json() as { fields: unknown }).fields, { status: "closed" });

  const noOp = await noteWrite(vault.baseUrl, "PATCH", "/note", {});
  assert.equal(noOp.status, 200);
  assert.equal(noOp.headers.get("content-type"), recordType);
  assert.deepEqual((await noOp.json() as { fields: unknown }).fields, { status: "closed" });

  const missing = await noteWrite(vault.baseUrl, "PATCH", "/missing", {});
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await missing.json(), { error: "record not found" });

  const asset = await fetch(`${vault.baseUrl}/asset.json`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "application/json; charset=utf-8");
});
