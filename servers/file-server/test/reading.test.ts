import assert from "node:assert/strict";
import { readdir, readlink } from "node:fs/promises";
import { test } from "node:test";

import { startFileServer } from "./helpers.ts";

test("GET headers and bytes stay on one file while atomic PUTs commit", async () => {
  const shortBody = Buffer.alloc(32 * 1024, 0x61);
  const longBody = Buffer.alloc(96 * 1024, 0x62);
  const { baseUrl } = await startFileServer({ "race.bin": shortBody });

  const writer = async (offset: number): Promise<void> => {
    for (let index = 0; index < 30; index += 1) {
      const body = (index + offset) % 2 === 0 ? shortBody : longBody;
      const response = await fetch(`${baseUrl}/race.bin`, { method: "PUT", body });
      assert.equal(response.status, 204);
    }
  };
  const reader = async (): Promise<void> => {
    for (let index = 0; index < 90; index += 1) {
      const response = await fetch(`${baseUrl}/race.bin`);
      assert.equal(response.status, 200);
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(Number(response.headers.get("content-length")), body.length);
      const sizeFromEtag = Number.parseInt(response.headers.get("etag")?.match(/^W\/"([0-9a-f]+)-/)?.[1] ?? "", 16);
      assert.equal(sizeFromEtag, body.length);
      assert.equal(body.equals(shortBody) || body.equals(longBody), true);
    }
  };

  await Promise.all([writer(0), writer(1), reader(), reader()]);
});

test("aborting a streamed file closes its file handle without escaping an error", async () => {
  const size = 4 * 1024 * 1024;
  const { baseUrl, root } = await startFileServer({ "large.bin": new Uint8Array(size).fill(0x61) });
  const escapedErrors: unknown[] = [];
  const onUncaught = (error: Error): void => { escapedErrors.push(error); };
  const onUnhandled = (reason: unknown): void => { escapedErrors.push(reason); };
  process.on("uncaughtExceptionMonitor", onUncaught);
  process.on("unhandledRejection", onUnhandled);
  try {
    const response = await fetch(`${baseUrl}/large.bin`);
    assert(response.body);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert(first.value);
    assert.ok(first.value.length > 0 && first.value.length < size);
    await reader.cancel();

    const openDescriptors = await waitForClosedFileDescriptor(`${root}/large.bin`);
    if (openDescriptors !== undefined) assert.equal(openDescriptors, 0);
    const followUp = await fetch(`${baseUrl}/large.bin`, { headers: { range: "bytes=0-3" } });
    assert.equal(followUp.status, 206);
    assert.equal((await followUp.arrayBuffer()).byteLength, 4);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(escapedErrors, []);
  } finally {
    process.off("uncaughtExceptionMonitor", onUncaught);
    process.off("unhandledRejection", onUnhandled);
  }
});

async function waitForClosedFileDescriptor(path: string): Promise<number | undefined> {
  let count: number | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    count = await countOpenFileDescriptors(path);
    if (count === undefined || count === 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return count;
}

async function countOpenFileDescriptors(path: string): Promise<number | undefined> {
  let descriptors: string[];
  try { descriptors = await readdir("/proc/self/fd"); }
  catch { return undefined; }
  let count = 0;
  for (const descriptor of descriptors) {
    try { if (await readlink(`/proc/self/fd/${descriptor}`) === path) count += 1; }
    catch { /* A descriptor can close between readdir and readlink. */ }
  }
  return count;
}
