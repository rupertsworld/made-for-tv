/** Reader flows through the shipped element, its bundled Markdown and the live loader. */
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, markup = "<tv-code></tv-code>"): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate((host, html) => { host.innerHTML = html; }, markup);
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

async function files(page: Page, entries: unknown): Promise<void> {
  await page.locator("tv-code").evaluate((viewer, value) => { (viewer as any).files = value; }, entries);
}

test("viewer and standalone Markdown keep the first element definition in either load order", async ({ page }) => {
  await ready(page);
  expect(await page.evaluate(async () => {
    const first = customElements.get("tv-markdown");
    const standaloneModule = "/skills/tv-markdown/tv-markdown.js";
    await import(standaloneModule);
    return first === customElements.get("tv-markdown");
  })).toBe(true);

  await page.goto("/packages/tv-code/test/browser/finder-fixture.html");
  await expect(page.locator("tv-code")).toBeAttached();
  expect(await page.evaluate(async () => {
    document.body.replaceChildren();
    const standaloneModule = "/skills/tv-markdown/tv-markdown.js";
    const viewerModule = "/skills/tv-code/tv-code.js";
    await import(standaloneModule);
    const first = customElements.get("tv-markdown");
    await import(viewerModule);
    const viewer = document.createElement("tv-code") as HTMLElement & { files: Record<string, string> };
    document.body.append(viewer);
    viewer.files = { "README.md": "# Together" };
    return first === customElements.get("tv-markdown");
  })).toBe(true);
  await expect(page.locator("tv-markdown h1")).toHaveText("Together");
});

test("code body selects lines, wraps, and updates in place", async ({ page }) => {
  await ready(page);
  await files(page, [{ path: "src/app.ts", content: "const one = 1;\nconst two = 2;", size: 37 }]);
  await page.locator('tv-code').evaluate(viewer => { (viewer as any).selected = "src/app.ts"; });
  await page.locator("tv-code").evaluate(viewer => { (window as any).selections = []; viewer.addEventListener("select", event => (window as any).selections.push((event as CustomEvent).detail)); });
  await expect(page.locator(".cv-code-view .cv-line")).toHaveCount(2);
  await expect(page.locator(".cv-pane-header")).not.toContainText("TypeScript");
  await expect(page.locator(".cv-pane-header")).not.toContainText("2 lines");
  await page.locator('.cv-line-number[data-line="2"]').click();
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  expect(await page.evaluate(() => (window as any).selections)).toEqual([{ path: "src/app.ts", lines: "2" }]);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).lines = "1"; });
  await expect(page.locator('.cv-line[data-line="1"]')).toHaveClass(/cv-line-selected/);
  await page.keyboard.press("Alt+z");
  await expect(page.locator("tv-code")).toHaveAttribute("wrap", "");
  await files(page, [{ path: "src/app.ts", content: "// new\nconst one = 1;\nconst two = 2;" }]);
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
  await expect(page.locator(".cv-code-view .cv-line")).toHaveCount(3);
});

test("a page-assigned range beyond a file clamps to its last line without a select event", async ({ page }) => {
  await ready(page);
  await files(page, { "short.ts": "first\nsecond" });
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).events = 0;
    viewer.addEventListener("select", () => (window as any).events++);
    (viewer as any).selected = "short.ts";
  });
  await expect(page.locator(".cv-line")).toHaveCount(2);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).lines = "99"; });
  await expect(page.locator('.cv-line[data-line="2"]')).toHaveClass(/cv-line-selected/);
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  expect(await page.evaluate(() => (window as any).events)).toBe(0);
});

test("lines assigned before a slow read reflect the range available in the file", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).selectCount = 0;
    viewer.addEventListener("select", () => (window as any).selectCount++);
    (viewer as any).connection = {
      list: () => [{ name: "short.ts" }],
      read: () => new Promise(resolve => setTimeout(() => resolve("one\ntwo\nthree"), 120)),
    };
    (viewer as any).lines = "2-20";
    (viewer as any).selected = "short.ts";
  });
  await expect(page.locator(".cv-line")).toHaveCount(3);
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2-3");
  expect(await page.locator("tv-code").evaluate(viewer => (viewer as any).lines)).toBe("2-3");
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).selected = null;
    (viewer as any).lines = "99";
    (viewer as any).selected = "short.ts";
  });
  await expect(page.locator(".cv-line")).toHaveCount(3);
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "3");
  expect(await page.locator("tv-code").evaluate(viewer => (viewer as any).lines)).toBe("3");
  expect(await page.evaluate(() => (window as any).selectCount)).toBe(0);
});

test("reconnection applies an input assigned while detached and ignores an obsolete read", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: () => [{ name: "note.txt" }],
      read: () => new Promise(resolve => { (window as any).finishOldRead = resolve; }),
    };
    (viewer as any).selected = "note.txt";
    (viewer as any).lines = "2";
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishOldRead)).toBe("function");
  await page.locator("tv-code").evaluate(viewer => {
    viewer.remove();
    (viewer as any).files = { "note.txt": "New first\nNew second" };
    document.querySelector("#host")!.append(viewer);
    (window as any).finishOldRead("Old first\nOld second");
  });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "note.txt");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator(".cv-code-text")).toHaveText(["New first", "New second"]);
});

test("selection made during a delayed root listing reveals and scrolls to a nested file", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as HTMLElement).style.height = "220px";
    (viewer as any).connection = {
      list: (path: string) => new Promise(resolve => setTimeout(() => resolve(path === "" ? [
        ...Array.from({ length: 24 }, (_, index) => ({ name: `folder${index}`, type: "folder" })),
        { name: "z-deep", type: "folder" },
      ] : path === "z-deep" ? [{ name: "inner", type: "folder" }] : [{ name: "c.ts" }]), 100)),
      read: () => "export const ready = true;",
    };
    (viewer as any).selected = "z-deep/inner/c.ts";
  });
  await expect(page.locator('.cv-row[data-path="z-deep"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.cv-row[data-path="z-deep/inner"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.cv-row[data-path="z-deep/inner/c.ts"]')).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.locator(".cv-tree").evaluate(tree => tree.scrollTop)).toBeGreaterThan(0);
});

test("finder discovers folders that arrive after it opens during the root listing", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: (path: string) => path === "" ? new Promise(resolve => setTimeout(() => resolve([{ name: "src", type: "folder" }]), 150)) : [{ name: "nested.ts" }],
      read: () => "const nested = true;",
    };
  });
  await page.getByRole("button", { name: "Find file" }).click();
  await page.getByRole("combobox", { name: "Go to file" }).fill("nested");
  await expect(page.locator(".cv-finder-row")).toContainText("nested.ts");
});

test("finder clears pending discovery when a new files input replaces a connection", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: (path: string) => path === "" ? [{ name: "slow", type: "folder" }] : new Promise(resolve => setTimeout(() => resolve([{ name: "old.ts" }]), 500)),
      read: () => "old",
    };
  });
  await expect(page.locator('.cv-row[data-path="slow"]')).toBeVisible();
  await page.getByRole("button", { name: "Find file" }).click();
  await expect(page.locator(".cv-finder-progress")).toBeVisible();
  await files(page, { "new.ts": "new", "other.ts": "other" });
  await expect(page.locator(".cv-finder-progress")).toBeHidden();
  await expect(page.locator(".cv-finder-row").first()).toContainText("new.ts");
  await page.waitForTimeout(600);
  await expect(page.locator(".cv-finder-progress")).toBeHidden();
});

test("built finder shows no matches without an accent focus ring", async ({ page }) => {
  await ready(page);
  await files(page, { "README.md": "# Welcome", "other.txt": "Other" });
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as HTMLElement).style.setProperty("--tv-code-accent", "red");
  });
  await page.getByRole("button", { name: "Find file" }).click();
  const input = page.getByRole("combobox", { name: "Go to file" });
  await expect(input).toBeFocused();
  await input.fill("nothing-matches");
  await expect(page.locator(".cv-finder-empty")).toHaveText("No matching files");
  await expect(page.getByRole("option")).toHaveCount(0);
  const appearance = await page.locator(".cv-finder-panel").evaluate(panel => {
    const style = getComputedStyle(panel);
    return { outline: style.outlineStyle, border: style.borderStyle, shadow: style.boxShadow };
  });
  expect(appearance).toMatchObject({ outline: "none", border: "solid" });
  expect(appearance.shadow).not.toBe("none");
  expect(await input.evaluate(field => getComputedStyle(field).outlineStyle)).toBe("none");
});

test("a fenced block still highlights after an indented Markdown code block", async ({ page }) => {
  await ready(page);
  await files(page, { "README.md": "    plain code\n\n```ts\nconst value = 1;\n```" });
  await expect(page.locator("tv-markdown pre code")).toHaveCount(2);
  await expect(page.locator("tv-markdown pre code").nth(1).locator(".cv-t-keyword")).toHaveText("const");
  await files(page, { "README.md": "    plain code\n\n  ```ts\n  const value = 2;\n  ```" });
  await expect(page.locator("tv-markdown pre code").nth(1).locator(".cv-t-keyword")).toHaveText("const");
  await files(page, { "README.md": "    const value = 3;\n\n```ts\nconst value = 3;\n```" });
  await expect(page.locator("tv-markdown pre code").first().locator(".cv-t-keyword")).toHaveCount(0);
  await expect(page.locator("tv-markdown pre code").nth(1).locator(".cv-t-keyword")).toHaveText("const");
});

test("an oversized known binary file stays a binary placeholder without reading", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).reads = 0;
    (viewer as any).connection = {
      list: () => [{ name: "archive.zip", size: 3_000_000 }],
      read: () => { (window as any).reads++; return "contents"; },
    };
  });
  await page.locator('.cv-row[data-path="archive.zip"]').click();
  await expect(page.locator(".cv-binary-body")).toContainText("Binary file not shown");
  await expect(page.getByRole("button", { name: "Show anyway" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).reads)).toBe(0);
});

test("header action keeps keyboard focus when toggled", async ({ page }) => {
  await ready(page);
  await files(page, { "app.ts": "const app = true;", "README.md": "# Guide" });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "app.ts"; });
  const wrap = page.getByRole("button", { name: "Wrap lines" });
  await wrap.focus();
  await page.keyboard.press("Space");
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await expect(wrap).toBeFocused();
  await page.locator('.cv-row[data-path="README.md"]').click();
  const source = page.getByRole("button", { name: "Source" });
  await source.focus();
  await page.keyboard.press("Space");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(source).toBeFocused();
});

test("clearing an image selection shows the shortcut empty state", async ({ page }) => {
  await ready(page);
  await files(page, { "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>' });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "icon.svg"; });
  await expect(page.locator(".cv-media-image img")).toBeVisible();
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = null; });
  await expect(page.locator(".cv-empty-state strong")).toHaveText("No file open");
  await expect(page.locator(".cv-empty-state kbd")).toHaveText(["Ctrl", "P"]);
});

test("an image becoming too large shows the large-file override", async ({ page }) => {
  await ready(page);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>';
  await files(page, [{ path: "icon.svg", content: svg }]);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "icon.svg"; });
  await expect(page.locator(".cv-media-image img")).toBeVisible();
  await files(page, [{ path: "icon.svg", content: svg, size: 3_000_000 }]);
  await expect(page.getByRole("button", { name: "Show anyway" })).toBeVisible();
  await expect(page.locator(".cv-media-image img")).toHaveCount(0);
});

test("language supplied by a late listing updates the open code body", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: () => new Promise(resolve => setTimeout(() => resolve([{ name: "example.unknown", language: "ts" }]), 150)),
      read: () => "const answer = 42;",
    };
    (viewer as any).selected = "example.unknown";
  });
  await expect(page.locator(".cv-code-text")).toContainText("answer");
  await expect(page.locator(".cv-code-text .cv-t-keyword")).toHaveText("const");
});

test("a heading link waits for a slow Markdown read", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as HTMLElement).style.height = "260px";
    const target = Array.from({ length: 35 }, (_, index) => `Paragraph ${index}\n\n`).join("") + "## Destination\n\nArrived";
    (viewer as any).connection = {
      list: () => [{ name: "start.md" }, { name: "target.md" }],
      read: (path: string) => path === "start.md" ? "[Go](target.md#destination)" : new Promise(resolve => setTimeout(() => resolve(target), 900)),
    };
    (viewer as any).selected = "start.md";
  });
  await page.getByRole("link", { name: "Go" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "target.md");
  await expect.poll(() => page.locator(".cv-pane-content").evaluate(element => element.scrollTop)).toBeGreaterThan(100);
});

test("a cancelled in-document Markdown link reports linkclick and keeps the address", async ({ page }) => {
  await ready(page);
  await files(page, { "README.md": "[Jump](#target)\n\n## Target" });
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).links = [];
    viewer.addEventListener("linkclick", event => {
      (window as any).links.push({ href: (event as any).href, target: (event.target as Element).localName });
      event.preventDefault();
    });
  });
  await page.getByRole("link", { name: "Jump" }).click();
  expect(await page.evaluate(() => (window as any).links)).toEqual([{ href: "#target", target: "tv-markdown" }]);
  await expect(page).not.toHaveURL(/#target$/);
});

test("refresh of a Markdown image uses fresh bytes and leaves unrelated images alone", async ({ page }) => {
  await ready(page);
  const rawRequests: string[] = [];
  page.on("request", request => { if (/\/(pixel|other)\.svg$/.test(request.url())) rawRequests.push(request.url()); });
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).imageVersion = "red";
    (window as any).imagePresent = true;
    (window as any).imageReads = { pixel: 0, other: 0 };
    (viewer as any).connection = {
      list: () => [ { name: "README.md" }, ...(window as any).imagePresent ? [{ name: "pixel.svg" }] : [], { name: "other.svg" } ],
      read: (path: string) => {
        if (path === "README.md") return "![pixel](pixel.svg) ![other](other.svg)";
        if (path === "other.svg") { (window as any).imageReads.other++; return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'; }
        (window as any).imageReads.pixel++;
        const version = (window as any).imageVersion;
        return new Promise(resolve => setTimeout(() => resolve(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="${version}"/></svg>`), 250));
      },
    };
  });
  await expect(page.locator('tv-markdown img[alt="other"]')).toHaveAttribute("src", /^blob:/);
  await page.evaluate(() => { (window as any).imageVersion = "blue"; });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).refresh("pixel.svg"); });
  await expect.poll(async () => {
    const url = await page.locator('tv-markdown img[alt="pixel"]').getAttribute("src");
    return url?.startsWith("blob:") ? page.evaluate(async url => (await fetch(url)).text(), url) : "";
  }).toContain('fill="blue"');
  expect(await page.evaluate(() => (window as any).imageReads.other)).toBe(1);
  expect(rawRequests).toEqual([]);
  await page.evaluate(() => { (window as any).imagePresent = false; });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).refresh("pixel.svg"); });
  await expect(page.locator('tv-markdown img[alt="pixel"]')).not.toHaveAttribute("src", /./);
});

test("two rapid highlighted updates keep reflected lines on the visible selection", async ({ page }) => {
  await ready(page);
  const original = Array.from({ length: 1200 }, (_, index) => `const line${index} = ${index};`);
  const first = original.slice(5);
  const second = [...original.slice(0, 999), "const inserted = true;", ...original.slice(999)];
  await files(page, { "app.ts": original.join("\n") });
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "app.ts"; (viewer as any).lines = "1000"; });
  await expect(page.locator('.cv-line[data-line="1000"]')).toHaveClass(/cv-line-selected/);
  await page.locator("tv-code").evaluate(async (viewer, versions) => {
    (viewer as any).files = { "app.ts": versions.first };
    await new Promise(resolve => setTimeout(resolve, 20));
    if (viewer.querySelectorAll(".cv-line").length !== 1200) throw new Error("First highlighted update committed before the race could be exercised");
    (viewer as any).files = { "app.ts": versions.second };
  }, { first: first.join("\n"), second: second.join("\n") });
  await expect(page.locator(".cv-line")).toHaveCount(1201);
  await expect.poll(() => page.locator(".cv-line-selected").getAttribute("data-line")).toBe("1001");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "1001");
});

test("removed files keep their body and return; never known paths fail", async ({ page }) => {
  await ready(page);
  await files(page, { "a.txt": "Old" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "a.txt");
  await files(page, {});
  await expect(page.locator(".cv-deleted")).toHaveText("Deleted");
  await expect(page.locator(".cv-code-text")).toHaveText("Old");
  await files(page, { "a.txt": "New" });
  await expect(page.locator(".cv-deleted")).toHaveCount(0);
  await expect(page.locator(".cv-code-text")).toHaveText("New");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "never.txt"; });
  await expect(page.locator(".cv-pane-content .cv-failure")).toContainText("File not found");
});

test("images, SVG source, known and detected binary, and large file override", async ({ page }) => {
  await ready(page);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16"/></svg>';
  await files(page, [
    { path: "icon.svg", content: svg }, { path: "photo.png", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII=" },
    { path: "archive.zip", size: 100 }, { path: "big.txt", content: "Large content", size: 3_000_000 },
  ]);
  await page.locator('.cv-row[data-path="icon.svg"]').click();
  await expect(page.locator(".cv-media-image img")).toHaveAttribute("src", /^blob:/);
  await expect(page.locator(".cv-pane-header")).not.toContainText("24 × 16");
  await expect(page.getByRole("group", { name: "View mode" }).getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Source" }).click();
  await expect(page.getByRole("button", { name: "Source" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cv-code-text")).toContainText("<svg");
  await page.locator('.cv-row[data-path="photo.png"]').click();
  await expect(page.locator(".cv-media-image img")).toHaveAttribute("src", /^data:image/);
  await files(page, [
    { path: "icon-src.svg", src: `data:image/svg+xml,${encodeURIComponent(svg)}` },
    { path: "archive.zip", size: 100 }, { path: "big.txt", content: "Large content", size: 3_000_000 },
  ]);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).showSource = false; });
  await page.locator('.cv-row[data-path="icon-src.svg"]').click();
  await expect(page.locator(".cv-media-image img")).toHaveAttribute("src", /^data:image\/svg/);
  await page.getByRole("button", { name: "Source" }).click();
  await expect(page.locator(".cv-code-text")).toContainText("<svg");
  await page.locator('.cv-row[data-path="archive.zip"]').click();
  await expect(page.locator(".cv-binary-body")).toContainText("Binary file not shown");
  await page.locator('.cv-row[data-path="big.txt"]').click();
  await expect(page.getByRole("button", { name: "Show anyway" })).toBeVisible();
  await page.getByRole("button", { name: "Show anyway" }).click();
  await expect(page.locator(".cv-code-text")).toHaveText("Large content");
});

test("an oversized image scales to a short pane", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => { (viewer as HTMLElement).style.height = "240px"; (viewer as HTMLElement).style.width = "500px"; });
  await files(page, [{ path: "large.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800"/></svg>' }]);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "large.svg"; });
  await expect(page.locator(".cv-media-image img")).toBeVisible();
  const image = await page.locator(".cv-media-image img").boundingBox();
  const pane = await page.locator(".cv-pane-content").boundingBox();
  expect(image!.width).toBeLessThanOrEqual(pane!.width);
  expect(image!.height).toBeLessThanOrEqual(pane!.height);
});

test("a viewer connected while hidden opens its sidebar when shown wide", async ({ page }) => {
  await ready(page, '<div id="wrapper" style="display:none"><tv-code></tv-code></div>');
  await files(page, { "README.md": "# Hello", "other.txt": "Other" });
  await page.locator("#wrapper").evaluate(wrapper => { (wrapper as HTMLElement).style.display = "block"; });
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-app-narrow/);
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-sidebar-closed/);
  await expect(page.getByRole("button", { name: "Find file" })).toBeVisible();
});

test("Markdown highlights code, resolves images and links, respects cancelled links, and keeps scroll", async ({ page }) => {
  await ready(page);
  const lines = Array.from({ length: 35 }, (_, i) => `Paragraph ${i}`).join("\n\n");
  await files(page, [
    { path: "docs/start.md", content: `# Start\n\n![pixel](pixel.png) ![vector](vector%20icon.svg)\n\n[Target](target.md#part)\n\n[Line](../src/app.ts#L2-L3)\n\n[External](https://example.com)\n\n\`\`\`ts\nconst n = 1\n\`\`\`\n\n${lines}` },
    { path: "docs/target.md", content: "# Part\n\nHere" },
    { path: "docs/pixel.png", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII=" },
    { path: "docs/vector icon.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>' },
    { path: "src/app.ts", content: "one\ntwo\nthree" },
  ]);
  await page.locator('tv-code').evaluate(viewer => { (viewer as any).selected = "docs/start.md"; });
  await expect(page.locator("tv-markdown[show-frontmatter]")).toBeVisible();
  await expect(page.locator('tv-markdown img[alt="pixel"]')).toHaveAttribute("src", /^data:image/);
  await expect(page.locator('tv-markdown img[alt="vector"]')).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("tv-markdown pre code .cv-t-keyword")).toBeVisible();
  await expect(page.getByRole("link", { name: "External" })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: "External" })).toHaveAttribute("rel", "noopener");
  await page.locator(".cv-pane-content").evaluate(element => { element.scrollTop = 250; });
  await files(page, [
    { path: "docs/start.md", content: `# Start\n\n![pixel](pixel.png) ![vector](vector%20icon.svg)\n\n[Target](target.md#part)\n\n[Line](../src/app.ts#L2-L3)\n\n${lines}\n\nMore` },
    { path: "docs/target.md", content: "# Part\n\nHere" }, { path: "docs/pixel.png", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII=" },
    { path: "docs/vector icon.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>' },
    { path: "src/app.ts", content: "one\ntwo\nthree" },
  ]);
  expect(await page.locator(".cv-pane-content").evaluate(element => element.scrollTop)).toBeGreaterThan(150);
  await page.getByRole("link", { name: "Line" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/app.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2-3");
});

test("finder discovers lazy folders, opens paths and lines, and tree icons match", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).connection = {
      list: (path: string) => path === "" ? [{ name: "docs", type: "folder" }, { name: "app.ts" }] : [{ name: "guide.md" }],
      read: (path: string) => path === "docs/guide.md" ? "# Guide" : "one\ntwo",
    };
  });
  await page.getByRole("button", { name: "Find file" }).click();
  await expect(page.getByRole("option", { name: /guide.md/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Go to file" }).fill("guide:1");
  await page.keyboard.press("Enter");
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "docs/guide.md");
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("combobox", { name: "Go to file" })).toBeVisible();
  await page.getByRole("combobox", { name: "Go to file" }).fill("app:2");
  await page.keyboard.press("Enter");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator('.cv-row[data-path="app.ts"] .cv-row-icon')).toHaveAttribute("data-icon", "fileCode");
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("option").first()).toContainText("app.ts");
  await page.getByRole("combobox", { name: "Go to file" }).fill(":1");
  await page.keyboard.press("Enter");
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "app.ts");
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "1");
});

test("live connection scenario preserves the reader while files change", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const contents = new Map([["src/app.ts", Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n")], ["docs/readme.md", "# Readme"]]);
    (window as any).service = { contents, change(path: string, value: string | null) { if (value === null) contents.delete(path); else contents.set(path, value); (viewer as any).refresh(path); } };
    (window as any).selections = [];
    (window as any).reads = [];
    viewer.addEventListener("select", (event: Event) => (window as any).selections.push((event as CustomEvent).detail));
    (viewer as any).connection = {
      list: (path: string) => path === "" ? [{ name: "src", type: "folder" }, { name: "docs", type: "folder" }] :
        [...contents.keys()].filter(key => (key.slice(0, key.lastIndexOf("/")) || "") === path).map(key => ({ path: key })),
      read: (path: string) => { (window as any).reads.push(path); return contents.has(path) ? contents.get(path)! : new Response("", { status: 404 }); },
    };
  });
  await page.getByRole("button", { name: "Find file" }).click();
  await page.getByRole("combobox", { name: "Go to file" }).fill("app");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cv-line")).toHaveCount(80);
  await page.locator(".cv-code-view").evaluate(element => { element.scrollTop = 600; });
  const oldTop = await page.locator(".cv-code-view").evaluate(element => element.scrollTop);
  await page.evaluate(() => (window as any).service.change("src/app.ts", `inserted\n${(window as any).service.contents.get("src/app.ts")}`));
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
  expect(await page.locator(".cv-code-view").evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(oldTop);
  await page.evaluate(() => (window as any).service.change("src/new.ts", "new"));
  await expect(page.locator('.cv-row[data-path="src/new.ts"]')).toBeVisible();
  await page.evaluate(() => (window as any).service.change("src/app.ts", null));
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-line")).toHaveCount(81);
  await page.evaluate(() => (window as any).service.change("src/app.ts", "restored"));
  await expect(page.locator(".cv-deleted")).toHaveCount(0);
  await expect(page.locator(".cv-code-text")).toHaveText("restored");
  expect(await page.evaluate(() => (window as any).reads.filter((path: string) => path === "src/app.ts").length)).toBe(3);
  expect(await page.evaluate(() => (window as any).selections)).toEqual([{ path: "src/app.ts", lines: null }]);
});

test("child tag removal marks Deleted and reinsertion updates the same code body", async ({ page }) => {
  await ready(page, '<tv-code><tv-code-file path="note.txt">First</tv-code-file></tv-code>');
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "note.txt");
  await page.locator("tv-code-file").evaluate(element => element.remove());
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-code-text")).toHaveText("First");
  await page.locator("tv-code").evaluate(viewer => { viewer.insertAdjacentHTML("afterbegin", '<tv-code-file path="note.txt">Second</tv-code-file>'); });
  await expect(page.locator(".cv-deleted")).toHaveCount(0);
  await expect(page.locator(".cv-code-text")).toHaveText("Second");
  await expect(page.locator(".cv-line-added")).toHaveCount(1);
});

test("Markdown cancellation, folder links and heading fragments respect reader navigation", async ({ page }) => {
  await ready(page);
  await files(page, [
    { path: "docs/index.md", content: "# Home\n\n" + "Long paragraph.\n\n".repeat(40) + "## Deep\n\n[Self](#deep)\n\n[Cancelled](other.md)\n\n[Encoded](my%20guide.md)\n\n[Folder](../src/)\n\n[Heading](other.md#deep)\n\n[[Addressless]]" },
    { path: "docs/other.md", content: "# Top\n\n" + "Long paragraph.\n\n".repeat(40) + "## Deep\n\nEnd" },
    { path: "docs/my guide.md", content: "# Guide" },
    { path: "src/app.ts", content: "code" },
  ]);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).selected = "docs/index.md";
    (viewer as any).cancelLink = (event: Event) => {
      if ((event as any).href === "other.md") event.preventDefault();
    };
    viewer.addEventListener("linkclick", (viewer as any).cancelLink);
  });
  await page.getByRole("link", { name: "Cancelled" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "docs/index.md");
  await page.getByRole("link", { name: "Addressless" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "docs/index.md");
  const addressBeforeHeading = page.url();
  await page.getByRole("link", { name: "Self" }).click();
  await expect(page).toHaveURL(addressBeforeHeading);
  await expect.poll(() => page.locator(".cv-pane-content").evaluate(element => element.scrollTop)).toBeGreaterThan(300);
  await page.getByRole("link", { name: "Encoded" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "docs/my guide.md");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "docs/index.md"; });
  await page.getByRole("link", { name: "Folder" }).click();
  await expect(page.locator('.cv-row[data-path="src"]')).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Heading" }).click();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "docs/other.md");
  await expect.poll(() => page.locator(".cv-pane-content").evaluate(element => element.scrollTop)).toBeGreaterThan(300);
});

test("header shows the path and relevant controls without file details or copy actions", async ({ page }) => {
  await ready(page);
  await files(page, [{ path: "src/app.ts", content: "const value = 1", size: 15, modified: Date.now() - 120_000 }, { path: "other.ts", content: "Other" }]);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "src/app.ts"; });
  await expect(page.locator(".cv-pane-path")).toContainText("src/app.ts");
  await expect(page.locator(".cv-pane-header")).not.toContainText("TypeScript");
  await expect(page.locator(".cv-pane-header")).not.toContainText("15 B");
  await expect(page.locator(".cv-pane-header")).not.toContainText("line");
  await expect(page.locator(".cv-pane-header")).not.toContainText("minutes ago");
  await expect(page.locator(".cv-pane-details")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy path" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy contents" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close all folders" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find file" })).toBeVisible();
  await page.locator("tv-code").evaluate(viewer => { (viewer as HTMLElement).style.width = "500px"; });
  await expect(page.locator(".cv-pane-path")).toContainText("src/app.ts");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();
});

test("connection image bytes render, zero bytes are binary, and known binary files are never read", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    (window as any).reads = [];
    (viewer as any).connection = {
      list: () => [{ name: "pixel.png" }, { name: "unknown.txt" }, { name: "archive.zip", size: 10 }],
      read: (path: string) => { (window as any).reads.push(path); return path === "pixel.png" ? png : new Uint8Array([65, 0, 66]); },
    };
  });
  await page.locator('.cv-row[data-path="pixel.png"]').click();
  await expect(page.locator(".cv-media-image img")).toBeVisible();
  await page.locator('.cv-row[data-path="unknown.txt"]').click();
  await expect(page.locator(".cv-binary-body")).toContainText("Binary file not shown");
  await page.locator('.cv-row[data-path="archive.zip"]').click();
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).refresh("archive.zip"); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).reads)).toEqual(["pixel.png", "unknown.txt"]);
});

test("Markdown connection images use bytes, retain alt text on failure, and revoke URLs on cleanup", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as any).revoked = [];
    URL.revokeObjectURL = url => { (window as any).revoked.push(url); revoke(url); };
    (viewer as any).connection = {
      list: () => [{ name: "README.md" }, { name: "pixel.png" }, { name: "missing.png" }, { name: "other.txt" }],
      read: (path: string) => path === "README.md" ? "# Pictures\n\n![working](pixel.png)\n\n![unavailable](missing.png)" :
        path === "pixel.png" ? png : path === "other.txt" ? "Other" : Promise.reject(new Error("Missing image")),
    };
  });
  await expect(page.locator('tv-markdown img[alt="working"]')).toHaveAttribute("src", /^blob:/);
  const oldUrl = await page.locator('tv-markdown img[alt="working"]').getAttribute("src");
  await expect(page.locator('tv-markdown img[alt="unavailable"]')).not.toHaveAttribute("src", /./);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).refresh("pixel.png"); });
  await expect.poll(() => page.evaluate(url => (window as any).revoked.includes(url), oldUrl)).toBe(true);
  const nextUrl = await page.locator('tv-markdown img[alt="working"]').getAttribute("src");
  await page.locator('.cv-row[data-path="other.txt"]').click();
  await expect.poll(() => page.evaluate(url => (window as any).revoked.includes(url), nextUrl)).toBe(true);
});

test("Markdown lists unopened folders to load a nested connection image without expanding the tree", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    (window as any).listCalls = [];
    (window as any).readCalls = [];
    (viewer as any).connection = {
      list: (path: string) => {
        (window as any).listCalls.push(path);
        if (path === "") return [{ name: "README.md" }, { name: "docs", type: "folder" }];
        if (path === "docs") return [{ name: "shots", type: "folder" }];
        if (path === "docs/shots") return [{ name: "a.png" }];
        return [];
      },
      read: (path: string) => {
        (window as any).readCalls.push(path);
        return path === "README.md" ? '<picture><img alt="nested" src="docs/shots/a.png"><img alt="duplicate" src="docs/shots/a.png"></picture>' : png;
      },
    };
  });
  const image = page.locator('tv-markdown img[alt="nested"]');
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const duplicate = page.locator('tv-markdown img[alt="duplicate"]');
  await expect(duplicate).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => duplicate.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).listCalls)).toEqual(["", "docs", "docs/shots"]);
  expect(await page.evaluate(() => (window as any).readCalls)).toEqual(["README.md", "docs/shots/a.png"]);
  await expect(page.locator('.cv-row[data-path="docs"]')).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('.cv-row[data-path="docs/shots"]')).toHaveCount(0);
});

test("Markdown restores a missing nested connection image address after listing", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).listCalls = [];
    (viewer as any).connection = {
      list: (path: string) => {
        (window as any).listCalls.push(path);
        if (path === "") return [{ name: "README.md" }, { name: "docs", type: "folder" }];
        if (path === "docs") return [{ name: "shots", type: "folder" }];
        if (path === "docs/shots") return [];
        return [];
      },
      read: (path: string) => path === "README.md" ? '<img alt="missing" src="docs/shots/missing.png?raw=1#crop">' : Promise.reject(new Error("Unexpected read")),
    };
  });
  await expect.poll(() => page.evaluate(() => (window as any).listCalls)).toEqual(["", "docs", "docs/shots"]);
  await expect(page.locator('tv-markdown img[alt="missing"]')).toHaveAttribute("src", "docs/shots/missing.png?raw=1#crop");
  await expect(page.locator(".cv-failure")).toHaveCount(0);
});

test("a newer Markdown render ignores a stale nested image listing", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    (window as any).markdown = "![old](docs/old.png)";
    (window as any).readCalls = [];
    (viewer as any).connection = {
      list: (path: string) => {
        if (path === "") return [{ name: "README.md" }, { name: "docs", type: "folder" }, { name: "fresh.png" }];
        if (path === "docs") return new Promise(resolve => { (window as any).finishOldListing = resolve; });
        return [];
      },
      read: (path: string) => {
        (window as any).readCalls.push(path);
        return path === "README.md" ? (window as any).markdown : path === "fresh.png" ? png : Promise.reject(new Error("Stale image was read"));
      },
    };
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishOldListing)).toBe("function");
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).markdown = "![fresh](fresh.png)";
    (viewer as any).refresh("README.md");
  });
  const fresh = page.locator('tv-markdown img[alt="fresh"]');
  await expect(fresh).toHaveAttribute("src", /^blob:/);
  await page.evaluate(() => (window as any).finishOldListing([{ name: "old.png" }]));
  await expect(page.locator('tv-markdown img[alt="old"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).readCalls)).toEqual(["README.md", "README.md", "fresh.png"]);
});

test("refresh during nested image discovery queues a fresh listing before loading", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6A3sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
    (window as any).listCalls = [];
    (window as any).readCalls = [];
    (viewer as any).connection = {
      list: (path: string) => {
        (window as any).listCalls.push(path);
        if (path === "") return [{ name: "README.md" }, { name: "docs", type: "folder" }];
        if (path === "docs" && (window as any).listCalls.filter((call: string) => call === "docs").length === 1)
          return new Promise(resolve => { (window as any).finishOldImageListing = resolve; });
        if (path === "docs") return [{ name: "shots", type: "folder" }];
        return path === "docs/shots" ? [{ name: "a.png" }] : [];
      },
      read: (path: string) => {
        (window as any).readCalls.push(path);
        return path === "README.md" ? "![refreshed](docs/shots/a.png)" : png;
      },
    };
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishOldImageListing)).toBe("function");
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).refresh("docs/shots/a.png"); });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).finishOldImageListing([]));
  const image = page.locator('tv-markdown img[alt="refreshed"]');
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).listCalls)).toEqual(["", "docs", "docs", "docs/shots"]);
  expect(await page.evaluate(() => (window as any).readCalls)).toEqual(["README.md", "docs/shots/a.png"]);
});

test("the highlighter warms during idle time and over-limit code stays plain", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    (window as any).idleCalls = 0;
    window.requestIdleCallback = (callback: IdleRequestCallback) => { (window as any).idleCalls++; return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0); };
  });
  await files(page, [{ path: "large.ts", content: "x\n".repeat(20_000) + "x" }]);
  await expect.poll(() => page.evaluate(() => (window as any).idleCalls)).toBeGreaterThan(0);
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).selected = "large.ts"; });
  await expect(page.locator(".cv-line")).toHaveCount(20_001);
  await expect(page.locator(".cv-code-text .cv-t-keyword")).toHaveCount(0);
});
