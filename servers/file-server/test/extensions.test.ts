import assert from "node:assert/strict";
import { rename, rm, symlink } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { test } from "node:test";
import { WebSocket } from "ws";

import {
  FileServer,
  type DirectoryListing,
  type FileChangeEvent,
  type FileServerExtension,
  type FileServerExtensionContext,
} from "../src/server.ts";
import { makeRoot } from "./helpers.ts";

test("handle receives inspected request context and delegates untouched base requests", async (context) => {
  const seen: Array<{
    path: string;
    segments: readonly string[];
    trailingSlash: boolean;
    resource: FileServerExtensionContext["resource"];
  }> = [];
  const extension: FileServerExtension = {
    handle(_request, response, requestContext) {
      seen.push({
        path: requestContext.path,
        segments: requestContext.segments,
        trailingSlash: requestContext.trailingSlash,
        resource: requestContext.resource,
      });
      if (requestContext.path !== "virtual") return false;
      response.status(200).json({ virtual: true });
      return true;
    },
  };
  const server = await startExtended({ "file.txt": "file", "dir/child.txt": "child" }, extension);
  context.after(() => server.close());

  assert.equal(await (await fetch(`${server.url}/file.txt`)).text(), "file");
  assert.deepEqual(await (await fetch(`${server.url}/virtual`)).json(), { virtual: true });
  assert.deepEqual(seen, [
    {
      path: "file.txt",
      segments: ["file.txt"],
      trailingSlash: false,
      resource: { type: "file", size: 4, modified: seen[0]?.resource.type === "file" ? seen[0].resource.modified : "" },
    },
    { path: "virtual", segments: ["virtual"], trailingSlash: false, resource: { type: "missing" } },
  ]);
  assert.match(seen[0]?.resource.type === "file" ? seen[0].resource.modified : "", /^\d{4}-/);
});

test("handle runs after path, object, method, and OPTIONS checks", async (context) => {
  let calls = 0;
  const root = await makeRoot({ ".hidden": "hidden" });
  const outside = await makeRoot({ "secret.txt": "secret" });
  await symlink(outside, join(root, "escape"));
  const special = createNetServer();
  await new Promise<void>((resolve, reject) => {
    special.once("error", reject);
    special.listen(join(root, "special.sock"), resolve);
  });
  context.after(() => new Promise<void>((resolve) => special.close(() => resolve())));
  const server = await new FileServer({ root, extension: { handle: () => { calls += 1; return false; } } }).listen({ port: 0 });
  context.after(() => server.close());

  assert.equal((await fetch(`${server.url}/.hidden`)).status, 404);
  assert.equal((await fetch(`${server.url}/escape/secret.txt`)).status, 403);
  assert.equal((await fetch(`${server.url}/special.sock`)).status, 404);
  assert.equal((await fetch(`${server.url}/missing`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${server.url}/missing`, { method: "OPTIONS" })).status, 204);
  assert.equal(calls, 0);
});

test("invalid handle completion and thrown failures become 500 responses", async (context) => {
  for (const extension of [
    { handle: () => true },
    { handle: (_request, response) => { response.set("X-Extension", "changed"); return false; } },
    { handle: () => { throw new Error("boom"); } },
  ] satisfies FileServerExtension[]) {
    const server = await startExtended({}, extension);
    context.after(() => server.close());
    const response = await fetch(`${server.url}/anything`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal server error" });
  }
});

test("listing can decorate a base listing and invalid listings become 500", async (context) => {
  let calls = 0;
  const extension: FileServerExtension = {
    handle(_request, response, requestContext) {
      if (requestContext.path !== "virtual") return false;
      response.type("text/plain").send("virtual resource");
      return true;
    },
    listing(_request, listing, requestContext) {
      calls += 1;
      assert.equal(requestContext.resource.type, "dir");
      return {
        ...listing,
        entries: [...listing.entries, { name: "virtual", type: "record", id: 42 }],
      };
    },
  };
  const server = await startExtended({ "file.txt": "file" }, extension);
  context.after(() => server.close());
  const listing = await (await fetch(`${server.url}/`)).json() as DirectoryListing;
  const virtualEntry = listing.entries.at(-1);
  assert.deepEqual(virtualEntry, { name: "virtual", type: "record", id: 42 });
  assert(virtualEntry !== undefined);
  const addressablePath = [listing.path, virtualEntry.name].filter(Boolean).map(encodeURIComponent).join("/");
  assert.equal(await (await fetch(`${server.url}/${addressablePath}`)).text(), "virtual resource");
  const head = await fetch(`${server.url}/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(calls, 2);

  const invalidEntries = [
    { name: 1, type: "file" },
    { name: "file", type: "file" },
    { name: "file", type: "file", size: -1, modified: "2026-01-01T00:00:00.000Z" },
    { name: "file", type: "file", size: 1, modified: "not-a-date" },
    { name: "dir", type: "dir", extra: true },
    { name: "link", type: "link", size: 1 },
    { name: "bad\uD800", type: "record" },
  ];
  for (const entry of invalidEntries) {
    const invalid = await startExtended({}, { listing: () => ({ path: "", entries: [entry] }) as never });
    context.after(() => invalid.close());
    const invalidResponse = await fetch(`${invalid.url}/`);
    assert.equal(invalidResponse.status, 500, JSON.stringify(entry));
    assert.deepEqual(await invalidResponse.json(), { error: "internal server error" });
  }
});

test("listing hook exceptions retain context-operation status or map unexpected failures to 500", async (context) => {
  const missing = await startExtended({}, {
    listing: async (_request, _listing, requestContext) => requestContext.list("missing"),
  });
  context.after(() => missing.close());
  assert.equal((await fetch(`${missing.url}/`)).status, 404);

  const unexpected = await startExtended({}, { listing: () => { throw new Error("boom"); } });
  context.after(() => unexpected.close());
  assert.equal((await fetch(`${unexpected.url}/`)).status, 500);
});

test("filesystem-shaped errors thrown directly by extension hooks are 500", async (context) => {
  const filesystemShapedError = (): Error & { code: string } => Object.assign(new Error("not from context"), { code: "ENOENT" });
  const handleServer = await startExtended({}, { handle: () => { throw filesystemShapedError(); } });
  context.after(() => handleServer.close());
  const handleResponse = await fetch(`${handleServer.url}/anything`);
  assert.equal(handleResponse.status, 500);
  assert.deepEqual(await handleResponse.json(), { error: "internal server error" });

  const listingServer = await startExtended({}, { listing: () => { throw filesystemShapedError(); } });
  context.after(() => listingServer.close());
  const listingResponse = await fetch(`${listingServer.url}/`);
  assert.equal(listingResponse.status, 500);
  assert.deepEqual(await listingResponse.json(), { error: "internal server error" });
});

test("context operations expose base inspection/listing and use base mutation signals once", async (context) => {
  let listingHookCalls = 0;
  const extension: FileServerExtension = {
    listing(_request, listing) { listingHookCalls += 1; return listing; },
    async handle(_request, response, requestContext) {
      if (requestContext.path !== "actions") return false;
      assert(Object.isFrozen(requestContext));
      assert(Object.isFrozen(requestContext.segments));
      assert(Object.isFrozen(requestContext.resource));
      const inspected = await requestContext.inspect("source.txt");
      const missing = await requestContext.inspect("missing.txt");
      const listing = await requestContext.list("");
      const created = await requestContext.replace("generated/one.txt", new Uint8Array(Buffer.from("one")));
      const replaced = await requestContext.replace("generated/one.txt", Readable.from("two"));
      await requestContext.remove("source.txt");
      response.json({ inspected, missing, listing, created, replaced });
      return true;
    },
  };
  const server = await startExtended({ "source.txt": "source" }, extension);
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());
  const events = nextEvents(socket, 3);

  const result = await (await fetch(`${server.url}/actions`)).json() as {
    inspected: FileServerExtensionContext["resource"];
    missing: FileServerExtensionContext["resource"];
    listing: DirectoryListing;
    created: string;
    replaced: string;
  };
  assert.equal(result.inspected.type, "file");
  assert.deepEqual(result.missing, { type: "missing" });
  assert.deepEqual(result.listing.entries.map(({ name }) => name), ["source.txt"]);
  assert.equal(result.created, "created");
  assert.equal(result.replaced, "replaced");
  assert.equal(listingHookCalls, 0, "context.list does not recurse through the listing hook");
  assert.equal(await (await fetch(`${server.url}/generated/one.txt`)).text(), "two");
  assert.equal((await fetch(`${server.url}/source.txt`)).status, 404);
  assert.deepEqual(await events, [
    { type: "created", path: "generated/one.txt" },
    { type: "modified", path: "generated/one.txt" },
    { type: "deleted", path: "source.txt" },
  ]);
  await expectNoEvent(socket);
});

test("uncaught context failures retain base status mapping", async (context) => {
  const failures = [
    ["inspect-hidden", (value: FileServerExtensionContext) => value.inspect(".hidden"), 404],
    ["inspect-malformed", (value: FileServerExtensionContext) => value.inspect("bad//path"), 400],
    ["inspect-surrogate", (value: FileServerExtensionContext) => value.inspect("bad\uD800"), 400],
    ["list-file", (value: FileServerExtensionContext) => value.list("file.txt"), 404],
    ["replace-root", (value: FileServerExtensionContext) => value.replace("", new Uint8Array()), 409],
    ["replace-slash", (value: FileServerExtensionContext) => value.replace("new/", new Uint8Array()), 409],
    ["replace-dir", (value: FileServerExtensionContext) => value.replace("dir", new Uint8Array()), 409],
    ["remove-root", (value: FileServerExtensionContext) => value.remove(""), 409],
    ["remove-missing", (value: FileServerExtensionContext) => value.remove("missing"), 404],
  ] as const;
  const extension: FileServerExtension = {
    async handle(_request, _response, requestContext) {
      const failure = failures.find(([path]) => path === requestContext.path);
      if (failure === undefined) return false;
      await failure[1](requestContext);
      return false;
    },
  };
  const server = await startExtended({ "file.txt": "file", "dir/child.txt": "child" }, extension);
  context.after(() => server.close());
  for (const [path, , status] of failures) assert.equal((await fetch(`${server.url}/${path}`)).status, status, path);
});

test("context operations preserve symlink confinement and filesystem permission mapping", async (context) => {
  const root = await makeRoot();
  const outside = await makeRoot({ "secret.txt": "secret" });
  await symlink(outside, join(root, "escape"));
  const operations = new Map<string, (value: FileServerExtensionContext) => Promise<unknown>>([
    ["inspect-symlink", (value) => value.inspect("escape/secret.txt")],
    ["list-symlink", (value) => value.list("escape")],
    ["replace-symlink", (value) => value.replace("escape/new.txt", new Uint8Array())],
    ["remove-symlink", (value) => value.remove("escape")],
    ["replace-permission", (value) => value.replace("target.txt", Readable.from((async function* () {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    })()))],
  ]);
  const extension: FileServerExtension = {
    async handle(_request, _response, requestContext) {
      const operation = operations.get(requestContext.path);
      if (operation === undefined) return false;
      await operation(requestContext);
      return false;
    },
  };
  const server = await new FileServer({ root, extension }).listen({ port: 0 });
  context.after(() => server.close());

  for (const path of operations.keys()) {
    const response = await fetch(`${server.url}/${path}`);
    assert.equal(response.status, 403, path);
    assert.deepEqual(await response.json(), { error: "forbidden" }, path);
  }
});

test("context operations reject canonical paths moved outside the root", async (context) => {
  const root = await makeRoot();
  const movedRoot = `${root}-moved`;
  const outside = await makeRoot({ "secret.txt": "secret" });
  context.after(() => rm(movedRoot, { recursive: true, force: true }));
  const extension: FileServerExtension = {
    async handle(_request, _response, requestContext) {
      if (requestContext.path !== "inspect-confined") return false;
      await rename(root, movedRoot);
      await symlink(outside, root);
      await requestContext.inspect("secret.txt");
      return false;
    },
  };
  const server = await new FileServer({ root, extension }).listen({ port: 0 });
  context.after(() => server.close());

  const response = await fetch(`${server.url}/inspect-confined`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not found" });
});

test("context.replace keeps the old file visible until a streamed replacement completes", async (context) => {
  let startReplacement: (() => void) | undefined;
  const replacementStarted = new Promise<void>((resolve) => { startReplacement = resolve; });
  let finishReplacement: (() => void) | undefined;
  const mayFinish = new Promise<void>((resolve) => { finishReplacement = resolve; });
  const extension: FileServerExtension = {
    async handle(_request, response, requestContext) {
      if (requestContext.path !== "replace-slowly") return false;
      const source = new PassThrough();
      const replacing = requestContext.replace("target.txt", source);
      source.write("new ");
      startReplacement?.();
      await mayFinish;
      source.end("contents");
      await replacing;
      response.status(204).end();
      return true;
    },
  };
  const server = await startExtended({ "target.txt": "old contents" }, extension);
  context.after(() => server.close());

  const request = fetch(`${server.url}/replace-slowly`);
  await replacementStarted;
  assert.equal(await (await fetch(`${server.url}/target.txt`)).text(), "old contents");
  finishReplacement?.();
  assert.equal((await request).status, 204);
  assert.equal(await (await fetch(`${server.url}/target.txt`)).text(), "new contents");
});

test("context.replace preserves the old file and cleans up after a failing stream", async (context) => {
  const extension: FileServerExtension = {
    async handle(_request, _response, requestContext) {
      if (requestContext.path !== "replace-with-failure") return false;
      const source = Readable.from((async function* () {
        yield "partial";
        throw new Error("source failed");
      })());
      await requestContext.replace("target.txt", source);
      return true;
    },
  };
  const server = await startExtended({ "target.txt": "old contents" }, extension);
  context.after(() => server.close());

  assert.equal((await fetch(`${server.url}/replace-with-failure`)).status, 500);
  assert.equal(await (await fetch(`${server.url}/target.txt`)).text(), "old contents");
  const listing = await (await fetch(`${server.url}/`)).json() as DirectoryListing;
  assert.deepEqual(listing.entries.map(({ name }) => name), ["target.txt"]);
});

test("concurrent context replacements are atomic and last completed write wins", async (context) => {
  let firstCommitted: (() => void) | undefined;
  const firstCommit = new Promise<void>((resolve) => { firstCommitted = resolve; });
  let finishSecond: (() => void) | undefined;
  const secondMayFinish = new Promise<void>((resolve) => { finishSecond = resolve; });
  const extension: FileServerExtension = {
    async handle(_request, response, requestContext) {
      if (requestContext.path !== "replace-concurrently") return false;
      const first = new PassThrough();
      const second = new PassThrough();
      const firstReplacement = requestContext.replace("target.txt", first);
      const secondReplacement = requestContext.replace("target.txt", second);
      first.end("first");
      await firstReplacement;
      firstCommitted?.();
      await secondMayFinish;
      second.end("second");
      await secondReplacement;
      response.status(204).end();
      return true;
    },
  };
  const server = await startExtended({ "target.txt": "old" }, extension);
  context.after(() => server.close());

  const replacing = fetch(`${server.url}/replace-concurrently`);
  await firstCommit;
  assert.equal(await (await fetch(`${server.url}/target.txt`)).text(), "first");
  finishSecond?.();
  assert.equal((await replacing).status, 204);
  assert.equal(await (await fetch(`${server.url}/target.txt`)).text(), "second");
});

test("context directory removal emits only the exact deleted path", async (context) => {
  const extension: FileServerExtension = {
    async handle(_request, response, requestContext) {
      if (requestContext.path !== "remove-tree") return false;
      await requestContext.remove("tree");
      response.status(204).end();
      return true;
    },
  };
  const server = await startExtended({ "tree/a.txt": "a", "tree/nested/b.txt": "b" }, extension);
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());
  const event = nextEvent(socket);
  assert.equal((await fetch(`${server.url}/remove-tree`)).status, 204);
  assert.deepEqual(await event, { type: "deleted", path: "tree" });
  await expectNoEvent(socket);
});

test("change can transform or suppress events, while a thrown hook reports and publishes the original", async (context) => {
  const reported: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => { reported.push(values); };
  context.after(() => { console.error = original; });
  const extension: FileServerExtension = {
    change(event) {
      if (event.path === "suppressed.txt") return null;
      if (event.type === "created") return { ...event, path: `mapped/${event.path}` };
      if (event.type === "deleted") throw new Error("change failed");
      return event;
    },
  };
  const server = await startExtended({}, extension);
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());

  let event = nextEvent(socket);
  assert.equal((await fetch(`${server.url}/created.txt`, { method: "PUT", body: "created" })).status, 201);
  assert.deepEqual(await event, { type: "created", path: "mapped/created.txt" });
  assert.equal((await fetch(`${server.url}/suppressed.txt`, { method: "PUT", body: "suppressed" })).status, 201);
  await expectNoEvent(socket);
  event = nextEvent(socket);
  assert.equal((await fetch(`${server.url}/created.txt`, { method: "DELETE" })).status, 204);
  assert.deepEqual(await event, { type: "deleted", path: "created.txt" });
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]?.at(-1)), /change failed/);
});

test("invalid change results report and publish the original event", async (context) => {
  const reported: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => { reported.push(values); };
  context.after(() => { console.error = original; });
  for (const invalidEvent of [
    { type: "wrong", path: "bad" },
    { type: "created", path: "bad\uD800" },
  ]) {
    const server = await startExtended({}, { change: () => invalidEvent as never });
    context.after(() => server.close());
    const socket = await openSocket(server.url as string);
    context.after(() => socket.close());
    const event = nextEvent(socket);
    assert.equal((await fetch(`${server.url}/file.txt`, { method: "PUT", body: "file" })).status, 201);
    assert.deepEqual(await event, { type: "created", path: "file.txt" });
  }
  assert.equal(reported.length, 2);
});

test("a change hook cannot mutate the original event used for failure fallback", async (context) => {
  const original = console.error;
  console.error = () => undefined;
  context.after(() => { console.error = original; });
  const server = await startExtended({}, {
    change(event) {
      event.path = "mutated.txt";
      throw new Error("after mutation");
    },
  });
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());
  const event = nextEvent(socket);
  assert.equal((await fetch(`${server.url}/original.txt`, { method: "PUT", body: "file" })).status, 201);
  assert.deepEqual(await event, { type: "created", path: "original.txt" });
});

test("a rejected asynchronous change hook reports and publishes the original event", async (context) => {
  const reported: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => { reported.push(values); };
  context.after(() => { console.error = original; });
  const server = await startExtended({}, {
    async change() {
      await Promise.resolve();
      throw new Error("async change failed");
    },
  });
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());
  const event = nextEvent(socket);

  assert.equal((await fetch(`${server.url}/original.txt`, { method: "PUT", body: "file" })).status, 201);
  assert.deepEqual(await event, { type: "created", path: "original.txt" });
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]?.at(-1)), /async change failed/);
});

test("a change hook may mutate its event clone and return it as a valid transform", async (context) => {
  const server = await startExtended({}, {
    change(event) {
      event.path = `mapped/${event.path}`;
      return event;
    },
  });
  context.after(() => server.close());
  const socket = await openSocket(server.url as string);
  context.after(() => socket.close());
  const event = nextEvent(socket);
  assert.equal((await fetch(`${server.url}/original.txt`, { method: "PUT", body: "file" })).status, 201);
  assert.deepEqual(await event, { type: "created", path: "mapped/original.txt" });
});

async function startExtended(files: Record<string, string>, extension: FileServerExtension): Promise<FileServer> {
  const root = await makeRoot(files);
  return new FileServer({ root, extension }).listen({ port: 0 });
}

async function openSocket(baseUrl: string): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function nextEvent(socket: WebSocket): Promise<FileChangeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for event")), 3_000);
    socket.once("message", (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString()) as FileChangeEvent); });
  });
}

async function nextEvents(socket: WebSocket, count: number): Promise<FileChangeEvent[]> {
  return new Promise((resolve, reject) => {
    const events: FileChangeEvent[] = [];
    const timer = setTimeout(() => reject(new Error("timed out waiting for events")), 3_000);
    const onMessage = (data: WebSocket.RawData): void => {
      events.push(JSON.parse(data.toString()) as FileChangeEvent);
      if (events.length === count) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(events);
      }
    };
    socket.on("message", onMessage);
  });
}

async function expectNoEvent(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); resolve(); }, 200);
    const onMessage = (data: WebSocket.RawData): void => {
      clearTimeout(timer);
      reject(new Error(`unexpected event: ${data.toString()}`));
    };
    socket.once("message", onMessage);
  });
}
