import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const run = promisify(execFile);

test("npm package ships the bundled skill and built conformance subpath", async (context) => {
  const cache = await mkdtemp(join(tmpdir(), "file-server-npm-cache-"));
  context.after(() => rm(cache, { recursive: true, force: true }));
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache], {
    cwd: process.cwd(),
  });
  const result = JSON.parse(stdout) as Array<{ name?: string; files: Array<{ path: string }> }>;
  assert.equal(result[0]?.name, "@rupertsworld/file-server");
  const files = new Set(result[0]?.files.map(({ path }) => path));
  assert(files.has("README.md"));
  assert(files.has("LICENSE"));
  assert(files.has("skill/SKILL.md"));
  assert(files.has("dist/src/conformance/index.js"));
  assert(files.has("dist/src/conformance/index.d.ts"));
  for (const concern of [
    "changes",
    "confinement",
    "cors",
    "directories",
    "editing",
    "errors",
    "helpers",
    "reading",
    "types",
    "url-mapping",
    "writing",
  ]) {
    assert(files.has(`dist/src/conformance/${concern}.js`), concern);
  }
  const subpath: string = "@rupertsworld/file-server/conformance";
  const conformance = await import(subpath) as { defineFileServerConformance?: unknown };
  assert.equal(typeof conformance.defineFileServerConformance, "function");
});

test("bundled skill teaches scheme mapping, dirty refetch, no replay, reconnection, and extension entries", async () => {
  const skill = await readFile(join(process.cwd(), "skill/SKILL.md"), "utf8");
  assert.match(skill, /WebSocket/);
  assert.match(skill, /`http` or `https` scheme to\s+`ws` or `wss`/);
  assert.match(skill, /before fetching initial state/);
  assert.match(skill, /On a message, schedule another fetch/);
  assert.match(skill, /one fetch in flight/);
  assert.match(skill, /no history or\s+replay/);
  assert.match(skill, /reconnect with backoff/);
  assert.match(skill, /Dot-prefixed paths/);
  assert.match(skill, /ignore\s+patterns/);
  assert.match(skill, /unrecognized type/);
  assert.match(skill, /Its `name` remains an addressable URL\s+component/);
});

test("published extension declarations include their Express type dependency", async () => {
  const manifest = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal(manifest.dependencies?.["@types/express"], "^5.0.3");
  assert.equal(manifest.devDependencies?.["@types/express"], undefined);
});

test("a clean TypeScript consumer can compile against the packed public declarations", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "file-server-consumer-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const pack = await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], {
    cwd: process.cwd(),
  });
  const packed = JSON.parse(pack.stdout) as Array<{ filename: string }>;
  const archive = join(temporary, packed[0]?.filename ?? "");
  const unpacked = join(temporary, "unpacked");
  const consumer = join(temporary, "consumer");
  const modules = join(consumer, "node_modules");
  await Promise.all([
    mkdir(unpacked, { recursive: true }),
    mkdir(modules, { recursive: true }),
  ]);
  await run("tar", ["-xzf", archive, "-C", unpacked]);
  await mkdir(join(modules, "@rupertsworld"), { recursive: true });
  await rename(join(unpacked, "package"), join(modules, "@rupertsworld", "file-server"));

  const workspaceModules = join(process.cwd(), "..", "node_modules");
  await symlink(join(workspaceModules, "express"), join(modules, "express"), "dir");
  await symlink(join(workspaceModules, "@types"), join(modules, "@types"), "dir");
  await writeFile(join(consumer, "consumer.ts"), `
import {
  FileServer,
  type DirectoryListing,
  type FileChangeEvent,
  type FileServerExtension,
  type FileServerExtensionContext,
} from "@rupertsworld/file-server";
import { defineFileServerConformance } from "@rupertsworld/file-server/conformance";

const extension: FileServerExtension = {
  handle(_request, _response, context: FileServerExtensionContext) {
    return context.path === "never";
  },
  listing(_request, listing: DirectoryListing) { return listing; },
  change(event: FileChangeEvent) { return event; },
};
void new FileServer({ root: ".", defaultPort: 4747, extension });
void defineFileServerConformance;
`);
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      types: [],
    },
    include: ["consumer.ts"],
  }));
  await run(join(workspaceModules, ".bin", "tsc"), ["-p", join(consumer, "tsconfig.json")]);
});
