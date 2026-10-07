import assert from "node:assert/strict";
import { mkdtemp, rename, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { rawRequest, startFileServer } from "./helpers.ts";

test("PUT refuses a checked parent chain when the configured root is concurrently replaced", async (context) => {
  const { baseUrl, root } = await startFileServer();
  const movedRoot = `${root}-moved`;
  const outside = await mkdtemp(join(tmpdir(), "file-server-outside-parent-"));
  await rename(root, movedRoot);
  await symlink(outside, root);
  context.after(async () => {
    await rm(root, { force: true });
    await Promise.all([
      rm(movedRoot, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  assert.equal((await rawRequest(baseUrl, "PUT", "/new/escaped.txt")).status, 404);
  await assert.rejects(stat(`${outside}/new/escaped.txt`), { code: "ENOENT" });
});
