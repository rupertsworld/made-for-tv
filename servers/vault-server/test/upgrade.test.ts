import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { VaultServer } from "../src/server.ts";
import { nextEvent, openSocket } from "./helpers.ts";

test("VaultServer handleUpgrade accepts a mount-relative request target", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vault-server-upgrade-"));
  await writeFile(join(root, "note.md"), "before");
  const vault = new VaultServer({ root });
  const host = createServer(vault.app);
  context.after(async () => {
    await vault.close();
    if (host.listening) await new Promise<void>((resolve) => host.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  host.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/vault/")) {
      socket.destroy();
      return;
    }
    void vault.handleUpgrade(request, socket, head, `${url.pathname.slice("/vault".length)}${url.search}`)
      .catch(() => socket.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    host.once("error", reject);
    host.listen(0, "127.0.0.1", () => {
      host.off("error", reject);
      resolve();
    });
  });
  const address = host.address();
  assert(address && typeof address === "object");

  const socket = await openSocket(`http://127.0.0.1:${address.port}`, "/vault/");
  context.after(() => socket.close());
  const event = nextEvent(socket);
  await writeFile(join(root, "note.md"), "after");
  assert.deepEqual(await event, { type: "modified", path: "note" });
});
