/** Serve the repository root so tests load the same built files agents copy. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const port = Number(process.env.ARTIFACT_E2E_PORT ?? 53972);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: path.join(packageDirectory, "test", "browser"),
  outputDir: path.join(packageDirectory, "test-results"),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    browserName: "chromium",
    baseURL,
  },
  webServer: {
    command: `node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: repositoryRoot,
    url: `${baseURL}/packages/tv-code/test/browser/fixture.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
