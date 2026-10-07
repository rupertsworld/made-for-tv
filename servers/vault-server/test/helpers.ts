import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "node:test";
import { WebSocket, type ClientOptions } from "ws";

import { VaultServer, type VaultServerOptions } from "../src/server.ts";

export type RunningVault = {
  root: string;
  baseUrl: string;
  server: VaultServer;
  close: () => Promise<void>;
};

const runningVaults: RunningVault[] = [];

afterEach(async () => {
  await Promise.all(runningVaults.splice(0).map(async ({ close, root }) => {
    await close();
    await rm(root, { recursive: true, force: true });
  }));
});

export async function startVault(files: Record<string, string | Uint8Array> = {}, options: Omit<VaultServerOptions, "root"> = {}): Promise<RunningVault> {
  const root = await mkdtemp(join(tmpdir(), "vault-server-test-"));
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  const vaultServer = new VaultServer({ root, ...options });
  await vaultServer.listen({ port: 0 });
  const running = { root, baseUrl: vaultServer.url as string, server: vaultServer, close: () => vaultServer.close() };
  runningVaults.push(running);
  return running;
}

export async function noteWrite(
  baseUrl: string,
  method: "PUT" | "PATCH",
  path: string,
  body: unknown,
  contentType = "application/vnd.telepath.record+json",
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

export async function rawRequest(baseUrl: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: string }> {
  const base = new URL(baseUrl);
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method,
      path,
      headers: encodedBody === undefined ? undefined : {
        "content-type": "application/vnd.telepath.record+json",
        "content-length": Buffer.byteLength(encodedBody),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { responseBody += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: responseBody }));
    });
    request.once("error", reject);
    request.end(encodedBody);
  });
}

export async function openSocket(baseUrl: string, path: string, options: ClientOptions = {}): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}${path}`, options);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

export async function nextEvent(socket: WebSocket, timeoutMs = 3_000): Promise<{ type: string; path: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for WebSocket event")), timeoutMs);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as { type: string; path: string });
    });
  });
}

export async function expectNoEvent(socket: WebSocket, timeoutMs = 150): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      resolve();
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData): void => {
      clearTimeout(timer);
      reject(new Error(`unexpected WebSocket event: ${data.toString()}`));
    };
    socket.once("message", onMessage);
  });
}
