import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { VaultServer } from "../src/server.ts";

const cliPath = join(process.cwd(), "dist/src/cli.js");

test("concurrent default listeners claim distinct ports in the vault range", async (context) => {
  const firstRoot = await mkdtemp(join(tmpdir(), "vault-server-api-port-first-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "vault-server-api-port-second-"));
  const first = new VaultServer({ root: firstRoot });
  const second = new VaultServer({ root: secondRoot });
  context.after(async () => {
    await Promise.all([first.close(), second.close()]);
    await Promise.all([firstRoot, secondRoot].map((root) => rm(root, { recursive: true, force: true })));
  });

  await Promise.all([first.ready, second.ready]);
  await Promise.all([first.listen({ host: "127.0.0.2" }), second.listen({ host: "127.0.0.2" })]);
  assert.notEqual(first.port, second.port);
  for (const port of [first.port, second.port]) {
    assert(port !== undefined && port >= 4747 && port <= 4846, `${port} is in the vault default range`);
  }
});

test("an explicit occupied port is attempted once instead of scanning the default range", async (context) => {
  const host = "127.0.0.3";
  const root = await mkdtemp(join(tmpdir(), "vault-server-explicit-port-"));
  let occupied: Server | undefined;
  let vault: VaultServer | undefined;
  context.after(async () => {
    await vault?.close();
    if (occupied !== undefined) await new Promise<void>((resolve) => occupied?.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const held = await occupyPort(0, host);
  assert(held !== undefined);
  occupied = held;
  const port = held.address();
  assert(port && typeof port === "object");
  vault = new VaultServer({ root });

  await assert.rejects(
    vault.listen({ host, port: port.port }),
    (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE",
  );
  assert.equal(vault.port, undefined);
});

test("the default range includes port 4846 and reports exhaustion after 100 ports", async (context) => {
  const host = "127.0.0.2";
  const root = await mkdtemp(join(tmpdir(), "vault-server-port-range-"));
  const held: Server[] = [];
  let vault: VaultServer | undefined;
  context.after(async () => {
    await vault?.close();
    await Promise.all(held.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await rm(root, { recursive: true, force: true });
  });

  for (let port = 4747; port < 4846; port += 1) {
    const server = await occupyPort(port, host);
    assert.notEqual(server, undefined, `test host port ${port} must begin free`);
    held.push(server as Server);
  }
  vault = new VaultServer({ root });
  await vault.listen({ host });
  assert.equal(vault.port, 4846, "the hundredth port is part of the range");
  await vault.close();

  const ceiling = await occupyPort(4846, host);
  assert.notEqual(ceiling, undefined, "the ceiling must be reusable after close");
  held.push(ceiling as Server);
  vault = new VaultServer({ root });
  await assert.rejects(
    vault.listen({ host }),
    (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE"
      && error.message === "ports 4747-4846 are already in use",
  );
});

test("CLI uses the next default port for a second instance", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-cli-port-"));
  let first: Awaited<ReturnType<typeof startCli>> | undefined;
  let second: Awaited<ReturnType<typeof startCli>> | undefined;
  context.after(async () => {
    await Promise.all([first, second].map((instance) => instance === undefined ? Promise.resolve() : stopCli(instance.child)));
    await rm(root, { recursive: true, force: true });
  });
  first = await startCli(root);
  const firstPort = Number(first.output.match(/^url:    http:\/\/127\.0\.0\.1:(\d+)$/m)?.[1]);
  const expectedSecondPort = await nextFreePort(firstPort + 1);
  second = await startCli(root);

  assert.equal(second.output.match(/^url:    http:\/\/127\.0\.0\.1:(\d+)$/m)?.[1], String(expectedSecondPort));
});

async function nextFreePort(from: number): Promise<number> {
  for (let port = from; ; port += 1) {
    const held = await occupyPort(port);
    if (held !== undefined) {
      await new Promise<void>((resolve) => held.close(() => resolve()));
      return port;
    }
  }
}

async function occupyPort(port: number, host = "127.0.0.1"): Promise<Server | undefined> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE" ? resolve(undefined) : reject(error));
    server.listen(port, host, () => resolve(server));
  });
}

async function startCli(cwd: string): Promise<{ child: ChildProcessWithoutNullStreams; output: string }> {
  const child = spawn(process.execPath, [cliPath], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => reject(new Error(`CLI did not start; stderr: ${stderr}`)), 5_000);
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.includes("\nurl:    ")) { clearTimeout(timer); resolve(stdout); }
      });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`CLI exited ${code}; stderr: ${stderr}`));
      });
    });
    return { child, output };
  } catch (error) {
    await stopCli(child);
    throw error;
  }
}

async function stopCli(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
}
