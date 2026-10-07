import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { WebSocket } from "ws";

const cliPath = join(process.cwd(), "dist/src/cli.js");
const version = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
const usage = `Usage: file-server [path] [options]

Serve a live directory over HTTP and WebSocket: read, list, write, edit, delete.

  path         directory to serve (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 8765, or the next free port up to 8864; 0 for any free port)
  --ignore     hide paths matching a .gitignore pattern; repeatable (added to the config's ignore list)
  --help       show this help
  --version    print the version
`;

type CliResult = { code: number | null; stdout: string; stderr: string };

// The CLI reads ~/.config/file-server/config.json, so every run gets an empty home
// of its own unless a test supplies one: the developer's real config must not
// change what these tests see.
const isolatedHome = await mkdtemp(join(tmpdir(), "file-server-cli-isolated-home-"));
const isolatedEnvironment = { ...process.env, HOME: isolatedHome };
after(() => rm(isolatedHome, { recursive: true, force: true }));

async function runCli(args: string[], cwd = process.cwd(), env: NodeJS.ProcessEnv = isolatedEnvironment): Promise<CliResult> {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, env: withoutForcedColor(env), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolveExit) => child.once("exit", resolveExit));
  return { code, stdout, stderr };
}

async function startCli(args: string[], cwd = process.cwd(), env: NodeJS.ProcessEnv = isolatedEnvironment): Promise<{
  child: ChildProcessWithoutNullStreams;
  output: string;
  baseUrl: string;
}> {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, env: withoutForcedColor(env), stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const output = await new Promise<string>((resolveOutput, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`CLI did not start; stderr: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (/^url:    http:\/\//m.test(stdout)) {
        clearTimeout(timer);
        resolveOutput(stdout);
      }
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited ${code}; stderr: ${stderr}`));
    });
  });
  const match = output.match(/^url:    (http:\/\/[^\s]+)$/m);
  assert(match?.[1]);
  return { child, output, baseUrl: match[1] };
}

async function stopCli(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals = "SIGTERM"): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  child.kill(signal);
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}

test("built CLI starts on port 0, round-trips every method, and exits cleanly on SIGTERM", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-"));
  await writeFile(join(root, "hello.txt"), "round trip");
  const { child, output, baseUrl } = await startCli([root, "--port", "0"]);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });

  assert.match(output, new RegExp(`^file-server ${version}\\nroot:   ${escapeRegExp(resolve(root))}\\nurl:    http:\\/\\/127\\.0\\.0\\.1:\\d+\\n$`));
  assert.doesNotMatch(output, /\x1b\[/);
  assert.equal(await (await fetch(`${baseUrl}/hello.txt`)).text(), "round trip");
  const head = await fetch(`${baseUrl}/hello.txt`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal(await head.text(), "");
  const options = await fetch(`${baseUrl}/hello.txt`, { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-methods"), "GET, HEAD, PUT, PATCH, DELETE, OPTIONS");
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/`);
  await new Promise<void>((resolveOpen, reject) => {
    socket.once("open", resolveOpen);
    socket.once("error", reject);
  });
  context.after(() => socket.close());
  const changed = new Promise<{ type: string; path: string }>((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error("CLI WebSocket did not publish a change")), 3_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolveEvent(JSON.parse(data.toString()) as { type: string; path: string });
    });
  });
  const put = await fetch(`${baseUrl}/hello.txt`, { method: "PUT", body: "replacement" });
  assert.equal(put.status, 204);
  assert.deepEqual(await changed, { type: "modified", path: "hello.txt" });
  assert.equal(await (await fetch(`${baseUrl}/hello.txt`)).text(), "replacement");
  const patch = await fetch(`${baseUrl}/hello.txt`, {
    method: "PATCH",
    headers: { "content-type": "application/vnd.telepath.edit+json" },
    body: JSON.stringify({ old_string: "replace", new_string: "edit" }),
  });
  assert.equal(patch.status, 204);
  assert.equal(await (await fetch(`${baseUrl}/hello.txt`)).text(), "editment");
  const deleted = await fetch(`${baseUrl}/hello.txt`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal((await fetch(`${baseUrl}/hello.txt`)).status, 404);
  assert.equal(await stopCli(child), 0);
});

test("CLI defaults to the current directory and resolves a symlinked root for output", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-real-"));
  const link = `${root}-link`;
  await symlink(root, link);
  const current = await startCli(["--port", "0"], root);
  const linked = await startCli([link, "--port", "0"], process.cwd());
  context.after(async () => {
    await Promise.all([stopCli(current.child), stopCli(linked.child)]);
    await rm(link, { force: true });
    await rm(root, { recursive: true, force: true });
  });
  assert.match(current.output, new RegExp(`^root:   ${escapeRegExp(resolve(root))}$`, "m"));
  assert.match(linked.output, new RegExp(`^root:   ${escapeRegExp(resolve(root))}$`, "m"));
});

test("CLI expands only a leading bare or slash-followed tilde", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "file-server-cli-home-"));
  const nested = join(home, "served");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(nested));
  const bare = await startCli(["~", "--port", "0"], process.cwd(), { ...process.env, HOME: home });
  const slash = await startCli(["~/served", "--port", "0"], process.cwd(), { ...process.env, HOME: home });
  context.after(async () => {
    await Promise.all([stopCli(bare.child), stopCli(slash.child)]);
    await rm(home, { recursive: true, force: true });
  });
  assert.match(bare.output, new RegExp(`^root:   ${escapeRegExp(home)}$`, "m"));
  assert.match(slash.output, new RegExp(`^root:   ${escapeRegExp(nested)}$`, "m"));

  const literal = await runCli(["~someone", "--port", "0"], home, { ...process.env, HOME: home });
  assert.equal(literal.code, 1);
  assert.match(literal.stderr, new RegExp(`${escapeRegExp(join(home, "~someone"))} is not a directory`));
});

test("CLI prints help and the bare version to stdout", async () => {
  assert.deepEqual(await runCli(["--help"]), { code: 0, stderr: "", stdout: usage });
  assert.deepEqual(await runCli(["--version"]), { code: 0, stderr: "", stdout: `${version}\n` });
});

test("CLI prints help and the version without reading the config", async (context) => {
  const home = await homeWithConfig("{");
  context.after(() => rm(home, { recursive: true, force: true }));
  const environment = { ...process.env, HOME: home };
  assert.deepEqual(await runCli(["--help"], process.cwd(), environment), { code: 0, stderr: "", stdout: usage });
  assert.deepEqual(await runCli(["--version"], process.cwd(), environment), { code: 0, stderr: "", stdout: `${version}\n` });
});

test("CLI rejects invalid flags, values, hosts, ports, and extra positional paths", async () => {
  const invalid = [
    ["--host"], ["--host", ""], ["--port"], ["--port", "-1"], ["--port", "65536"],
    ["--port", "1.5"], ["--port", "1e2"], ["--port", "+1"], ["--port", "nope"],
    ["--ignore"], ["--ignore", ""],
  ];
  for (const args of invalid) {
    const result = await runCli(args);
    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^file-server: .+\n$/);
  }

  assert.deepEqual(await runCli(["--unknown"]), {
    code: 1,
    stdout: "",
    stderr: `file-server: unknown argument --unknown\n${usage}`,
  });
  const extra = await runCli(["one", "two"]);
  assert.equal(extra.code, 1);
  assert.match(extra.stderr, /^file-server: unknown argument two\nUsage: file-server/);
});

test("CLI reports missing roots and occupied explicit ports without a stack trace", async () => {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-error-"));
  const missing = join(root, "missing");
  assert.deepEqual(await runCli([missing, "--port", "0"]), {
    code: 1,
    stdout: "",
    stderr: `file-server: ${missing} is not a directory\n`,
  });

  const occupied = createServer();
  await new Promise<void>((resolveListen) => occupied.listen(0, "127.0.0.1", resolveListen));
  const address = occupied.address();
  assert(address && typeof address === "object");
  try {
    assert.deepEqual(await runCli([root, "--port", String(address.port)]), {
      code: 1,
      stdout: "",
      stderr: `file-server: port ${address.port} is already in use\n`,
    });
  } finally {
    await new Promise<void>((resolveClose) => occupied.close(() => resolveClose()));
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI hides the config's ignore patterns and every --ignore flag's pattern", async (context) => {
  const home = await homeWithConfig(JSON.stringify({ ignore: ["node_modules/"] }));
  const root = await rootWithFiles({
    "node_modules/a.js": "module",
    "pkg/node_modules/b.js": "module",
    "pkg/index.js": "source",
    "build.log": "log",
    "secret.txt": "secret",
    "notes.txt": "notes",
  });
  const { child, baseUrl } = await startCli([root, "--port", "0", "--ignore", "*.log", "--ignore", "secret.txt"], process.cwd(), {
    ...process.env,
    HOME: home,
  });
  context.after(async () => {
    await stopCli(child);
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  for (const path of ["/node_modules/a.js", "/pkg/node_modules/b.js", "/build.log", "/secret.txt"]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, path);
  }
  assert.equal(await (await fetch(`${baseUrl}/notes.txt`)).text(), "notes");
  assert.deepEqual(await listedNames(baseUrl, "/"), ["notes.txt", "pkg"]);
  assert.deepEqual(await listedNames(baseUrl, "/pkg/"), ["index.js"]);

  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/`);
  await new Promise<void>((resolveOpen, reject) => {
    socket.once("open", resolveOpen);
    socket.once("error", reject);
  });
  context.after(() => socket.close());
  const firstSignal = new Promise<unknown>((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error("CLI WebSocket did not publish a change")), 3_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolveEvent(JSON.parse(data.toString()));
    });
  });
  await writeFile(join(root, "pkg/node_modules/b.js"), "changed");
  await writeFile(join(root, "build.log"), "more");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  await writeFile(join(root, "notes.txt"), "changed");
  assert.deepEqual(await firstSignal, { type: "modified", path: "notes.txt" });
});

test("CLI ignores nothing without patterns, and --ignore works without a config", async (context) => {
  const root = await rootWithFiles({ "node_modules/a.js": "module", "notes.txt": "notes" });
  const emptyConfigHome = await homeWithConfig("{}");
  const emptyListHome = await homeWithConfig(JSON.stringify({ ignore: [] }));
  context.after(async () => {
    await Promise.all([emptyConfigHome, emptyListHome, root].map((path) => rm(path, { recursive: true, force: true })));
  });

  for (const home of [isolatedHome, emptyConfigHome, emptyListHome]) {
    await withCli([root, "--port", "0"], { ...process.env, HOME: home }, async (baseUrl) => {
      assert.equal(await (await fetch(`${baseUrl}/node_modules/a.js`)).text(), "module", home);
      assert.deepEqual(await listedNames(baseUrl, "/"), ["node_modules", "notes.txt"], home);
    });
  }
  await withCli([root, "--port", "0", "--ignore", "node_modules/"], isolatedEnvironment, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/node_modules/a.js`)).status, 404);
    assert.deepEqual(await listedNames(baseUrl, "/"), ["notes.txt"]);
  });
});

test("CLI refuses an unreadable, malformed, or misshapen config, naming the file", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-config-root-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const contents = [
    "{",
    "",
    "null",
    "[]",
    "\"node_modules\"",
    JSON.stringify({ ignore: "node_modules" }),
    JSON.stringify({ ignore: [1] }),
    JSON.stringify({ ignore: ["node_modules", null] }),
    JSON.stringify({ ignore: { pattern: "node_modules" } }),
    JSON.stringify({ ignored: ["node_modules"] }),
    JSON.stringify({ ignore: [], port: 8000 }),
  ];
  for (const content of contents) {
    const home = await homeWithConfig(content);
    try {
      const result = await runCli([root, "--port", "0", "--ignore", "extra"], process.cwd(), { ...process.env, HOME: home });
      assert.equal(result.code, 1, content);
      assert.equal(result.stdout, "", content);
      assert.match(result.stderr, new RegExp(`^file-server: .*${escapeRegExp(configPathIn(home))}.*\\n$`), content);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }

  const unreadableHome = await mkdtemp(join(tmpdir(), "file-server-cli-config-home-"));
  context.after(() => rm(unreadableHome, { recursive: true, force: true }));
  await mkdir(configPathIn(unreadableHome), { recursive: true });
  const unreadable = await runCli([root, "--port", "0"], process.cwd(), { ...process.env, HOME: unreadableHome });
  assert.equal(unreadable.code, 1);
  assert.equal(unreadable.stdout, "");
  assert.match(unreadable.stderr, new RegExp(`^file-server: .*${escapeRegExp(configPathIn(unreadableHome))}.*\\n$`));
});

/** Runs the CLI for the duration of one check, stopping it whether or not the check passes. */
async function withCli(args: string[], env: NodeJS.ProcessEnv, check: (baseUrl: string) => Promise<void>): Promise<void> {
  const { child, baseUrl } = await startCli(args, process.cwd(), env);
  try {
    await check(baseUrl);
  } finally {
    await stopCli(child);
  }
}

async function listedNames(baseUrl: string, path: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, path);
  const listing = await response.json() as { entries: Array<{ name: string }> };
  return listing.entries.map(({ name }) => name);
}

async function rootWithFiles(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-ignore-"));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function homeWithConfig(contents: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "file-server-cli-config-home-"));
  await mkdir(dirname(configPathIn(home)), { recursive: true });
  await writeFile(configPathIn(home), contents);
  return home;
}

function configPathIn(home: string): string {
  return join(home, ".config", "file-server", "config.json");
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function withoutForcedColor(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { FORCE_COLOR: _forcedColor, ...rest } = environment;
  return rest;
}
