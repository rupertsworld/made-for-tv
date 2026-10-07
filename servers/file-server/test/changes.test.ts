import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { Duplex } from "node:stream";
import { test } from "node:test";
import { WebSocket, type ClientOptions, type RawData } from "ws";

import { FileServer, type FileChangeEvent } from "../src/server.ts";
import { makeRoot, startFileServer } from "./helpers.ts";

test("recursive deletion retains constant-size watcher suppression state", async () => {
  const files = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`tree/dir-${index}/file.txt`, "file"]));
  const { baseUrl, fileServer } = await startFileServer(files);
  assert.equal((await fetch(`${baseUrl}/tree`, { method: "DELETE" })).status, 204);
  const suppression = fileServer as unknown as {
    suppressedWatcherEvents: ReadonlyMap<string, unknown>;
    suppressedDeletedSubtrees?: ReadonlyMap<string, unknown>;
  };
  assert.ok(
    suppression.suppressedWatcherEvents.size + (suppression.suppressedDeletedSubtrees?.size ?? 0) <= 2,
    "one recursive delete should retain at most one exact-path and one subtree marker",
  );
});

test("all subscriptions share the single root watcher", async (context) => {
  const { baseUrl, fileServer } = await startFileServer({ "dir/file.txt": "file" });
  const implementation = fileServer as unknown as { watcher: unknown };
  const rootWatcher = implementation.watcher;
  assert.notEqual(rootWatcher, undefined);
  const rootSocket = await openSocket(baseUrl, "/");
  const directorySocket = await openSocket(baseUrl, "/dir/");
  context.after(() => { rootSocket.close(); directorySocket.close(); });

  assert.equal(implementation.watcher, rootWatcher);
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.equal(source.match(/\bchokidar\.watch\(/g)?.length, 1);
});

test("visible recreation clears recursive-delete watcher suppression", async (context) => {
  const { baseUrl, root } = await startFileServer({ "tree/a.txt": "a" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());

  const firstDeletion = nextEvent(socket);
  assert.equal((await fetch(`${baseUrl}/tree`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await firstDeletion, { type: "deleted", path: "tree" });
  await expectNoEvent(socket, 150);

  const recreation = nextMatchingEvent(
    socket,
    ({ type, path }) => type === "created" && path === "tree/b.txt",
    "tree/b.txt recreation",
  );
  await mkdir(join(root, "tree"));
  await writeFile(join(root, "tree", "b.txt"), "b");
  assert.deepEqual(await recreation, { type: "created", path: "tree/b.txt" });

  const secondDeletion = nextMatchingEvent(
    socket,
    ({ type, path }) => type === "deleted" && path === "tree",
    "second tree deletion",
  );
  await rm(join(root, "tree"), { recursive: true });
  assert.deepEqual(await secondDeletion, { type: "deleted", path: "tree" });
});

test("HTTP recreation preserves a pending deletion through suppression rollover", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ "tree/a.txt": "a" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());

  let event = nextEvent(socket);
  assert.equal((await fetch(`${baseUrl}/tree`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await event, { type: "deleted", path: "tree" });
  event = nextEvent(socket);
  assert.equal((await fetch(`${baseUrl}/tree/b.txt`, { method: "PUT", body: "b" })).status, 201);
  assert.deepEqual(await event, { type: "created", path: "tree/b.txt" });
  const suppression = fileServer as unknown as {
    suppressedDeletedSubtrees: ReadonlyMap<string, { recreatedPaths: ReadonlySet<string> }>;
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  assert.equal(suppression.suppressedDeletedSubtrees.size, 1);
  assert.equal(
    [...suppression.suppressedDeletedSubtrees.values()].some(({ recreatedPaths }) => {
      return recreatedPaths.has(join(root, "tree")) && recreatedPaths.has(join(root, "tree", "b.txt"));
    }),
    true,
  );
  const recreatedDeletion = nextMatchingEvent(
    socket,
    ({ type, path }) => type === "deleted" && path === "tree/b.txt",
    "recreated file deletion",
  );
  suppression.handleWatcherChange("created", join(root, "tree"));
  await rm(join(root, "tree", "b.txt"));
  suppression.handleWatcherChange("deleted", join(root, "tree", "b.txt"));
  assert.deepEqual(await recreatedDeletion, { type: "deleted", path: "tree/b.txt" });
});

test("closely spaced external changes to one path coalesce after the path becomes quiet", async (context) => {
  const { baseUrl, root } = await startFileServer({ "burst.txt": "initial" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  await writeFile(join(root, "burst.txt"), "one");
  await writeFile(join(root, "burst.txt"), "two");
  await writeFile(join(root, "burst.txt"), "three");
  assert.deepEqual(await event, { type: "modified", path: "burst.txt" });
  await expectNoEvent(socket);
});

test("a created watcher event followed by a modification stays created", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ "created.txt": "contents" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("created", join(root, "created.txt"));
  implementation.handleWatcherChange("modified", join(root, "created.txt"));
  assert.deepEqual(await event, { type: "created", path: "created.txt" });
  await expectNoEvent(socket);
});

test("a deleted watcher event followed by recreation becomes created", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ "recreated.txt": "contents" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("deleted", join(root, "recreated.txt"));
  implementation.handleWatcherChange("created", join(root, "recreated.txt"));
  assert.deepEqual(await event, { type: "created", path: "recreated.txt" });
  await expectNoEvent(socket);
});

test("an existing path modification stays modified after debouncing", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ "existing.txt": "contents" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("modified", join(root, "existing.txt"));
  assert.deepEqual(await event, { type: "modified", path: "existing.txt" });
  await expectNoEvent(socket);
});

test("an existing path stays modified when a later watcher event reports creation", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer({ "existing.txt": "contents" });
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("modified", join(root, "existing.txt"));
  implementation.handleWatcherChange("created", join(root, "existing.txt"));
  assert.deepEqual(await event, { type: "modified", path: "existing.txt" });
  await expectNoEvent(socket);
});

test("a debounced path that ends missing publishes deleted", async (context) => {
  const { baseUrl, root, fileServer } = await startFileServer();
  const socket = await openSocket(baseUrl, "/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  const implementation = fileServer as unknown as {
    handleWatcherChange(type: FileChangeEvent["type"], absolutePath: string): void;
  };
  implementation.handleWatcherChange("created", join(root, "gone.txt"));
  implementation.handleWatcherChange("modified", join(root, "gone.txt"));
  assert.deepEqual(await event, { type: "deleted", path: "gone.txt" });
  await expectNoEvent(socket);
});

test("handleUpgrade accepts a prefix-stripped request target for mounted servers", async (context) => {
  const root = await makeRoot({ "dir/file.txt": "file" });
  const files = new FileServer({ root });
  const host = createServer(files.app);
  host.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/files/")) return;
    const target = `${url.pathname.slice("/files".length)}${url.search}`;
    void files.handleUpgrade(request, socket, head, target);
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  assert(address && typeof address === "object");
  context.after(async () => {
    await files.close();
    if (host.listening) await new Promise<void>((resolve) => host.close(() => resolve()));
  });

  const socket = await openSocket(`http://127.0.0.1:${address.port}`, "/files/dir/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  await writeFile(join(root, "outside.txt"), "outside");
  assert.deepEqual(await event, { type: "created", path: "outside.txt" });
  await files.close();
  assert.equal(await refusedStatus(`http://127.0.0.1:${address.port}`, "/files/dir/"), 500);
});

test("handleUpgrade resolves a refusal after the response is written and the socket closes", async () => {
  const { fileServer } = await startFileServer();
  const socket = new DelayedFinalDuplex();
  const request = {
    method: "GET",
    url: "/missing/",
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13",
    },
  } as IncomingMessage;

  await fileServer.handleUpgrade(request, socket, Buffer.alloc(0));
  assert.match(Buffer.concat(socket.written).toString(), /^HTTP\/1\.1 404 Not Found\r\n/);
  assert.equal(socket.destroyed, true);
  assert.equal(socket.closed, true);
});

test("handleUpgrade refusal resolves for destroyed and write-error sockets", async () => {
  const { fileServer } = await startFileServer();
  const request = {
    method: "GET",
    url: "/missing/",
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      "sec-websocket-version": "13",
    },
  } as IncomingMessage;
  const destroyed = new DelayedFinalDuplex();
  destroyed.destroy();
  const writeError = new WriteErrorDuplex();

  await Promise.race([
    Promise.all([
      fileServer.handleUpgrade(request, destroyed, Buffer.alloc(0)),
      fileServer.handleUpgrade(request, writeError, Buffer.alloc(0)),
    ]),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("upgrade refusal did not resolve")), 500)),
  ]);
  assert.equal(destroyed.destroyed, true);
  assert.equal(writeError.destroyed, true);
});

test("a malformed client frame closes that subscriber without crashing the server", async () => {
  const { baseUrl } = await startFileServer();
  const socket = await openSocket(baseUrl, "/");
  const closed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("malformed subscriber was not closed")), 500);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
  (socket as unknown as { _socket: { write(bytes: Uint8Array): void } })._socket.write(Uint8Array.from([0x81, 0x01, 0x78]));
  await closed;
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
});

test("close terminates subscriptions and releases the listening address", async () => {
  const root = await makeRoot();
  const server = await new FileServer({ root }).listen({ port: 0 });
  const socket = await openSocket(server.url as string, "/");
  const closed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("subscription was not terminated")), 500);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
  await server.close();
  await closed;
  assert.equal(server.url, undefined);
  assert.equal(server.port, undefined);
});

async function openSocket(baseUrl: string, path: string, options: ClientOptions = {}): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}${path}`, options);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function nextEvent(socket: WebSocket, timeoutMs = 3_000): Promise<FileChangeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for WebSocket event")), timeoutMs);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as FileChangeEvent);
    });
  });
}

async function nextMatchingEvent(
  socket: WebSocket,
  matches: (event: FileChangeEvent) => boolean,
  description: string,
  timeoutMs = 3_000,
): Promise<FileChangeEvent> {
  return new Promise((resolve, reject) => {
    const observed: FileChangeEvent[] = [];
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`timed out waiting for ${description}; observed ${JSON.stringify(observed)}`));
    }, timeoutMs);
    const onMessage = (data: RawData): void => {
      const event = JSON.parse(data.toString()) as FileChangeEvent;
      observed.push(event);
      if (!matches(event)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(event);
    };
    socket.on("message", onMessage);
  });
}

async function expectNoEvent(socket: WebSocket, timeoutMs = 200): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      resolve();
    }, timeoutMs);
    const onMessage = (data: RawData): void => {
      clearTimeout(timer);
      reject(new Error(`unexpected WebSocket event: ${data.toString()}`));
    };
    socket.once("message", onMessage);
  });
}

async function refusedStatus(baseUrl: string, path: string): Promise<number> {
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

class DelayedFinalDuplex extends Duplex {
  readonly written: Buffer[] = [];

  override _read(): void { /* The refusal path only writes. */ }
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.written.push(Buffer.from(chunk));
    callback();
  }
  override _final(callback: (error?: Error | null) => void): void {
    setTimeout(callback, 25);
  }
}

class WriteErrorDuplex extends Duplex {
  override _read(): void { /* The refusal path only writes. */ }
  override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback(new Error("write failed"));
  }
}
