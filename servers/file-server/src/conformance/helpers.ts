import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { WebSocket, type ClientOptions } from "ws";

import type {
  FileServerConformanceFactory,
  FileServerConformanceOptions,
  FileServerConformanceServer,
} from "./types.js";

export type RunningFixture = FileServerConformanceServer & { root: string };
export type ChangeEvent = { type: "created" | "modified" | "deleted"; path: string };
export type RawResponse = { status: number; headers: IncomingHttpHeaders; body: Buffer };

export async function startFixture(
  context: TestContext,
  factory: FileServerConformanceFactory,
  files: Record<string, string | Uint8Array> = {},
  options?: FileServerConformanceOptions,
): Promise<RunningFixture> {
  const root = await mkdtemp(join(tmpdir(), "file-server-conformance-"));
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  const server = await factory(root, options);
  context.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  return { root, baseUrl: server.baseUrl, close: () => server.close() };
}

export async function openSocket(baseUrl: string, path: string, options: ClientOptions = {}): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}${path}`, options);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

export async function nextEvent(socket: WebSocket): Promise<ChangeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for change event")), 3_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as ChangeEvent);
    });
  });
}

export async function nextEvents(socket: WebSocket, count: number): Promise<ChangeEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ChangeEvent[] = [];
    const timer = setTimeout(() => reject(new Error("timed out waiting for change events")), 3_000);
    const onMessage = (data: WebSocket.RawData): void => {
      events.push(JSON.parse(data.toString()) as ChangeEvent);
      if (events.length === count) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(events);
      }
    };
    socket.on("message", onMessage);
  });
}

export async function expectNoEvent(socket: WebSocket, timeoutMs = 200): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      resolve();
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData): void => {
      clearTimeout(timer);
      reject(new Error(`unexpected change event: ${data.toString()}`));
    };
    socket.once("message", onMessage);
  });
}

export function compareEvents(left: ChangeEvent, right: ChangeEvent): number {
  return `${left.type}:${left.path}`.localeCompare(`${right.type}:${right.path}`);
}

export async function rawStatus(baseUrl: string, path: string): Promise<number> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: base.hostname, port: base.port, path }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.end();
  });
}

export async function rawRequest(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: Uint8Array,
): Promise<RawResponse> {
  const base = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: base.hostname, port: base.port, method, path, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", reject);
    request.end(body);
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

export function parseRawResponse(response: Buffer): { status: number; headers: Record<string, string>; body: Buffer } {
  const separator = response.indexOf("\r\n\r\n");
  assert.notEqual(separator, -1);
  const lines = response.subarray(0, separator).toString().split("\r\n");
  const status = Number(lines[0]?.split(" ")[1]);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon !== -1) headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status, headers, body: response.subarray(separator + 4) };
}

export function beginUpload(baseUrl: string, path: string, contentLength: number): {
  request: ClientRequest;
  response: Promise<RawResponse>;
} {
  const base = new URL(baseUrl);
  let request: ClientRequest;
  const response = new Promise<RawResponse>((resolve) => {
    request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method: "PUT",
      path,
      headers: { "content-length": String(contentLength) },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        status: incoming.statusCode ?? 0,
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", () => resolve({ status: 0, headers: {}, body: Buffer.alloc(0) }));
  });
  return { request: request!, response };
}

export async function waitForTemporaryName(root: string, permanentNames: readonly string[]): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const temporary = (await readdir(root)).find((name) => !permanentNames.includes(name));
    if (temporary !== undefined) return temporary;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("temporary file did not appear");
}

export async function waitForNoTemporaryFiles(root: string, permanentNames: readonly string[]): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await readdir(root)).every((name) => permanentNames.includes(name))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("temporary file was not removed");
}

export async function editRequest(
  baseUrl: string,
  path: string,
  document: unknown,
  contentType = "application/vnd.telepath.edit+json",
): Promise<RawResponse> {
  const body = Buffer.from(JSON.stringify(document));
  return rawRequest(baseUrl, "PATCH", path, {
    "content-type": contentType,
    "content-length": String(body.length),
  }, body);
}

export async function refusedStatus(baseUrl: string, path: string): Promise<number> {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}${path}`);
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    socket.once("open", () => reject(new Error(`unexpectedly upgraded ${path}`)));
    socket.once("error", () => undefined);
  });
}
