#!/usr/bin/env node
/** Run each package's Playwright suite on its own free local port. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDirectory = path.join(repositoryRoot, "packages");
const playwright = path.join(repositoryRoot, "node_modules", ".bin", "playwright");

for (const packageName of readdirSync(packagesDirectory).sort()) {
  const config = path.join(packagesDirectory, packageName, "playwright.config.ts");
  if (!existsSync(config)) continue;

  const port = await freePort();
  const result = spawnSync(playwright, ["test", "--config", config], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: { ...process.env, ARTIFACT_E2E_PORT: String(port) },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
