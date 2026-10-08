import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const run = promisify(execFile);

test("npm package is version 0.5.0 and ships built entrypoints and the skill without deleted core", async (context) => {
  const cache = await mkdtemp(join(tmpdir(), "vault-server-npm-cache-"));
  context.after(() => rm(cache, { recursive: true, force: true }));
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache], {
    cwd: process.cwd(),
  });
  const result = JSON.parse(stdout) as Array<{ name?: string; version?: string; files: Array<{ path: string }> }>;
  assert.equal(result[0]?.name, "@rupertsworld/vault-server");
  assert.equal(result[0]?.version, "0.5.0");
  const files = new Set(result[0]?.files.map(({ path }) => path));
  for (const required of [
    "dist/src/cli.d.ts",
    "dist/src/cli.js",
    "dist/src/notes.d.ts",
    "dist/src/notes.js",
    "dist/src/server.d.ts",
    "dist/src/server.js",
    "skill/SKILL.md",
    "README.md",
    "LICENSE",
  ]) {
    assert(files.has(required), required);
  }
  assert.equal([...files].some((path) => path.startsWith("dist/src/paths.")), false, "deleted path core is absent");
});
