/** Change letters in the tree, and a page shown in the file pane in place of a file. */
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate(host => { host.innerHTML = "<tv-code></tv-code>"; });
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

const status = (page: Page, path: string) => page.locator(`.cv-row[data-path="${path}"] .cv-row-status`);
const frame = (page: Page) => page.locator(".cv-pane-content > iframe.cv-pane-frame");
const showFile = (page: Page) => page.getByRole("button", { name: "Show file" });

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

test("a frame address shows that page in place of the file, and Show file switches to the file", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).reads = [];
    (viewer as any).frame = async (path: string) => path.startsWith("changed") ? `data:text/html,<p>${path}</p>` : null;
    (viewer as any).connection = {
      list: () => [{ name: "changed.ts", type: "file" }, { name: "changed.md", type: "file" }, { name: "same.ts", type: "file" }],
      read: (path: string) => { (window as any).reads.push(path); return `contents of ${path}`; },
    };
    (viewer as any).selected = "changed.ts";
  });
  await expect(frame(page)).toHaveAttribute("src", "data:text/html,<p>changed.ts</p>");
  await expect(frame(page)).toHaveAttribute("title", "changed.ts");
  await expect(page.locator(".cv-pane-path")).toHaveText("changed.ts");
  await expect(showFile(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find file" })).toBeVisible();
  const size = await page.locator(".cv-pane-content").evaluate(content => ({
    content: [content.clientWidth, content.clientHeight],
    frame: [content.firstElementChild!.clientWidth, content.firstElementChild!.clientHeight],
  }));
  expect(size.frame).toEqual(size.content);
  expect(await page.evaluate(() => (window as any).reads)).toEqual([]);

  await showFile(page).click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of changed.ts");
  await expect(frame(page)).toHaveCount(0);
  await expect(showFile(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();
  await showFile(page).click();
  await expect(frame(page)).toHaveAttribute("src", "data:text/html,<p>changed.ts</p>");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toHaveCount(0);

  // A file without an address shows as usual, with no Show file button.
  await page.locator('.cv-row[data-path="same.ts"]').click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of same.ts");
  await expect(frame(page)).toHaveCount(0);
  await expect(showFile(page)).toHaveCount(0);

  // Show file applies to one opening: the next changed file shows its frame.
  await page.locator('.cv-row[data-path="changed.md"]').click();
  await expect(frame(page)).toHaveAttribute("src", "data:text/html,<p>changed.md</p>");
  await expect(page.getByRole("group", { name: "View mode" })).toHaveCount(0);
  await showFile(page).click();
  await expect(page.locator(".cv-markdown-view")).toContainText("contents of changed.md");
  await expect(page.getByRole("group", { name: "View mode" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).reads)).toEqual(["changed.ts", "same.ts", "changed.md"]);
});

test("the pane follows a frame address that changes with the tree", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const state = { changed: true };
    (window as any).state = state;
    (viewer as any).frame = (path: string) => state.changed ? `data:text/html,${path}` : null;
    (viewer as any).connection = { list: () => [{ name: "a.ts", type: "file" }, { name: "b.ts", type: "file" }], read: () => "text" };
    (viewer as any).selected = "a.ts";
  });
  await expect(frame(page)).toHaveAttribute("src", "data:text/html,a.ts");
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = false; (viewer as any).refresh("a.ts"); });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(showFile(page)).toHaveCount(0);
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = true; (viewer as any).refresh("a.ts"); });
  await expect(frame(page)).toHaveAttribute("src", "data:text/html,a.ts");
  // Clearing the property shows the file again.
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).frame = null; });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(showFile(page)).toHaveCount(0);
});
