import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { rawRequest, startFixture } from "./helpers.ts";
import type { FileServerConformanceFactory } from "./types.js";

export function defineConfinementConformance(factory: FileServerConformanceFactory): void {
  test("file-server conformance: confinement and symbolic-link refusal", async (context) => {
    const outside = await mkdtemp(join(tmpdir(), "file-server-conformance-outside-"));
    context.after(() => rm(outside, { recursive: true, force: true }));
    await writeFile(join(outside, "secret.txt"), "secret");
    const running = await startFixture(context, factory);
    await symlink(outside, join(running.root, "escape"));
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "POST"]) {
      assert.equal((await fetch(`${running.baseUrl}/escape/secret.txt`, { method })).status, 403, method);
    }
    assert.equal(await readFile(join(outside, "secret.txt"), "utf8"), "secret");

    const special = createNetServer();
    await new Promise<void>((resolve, reject) => {
      special.once("error", reject);
      special.listen(join(running.root, "special.sock"), resolve);
    });
    context.after(() => new Promise<void>((resolve) => special.close(() => resolve())));
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "POST"]) {
      assert.equal((await rawRequest(running.baseUrl, method, "/special.sock")).status, 404, method);
    }
    const listing = await (await fetch(`${running.baseUrl}/`)).json() as { entries: Array<{ name: string }> };
    assert.deepEqual(listing.entries.map(({ name }) => name), ["escape"]);
  });
}
