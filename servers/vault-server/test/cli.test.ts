import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const cliPath = join(process.cwd(), "dist/src/cli.js");
const version = (JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string }).version;
const usage = `Usage: vault-server [path] [options]

Serve a live vault as files and structured markdown records.

  path         vault root (default: current directory)
  --host       bind address (default: 127.0.0.1)
  --port       port (default: 4747, or the next free port up to 4846; 0 for any free port)
  --help       show this help
  --version    print the version
`;

async function runCli(
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  const child = spawn(process.execPath, [cliPath, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolveExit) => child.once("exit", resolveExit));
  return { code, stderr, stdout };
}

async function startCli(
  args: string[],
  cwd = process.cwd(),
  executable = cliPath,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ child: ChildProcessWithoutNullStreams; output: string }> {
  const child = spawn(process.execPath, [executable, ...args], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const output = await new Promise<string>((resolveOutput, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI did not start; stderr: ${stderr}`));
    }, 15_000);
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.includes("\nurl:    ")) { clearTimeout(timer); resolveOutput(stdout); }
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`CLI exited ${code}; stderr: ${stderr}`)); });
  });
  return { child, output };
}

async function stopCli(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
}

test("CLI serves its current working directory by default", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-"));
  await writeFile(join(root, "note.md"), "note");
  const { child, output } = await startCli(["--port", "0"], root);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });
  assert.match(output, new RegExp(`^vault-server ${version}\\nvault:  ${escapeRegExp(resolve(root))} \\(1 records\\)\\nurl:    http:\\/\\/127\\.0\\.0\\.1:\\d+\\n$`));
  assert.doesNotMatch(output, /\x1b\[/);
});

test("CLI accepts a positional vault path plus --host and --port", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-"));
  const { child, output } = await startCli([root, "--host", "127.0.0.1", "--port", "0"]);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });
  assert.match(output, new RegExp(`vault:  ${escapeRegExp(resolve(root))} \\(0 records\\)`));
  assert.match(output, /url:    http:\/\/127\.0\.0\.1:\d+/);
});

test("CLI formats record counts with thousands separators", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-"));
  await Promise.all(Array.from({ length: 1_001 }, (_, index) => writeFile(join(root, `${index}.md`), "")));
  await writeFile(join(root, "asset.txt"), "not a markdown file");
  const { child, output } = await startCli([root, "--port", "0"]);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });
  assert.match(output, /\(1,001 records\)/);
});

test("CLI prints help and version to stdout", async () => {
  assert.deepEqual(await runCli(["--help"]), { code: 0, stderr: "", stdout: usage });
  assert.deepEqual(await runCli(["--version"]), { code: 0, stderr: "", stdout: `${version}\n` });
});

test("CLI rejects missing flag values and invalid ports", async () => {
  for (const args of [["--host"], ["--port"], ["--port", "nope"], ["--port", "-1"], ["--port", "65536"], ["--port", "1.5"]]) {
    const result = await runCli(args);
    assert.equal(result.code, 1, `expected ${args.join(" ")} to fail`);
    assert.match(result.stderr, /^vault-server: .+\n$/);
  }
});

test("CLI accepts only decimal digits for ports", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-invalid-port-"));
  const missing = join(root, "missing");
  try {
    for (const value of ["1e2", "+1"]) {
      assert.deepEqual(await runCli([missing, "--port", value]), {
        code: 1,
        stdout: "",
        stderr: "vault-server: port must be a decimal integer from 0 to 65535\n",
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI prints usage for unknown arguments and rejects a second positional", async () => {
  const unknown = await runCli(["--foo"]);
  assert.deepEqual(unknown, { code: 1, stdout: "", stderr: `vault-server: unknown argument --foo\n${usage}` });
  const extra = await runCli(["one", "two"]);
  assert.equal(extra.code, 1);
  assert.equal(extra.stdout, "");
  assert.match(extra.stderr, /^vault-server: unknown argument two\nUsage: vault-server/);
});

test("CLI reports an occupied explicit port without a stack trace", async () => {
  const listener = createServer();
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-occupied-"));
  await new Promise<void>((resolveListen) => listener.listen(0, "127.0.0.1", resolveListen));
  const address = listener.address();
  assert(address && typeof address === "object");
  try {
    const result = await runCli(["--port", String(address.port)], root);
    assert.deepEqual(result, { code: 1, stdout: "", stderr: `vault-server: port ${address.port} is already in use\n` });
  } finally {
    await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI runs when invoked through a bin-style symlink", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-"));
  const shim = join(root, "vault-server-shim");
  await symlink(cliPath, shim);
  const { child, output } = await startCli([root, "--port", "0"], root, shim);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });
  assert.match(output, new RegExp(`^vault-server ${version.replaceAll(".", "\\.")}`, "m"));
});

test("CLI resolves a symlinked vault root for indexing and the banner", async (context) => {
  const real = await mkdtemp(join(tmpdir(), "vault-server-cli-real-"));
  await writeFile(join(real, "note.md"), "note");
  const link = `${real}-link`;
  await symlink(real, link);
  const { child, output } = await startCli([link, "--port", "0"], real);
  context.after(async () => {
    await stopCli(child);
    await rm(link, { force: true });
    await rm(real, { recursive: true, force: true });
  });
  assert.match(output, new RegExp(`^vault:  ${escapeRegExp(real)} \\(1 records\\)$`, "m"));
});

test("CLI expands only a leading bare or slash-followed tilde", async (context) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "vault-server-cli-home-"));
  const nested = join(homeDirectory, "served");
  await mkdir(nested);
  const environment = { ...process.env, HOME: homeDirectory };
  const bare = await startCli(["~", "--port", "0"], process.cwd(), cliPath, environment);
  const slash = await startCli(["~/served", "--port", "0"], process.cwd(), cliPath, environment);
  context.after(async () => {
    await Promise.all([stopCli(bare.child), stopCli(slash.child)]);
    await rm(homeDirectory, { recursive: true, force: true });
  });
  assert.match(bare.output, new RegExp(`^vault:  ${escapeRegExp(homeDirectory)} \\(0 records\\)$`, "m"));
  assert.match(slash.output, new RegExp(`^vault:  ${escapeRegExp(nested)} \\(0 records\\)$`, "m"));

  const literal = await runCli(["~someone", "--port", "0"], homeDirectory, environment);
  assert.equal(literal.code, 1);
  assert.match(literal.stderr, new RegExp(`${escapeRegExp(join(homeDirectory, "~someone"))} is not a directory`));
});

test("CLI banner uses the server URL so IPv6 hosts are bracketed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-ipv6-"));
  const { child, output } = await startCli([root, "--host", "::1", "--port", "0"]);
  context.after(async () => { await stopCli(child); await rm(root, { recursive: true, force: true }); });
  assert.match(output, /^url:    http:\/\/\[::1\]:\d+$/m);
});

test("CLI reports a missing or non-directory vault root", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-"));
  const file = join(root, "file.md");
  const missing = join(root, "missing");
  await writeFile(file, "text");
  try {
    assert.deepEqual(await runCli([missing, "--port", "0"]), { code: 1, stdout: "", stderr: `vault-server: ${missing} is not a directory\n` });
    assert.deepEqual(await runCli([file, "--port", "0"]), { code: 1, stdout: "", stderr: `vault-server: ${file} is not a directory\n` });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
