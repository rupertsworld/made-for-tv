/** Exercises the inherited dirty-signal stream and the vault record-path mapping through public surfaces. */
import assert from "node:assert/strict";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type ClientRequest } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { WebSocket } from "ws";

import { expectNoEvent, nextEvent, noteWrite, openSocket, rawRequest, startVault } from "./helpers.ts";

type ChangeEvent = { type: string; path: string };

function nextEvents(socket: WebSocket, count: number): Promise<ChangeEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ChangeEvent[] = [];
    const timer = setTimeout(() => reject(new Error("timed out waiting for WebSocket events")), 3_000);
    const onMessage = (data: WebSocket.RawData): void => {
      events.push(JSON.parse(data.toString()) as ChangeEvent);
      if (events.length !== count) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(events);
    };
    socket.on("message", onMessage);
  });
}

function compareEvents(left: ChangeEvent, right: ChangeEvent): number {
  const leftKey = `${left.type}:${left.path}`;
  const rightKey = `${right.type}:${right.path}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function beginUpload(baseUrl: string, path: string, contentLength: number): {
  request: ClientRequest;
  response: Promise<number>;
} {
  const base = new URL(baseUrl);
  let request: ClientRequest;
  const response = new Promise<number>((resolve, reject) => {
    request = httpRequest({
      hostname: base.hostname,
      port: base.port,
      method: "PUT",
      path,
      headers: { "content-length": String(contentLength) },
    }, (incoming) => {
      incoming.resume();
      incoming.once("end", () => resolve(incoming.statusCode ?? 0));
    });
    request.once("error", reject);
  });
  return { request: request!, response };
}

function refusedStatus(baseUrl: string, path: string): Promise<number> {
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

function refetchOnNextEvent(socket: WebSocket, baseUrl: string, path: string): Promise<{
  event: ChangeEvent;
  response: Response;
}> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      const event = JSON.parse(data.toString()) as ChangeEvent;
      void fetch(`${baseUrl}${path}`).then((response) => resolve({ event, response }), reject);
    });
  });
}

test("a directory subscription is root-wide and maps record create, modify, and delete paths", async () => {
  const vault = await startVault({ "scope/existing.md": "old" });
  const socket = await openSocket(vault.baseUrl, "/scope/");

  let event = nextEvent(socket);
  await writeFile(join(vault.root, "outside.md"), "created outside scope");
  assert.deepEqual(await event, { type: "created", path: "outside" });

  event = nextEvent(socket);
  await writeFile(join(vault.root, "scope/existing.md"), "modified");
  assert.deepEqual(await event, { type: "modified", path: "scope/existing" });

  event = nextEvent(socket);
  await rm(join(vault.root, "outside.md"));
  assert.deepEqual(await event, { type: "deleted", path: "outside" });
  socket.close();
});

test("record HTTP mutations refresh the cache before their dirty signal is published", async () => {
  const vault = await startVault();
  const socket = await openSocket(vault.baseUrl, "/");

  let signalledState = refetchOnNextEvent(socket, vault.baseUrl, "/api-note");
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/api-note", { body: "created" })).status, 201);
  let observed = await signalledState;
  assert.deepEqual(observed.event, { type: "created", path: "api-note" });
  assert.equal(observed.response.status, 200);
  assert.equal((await observed.response.json() as { body: string }).body, "created");
  await expectNoEvent(socket);

  signalledState = refetchOnNextEvent(socket, vault.baseUrl, "/api-note");
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/api-note", { body: "modified" })).status, 200);
  observed = await signalledState;
  assert.deepEqual(observed.event, { type: "modified", path: "api-note" });
  assert.equal(observed.response.status, 200);
  assert.equal((await observed.response.json() as { body: string }).body, "modified");
  await expectNoEvent(socket);

  signalledState = refetchOnNextEvent(socket, vault.baseUrl, "/api-note");
  assert.equal((await fetch(`${vault.baseUrl}/api-note`, { method: "DELETE" })).status, 204);
  observed = await signalledState;
  assert.deepEqual(observed.event, { type: "deleted", path: "api-note" });
  assert.equal(observed.response.status, 404);
  await expectNoEvent(socket);
  socket.close();
});

test("a literal file shadow keeps markdown source events at their .md path", async () => {
  const vault = await startVault({ "note": "literal shadow", "note.md": "record" });
  const socket = await openSocket(vault.baseUrl, "/");

  let event = nextEvent(socket);
  await writeFile(join(vault.root, "note.md"), "modified while shadowed");
  assert.deepEqual(await event, { type: "modified", path: "note.md" });

  event = nextEvent(socket);
  await rm(join(vault.root, "note"));
  assert.deepEqual(await event, { type: "deleted", path: "note" });

  event = nextEvent(socket);
  await writeFile(join(vault.root, "note.md"), "modified after removing shadow");
  assert.deepEqual(await event, { type: "modified", path: "note" });
  socket.close();
});

test("renaming a visible record publishes deleted and created without cross-path ordering", async () => {
  const vault = await startVault({ "before.md": "record" });
  const socket = await openSocket(vault.baseUrl, "/");
  const events = nextEvents(socket, 2);

  await rename(join(vault.root, "before.md"), join(vault.root, "after.md"));
  assert.deepEqual((await events).sort(compareEvents), [
    { type: "created", path: "after" },
    { type: "deleted", path: "before" },
  ]);
  socket.close();
});

test("hidden paths and an in-progress atomic upload produce no dirty signal", async () => {
  const vault = await startVault();
  const socket = await openSocket(vault.baseUrl, "/");
  await mkdir(join(vault.root, ".obsidian"));
  await writeFile(join(vault.root, ".obsidian", "config"), "hidden");
  await writeFile(join(vault.root, ".temporary"), "hidden");
  await expectNoEvent(socket, 250);

  const upload = beginUpload(vault.baseUrl, "/slow.bin", 8);
  upload.request.write("slow");
  await expectNoEvent(socket, 250);
  const event = nextEvent(socket);
  upload.request.end("done");
  assert.equal(await upload.response, 201);
  assert.deepEqual(await event, { type: "created", path: "slow.bin" });
  await expectNoEvent(socket);
  socket.close();
});

test("invalid double-slash and dot-segment mutations are refused without signals", async () => {
  const vault = await startVault({ "a/b.md": "before", "a/c.md": "before" });
  const socket = await openSocket(vault.baseUrl, "/");

  assert.equal((await rawRequest(vault.baseUrl, "PUT", "/a//b", { body: "body" })).status, 400);
  assert.equal((await rawRequest(vault.baseUrl, "PUT", "/a/./c", { body: "body" })).status, 404);
  await expectNoEvent(socket);
  socket.close();
});

test("WebSockets upgrade only existing slash-terminated directories", async () => {
  const vault = await startVault({ "scope/file.txt": "file", ".hidden/file.txt": "hidden" });
  const root = await openSocket(vault.baseUrl, "/");
  const directory = await openSocket(vault.baseUrl, "/scope/");
  root.close();
  directory.close();

  for (const [path, status] of [
    ["/scope", 404],
    ["/missing/", 404],
    ["/scope/file.txt/", 404],
    ["/.hidden/", 404],
    ["/scope//", 400],
  ] as const) {
    assert.equal(await refusedStatus(vault.baseUrl, path), status, path);
  }
});

test("a new subscriber receives no historical events", async () => {
  const vault = await startVault({ "one.md": "one", "two.md": "two" });
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/one", { body: "modified one" })).status, 200);
  assert.equal((await noteWrite(vault.baseUrl, "PATCH", "/two", { body: "modified two" })).status, 200);
  assert.equal((await noteWrite(vault.baseUrl, "PUT", "/three", { body: "three" })).status, 201);

  const socket = await openSocket(vault.baseUrl, "/");
  await expectNoEvent(socket);
  const event = nextEvent(socket);
  await writeFile(join(vault.root, "four.md"), "four");
  assert.deepEqual(await event, { type: "created", path: "four" });
  socket.close();
});

test("the ping loop reaps an unresponsive subscriber while a responsive subscriber survives", async () => {
  const vault = await startVault({}, { pingIntervalMs: 20 });
  const unresponsive = await openSocket(vault.baseUrl, "/", { autoPong: false });
  const responsive = await openSocket(vault.baseUrl, "/");
  const unresponsiveClosed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("unresponsive WebSocket was not terminated")), 500);
    unresponsive.once("close", () => { clearTimeout(timer); resolve(); });
  });

  await unresponsiveClosed;
  assert.equal(responsive.readyState, WebSocket.OPEN);
  const event = nextEvent(responsive);
  await writeFile(join(vault.root, "survivor.md"), "still connected");
  assert.deepEqual(await event, { type: "created", path: "survivor" });
  responsive.close();
});
