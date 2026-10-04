/** Browser contracts for the standalone finder module, loaded through Vite. */
import { expect, test, type Page } from "@playwright/test";
import type { Finder, FinderFile } from "../../src/finder";

type FinderEvent = { type: "open"; path: string; line: number | null }
  | { type: "line"; line: number }
  | { type: "close" };

declare global {
  interface Window {
    finderHarness: {
      finder: Finder;
      events: FinderEvent[];
      setFiles(files: FinderFile[]): void;
      setRecent(paths: string[]): void;
      setPending(count: number): void;
    };
  }
}

const fixture = "/packages/tv-code/test/browser/finder-fixture.html";

async function ready(page: Page, files: FinderFile[] = []): Promise<void> {
  await page.goto(fixture);
  await page.waitForFunction(() => Boolean(window.finderHarness));
  await page.evaluate(value => window.finderHarness.setFiles(value), files);
}

async function open(page: Page): Promise<void> {
  await page.evaluate(() => window.finderHarness.finder.open());
}

const paths = ["src/lib/indexer/x.ts", "src/index.ts", "src/foo.spec.ts", "spec/index.md"]
  .map(path => ({ path, dimmed: false }));

test("opening focuses the combobox and typing ranks, emphasises, limits, and scrolls results", async ({ page }) => {
  await ready(page, paths);
  await page.locator("#before").focus();
  await open(page);
  const input = page.getByRole("combobox", { name: "Go to file" });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-controls", /cv-finder-list/);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const rows = page.getByRole("option");
  const initialActiveId = await input.getAttribute("aria-activedescendant");
  expect(initialActiveId).toBe(await rows.first().getAttribute("id"));
  await input.fill("index");
  await expect(rows.first()).toContainText("index.ts");
  await expect(rows.first().locator(".cv-finder-name .cv-finder-match")).toHaveText("index");
  await input.fill("src/in");
  await expect(rows.first().locator(".cv-finder-folder .cv-finder-match")).toHaveText("src/");
  await expect(rows.first().locator(".cv-finder-name .cv-finder-match")).toHaveText("in");
  await page.evaluate(() => window.finderHarness.setFiles(
    Array.from({ length: 100 }, (_, index) => ({ path: `src/file-${index}.ts`, dimmed: false })),
  ));
  await input.fill("");
  await expect(rows).toHaveCount(50);
  await input.press("ArrowUp");
  await expect(rows.last()).toHaveAttribute("aria-selected", "true");
  const selectedIsVisible = await rows.last().evaluate(row => {
    const rowBounds = row.getBoundingClientRect();
    const listBounds = row.parentElement!.getBoundingClientRect();
    return rowBounds.top >= listBounds.top && rowBounds.bottom <= listBounds.bottom;
  });
  expect(selectedIsVisible).toBe(true);
});

test("empty query puts recent files first, excludes missing recent paths, and leaves tree order after them", async ({ page }) => {
  await ready(page, paths);
  await page.evaluate(() => window.finderHarness.setRecent(["gone.ts", "spec/index.md", "src/index.ts"]));
  await open(page);
  await expect(page.getByRole("option")).toHaveText([
    /index\.md.*spec/, /index\.ts.*src/, /x\.ts.*src\/lib\/indexer/, /foo\.spec\.ts.*src/,
  ]);
});

test("arrow keys wrap, Enter opens the highlighted path and line, and focus returns", async ({ page }) => {
  await ready(page, paths);
  await page.locator("#before").focus();
  await open(page);
  const input = page.getByRole("combobox");
  await input.fill("spec:27");
  await input.press("ArrowUp");
  await expect(page.getByRole("option").last()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.locator("#before")).toBeFocused();
  expect(await page.evaluate(() => window.finderHarness.events)).toEqual([
    { type: "open", path: "src/foo.spec.ts", line: 27 }, { type: "close" },
  ]);
});

test("click opens a result at its line and a line-only query calls onGoToLine", async ({ page }) => {
  await ready(page, paths);
  await open(page);
  await page.getByRole("combobox").fill("index:12");
  await page.getByRole("option").first().click();
  expect(await page.evaluate(() => window.finderHarness.events[0])).toEqual({ type: "open", path: "src/index.ts", line: 12 });
  await open(page);
  await page.getByRole("combobox").fill(":42");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toHaveText("Go to line 42");
  await page.getByRole("combobox").press("Enter");
  expect(await page.evaluate(() => window.finderHarness.events.at(-2))).toEqual({ type: "line", line: 42 });
});

test("Escape and backdrop close and restore focus", async ({ page }) => {
  await ready(page, paths);
  await page.evaluate(() => {
    const viewer = document.querySelector("tv-code")!;
    viewer.addEventListener("keydown", event => {
      if (event instanceof KeyboardEvent && event.key === "Escape" && !window.finderHarness.finder.isOpen) {
        viewer.setAttribute("data-sidebar-closed", "true");
      }
    });
  });
  await page.locator("#before").focus();
  await open(page);
  await page.getByRole("combobox").press("Escape");
  await expect(page.locator("#before")).toBeFocused();
  await expect(page.getByRole("combobox", { includeHidden: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("tv-code")).not.toHaveAttribute("data-sidebar-closed", "true");
  await open(page);
  await page.locator(".cv-finder-backdrop").click({ position: { x: 5, y: 200 } });
  await expect(page.locator("#before")).toBeFocused();
  expect(await page.evaluate(() => window.finderHarness.events.filter(event => event.type === "close").length)).toBe(2);
});

test("composition keys edit the query without opening a result or closing the panel", async ({ page }) => {
  await ready(page, paths);
  await open(page);
  await page.getByRole("combobox").fill("index");
  await page.evaluate(() => {
    const input = document.querySelector(".cv-finder-input")!;
    for (const key of ["Enter", "Escape"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key, isComposing: true, bubbles: true, cancelable: true,
      }));
    }
  });
  await expect(page.getByRole("combobox")).toBeVisible();
  expect(await page.evaluate(() => window.finderHarness.events)).toEqual([]);
});

test("pointer hover selects and update keeps that path while showing pending folders", async ({ page }) => {
  await ready(page, paths);
  await open(page);
  await page.getByRole("option").nth(2).hover();
  await expect(page.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => {
    const harness = window.finderHarness;
    harness.setFiles([{ path: "new.ts", dimmed: false }, ...[
      "src/lib/indexer/x.ts", "src/index.ts", "src/foo.spec.ts", "spec/index.md",
    ].map(path => ({ path, dimmed: false }))]);
    harness.setPending(12);
  });
  await expect(page.getByRole("option", { name: /foo\.spec\.ts/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".cv-finder-progress")).toContainText("Listing 12 folders…");
  await expect(page.locator(".cv-finder-spinner")).toBeVisible();
  await page.evaluate(() => window.finderHarness.setPending(0));
  await expect(page.locator(".cv-finder-progress")).toBeHidden();
});

test("new matches do not displace the highlighted file from a full result list", async ({ page }) => {
  const original = Array.from({ length: 50 }, (_, index) => ({
    path: `src/index-${String(index).padStart(3, "0")}.ts`, dimmed: false,
  }));
  await ready(page, original);
  await open(page);
  const input = page.getByRole("combobox");
  await input.fill("index");
  await input.press("ArrowUp");
  const selectedPath = "index-049.ts";
  await expect(page.getByRole("option", { selected: true })).toContainText(selectedPath);
  await page.evaluate(() => {
    const next = Array.from({ length: 60 }, (_, index) => ({
      path: `index-${String(index).padStart(3, "0")}.ts`, dimmed: false,
    }));
    const original = Array.from({ length: 50 }, (_, index) => ({
      path: `src/index-${String(index).padStart(3, "0")}.ts`, dimmed: false,
    }));
    window.finderHarness.setFiles([...next, ...original]);
    window.finderHarness.setPending(2);
  });
  await expect(page.getByRole("option")).toHaveCount(50);
  await expect(page.getByRole("option", { selected: true })).toContainText(selectedPath);
  await expect(input).toHaveAttribute("aria-activedescendant", /cv-finder-list-\d+-row-\d+/);
  await expect(page.locator(".cv-finder-progress")).toContainText("Listing 2 folders…");
  await expect(page.locator(".cv-finder-progress")).toHaveAttribute("aria-live", "polite");
});

test("new files do not displace an empty-query highlight from a full list", async ({ page }) => {
  const original = Array.from({ length: 50 }, (_, index) => ({
    path: `z-${String(index).padStart(3, "0")}.ts`, dimmed: false,
  }));
  await ready(page, original);
  await open(page);
  await page.getByRole("combobox").press("ArrowUp");
  await expect(page.getByRole("option", { selected: true })).toContainText("z-049.ts");
  await page.evaluate(() => window.finderHarness.setFiles([
    ...Array.from({ length: 60 }, (_, index) => ({
      path: `a-${String(index).padStart(3, "0")}.ts`, dimmed: false,
    })),
    ...Array.from({ length: 50 }, (_, index) => ({
      path: `z-${String(index).padStart(3, "0")}.ts`, dimmed: false,
    })),
  ]));
  await expect(page.getByRole("option")).toHaveCount(50);
  await expect(page.getByRole("option", { selected: true })).toContainText("z-049.ts");
});

test("repository-like queries rank expected paths ahead of dimmed dependencies", async ({ page }) => {
  const sourcePaths = [
    "spec/index.md", "spec/tv-code-viewer/style.css", "spec/tv-code-viewer/index.md",
    "packages/tv-code-viewer/test/browser/finder.spec.ts", "vitest.config.ts",
    "packages/tv-code-viewer/vite.config.ts", "packages/tv-code-viewer/src/finder.ts",
    "skills/tv-markdown/tv-markdown.js", "package.json", "package-lock.json",
    "skills/tv-markdown/SKILL.md", "skills/tv-code-viewer/tv-code-viewer.js",
  ];
  await ready(page, [
    ...sourcePaths.map(path => ({ path, dimmed: false })),
    ...Array.from({ length: 300 }, (_, index) => ({
      path: `node_modules/package-${index}/index.js`, dimmed: true,
    })),
    { path: "node_modules/finder.ts", dimmed: true },
  ]);
  await open(page);
  const input = page.getByRole("combobox");
  for (const [query, expected] of [
    ["index", "index.md"],
    ["vite", "vite.config.ts"],
    ["finder", "finder.ts"],
    ["style", "style.css"],
    ["pkg json", "package.json"],
    ["skill", "SKILL.md"],
    ["code view", "tv-code-viewer.js"],
  ]) {
    await input.fill(query);
    await expect(page.getByRole("option").first(), query).toContainText(expected);
  }
  await input.fill("spec");
  await expect(page.getByRole("option").first()).toContainText("finder.spec.ts");
  await expect(page.getByRole("option").filter({ hasText: /index\.md.*spec\// })).toHaveCount(2);
  await input.fill("tvmd");
  await expect(page.getByRole("option").filter({ hasText: "tv-markdown.js" })).toHaveCount(1);
  await input.fill("finder");
  await expect(page.getByRole("option").first()).not.toHaveClass(/cv-finder-dimmed/);
  await expect(page.getByRole("option").last()).toHaveClass(/cv-finder-dimmed/);
});

test("file paths render as text and the open finder keeps its neutral border without a focus outline", async ({ page }) => {
  await ready(page, [{ path: 'src/<img src=x onerror=alert(1)>.ts', dimmed: false }]);
  await page.locator("#before").focus();
  await page.keyboard.press("Tab");
  await open(page);
  const input = page.getByRole("combobox");
  await expect(input).toBeFocused();
  await expect(page.getByRole("option")).toContainText("<img src=x onerror=alert(1)>.ts");
  await expect(page.locator(".cv-finder-row img")).toHaveCount(0);
  expect(await input.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("none");
  const panelStyle = await page.locator(".cv-finder-panel").evaluate(element => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, border: style.borderStyle, shadow: style.boxShadow };
  });
  expect(panelStyle.outline).toBe("none");
  expect(panelStyle.border).toBe("solid");
  expect(panelStyle.shadow).not.toBe("none");
});

test("an unmatched query shows a muted row after folder listing finishes", async ({ page }) => {
  await ready(page, paths);
  await open(page);
  await page.evaluate(() => window.finderHarness.setPending(2));
  await page.getByRole("combobox").fill("not-a-file-anywhere");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.locator(".cv-finder-empty")).toBeHidden();
  await expect(page.locator(".cv-finder-progress")).toContainText("Listing 2 folders…");
  await page.evaluate(() => window.finderHarness.setPending(0));
  await expect(page.locator(".cv-finder-empty")).toBeVisible();
  await expect(page.locator(".cv-finder-empty")).toHaveText("No matching files");
  await expect(page.getByRole("listbox").getByRole("status")).toHaveCount(0);
  const emptyColor = await page.locator(".cv-finder-empty").evaluate(element => getComputedStyle(element).color);
  const mutedColor = await page.locator(".cv-finder-progress").evaluate(element => getComputedStyle(element).color);
  expect(emptyColor).toBe(mutedColor);
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.getByRole("combobox").press("Enter");
  expect(await page.evaluate(() => window.finderHarness.events)).toEqual([]);
  await page.getByRole("combobox").fill("index");
  await expect(page.locator(".cv-finder-empty")).toBeHidden();
});

test("dimmed matches rank last and file kinds have distinct icons", async ({ page }) => {
  await ready(page, [
    { path: "src/index.ts", dimmed: true },
    { path: "src/lib/indexer.ts", dimmed: false },
    { path: "README.md", dimmed: false },
    { path: "image.png", dimmed: false },
    { path: "data.yaml", dimmed: false },
    { path: "LICENSE", dimmed: false },
  ]);
  await open(page);
  const iconShapes = await page.getByRole("option").evaluateAll(rows =>
    rows.map(row => row.querySelector("svg")?.innerHTML));
  expect(new Set(iconShapes).size).toBe(5);
  await page.getByRole("combobox").fill("index");
  await expect(page.getByRole("option").first()).toContainText("indexer.ts");
  await expect(page.getByRole("option").last()).toHaveClass(/cv-finder-dimmed/);
});

test("known source and Markdown extensions use their kind icons", async ({ page }) => {
  await ready(page, [
    "README.md", "README.markdown", "main.ts", "main.kt", "Dockerfile", "Makefile",
    "app.less", "schema.graphql", "setup.ps1", "script.lua",
  ].map(path => ({ path, dimmed: false })));
  await open(page);
  const shapes = await page.getByRole("option").evaluateAll(rows =>
    Object.fromEntries(rows.map(row => [row.textContent, row.querySelector("svg")?.innerHTML])));
  expect(shapes["README.markdown"]).toBe(shapes["README.md"]);
  for (const path of ["main.kt", "Dockerfile", "Makefile", "app.less", "schema.graphql", "setup.ps1", "script.lua"]) {
    expect(shapes[path], path).toBe(shapes["main.ts"]);
  }
});

test("panel stays centred with 16 px side clearance on a narrow viewer", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await ready(page, [{ path: `src/${"very-long-file-name-".repeat(12)}.ts`, dimmed: false }]);
  await open(page);
  const viewer = await page.locator("tv-code").boundingBox();
  const panel = await page.locator(".cv-finder-panel").boundingBox();
  expect(viewer).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(panel!.width).toBeLessThanOrEqual(viewer!.width - 32);
  expect(Math.abs(panel!.x + panel!.width / 2 - (viewer!.x + viewer!.width / 2))).toBeLessThan(1);
  const rowFits = await page.getByRole("option").evaluate(row => row.scrollWidth <= row.clientWidth);
  expect(rowFits).toBe(true);
});

test("narrow results keep a short file name readable before truncating its folder", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await ready(page, [{ path: "packages/tv-code-viewer/src/finder.ts", dimmed: false }]);
  await open(page);
  const widths = await page.getByRole("option").evaluate(row => {
    const name = row.querySelector(".cv-finder-name")!;
    const folder = row.querySelector(".cv-finder-folder")!;
    return {
      nameScroll: name.scrollWidth, nameVisible: name.clientWidth,
      folderScroll: folder.scrollWidth, folderVisible: folder.clientWidth,
    };
  });
  expect(widths.nameScroll).toBeLessThanOrEqual(widths.nameVisible);
  expect(widths.folderScroll).toBeGreaterThan(widths.folderVisible);
});

test("panel colours follow the host's light and dark colour scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await ready(page, paths);
  await open(page);
  const light = await page.locator(".cv-finder-panel").evaluate(panel => getComputedStyle(panel).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.locator(".cv-finder-panel").evaluate(panel => getComputedStyle(panel).backgroundColor);
  expect(dark).not.toBe(light);
});

test("20,000 files can be searched and rendered within 50 ms per keystroke in Chromium", async ({ page }) => {
  await ready(page);
  await open(page);
  const elapsedMs = await page.evaluate(() => {
    const harness = window.finderHarness;
    harness.setFiles(Array.from({ length: 20_000 }, (_, index) => ({
      path: `src/feature-${index}/component-${index}.tsx`, dimmed: false,
    })));
    const input = document.querySelector(".cv-finder-input") as HTMLInputElement;
    // Warm Chromium's scorer once, then measure steady typing. The first run
    // includes JIT compilation, which is not search work and varies by host.
    return ["c", "com", "component-199"].map(query => {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const samples = Array.from({ length: 3 }, () => {
        const start = performance.now();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return performance.now() - start;
      });
      return samples.sort((first, second) => first - second)[1];
    });
  });
  expect(elapsedMs[0]).toBeLessThan(45);
  expect(elapsedMs[1]).toBeLessThan(45);
  expect(elapsedMs[2]).toBeLessThan(45);
  await expect(page.getByRole("option").first()).toContainText("component-199");
});

test("repeated characters do not make a short query stall", async ({ page }) => {
  await ready(page);
  await open(page);
  const elapsedMs = await page.evaluate(() => {
    window.finderHarness.setFiles(Array.from({ length: 5_000 }, (_, index) => ({
      path: `src/${"a".repeat(48)}-${index}.ts`, dimmed: false,
    })));
    const input = document.querySelector(".cv-finder-input") as HTMLInputElement;
    input.value = "aaa";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const samples = Array.from({ length: 3 }, () => {
      const start = performance.now();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return performance.now() - start;
    });
    return samples.sort((a, b) => a - b)[1];
  });
  expect(elapsedMs).toBeLessThan(45);
  await expect(page.getByRole("option")).toHaveCount(50);
});
