import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { WebSocket } from "ws";

const children: ChildProcessWithoutNullStreams[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(children.splice(0).map(stopChild));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("built CLI serves a realistic vault over HTTP and WebSocket", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-e2e-"));
  roots.push(root);
  await cp(join(process.cwd(), "test/fixture-vault"), root, { recursive: true });
  const child = spawn(process.execPath, [
    "dist/src/cli.js", root, "--host", "127.0.0.1", "--port", "0",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  const baseUrl = await listenUrl(child);

  assert.equal(await (await fetch(`${baseUrl}/photo.jpg`)).text(), "fixture asset\n");
  assert.equal((await (await fetch(`${baseUrl}/folder`)).json() as { path: string }).path, "folder");
  const folder = await (await fetch(`${baseUrl}/folder/`)).json() as {
    path: string;
    entries: Array<{ name: string; type: string; modified?: string; size?: number }>;
  };
  assert.equal(folder.path, "folder");
  assert.deepEqual(folder.entries.map(({ name, type }) => ({ name, type })), [{ name: "child", type: "record" }]);
  assert.match(folder.entries[0]?.modified ?? "", /^\d{4}-/);
  assert.equal("size" in (folder.entries[0] ?? {}), false);

  const linksNote = await (await fetch(`${baseUrl}/links`)).json() as { fields: Record<string, unknown> } & Record<string, unknown>;
  assert.deepEqual(linksNote.fields, {
    page: { $type: "ref", path: "Page" },
    markdownPage: { $type: "ref", path: "Page" },
    dottedExplicit: { $type: "ref", path: "docs/v1.2" },
    dottedBare: { $type: "ref", path: "Node.js" },
    rootDotted: { $type: "ref", path: "v1.2" },
    asset: { $type: "ref", path: "photo.jpg" },
    list: [{ $type: "ref", path: "Page" }],
    nested: { target: { $type: "ref", path: "folder/child" } },
    fragment: { $type: "ref", path: "Page#Heading" },
    missing: { $type: "ref", path: "Missing" },
    aliased: { $type: "ref", path: "Page", label: "Fixture page" },
  });
  assert.equal(linksNote.body, "Body [Page](Page) is transformed for record reads.\n");
  assert.deepEqual(linksNote.links, [
    { path: "Page", field: "page" },
    { path: "Page", field: "markdownPage" },
    { path: "docs/v1.2", field: "dottedExplicit" },
    { path: "Node.js", field: "dottedBare" },
    { path: "v1.2", field: "rootDotted" },
    { path: "Page", field: "list" },
    { path: "folder/child", field: "nested" },
    { path: "Page", field: "fragment" },
    { path: "Page", field: "aliased" },
    { path: "Page" },
  ]);

  const written = await fetch(`${baseUrl}/round-trip`, {
    method: "PUT",
    headers: { "content-type": "application/vnd.telepath.record+json" },
    body: JSON.stringify({ fields: { status: "open" }, body: "round trip" }),
  });
  assert.equal(written.status, 201);
  assert.equal((await (await fetch(`${baseUrl}/round-trip`)).json() as { body: string }).body, "round trip");

  const socket = await openSocket(baseUrl);
  const event = nextEvent(socket);
  await writeFile(join(root, "external.md"), "external edit");
  assert.deepEqual(await event, { type: "created", path: "external" });
  socket.close();

  await stopChild(child);
  children.splice(children.indexOf(child), 1);
  assert.equal(child.exitCode, 0);
});

function listenUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`CLI did not listen; stderr: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/^url:    (http:\/\/[^\s]+)$/m);
      if (match?.[1]) { clearTimeout(timer); resolve(match[1]); }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`CLI exited ${code}; stderr: ${stderr}`)); });
  });
}

async function openSocket(baseUrl: string): Promise<WebSocket> {
  const socket = new WebSocket(baseUrl.replace("http", "ws") + "/");
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
}

function nextEvent(socket: WebSocket): Promise<{ type: string; path: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for event")), 3_000);
    socket.once("message", (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString()) as { type: string; path: string }); });
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}
