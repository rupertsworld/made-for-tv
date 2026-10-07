// Ignore patterns through the exported FileServer. The patterns follow
// .gitignore rules; these tests pin the rules the server relies on, then show
// that a matching path hides exactly like a dot-prefixed path on every protocol
// surface — requests, upgrades, listings, the change stream, and extension
// context operations — that the watcher never descends into it, that a long
// request path cannot stall the server, and that checking paths does not grow
// memory without bound. The CLI's config and flag are covered in cli.test.ts.
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import type { FSWatcher } from "chokidar";

import { cachedChecksLimit, IgnorePatterns } from "../src/ignore.ts";
import {
  FileServer,
  type FileChangeEvent,
  type FileServerExtension,
  type FileServerExtensionContext,
} from "../src/server.ts";
import {
  editRequest,
  expectNoEvent,
  nextEvent,
  openSocket,
  parseRawResponse,
  rawRequest,
  rawTcpRequest,
  refusedStatus,
} from "../src/conformance/helpers.ts";
import { makeRoot, startFileServer, type RunningFileServer } from "./helpers.ts";

// The memory tests compare heap sizes, which means little unless garbage is
// collected first. `--expose-gc` cannot be passed to the files `node --test`
// runs, so it is switched on here, where only this test process sees it.
setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

// ---------------------------------------------------------------------------
// The .gitignore rules the server relies on
// ---------------------------------------------------------------------------

test("node_modules/ and node_modules both hide every node_modules directory and everything inside it", async () => {
  for (const pattern of ["node_modules/", "node_modules"]) {
    const { baseUrl } = await startFileServer({
      "node_modules/a.js": "module",
      "pkg/node_modules/b/c.js": "module",
      "pkg/index.js": "source",
    }, { ignore: [pattern] });

    for (const path of ["node_modules", "node_modules/", "node_modules/a.js", "pkg/node_modules", "pkg/node_modules/b/c.js"]) {
      assert.equal((await fetch(`${baseUrl}/${path}`)).status, 404, `${pattern}: ${path}`);
    }
    assert.equal(await (await fetch(`${baseUrl}/pkg/index.js`)).text(), "source", pattern);
    assert.deepEqual(await listedNames(baseUrl, "/"), ["pkg"], pattern);
    assert.deepEqual(await listedNames(baseUrl, "/pkg/"), ["index.js"], pattern);
  }
});

test("a pattern ending in / matches only directories", async () => {
  const { baseUrl } = await startFileServer({
    "node_modules/a.js": "module",
    "notes/node_modules": "a file named node_modules",
  }, { ignore: ["node_modules/", "build/"] });

  assert.equal((await fetch(`${baseUrl}/node_modules`)).status, 404);
  assert.equal(await (await fetch(`${baseUrl}/notes/node_modules`)).text(), "a file named node_modules");
  assert.deepEqual(await listedNames(baseUrl, "/notes/"), ["node_modules"]);
  // A missing path is judged as a file, so PUT can create a file the pattern does not match...
  assert.equal((await fetch(`${baseUrl}/build`, { method: "PUT", body: "a file named build" })).status, 201);
  assert.equal(await (await fetch(`${baseUrl}/build`)).text(), "a file named build");
  // ...but not a file inside a directory the pattern would match.
  assert.equal((await fetch(`${baseUrl}/dist/build/out.js`, { method: "PUT", body: "out" })).status, 404);
});

test("a leading / anchors a pattern at the root", async () => {
  const { baseUrl } = await startFileServer({ "dist/a.js": "root dist", "src/dist/b.js": "nested dist" }, { ignore: ["/dist"] });

  assert.equal((await fetch(`${baseUrl}/dist`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/dist/a.js`)).status, 404);
  assert.equal(await (await fetch(`${baseUrl}/src/dist/b.js`)).text(), "nested dist");
  assert.deepEqual(await listedNames(baseUrl, "/"), ["src"]);
});

test("a pattern without a / matches at any depth", async () => {
  const { baseUrl } = await startFileServer({ "a.log": "log", "x/y/b.log": "log", "x/c.txt": "text" }, { ignore: ["*.log"] });

  assert.equal((await fetch(`${baseUrl}/a.log`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/x/y/b.log`)).status, 404);
  assert.equal(await (await fetch(`${baseUrl}/x/c.txt`)).text(), "text");
  assert.deepEqual(await listedNames(baseUrl, "/x/y/"), []);
});

test("! re-includes a path, except inside an ignored directory, as in git", async () => {
  const { baseUrl } = await startFileServer({
    "a.log": "log",
    "keep.log": "kept",
    "x/keep.log": "kept",
    "logs/keep.log": "inside an ignored directory",
  }, { ignore: ["*.log", "!keep.log", "logs/", "!logs/keep.log"] });

  assert.equal((await fetch(`${baseUrl}/a.log`)).status, 404);
  assert.equal(await (await fetch(`${baseUrl}/keep.log`)).text(), "kept");
  assert.equal(await (await fetch(`${baseUrl}/x/keep.log`)).text(), "kept");
  assert.equal((await fetch(`${baseUrl}/logs/keep.log`)).status, 404);
  assert.deepEqual(await listedNames(baseUrl, "/"), ["keep.log", "x"]);
});

test("matching ignores letter case", async () => {
  const { baseUrl } = await startFileServer({
    "NODE_MODULES/x.js": "module",
    "Pkg/Node_Modules/y.js": "module",
    "Pkg/index.js": "source",
  }, { ignore: ["node_modules/"] });

  assert.equal((await fetch(`${baseUrl}/NODE_MODULES/x.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/Pkg/Node_Modules`)).status, 404);
  assert.deepEqual(await listedNames(baseUrl, "/"), ["Pkg"]);
  assert.deepEqual(await listedNames(baseUrl, "/Pkg/"), ["index.js"]);
});

test("a directory a pattern re-includes stays visible when its name alone would be ignored", async () => {
  // `*` ignores every path and `!*/` re-includes directories, so only files are hidden.
  const { baseUrl } = await startFileServer({ "src/a.js": "source", "top.txt": "top" }, { ignore: ["*", "!*/"] });

  assert.deepEqual(await listedNames(baseUrl, "/"), ["src"]);
  assert.deepEqual(await listedNames(baseUrl, "/src"), []);
  assert.equal((await fetch(`${baseUrl}/src/a.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/top.txt`)).status, 404);
});

// ---------------------------------------------------------------------------
// Hidden on every surface
// ---------------------------------------------------------------------------

test("ignored files and directories are 404 for every method and are left untouched", async () => {
  const { baseUrl, root } = await startFileServer({
    "secret.txt": "secret",
    "node_modules/pkg/index.js": "module",
    "visible.txt": "visible",
  }, { ignore: ["secret.txt", "node_modules/"] });

  const hiddenPaths = ["/secret.txt", "/node_modules", "/node_modules/", "/node_modules/pkg/index.js", "/node_modules/pkg/new.js"];
  for (const path of hiddenPaths) {
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "POST"]) {
      const body = method === "PUT" ? Buffer.from("replaced") : undefined;
      assert.equal((await rawRequest(baseUrl, method, path, {}, body)).status, 404, `${method} ${path}`);
    }
    const edit = await editRequest(baseUrl, path, { old_string: "e", new_string: "E", replace_all: true });
    assert.equal(edit.status, 404, `PATCH ${path}`);
    assert.deepEqual(JSON.parse(edit.body.toString()), { error: "not found" });
    const connect = parseRawResponse(await rawTcpRequest(
      baseUrl,
      `CONNECT ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
    ));
    assert.equal(connect.status, 404, `CONNECT ${path}`);
  }

  assert.equal(await readFile(join(root, "secret.txt"), "utf8"), "secret");
  assert.equal(await readFile(join(root, "node_modules/pkg/index.js"), "utf8"), "module");
  await assert.rejects(stat(join(root, "node_modules/pkg/new.js")), { code: "ENOENT" });
  // The same edit document succeeds on a visible file, so the 404s above come from hiding alone.
  assert.equal((await editRequest(baseUrl, "/visible.txt", { old_string: "e", new_string: "E", replace_all: true })).status, 204);
});

test("an ignored path reached through a symbolic link is 404, because hiding precedes the link check", async () => {
  const { baseUrl, root } = await startFileServer({
    "real/node_modules/a.js": "module",
    "real/other.txt": "other",
  }, { ignore: ["node_modules/"] });
  await symlink(join(root, "real"), join(root, "link"));

  assert.equal((await fetch(`${baseUrl}/link/node_modules/a.js`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/link/other.txt`)).status, 403);
  // Whether `link/node_modules` is a directory is judged without following the
  // link, so it counts as no directory, `node_modules/` does not match, and the
  // link rule answers.
  assert.equal((await fetch(`${baseUrl}/link/node_modules`)).status, 403);
});

test("a link reveals nothing about what lies outside the root, even where a pattern matches only directories", async () => {
  const outside = await makeRoot({ "proj-a/node_modules/a.js": "module", "proj-b/readme.txt": "no node_modules" });
  const { baseUrl, root } = await startFileServer({}, { ignore: ["node_modules/"] });
  await symlink(outside, join(root, "link"));

  const statuses = [];
  for (const project of ["proj-a", "proj-b"]) statuses.push((await fetch(`${baseUrl}/link/${project}/node_modules`)).status);
  assert.deepEqual(statuses, [403, 403]);
});

test("a WebSocket upgrade on an ignored directory is refused like a hidden one", async (context) => {
  const { baseUrl } = await startFileServer({
    ".hidden/file.txt": "hidden",
    "node_modules/pkg/index.js": "module",
    "src/index.js": "source",
  }, { ignore: ["node_modules/"] });

  assert.equal(await refusedStatus(baseUrl, "/.hidden/"), 404);
  assert.equal(await refusedStatus(baseUrl, "/node_modules/"), 404);
  assert.equal(await refusedStatus(baseUrl, "/node_modules/pkg/"), 404);
  const socket = await openSocket(baseUrl, "/src/");
  context.after(() => socket.close());
});

test("ignored entries are absent from directory listings at every depth", async () => {
  const { baseUrl } = await startFileServer({
    "node_modules/a.js": "module",
    "pkg/node_modules/b.js": "module",
    "pkg/index.js": "source",
    "build.log": "log",
    "notes.txt": "notes",
  }, { ignore: ["node_modules/", "*.log"] });

  assert.deepEqual(await listedNames(baseUrl, "/"), ["notes.txt", "pkg"]);
  assert.deepEqual(await listedNames(baseUrl, "/pkg/"), ["index.js"]);
});

test("changes inside ignored paths produce no signals while visible changes still do", async (context) => {
  const { baseUrl, root } = await startFileServer({
    "node_modules/pkg/index.js": "module",
    "src/index.js": "source",
  }, { ignore: ["node_modules/", "*.log"] });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());

  await writeFile(join(root, "node_modules/pkg/index.js"), "changed");
  await writeFile(join(root, "node_modules/pkg/added.js"), "added");
  await rm(join(root, "node_modules/pkg/index.js"));
  await mkdir(join(root, "node_modules/fresh/deep"), { recursive: true });
  await writeFile(join(root, "node_modules/fresh/deep/file.js"), "fresh");
  await mkdir(join(root, "src/node_modules/nested"), { recursive: true });
  await writeFile(join(root, "src/node_modules/nested/file.js"), "nested");
  await writeFile(join(root, "debug.log"), "log");
  await expectNoEvent(socket, 300);

  const event = nextEvent(socket);
  await writeFile(join(root, "src/added.js"), "visible");
  assert.deepEqual(await event, { type: "created", path: "src/added.js" });

  await rm(join(root, "node_modules"), { recursive: true });
  await rm(join(root, "src/node_modules"), { recursive: true });
  await expectNoEvent(socket, 300);
});

test("a change reported for a path that is now a hidden directory is published as deleted", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ build: "a file named build" }, { ignore: ["build/"] });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());

  // A visible file becomes a directory that `build/` hides, so for a client the file is gone.
  const replaced = nextEvent(socket);
  await rm(join(root, "build"));
  await mkdir(join(root, "build"));
  await writeFile(join(root, "build/out.js"), "out");
  assert.deepEqual(await replaced, { type: "deleted", path: "build" });
  await expectNoEvent(socket);

  // The watcher on the old file can still report a change after the swap. The
  // server judges the path as it now is, a hidden directory, and never
  // publishes a change for it.
  const late = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("modified", join(root, "build"));
  assert.deepEqual(await late, { type: "deleted", path: "build" });
  await expectNoEvent(socket);
});

test("extension context operations hide ignored paths before any other rule", async (context) => {
  const root = await makeRoot({ "node_modules/pkg/index.js": "module", "visible.txt": "visible" });
  const operations = new Map<string, (value: FileServerExtensionContext) => Promise<unknown>>([
    ["inspect", (value) => value.inspect("node_modules/pkg/index.js")],
    ["inspect-directory", (value) => value.inspect("node_modules")],
    ["list", (value) => value.list("node_modules")],
    ["replace", (value) => value.replace("node_modules/pkg/new.js", new Uint8Array())],
    ["replace-slash", (value) => value.replace("node_modules/", new Uint8Array())],
    ["remove", (value) => value.remove("node_modules")],
    ["inspect-visible", (value) => value.inspect("visible.txt")],
  ]);
  const extension: FileServerExtension = {
    async handle(_request, response, requestContext) {
      const operation = operations.get(requestContext.path);
      if (operation === undefined) return false;
      await operation(requestContext);
      response.status(200).end();
      return true;
    },
  };
  const server = await new FileServer({ root, ignore: ["node_modules/"], extension }).listen({ port: 0 });
  context.after(() => server.close());

  for (const path of ["inspect", "inspect-directory", "list", "replace", "replace-slash", "remove"]) {
    assert.equal((await fetch(`${server.url}/${path}`)).status, 404, path);
  }
  assert.equal((await fetch(`${server.url}/inspect-visible`)).status, 200);
  assert.equal(await readFile(join(root, "node_modules/pkg/index.js"), "utf8"), "module");
  await assert.rejects(stat(join(root, "node_modules/pkg/new.js")), { code: "ENOENT" });
});

test("without ignore patterns nothing beyond dot-prefixed paths is hidden", async () => {
  const { baseUrl } = await startFileServer({ "node_modules/pkg/index.js": "module", ".env": "hidden" });
  assert.equal(await (await fetch(`${baseUrl}/node_modules/pkg/index.js`)).text(), "module");
  assert.deepEqual(await listedNames(baseUrl, "/"), ["node_modules"]);
});

// ---------------------------------------------------------------------------
// Never watched
// ---------------------------------------------------------------------------

test("the watcher never descends into ignored directories, including ones created later", async () => {
  const files: Record<string, string> = { "src/index.js": "source" };
  for (let index = 0; index < 50; index += 1) {
    files[`node_modules/pkg-${index}/lib/index.js`] = "module";
    files[`src/node_modules/pkg-${index}/index.js`] = "module";
  }
  const control = await startFileServer(files);
  const ignoring = await startFileServer(files, { ignore: ["node_modules/"] });

  // Without the pattern the same tree is watched all the way down, so the probe below can see descent.
  const controlWatched = watchedPaths(control);
  assert(controlWatched.includes("node_modules/pkg-49/lib/index.js"));
  assert(controlWatched.includes("src/node_modules/pkg-0/index.js"));

  assert.deepEqual(watchedPaths(ignoring), ["src", "src/index.js"]);
  await mkdir(join(ignoring.root, "src/node_modules/late/deep"), { recursive: true });
  await writeFile(join(ignoring.root, "src/node_modules/late/deep/file.js"), "late");
  await mkdir(join(ignoring.root, "node_modules/late"), { recursive: true });
  await delay(300);
  assert.deepEqual(watchedPaths(ignoring), ["src", "src/index.js"]);
});

test("the watcher skips ignored directories created or renamed under a watched parent", async () => {
  const running = await startFileServer({ "src/index.js": "source", "app/lib/util.js": "util" }, { ignore: ["node_modules/"] });
  assert.deepEqual(watchedPaths(running), ["app", "app/lib", "app/lib/util.js", "src", "src/index.js"]);

  await mkdir(join(running.root, "src/newpkg/node_modules/a/b"), { recursive: true });
  await writeFile(join(running.root, "src/newpkg/node_modules/a/b/c.js"), "new");
  await rename(join(running.root, "app/lib"), join(running.root, "app/node_modules"));

  // The watcher picks up the new package directory and drops the renamed one,
  // which shows it saw both changes, and holds nothing inside either node_modules.
  await waitForWatchedPaths(running, ["app", "src", "src/index.js", "src/newpkg"]);
});

// ---------------------------------------------------------------------------
// Long request paths
// ---------------------------------------------------------------------------

test("a long request path that almost matches a pattern delays neither itself nor other requests", async () => {
  const cases: Array<[pattern: string, path: string]> = [
    ["*-*-*.log", `/${"-".repeat(4_000)}`],
    ["*a*a*a*a*a*a*a*a*a*a*a*a*b", `/${"a".repeat(60)}`],
  ];
  for (const [pattern, longPath] of cases) {
    const files = { "small.txt": "small" };
    const control = await startFileServer(files);
    const ignoring = await startFileServer(files, { ignore: [pattern] });
    const expected = await rawRequest(control.baseUrl, "GET", longPath);

    const started = performance.now();
    const timed = async (request: Promise<{ status: number }>): Promise<{ status: number; elapsedMs: number }> => {
      const { status } = await request;
      return { status, elapsedMs: performance.now() - started };
    };
    const [long, small] = await Promise.all([
      timed(rawRequest(ignoring.baseUrl, "GET", longPath)),
      timed(rawRequest(ignoring.baseUrl, "GET", "/small.txt")),
    ]);
    // The path matches no pattern, so it gets exactly the answer it gets from a server without patterns.
    assert.equal(long.status, expected.status, pattern);
    assert.equal(small.status, 200, pattern);
    assert(long.elapsedMs < 1_000, `${pattern}: the long request took ${long.elapsedMs.toFixed(0)} ms`);
    assert(small.elapsedMs < 1_000, `${pattern}: the unrelated request took ${small.elapsedMs.toFixed(0)} ms`);
  }
});

// ---------------------------------------------------------------------------
// Bounded memory
// ---------------------------------------------------------------------------

test("unique deep request paths neither grow the heap nor slow the answers", async () => {
  const patterns = ["node_modules/", "*.log", "/dist", "build/", "*.tmp", "coverage/", "!keep.log", "cache/"];
  const { baseUrl } = await startFileServer({}, { ignore: patterns });
  const deepPath = (request: number): string => `/${Array.from({ length: 500 }, (_, index) => `r${request}s${index}`).join("/")}`;
  assert.equal((await rawRequest(baseUrl, "GET", deepPath(-1))).status, 404);

  collectGarbage();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (let request = 0; request < 100; request += 1) {
    assert.equal((await rawRequest(baseUrl, "GET", deepPath(request))).status, 404);
  }
  const elapsedMs = performance.now() - started;
  collectGarbage();
  const growthMb = (process.memoryUsage().heapUsed - heapBefore) / 1_048_576;

  // Remembering every checked path and its parents grew the heap by about
  // 95 MB for these requests; checked on their own, they leave almost nothing.
  assert(growthMb < 16, `the heap grew by ${growthMb.toFixed(1)} MB`);
  assert(elapsedMs < 5_000, `100 requests took ${elapsedMs.toFixed(0)} ms`);
});

test("the matcher for paths found on disk is rebuilt after a fixed number of checks, so its cache stays bounded", () => {
  const patterns = new IgnorePatterns(["node_modules/", "*.log"]);
  const internals = patterns as unknown as { cachedMatcher: object };
  const diskPath = (index: number): string => `tool-output/run-${index}/a/b/c/d/e/f/file-${index}.txt`;

  const firstMatcher = internals.cachedMatcher;
  for (let index = 0; index < cachedChecksLimit; index += 1) patterns.hides(diskPath(index), false);
  assert.equal(internals.cachedMatcher, firstMatcher);
  assert.equal(patterns.hides("logs/app.log", false), true);
  assert.notEqual(internals.cachedMatcher, firstMatcher);
  assert.equal(patterns.hides("src/node_modules", true), true);
  assert.equal(patterns.hides("src/node_modules", false), false);

  // Ten times the limit in unique paths, as tools that keep creating uniquely
  // named files would produce. An unbounded cache grew by over 100 MB here.
  collectGarbage();
  const heapBefore = process.memoryUsage().heapUsed;
  for (let index = 0; index < 10 * cachedChecksLimit; index += 1) patterns.hides(diskPath(index), false);
  collectGarbage();
  const growthMb = (process.memoryUsage().heapUsed - heapBefore) / 1_048_576;
  assert(growthMb < 32, `the heap grew by ${growthMb.toFixed(1)} MB`);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function listedNames(baseUrl: string, path: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, path);
  const listing = await response.json() as { entries: Array<{ name: string }> };
  return listing.entries.map(({ name }) => name);
}

/** Waits until the watcher holds exactly the expected paths, then asserts it does. */
async function waitForWatchedPaths(running: RunningFileServer, expected: readonly string[]): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (JSON.stringify(watchedPaths(running)) === JSON.stringify(expected)) break;
    await delay(50);
  }
  assert.deepEqual(watchedPaths(running), expected);
}

/** Every file and directory the running server's watcher holds, as sorted root-relative paths. */
function watchedPaths({ fileServer, root }: RunningFileServer): string[] {
  const { watcher } = fileServer as unknown as { watcher: FSWatcher };
  const watchedRoot = realpathSync(root);
  const paths: string[] = [];
  for (const [directory, names] of Object.entries(watcher.getWatched())) {
    for (const name of names) {
      const pathFromRoot = relative(watchedRoot, join(directory, name));
      if (pathFromRoot !== "" && !pathFromRoot.startsWith("..")) paths.push(pathFromRoot.split(sep).join("/"));
    }
  }
  return paths.sort();
}
