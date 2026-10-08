import { defineFileServerConformance } from "@rupertsworld/file-server/conformance";

import { VaultServer } from "../src/server.ts";

defineFileServerConformance(async (root, options) => {
  const server = await new VaultServer({ root, pingIntervalMs: options?.pingIntervalMs }).listen({ port: 0 });
  return {
    baseUrl: server.url as string,
    close: () => server.close(),
  };
});
