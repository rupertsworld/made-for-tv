import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { FileServer } from "../src/server.ts";

const cliPath = join(process.cwd(), "dist/src/cli.js");
// The CLI reads ~/.config/file-server/config.json; an empty home keeps the
// developer's real config out of these runs.
const isolatedHome = await mkdtemp(join(tmpdir(), "file-server-ports-home-"));
after(() => rm(isolatedHome, { recursive: true, force: true }));

test("omitting defaultPort starts the fixed range at 8765", async (context) => {
  const host = "127.0.0.3";
  const root = await mkdtemp(join(tmpdir(), "file-server-default-base-"));
  const fileServer = new FileServer({ root });
  context.after(async () => {
    await fileServer.close();
    await rm(root, { recursive: true, force: true });
  });
  const available = await occupyHostPort(8765, host);
  assert(available !== undefined, "test host port 8765 must begin free");
  await closeServers([available]);

  await fileServer.listen({ host });
  assert.equal(fileServer.port, 8765);
});

test("listen without a port uses the first free port after an occupied default", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "file-server-api-port-"));
  const occupied = await occupyPort(8765);
  const expectedPort = await firstAvailablePort(8766, 8864);
  const fileServer = new FileServer({ root });
  context.after(async () => {
    await fileServer.close();
    if (occupied !== undefined) await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  await fileServer.listen();
  assert.equal(fileServer.port, expectedPort);
});

test("concurrent servers bind distinct ports from the configured default range", async (context) => {
  const host = "127.0.0.2";
  const root = await mkdtemp(join(tmpdir(), "file-server-concurrent-port-"));
  const reserved = await occupyContiguousRange(2, host);
  await closeServers(reserved.servers);
  const first = new FileServer({ root, defaultPort: reserved.base });
  const second = new FileServer({ root, defaultPort: reserved.base });
  context.after(async () => {
    await Promise.all([first.close(), second.close()]);
    await rm(root, { recursive: true, force: true });
  });

  await Promise.all([first.listen({ host }), second.listen({ host })]);
  assert.deepEqual([first.port, second.port].sort(), [reserved.base, reserved.base + 1]);
});

test("an explicit occupied port is one-shot even with a configured default", async (context) => {
  const host = "127.0.0.2";
  const root = await mkdtemp(join(tmpdir(), "file-server-explicit-port-"));
  const reserved = await occupyContiguousRange(1, host);
  const fileServer = new FileServer({ root, defaultPort: reserved.base + 1 });
  context.after(async () => {
    await fileServer.close();
    await closeServers(reserved.servers);
    await rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    fileServer.listen({ host, port: reserved.base }),
    (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE",
  );
  assert.equal(fileServer.port, undefined);
});

test("configured default-port exhaustion reports the complete 100-port range", async (context) => {
  const host = "127.0.0.2";
  const root = await mkdtemp(join(tmpdir(), "file-server-exhausted-ports-"));
  const reserved = await occupyContiguousRange(100, host);
  const fileServer = new FileServer({ root, defaultPort: reserved.base });
  await fileServer.ready;
  const watcher = (fileServer as unknown as {
    watcher?: { getWatched(): Record<string, string[]> };
  }).watcher;
  assert(watcher !== undefined);
  context.after(async () => {
    await fileServer.close();
    await closeServers(reserved.servers);
    await rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    fileServer.listen({ host }),
    (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE"
      && error.message === `ports ${reserved.base}-${reserved.base + 99} are already in use`,
  );
  assert.equal(fileServer.port, undefined);
  assert.deepEqual(watcher.getWatched(), {}, "a failed implicit listen tears down the watcher before rejecting");
  await assert.rejects(fileServer.listen({ port: 0 }), /new instance/i);
});

test("CLI uses the next default port for a second instance", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "file-server-cli-port-"));
  let first: Awaited<ReturnType<typeof startCli>> | undefined;
  let second: Awaited<ReturnType<typeof startCli>> | undefined;
  context.after(async () => {
    await Promise.all([first, second].map((instance) => instance === undefined ? Promise.resolve() : stopCli(instance.child)));
    await rm(root, { recursive: true, force: true });
  });
  first = await startCli(root);
  const firstPort = Number(first.output.match(/^url:    http:\/\/127\.0\.0\.1:(\d+)$/m)?.[1]);
  const expectedSecondPort = await firstAvailablePort(firstPort + 1, 8864);
  second = await startCli(root);

  assert.equal(second.output.match(/^url:    http:\/\/127\.0\.0\.1:(\d+)$/m)?.[1], String(expectedSecondPort));
});

async function occupyPort(port: number): Promise<Server | undefined> {
  return occupyHostPort(port, "127.0.0.1");
}

async function occupyHostPort(port: number, host: string): Promise<Server | undefined> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE" ? resolve(undefined) : reject(error));
    server.listen(port, host, () => resolve(server));
  });
}

async function occupyContiguousRange(width: number, host: string): Promise<{ base: number; servers: Server[] }> {
  const firstCandidate = 20_000 + (process.pid % 100) * 101;
  for (let base = firstCandidate; base + width - 1 <= 65_535; base += 101) {
    const servers: Server[] = [];
    try {
      for (let offset = 0; offset < width; offset += 1) {
        const server = await occupyHostPort(base + offset, host);
        if (server === undefined) break;
        servers.push(server);
      }
      if (servers.length === width) return { base, servers };
    } catch (error) {
      await closeServers(servers);
      throw error;
    }
    await closeServers(servers);
  }
  throw new Error(`no free contiguous range of ${width} ports`);
}

async function closeServers(servers: readonly Server[]): Promise<void> {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
}

async function firstAvailablePort(first: number, last: number): Promise<number> {
  for (let port = first; port <= last; port += 1) {
    const server = await occupyPort(port);
    if (server === undefined) continue;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }
  throw new Error("no free port in the default range");
}

async function startCli(cwd: string): Promise<{ child: ChildProcessWithoutNullStreams; output: string }> {
  const { FORCE_COLOR: _forcedColor, ...env } = process.env;
  const child = spawn(process.execPath, [cliPath], { cwd, env: { ...env, HOME: isolatedHome }, stdio: ["pipe", "pipe", "pipe"] });
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
