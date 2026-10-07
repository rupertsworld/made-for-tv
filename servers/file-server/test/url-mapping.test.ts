import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";

import { FileServer } from "../src/server.ts";
import { makeRoot } from "./helpers.ts";

test("app uses the path remaining beneath an Express mount prefix", async (context) => {
  const root = await makeRoot({ "nested/file.txt": "mounted" });
  const fileServer = new FileServer({ root });
  const hostApp = express();
  hostApp.use("/files", fileServer.app);
  const hostServer = createServer(hostApp);
  context.after(async () => {
    await fileServer.close();
    if (hostServer.listening) await new Promise<void>((resolve) => hostServer.close(() => resolve()));
  });
  await new Promise<void>((resolve) => hostServer.listen(0, "127.0.0.1", resolve));
  const address = hostServer.address();
  assert(address && typeof address === "object");
  assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/files/nested/file.txt`)).text(), "mounted");
});
