import { FileServer } from "../src/server.ts";
import { defineFileServerConformance } from "../src/conformance/index.ts";

defineFileServerConformance(async (root, options) => {
  const server = await new FileServer({ root, pingIntervalMs: options?.pingIntervalMs }).listen({ port: 0 });
  return new FileServerConformanceAdapter(server);
});

class FileServerConformanceAdapter {
  private readonly server: FileServer;
  constructor(server: FileServer) { this.server = server; }
  get baseUrl(): string { return this.server.url as string; }
  close(): Promise<void> { return this.server.close(); }
}
