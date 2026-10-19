/** Change letters in the tree, and a diff of a changed file in the file pane. */
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate(host => { host.innerHTML = "<tv-code></tv-code>"; });
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

const status = (page: Page, path: string) => page.locator(`.cv-row[data-path="${path}"] .cv-row-status`);
const diffBody = (page: Page) => page.locator(".cv-pane-content > .cv-pane-diff > iframe");
const modes = (page: Page) => page.getByRole("group", { name: "View mode" }).getByRole("button");
const mode = (page: Page, name: string) => page.getByRole("group", { name: "View mode" }).getByRole("button", { name, exact: true });
const counts = (page: Page) => page.locator(".cv-pane-path .cv-diff-counts");

/** Expect the view-mode buttons by name, with the pressed one. */
async function expectModes(page: Page, names: string[], pressed: string): Promise<void> {
  await expect(modes(page)).toHaveCount(names.length);
  expect(await modes(page).evaluateAll(buttons => buttons.map(button => [button.getAttribute("aria-label"), button.getAttribute("aria-pressed")])))
    .toEqual(names.map(name => [name, String(name === pressed)]));
}

test("entries with a status show its letter after the name and others show none", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).files = [
      { path: "new.ts", content: "new", status: "added" },
      { path: "src/changed.ts", content: "changed", status: "modified" },
      { path: "gone", type: "folder", status: "removed" },
      { path: "same.ts", content: "same" },
      { path: "odd.ts", content: "odd", status: "renamed" },
    ];
  });
  await expect(status(page, "new.ts")).toHaveText("A");
  await expect(status(page, "new.ts")).toHaveAttribute("title", "Added");
  await expect(status(page, "gone")).toHaveText("D");
  await expect(status(page, "gone")).toHaveAttribute("title", "Removed");
  await expect(status(page, "same.ts")).toHaveCount(0);
  await expect(status(page, "odd.ts")).toHaveCount(0);
  await expect(status(page, "src")).toHaveCount(0);
  await page.locator('.cv-row[data-path="src"]').click();
  await expect(status(page, "src/changed.ts")).toHaveText("M");
  await expect(status(page, "src/changed.ts")).toHaveAttribute("title", "Modified");
  const colours = await page.locator("tv-code").evaluate(viewer => {
    const probe = (variable: string) => {
      const element = document.createElement("span");
      element.style.color = `var(${variable})`;
      viewer.querySelector(".cv-app")!.append(element);
      const colour = getComputedStyle(element).color;
      element.remove();
      return colour;
    };
    const colour = (path: string) => getComputedStyle(viewer.querySelector(`.cv-row[data-path="${path}"] .cv-row-status`)!).color;
    return {
      added: [colour("new.ts"), probe("--_added")],
      modified: [colour("src/changed.ts"), probe("--_syntax-number")],
      removed: [colour("gone"), probe("--_removed")],
    };
  });
  for (const [actual, expected] of Object.values(colours)) expect(actual).toBe(expected);
  // The letter sits at the end of the row, after the name.
  const box = await page.locator('.cv-row[data-path="new.ts"]').evaluate(row => ({
    row: row.getBoundingClientRect().right,
    name: row.querySelector(".cv-row-name")!.getBoundingClientRect().right,
    letter: row.querySelector(".cv-row-status")!.getBoundingClientRect(),
  }));
  expect(box.letter.left).toBeGreaterThanOrEqual(box.name);
  expect(box.row - box.letter.right).toBeLessThan(8);
});

test("a listing that changes an entry's status updates its letter on refresh", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const state = { status: "modified" as string | undefined };
    (window as any).state = state;
    (viewer as any).connection = {
      list: () => [{ name: "a.ts", type: "file", status: state.status }, { name: "b.ts", type: "file" }],
      read: () => "text",
    };
  });
  await expect(status(page, "a.ts")).toHaveText("M");
  await expect(status(page, "b.ts")).toHaveCount(0);
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.status = undefined; (viewer as any).refresh("a.ts"); });
  await expect(status(page, "a.ts")).toHaveCount(0);
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.status = "added"; (viewer as any).refresh(); });
  await expect(status(page, "a.ts")).toHaveText("A");
});

test("a diff element is the default view of a changed file, beside its rendered and source views", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).reads = [];
    const elements: Record<string, HTMLElement> = {};
    for (const path of ["changed.md", "changed.ts"]) {
      const frame = document.createElement("iframe");
      frame.src = `data:text/html,<p>${path}</p>`;
      frame.dataset.additions = "2";
      frame.dataset.deletions = "1";
      elements[path] = frame;
    }
    (window as any).elements = elements;
    (viewer as any).diff = async (path: string) => elements[path] ?? null;
    (viewer as any).connection = {
      list: () => ["changed.md", "changed.ts", "same.md", "same.ts"].map(name => ({ name, type: "file" })),
      read: (path: string) => { (window as any).reads.push(path); return `contents of ${path}`; },
    };
    (viewer as any).selected = "changed.md";
  });
  const isElement = (path: string) => page.locator(".cv-pane-diff > *").evaluate((element, path) => element === (window as any).elements[path], path);
  await expect(diffBody(page)).toBeVisible();
  expect(await isElement("changed.md")).toBe(true);
  await expectModes(page, ["Preview", "Source", "Diff"], "Diff");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toHaveCount(0);
  await expect(counts(page)).toHaveText("+2\u22121");
  const size = await page.locator(".cv-pane-content").evaluate(content => ({
    content: [content.clientWidth, content.clientHeight],
    diff: [content.querySelector("iframe")!.clientWidth, content.querySelector("iframe")!.clientHeight],
  }));
  expect(size.diff).toEqual(size.content);
  expect(await page.evaluate(() => (window as any).reads)).toEqual([]);

  // The counts follow the element's attributes.
  await page.evaluate(() => { (window as any).elements["changed.md"].dataset.additions = "3"; });
  await expect(counts(page)).toHaveText("+3\u22121");

  await mode(page, "Preview").click();
  await expect(page.locator(".cv-markdown-view")).toContainText("contents of changed.md");
  await expectModes(page, ["Preview", "Source", "Diff"], "Preview");
  await expect(counts(page)).toHaveText("+3\u22121");
  await mode(page, "Source").click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of changed.md");
  await expectModes(page, ["Preview", "Source", "Diff"], "Source");
  await expect(page.locator("tv-code")).toHaveAttribute("show-source", "");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();
  await mode(page, "Diff").click();
  await expect(diffBody(page)).toBeVisible();
  expect(await isElement("changed.md")).toBe(true);
  await expectModes(page, ["Preview", "Source", "Diff"], "Diff");
  await mode(page, "Preview").click();
  await expect(page.locator(".cv-markdown-view")).toBeVisible();

  // Unchanged files keep the plain toggle, or none, and no counts.
  await page.locator('.cv-row[data-path="same.md"]').click();
  await expect(page.locator(".cv-markdown-view")).toContainText("contents of same.md");
  await expectModes(page, ["Preview", "Source"], "Preview");
  await expect(counts(page)).toHaveCount(0);
  await page.locator('.cv-row[data-path="same.ts"]').click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of same.ts");
  await expect(modes(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();

  // A changed code file offers its source and the diff, the diff first.
  await page.locator('.cv-row[data-path="changed.ts"]').click();
  await expect(diffBody(page)).toBeVisible();
  expect(await isElement("changed.ts")).toBe(true);
  await expectModes(page, ["Source", "Diff"], "Diff");
  await mode(page, "Source").click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of changed.ts");
  await expectModes(page, ["Source", "Diff"], "Source");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();

  // Opening a changed file again shows its diff again.
  await page.locator('.cv-row[data-path="changed.md"]').click();
  await expect(diffBody(page)).toBeVisible();
  await expectModes(page, ["Preview", "Source", "Diff"], "Diff");
  expect(await page.evaluate(() => (window as any).reads)).toEqual(["changed.md", "changed.md", "changed.md", "same.md", "same.ts", "changed.ts"]);
});

test("the pane follows the diff function as the tree changes", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const state = { changed: true };
    const element = document.createElement("iframe");
    element.src = "data:text/html,diff";
    (window as any).state = state;
    (viewer as any).diff = (path: string) => state.changed && path === "a.ts" ? element : null;
    (viewer as any).connection = { list: () => [{ name: "a.ts", type: "file" }, { name: "b.ts", type: "file" }], read: () => "text" };
    (viewer as any).selected = "a.ts";
  });
  await expect(diffBody(page)).toBeVisible();
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = false; (viewer as any).refresh("a.ts"); });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(modes(page)).toHaveCount(0);
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = true; (viewer as any).refresh("a.ts"); });
  await expect(diffBody(page)).toBeVisible();
  // Clearing the property shows the file again.
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).diff = null; });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(modes(page)).toHaveCount(0);
});
