/** Restoring the open file and lines from the page's own preferences. */
import { expect, test, type Page } from "@playwright/test";

const fixture = "/packages/tv-code/test/browser/fixture.html";

async function mount(page: Page, markup = "<tv-code></tv-code>"): Promise<void> {
  await page.evaluate(html => {
    document.body.dataset.selectCount = "0";
    document.addEventListener("select", () => { document.body.dataset.selectCount = String(Number(document.body.dataset.selectCount) + 1); });
    document.querySelector("#host")!.innerHTML = html;
  }, markup);
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

async function visit(page: Page, markup?: string): Promise<void> {
  await page.goto(fixture);
  await mount(page, markup);
}

async function files(page: Page, contents: Record<string, string>): Promise<void> {
  await page.locator("tv-code").evaluate((viewer, value) => { (viewer as any).files = value; }, contents);
}

async function connect(page: Page): Promise<void> {
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).listCalls = [];
    (window as any).reads = [];
    (viewer as any).connection = {
      list: (folder: string) => {
        (window as any).listCalls.push(folder);
        if (folder === "") return [{ name: "README.md" }, { name: "src", type: "folder" }];
        if (folder === "src") return [{ name: "lib", type: "folder" }];
        return [{ name: "app.ts" }];
      },
      read: (path: string) => {
        (window as any).reads.push(path);
        return path === "README.md" ? "# Home" : "one\ntwo\nthree";
      },
    };
  });
}

test("files restore the open file and selected lines after a page reload without select", async ({ page }) => {
  const contents = { "README.md": "# Home", "src/app.ts": "one\ntwo\nthree" };
  await visit(page);
  await files(page, contents);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/app.ts"]').click();
  await page.getByRole("button", { name: "Select line 2" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");

  await page.reload();
  await mount(page);
  await files(page, contents);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator('.cv-line-selected[data-line="2"]')).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

test("child tags restore a nested file and its lines after a page reload", async ({ page }) => {
  const markup = '<tv-code><tv-code-file path="README.md"># Home</tv-code-file><tv-code-folder path="src"><tv-code-file path="app.ts">one\ntwo\nthree</tv-code-file></tv-code-folder></tv-code>';
  await visit(page, markup);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/app.ts"]').click();
  await page.getByRole("button", { name: "Select line 3" }).click();
  await page.reload();
  await mount(page, markup);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "3");
  await expect(page.locator('.cv-line-selected[data-line="3"]')).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

test("a connection lists remembered folders before restoring the file and lines", async ({ page }) => {
  await visit(page);
  await connect(page);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/lib"]').click();
  await page.locator('.cv-row[data-path="src/lib/app.ts"]').click();
  await page.getByRole("button", { name: "Select line 2" }).click();
  await page.reload();
  await mount(page);
  await connect(page);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/lib/app.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator('.cv-line-selected[data-line="2"]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).listCalls)).toEqual(["", "src", "src/lib"]);
  expect(await page.evaluate(() => (window as any).reads)).not.toContain("README.md");
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

for (const form of ["attribute", "property"] as const) {
  test(`page-set selected ${form} wins over the remembered file`, async ({ page }) => {
    const contents = { "README.md": "# Home", "a.ts": "A", "b.ts": "B" };
    await visit(page);
    await files(page, contents);
    await page.locator('.cv-row[data-path="b.ts"]').click();
    await page.reload();
    await mount(page, form === "attribute" ? '<tv-code selected="a.ts"></tv-code>' : undefined);
    if (form === "property") await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "a.ts"; });
    await files(page, contents);
    await expect(page.locator("tv-code")).toHaveAttribute("selected", "a.ts");
    await expect(page.locator(".cv-code-text")).toHaveText("A");
    await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
  });
}

test("a missing remembered file falls back to README without select", async ({ page }) => {
  await visit(page);
  await files(page, { "README.md": "# Home", "gone.ts": "one\ntwo" });
  await page.locator('.cv-row[data-path="gone.ts"]').click();
  await page.getByRole("button", { name: "Select line 2" }).click();
  await page.reload();
  await mount(page);
  await files(page, { "README.md": "# Home", "other.ts": "Other" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
  await expect(page.locator("tv-code")).not.toHaveAttribute("lines", /./);
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

test("a connection confirms a remembered nested file is missing before opening README", async ({ page }) => {
  await visit(page);
  await connect(page);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/lib"]').click();
  await page.locator('.cv-row[data-path="src/lib/app.ts"]').click();
  await page.reload();
  await mount(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).listCalls = [];
    (viewer as any).connection = {
      list: (folder: string) => {
        (window as any).listCalls.push(folder);
        if (folder === "") return [{ name: "README.md" }, { name: "src", type: "folder" }];
        if (folder === "src") return [{ name: "lib", type: "folder" }];
        return [];
      },
      read: () => "# Home",
    };
  });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
  expect(await page.evaluate(() => (window as any).listCalls)).toEqual(["", "src", "src/lib"]);
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

test("closing a restored connection file stays closed through refresh", async ({ page }) => {
  await visit(page);
  await connect(page);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/lib"]').click();
  await page.locator('.cv-row[data-path="src/lib/app.ts"]').click();
  await page.reload();
  await mount(page);
  await connect(page);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/lib/app.ts");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = null; (viewer as any).refresh(); });
  await expect.poll(() => page.evaluate(() => (window as any).listCalls.length)).toBeGreaterThan(3);
  await expect(page.locator("tv-code")).not.toHaveAttribute("selected", /./);
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem(`tv-code:preferences:${location.pathname}`) ?? "{}"));
  expect(remembered).toMatchObject({ selected: null, lines: null });
});

test("README opening and page-assigned file and lines are remembered", async ({ page }) => {
  const contents = { "README.md": "# Home", "other.ts": "one\ntwo" };
  await visit(page);
  await files(page, contents);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
  const preference = () => page.evaluate(() => JSON.parse(localStorage.getItem(`tv-code:preferences:${location.pathname}`) ?? "{}"));
  expect(await preference()).toMatchObject({ selected: "README.md", lines: null });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "other.ts"; (viewer as any).lines = "2"; });
  expect(await preference()).toMatchObject({ selected: "other.ts", lines: "2" });
  await page.reload();
  await mount(page);
  await files(page, contents);
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "other.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator("body")).toHaveAttribute("data-select-count", "0");
});

test("page-setting a different file without lines clears stale remembered lines", async ({ page }) => {
  await visit(page);
  await files(page, { "README.md": "# Home", "old.ts": "one\ntwo" });
  await page.locator('.cv-row[data-path="old.ts"]').click();
  await page.getByRole("button", { name: "Select line 2" }).click();
  await page.reload();
  await mount(page);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "new.ts"; });
  await files(page, { "README.md": "# Home", "new.ts": "new" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "new.ts");
  await expect(page.locator("tv-code")).not.toHaveAttribute("lines", /./);
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem(`tv-code:preferences:${location.pathname}`) ?? "{}"));
  expect(remembered).toMatchObject({ selected: "new.ts", lines: null });
});

test("automatic opening, live line remapping and closing update the remembered selection", async ({ page }) => {
  await visit(page);
  await files(page, { "app.ts": "one\ntwo\nthree" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "app.ts");
  const preference = () => page.evaluate(() => JSON.parse(localStorage.getItem(`tv-code:preferences:${location.pathname}`) ?? "{}"));
  expect(await preference()).toMatchObject({ selected: "app.ts" });
  await page.getByRole("button", { name: "Select line 2" }).click();
  expect(await preference()).toMatchObject({ selected: "app.ts", lines: "2" });
  await files(page, { "app.ts": "added\none\ntwo\nthree" });
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "3");
  expect(await preference()).toMatchObject({ selected: "app.ts", lines: "3" });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = null; });
  await expect(page.locator("tv-code")).not.toHaveAttribute("selected", /./);
  expect(await preference()).toMatchObject({ selected: null, lines: null });
  await page.reload();
  await mount(page);
  await files(page, { "README.md": "# Home", "app.ts": "added\none\ntwo\nthree" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
  await expect(page.locator("tv-code")).not.toHaveAttribute("lines", /./);
});
