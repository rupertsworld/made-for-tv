import assert from "node:assert/strict";
import { request, type ClientRequest } from "node:http";
import { test } from "node:test";

import { noteWrite, startVault } from "./helpers.ts";

const recordType = "application/vnd.telepath.record+json";

test("concurrent record replacement leaves the last-completed write fully visible", async (context) => {
  const vault = await startVault({ "race.md": "before" });
  const slowDocument = JSON.stringify({ fields: { writer: "slow" }, body: "slow body" });
  const slow = beginSlowPut(`${vault.baseUrl}/race`, slowDocument);
  context.after(() => slow.destroy());
  await slow.connected;

  const fast = await noteWrite(vault.baseUrl, "PUT", "/race", {
    fields: { writer: "fast" },
    body: "fast body",
  });
  assert.equal(fast.status, 200);
  assert.equal((await fast.json() as { body: string }).body, "fast body");

  const slowResponse = await slow.finish();
  assert.equal(slowResponse.status, 200);
  assert.equal((slowResponse.body as { body: string }).body, "slow body");
  assert.deepEqual(await (await fetch(`${vault.baseUrl}/race`)).json(), slowResponse.body);
});

function beginSlowPut(url: string, document: string): {
  connected: Promise<void>;
  destroy(): void;
  finish(): Promise<{ status: number; body: unknown }>;
} {
  const target = new URL(url);
  let resolveConnected: (() => void) | undefined;
  let rejectConnected: ((error: Error) => void) | undefined;
  const connected = new Promise<void>((resolve, reject) => {
    resolveConnected = resolve;
    rejectConnected = reject;
  });
  let resolveResponse: ((response: { status: number; body: unknown }) => void) | undefined;
  let rejectResponse: ((error: Error) => void) | undefined;
  const response = new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const client: ClientRequest = request({
    hostname: target.hostname,
    port: target.port,
    path: target.pathname,
    method: "PUT",
    headers: {
      "content-type": recordType,
      "content-length": Buffer.byteLength(document),
    },
  }, (incoming) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolveResponse?.({ status: incoming.statusCode ?? 0, body: JSON.parse(text) as unknown });
    });
  });
  client.once("error", (error) => {
    rejectConnected?.(error);
    rejectResponse?.(error);
  });
  client.once("socket", (socket) => {
    if (socket.connecting) socket.once("connect", () => resolveConnected?.());
    else resolveConnected?.();
  });
  client.write(document.slice(0, -1));

  return {
    connected,
    destroy() {
      client.destroy();
    },
    async finish() {
      client.end(document.slice(-1));
      return response;
    },
  };
}
