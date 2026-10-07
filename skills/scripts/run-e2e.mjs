#!/usr/bin/env node
/** Run the Playwright suite of each skill on its own free local port. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDirectory = path.join(skillsRoot, "packages");
const playwright = path.join(skillsRoot, "node_modules", ".bin", "playwright");

for (const skillName of readdirSync(packagesDirectory).sort()) {
  const config = path.join(packagesDirectory, skillName, "playwright.config.ts");
  if (!existsSync(config)) continue;

  const port = await freePort();
  const result = spawnSync(playwright, ["test", "--config", config], {
    cwd: skillsRoot,
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
