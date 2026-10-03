/** A single file uses the built viewer without tree or finder navigation. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test-results/single");

async function ready(page: Page, markup = "<tv-code></tv-code>"): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate((host, html) => { host.innerHTML = html; }, markup);
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

async function expectSingleLayout(page: Page, path: string): Promise<void> {
  await expect(page.locator(".cv-sidebar")).toBeHidden();
  await expect(page.locator(".cv-resize-handle")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open sidebar" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Find file" })).toBeHidden();
  await expect(page.locator(".cv-pane-path")).toHaveText(path);
  await expect(page.locator(".cv-pane-path button")).toHaveCount(0);
  const widths = await page.locator(".cv-app").evaluate(app => ({ app: app.getBoundingClientRect().width, pane: app.querySelector(".cv-pane")!.getBoundingClientRect().width }));
  expect(widths.pane).toBeCloseTo(widths.app, 0);
  for (const key of ["t", "Control+p", "Meta+p"]) {
    await page.keyboard.press(key);
    await expect(page.locator(".cv-finder")).toBeHidden();
  }
}

test("one files object opens silently, updates in place, and switches to and from a tree", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    viewer.addEventListener("select", () => { document.body.dataset.selectCount = String(Number(document.body.dataset.selectCount ?? "0") + 1); });
    (viewer as any).files = { "src/lib/app.ts": "one\ntwo" };
  });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/lib/app.ts");
  await expect(page.locator(".cv-code-text")).toHaveText(["one", "two"]);
  await expectSingleLayout(page, "src/lib/app.ts");
  mkdirSync(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDirectory, "single-file.png"), fullPage: true });
  await expect(page.locator("body")).not.toHaveAttribute("data-select-count", /./);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "src/lib/app.ts": "one\nchanged" }; });
  await expect(page.locator(".cv-code-text")).toHaveText(["one", "changed"]);
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "src/lib/app.ts": "one\nchanged", "other.ts": "other" }; });
  await expect(page.locator(".cv-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find file" })).toBeVisible();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/lib/app.ts");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "src/lib/app.ts": "one\nchanged" }; });
  await expectSingleLayout(page, "src/lib/app.ts");
});

test("one nested child file opens and tag edits update the code view as input size changes", async ({ page }) => {
  await ready(page, '<tv-code><tv-code-folder path="src"><tv-code-file path="app.ts">one</tv-code-file></tv-code-folder></tv-code>');
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await expectSingleLayout(page, "src/app.ts");
  await page.locator("tv-code-file").evaluate(file => { file.textContent = "changed"; });
  await expect(page.locator(".cv-code-text")).toHaveText("changed");
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
  await page.locator("tv-code-folder").evaluate(folder => { folder.insertAdjacentHTML("beforeend", '<tv-code-file path="other.ts">other</tv-code-file>'); });
  await expect(page.locator(".cv-sidebar")).toBeVisible();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await page.locator('tv-code-file[path="other.ts"]').evaluate(file => file.remove());
  await expectSingleLayout(page, "src/app.ts");
});

test("a read-only connection opens selected, re-reads on both refresh forms, and marks 404 deleted", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).reads = [];
    (window as any).content = "one";
    viewer.addEventListener("select", () => { document.body.dataset.selectCount = String(Number(document.body.dataset.selectCount ?? "0") + 1); });
    (viewer as any).selected = "src/app.ts";
    (viewer as any).connection = { read: (path: string) => {
      (window as any).reads.push(path);
      return (window as any).content === null ? new Response("", { status: 404 }) : (window as any).content;
    } };
  });
  await expect(page.locator(".cv-code-text")).toHaveText("one");
  await expectSingleLayout(page, "src/app.ts");
  await expect(page.locator("body")).not.toHaveAttribute("data-select-count", /./);
  await page.evaluate(() => { (window as any).content = "two"; (document.querySelector("tv-code") as any).refresh(); });
  await expect(page.locator(".cv-code-text")).toHaveText("two");
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
  await page.evaluate(() => { (window as any).content = "three"; (document.querySelector("tv-code") as any).refresh("src/app.ts"); });
  await expect.poll(() => page.evaluate(() => (window as any).reads.length)).toBe(3);
  await expect(page.locator(".cv-code-text")).toHaveText("three");
  await page.evaluate(() => { (window as any).content = null; (document.querySelector("tv-code") as any).refresh(); });
  await expect(page.locator(".cv-deleted")).toBeVisible();
  expect(await page.evaluate(() => (window as any).reads)).toEqual(["src/app.ts", "src/app.ts", "src/app.ts", "src/app.ts"]);
});

test("switching connection forms keeps the open path and restores tree controls", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).selected = "src/app.ts";
    (viewer as any).connection = { read: () => "one" };
  });
  await expectSingleLayout(page, "src/app.ts");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).connection = { list: () => [{ path: "src/app.ts" }, { path: "other.ts" }], read: () => "two" }; });
  await expect(page.locator(".cv-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find file" })).toBeVisible();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).connection = { read: () => "three" }; });
  await expectSingleLayout(page, "src/app.ts");
  await expect(page.locator(".cv-code-text")).toHaveText("three");
});

test("a read-only connection can receive its selected path after assignment", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).connection = { read: (path: string) => `Read ${path}` }; });
  await expect(page.locator(".cv-sidebar")).toBeHidden();
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "docs/late.txt"; });
  await expect(page.locator(".cv-code-text")).toHaveText("Read docs/late.txt");
  await expectSingleLayout(page, "docs/late.txt");
});

test("single-file mode leaves remembered sidebar choices untouched", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "a.ts": "A", "b.ts": "B" }; });
  await page.getByRole("button", { name: "Close sidebar" }).click();
  const sidebarPreferences = () => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem(`tv-code:preferences:${location.pathname}`) ?? "{}");
    return { closed: stored.sidebarClosed, expanded: stored.expanded ?? null, width: localStorage.getItem(`tv-code:sidebar-width:${location.pathname}`) };
  });
  const before = await sidebarPreferences();
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "a.ts": "A" }; });
  await expectSingleLayout(page, "a.ts");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).files = { "a.ts": "A", "b.ts": "B" }; });
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await expect(page.getByRole("button", { name: "Open sidebar" })).toBeVisible();
  expect(await sidebarPreferences()).toEqual(before);
});
