/** Header controls and the reader preferences each page remembers between visits. */
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.evaluate(() => { document.querySelector("#host")!.innerHTML = "<tv-code></tv-code>"; });
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

/** A connection over an in-page folder tree that counts its `list` calls. */
async function connect(page: Page): Promise<void> {
  await page.locator("tv-code").evaluate(element => {
    const files: Record<string, string> = {
      "src/lib/util.ts": "export const util = 1;",
      "src/app.ts": "export const app = 1;",
      "docs/guide.md": "# Guide",
      "notes.md": "Notes",
    };
    const calls: string[] = [];
    (window as unknown as { listCalls: string[] }).listCalls = calls;
    (element as HTMLElement & { connection: unknown }).connection = {
      list(path: string) {
        calls.push(path);
        const prefix = path ? `${path}/` : "";
        const names = new Map<string, string>();
        for (const file of Object.keys(files)) {
          if (!file.startsWith(prefix)) continue;
          const rest = file.slice(prefix.length);
          names.set(rest.split("/")[0], rest.includes("/") ? "folder" : "file");
        }
        return [...names].map(([name, type]) => ({ name, type }));
      },
      read: (path: string) => files[path],
    };
  });
}

test("the sidebar header closes the sidebar and the file header finds files", async ({ page }) => {
  await ready(page);
  await connect(page);
  await expect(page.locator(".cv-sidebar-header .cv-close-sidebar")).toBeVisible();
  await expect(page.locator(".cv-sidebar-header [aria-label='Find file']")).toHaveCount(0);
  await page.locator(".cv-close-sidebar").click();
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await expect(page.locator(".cv-open-sidebar")).toBeVisible();
  await page.locator(".cv-pane-header .cv-find").click();
  await expect(page.locator(".cv-finder-input")).toBeFocused();
});

test("open folders, a closed sidebar, wrapping and the source view are remembered for the page", async ({ page }) => {
  await ready(page);
  await connect(page);
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/lib"]').click();
  await page.locator('.cv-row[data-path="notes.md"]').click();
  await page.locator(".cv-pane-action[aria-label='Source']").click();
  await page.locator('.cv-row[data-path="src/app.ts"]').click();
  await page.locator(".cv-pane-action[aria-label='Wrap lines']").click();
  await page.locator(".cv-close-sidebar").click();

  await ready(page);
  await connect(page);
  // The remembered folders open, listed through the connection as they come into view.
  await expect(page.locator('.cv-row[data-path="src/lib/util.ts"]')).toBeAttached();
  expect(await page.evaluate(() => (window as unknown as { listCalls: string[] }).listCalls)).toEqual(["", "src", "src/lib"]);
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await expect(page.locator("tv-code")).toHaveAttribute("wrap", "");
  await expect(page.locator("tv-code")).toHaveAttribute("show-source", "");
});

test("a page-set attribute is not remembered as a reader choice", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => element.setAttribute("wrap", ""));
  await ready(page);
  await expect(page.locator("tv-code")).not.toHaveAttribute("wrap", "");
});

test("the gutter fits the largest line number and keeps a straight divider", async ({ page }) => {
  await ready(page);
  const width = async (lines: number) => {
    await page.locator("tv-code").evaluate((element, lines) => {
      (element as HTMLElement & { files: object; selected: string }).files = { [`f${lines}.txt`]: Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n") };
      (element as HTMLElement & { selected: string }).selected = `f${lines}.txt`;
    }, lines);
    await expect(page.locator(".cv-line-number")).toHaveCount(Math.min(lines, 200), { timeout: 5000 }).catch(() => undefined);
    return page.locator(".cv-line-number").first().evaluate(element => ({
      width: element.getBoundingClientRect().width,
      radius: getComputedStyle(element).borderTopRightRadius,
    }));
  };
  const small = await width(9);
  const large = await width(12000);
  expect(small.radius).toBe("0px");
  expect(large.width).toBeGreaterThan(small.width);
  // Two digits plus padding: far narrower than the earlier fixed 58 px.
  expect(small.width).toBeLessThan(42);
});
