import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "node:test";

import { FileServer, type FileServerOptions } from "../src/server.ts";

export type RunningFileServer = {
  root: string;
  baseUrl: string;
  fileServer: FileServer;
};

type RawResponse = { status: number; headers: IncomingHttpHeaders; body: Buffer };

const runningServers: RunningFileServer[] = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(({ fileServer }) => fileServer.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

export async function makeRoot(files: Record<string, string | Uint8Array> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "file-server-test-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

export async function startFileServer(
  files: Record<string, string | Uint8Array> = {},
  options: Omit<FileServerOptions, "root"> = {},
): Promise<RunningFileServer> {
  const root = await makeRoot(files);
  const fileServer = new FileServer({ ...options, root });
  await fileServer.listen({ port: 0 });
  const running = { root, baseUrl: fileServer.url as string, fileServer };
  runningServers.push(running);
  return running;
}

export async function rawRequest(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<RawResponse> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method,
      path,
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

export async function rawTcpRequest(baseUrl: string, requestText: string): Promise<Buffer> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect({ host: base.hostname, port: Number(base.port) });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timed out waiting for raw HTTP response"));
    }, 5_000);
    socket.once("connect", () => socket.write(requestText));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
