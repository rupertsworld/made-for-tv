/** Reproducible light, dark and narrow screenshots of the built viewer. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test-results/integration");

test("realistic code and Markdown layouts render in light, dark and narrow schemes", async ({ page }) => {
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate(host => { host.innerHTML = '<tv-code label="example-repo"></tv-code>'; });
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).files = [
      { path: "README.md", content: "---\ntitle: Example repo\nstatus: Active\n---\n\n# Example repository\n\nA small service that keeps a file tree and a reader in sync. See [the entry point](src/app.ts#L7).\n\n## Getting started\n\nInstall the dependencies, then run the local server.\n\n```ts\nconst greeting = 'Hello, world';\nconsole.log(greeting);\n```\n\nThe viewer renders code, Markdown and images in one place." },
      { path: "src/app.ts", content: "import { createServer } from 'node:http';\nimport { loadConfig } from './config';\n\nconst config = loadConfig();\n\n// Start the local service.\nfunction startServer(port: number) {\n  const server = createServer((_request, response) => {\n    response.writeHead(200, { 'content-type': 'text/plain' });\n    response.end(`Hello from ${config.name}`);\n  });\n  server.listen(port);\n}\n\nstartServer(config.port);\n", size: 446 },
      { path: "src/config.ts", content: "export const loadConfig = () => ({ name: 'Example', port: 3000 });" },
      { path: "docs/architecture.md", content: "# Architecture\n\nThe service has a small HTTP boundary." },
      { path: "public/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="cornflowerblue"/></svg>' },
      { path: "package.json", content: '{"name":"example-repo","private":true}' },
      { path: "package-lock.json", content: '{}' },
      { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}' },
      { path: "node_modules/dependency/index.js", content: "export const dependency = true;" },
    ];
    (viewer as any).selected = "src/app.ts";
  });
  await expect(page.locator(".cv-code-view .cv-line")).toHaveCount(16);
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-sidebar-closed/);
  await page.screenshot({ path: path.join(directory, "code-light.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => { (viewer as HTMLElement).style.colorScheme = "dark"; });
  await page.screenshot({ path: path.join(directory, "code-dark.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "README.md"; });
  await expect(page.locator("tv-markdown h1")).toHaveText("Example repository");
  await page.screenshot({ path: path.join(directory, "markdown-dark.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "public/logo.svg"; });
  await expect(page.locator(".cv-media-image img")).toBeVisible();
  await page.screenshot({ path: path.join(directory, "image-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "Find file" }).click();
  await page.getByRole("combobox", { name: "Go to file" }).fill("config");
  await page.screenshot({ path: path.join(directory, "finder-dark.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 420, height: 800 });
  await page.locator("tv-code").evaluate(viewer => { (viewer as HTMLElement).style.colorScheme = "light"; (viewer as any).selected = "src/app.ts"; });
  await expect(page.locator(".cv-app")).toHaveClass(/cv-app-narrow/);
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await page.waitForTimeout(250); // The button-driven sidebar width has a 200 ms transition.
  await page.screenshot({ path: path.join(directory, "code-narrow.png"), fullPage: true });
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(directory, "overlay-narrow.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = null; });
  await page.screenshot({ path: path.join(directory, "empty-light.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "missing.ts"; });
  await expect(page.locator(".cv-pane-content .cv-failure")).toBeVisible();
  await page.screenshot({ path: path.join(directory, "failure-light.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "src/app.ts"; });
  await expect(page.locator(".cv-code-text").first()).toContainText("import");
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).files = ((viewer as any).files as Array<{ path: string }>).filter(file => file.path !== "src/app.ts");
  });
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await page.screenshot({ path: path.join(directory, "deleted-light.png"), fullPage: true });
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: () => [{ name: "slow.ts" }],
      read: () => new Promise(resolve => setTimeout(() => resolve("const loaded = true;"), 800)),
    };
    (viewer as any).selected = "slow.ts";
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(directory, "progress-light.png"), fullPage: true });
});
