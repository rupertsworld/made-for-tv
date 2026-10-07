import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { VaultServer } from "../src/server.ts";

test("ready indexes a live-scale 6.6k-file vault within 15 seconds", { timeout: 30_000 }, async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-warmup-"));
  let server: VaultServer | undefined;
  context.after(async () => {
    if (server !== undefined && !server.server.listening) await server.listen({ port: 0 }).catch(() => undefined);
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  const directories = Array.from({ length: 66 }, (_, index) => join(root, `group-${String(index).padStart(2, "0")}`));
  await Promise.all(directories.map((directory) => mkdir(directory)));
  await Promise.all(directories.flatMap((directory) => Array.from({ length: 100 }, (_, index) => {
    const markdown = index < 47;
    const name = `item-${String(index).padStart(2, "0")}${markdown ? ".md" : ".txt"}`;
    const contents = markdown ? `---\nindex: ${index}\n---\nBody ${index}\n` : `File ${index}\n`;
    return writeFile(join(directory, name), contents);
  })));

  const started = performance.now();
  server = new VaultServer({ root });
  await server.ready;
  const elapsed = performance.now() - started;
  context.diagnostic(`vault warm-up: ${elapsed.toFixed(1)} ms for 6,600 files / 3,102 records`);
  assert(elapsed < 15_000, `ready took ${elapsed.toFixed(1)} ms`);
  const paths = [...server.paths];
  assert.equal(paths.length, 6_600);
  assert.equal(paths.filter((path) => path.endsWith(".md")).length, 3_102);

  await server.listen({ port: 0 });
  await server.close();
});
