/** Reader-visible contracts for the built element. */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, markup = "<tv-code></tv-code>"): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.evaluate(markup => { document.querySelector("#host")!.innerHTML = markup; }, markup);
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

async function setFiles(page: Page, files: object): Promise<void> {
  await page.locator("tv-code").evaluate((element, files) => { (element as HTMLElement & { files: object }).files = files; }, files);
}

const row = (page: Page, path: string) => page.locator('tv-code .cv-row').filter({ has: page.locator(`.cv-row-name:text-is("${path.split("/").at(-1)}")`) });

test("ships package and grammar notices for the bundled highlighter and Markdown renderer", () => {
  const notices = readFileSync("skills/tv-code/THIRD-PARTY-NOTICES.txt", "utf8");
  const packages = [
    "@shikijs/core", "@shikijs/engine-javascript", "@shikijs/langs",
    "@shikijs/primitive", "@shikijs/types", "@shikijs/vscode-textmate",
    "ccount", "character-entities-html4", "character-entities-legacy",
    "comma-separated-tokens", "dompurify", "hast-util-to-html",
    "hast-util-whitespace", "html-void-elements", "marked", "oniguruma-parser",
    "oniguruma-to-es", "property-information", "regex", "regex-recursion",
    "regex-utilities", "shiki", "space-separated-tokens", "stringify-entities",
    "yaml", "zwitch",
  ];
  for (const packageName of packages) {
    expect(notices).toMatch(new RegExp(`^${packageName.replace("/", "\\/")}@`, "m"));
  }
  expect(notices).toContain("BUNDLED TEXTMATE GRAMMARS (45)");
  const grammarSection = notices.split("BUNDLED TEXTMATE GRAMMARS (45)")[1]
    .split("UPSTREAM COPYRIGHT AND LICENCE TEXTS")[0];
  const grammars = [...grammarSection.matchAll(/^-{80}\n([^\n]+)\nLicense: /gm)]
    .map(match => match[1]);
  expect(grammars).toEqual([
    "c", "cpp", "cpp-macro", "csharp", "css", "diff", "docker", "glsl", "go",
    "graphql", "haml", "html", "html-derivative", "ini", "java", "javascript",
    "json", "jsonc", "jsx", "kotlin", "less", "lua", "make", "markdown",
    "markdown-vue", "postcss", "powershell", "python", "regexp", "ruby", "rust",
    "scss", "shellscript", "sql", "svelte", "swift", "toml", "tsx", "typescript",
    "vue", "vue-directives", "vue-interpolations", "vue-sfc-style-variable-injection",
    "xml", "yaml",
  ]);
  expect(notices).toContain("Copyright (c) 2015 - present Microsoft Corporation");
  expect(notices).toMatch(/^toml\nLicense: TextMate bundle licence$/m);
  expect(notices).toMatch(/^yaml\nLicense: TextMate bundle licence$/m);
  expect(notices).toContain("Permission to copy, use, modify, sell and distribute this");
  expect(notices).toMatch(/^glsl\nLicense: None stated by the source repository$/m);
  expect(notices).not.toContain("BUNDLED TEXTMATE THEMES");
});

test("child tags show nested relative paths, dedented scripts and live edits", async ({ page }) => {
  await ready(page, '<tv-code><tv-code-folder path="src"><tv-code-file path="a.ts"><script type="text/plain">\n  one\n</script></tv-code-file></tv-code-folder><tv-code-file path="other.txt">Other</tv-code-file></tv-code>');
  await page.locator('.cv-row[data-path="src"]').click();
  await page.locator('.cv-row[data-path="src/a.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("one");
  await page.locator('tv-code-file script').evaluate(element => { element.textContent = "\n  two\n"; });
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("two");
});

test("child tags appended after connection to the document are read", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    const file = document.createElement("tv-code-file");
    file.setAttribute("path", "late.txt");
    file.textContent = "Late";
    element.append(file);
    element.insertAdjacentHTML("afterbegin", '<tv-code-file path="other.txt">Other</tv-code-file>');
  });
  await expect(page.locator('.cv-row[data-path="late.txt"]')).toBeVisible();
  await page.locator('.cv-row[data-path="late.txt"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Late");
});

test("files forms replace each other and assigned input takes precedence over tags", async ({ page }) => {
  await ready(page, '<tv-code><tv-code-file path="tag.txt">Tag</tv-code-file><tv-code-file path="other.txt">Other</tv-code-file></tv-code>');
  await expect(page.locator('.cv-row[data-path="tag.txt"]')).toBeVisible();
  await setFiles(page, { "first.txt": "First", "other.txt": "Other" });
  await expect(page.locator('.cv-row[data-path="tag.txt"]')).toHaveCount(0);
  await expect(page.locator('.cv-row[data-path="first.txt"]')).toBeVisible();
  await setFiles(page, [{ path: "second.txt", content: "Second" }, { path: "other.txt", content: "Other" }]);
  await page.locator('.cv-row[data-path="second.txt"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Second");
  await page.locator('tv-code-file[path="tag.txt"]').evaluate(element => { element.textContent = "Changed tag"; });
  await expect(page.locator('.cv-row[data-path="tag.txt"]')).toHaveCount(0);
});

test("the latest files or connection assignment wins and null clears without restoring tags", async ({ page }) => {
  await ready(page, '<tv-code><tv-code-file path="tag.txt">Tag</tv-code-file></tv-code>');
  await setFiles(page, { "file.txt": "File" });
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = { list: () => [{ name: "connected.txt" }], read: () => "Connected" };
  });
  await expect(page.locator('.cv-row[data-path="connected.txt"]')).toBeVisible();
  await expect(page.locator('.cv-row[data-path="file.txt"]')).toHaveCount(0);
  await setFiles(page, { "again.txt": "Again", "other.txt": "Other" });
  await expect(page.locator('.cv-row[data-path="again.txt"]')).toBeVisible();
  await page.locator('.cv-row[data-path="again.txt"]').click();
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { files: null }).files = null; });
  await expect(page.locator(".cv-tree-empty")).toHaveText("No files");
  await expect(page.locator("tv-code")).not.toHaveAttribute("selected", /./);
  await expect(page.locator(".cv-pane-empty")).toContainText("No file open");
  await expect(page.locator('.cv-row[data-path="tag.txt"]')).toHaveCount(0);
});

test("folders sort before files, natural numbers sort, and dimmed rows remain selectable", async ({ page }) => {
  await ready(page);
  await setFiles(page, [
    { path: "file10", content: "10" }, { path: "node_modules/lib.ts", content: "lib" },
    { path: "file2", content: "2" }, { path: "A", content: "A" },
  ]);
  await expect(page.locator(".cv-tree > .cv-row").first()).toHaveAttribute("data-path", "node_modules");
  expect(await page.locator(".cv-tree > .cv-row").evaluateAll(rows => rows.map(row => row.getAttribute("data-path")))).toEqual(["node_modules", "A", "file2", "file10"]);
  await expect(page.locator('.cv-row[data-path="node_modules"]')).toHaveClass(/cv-row-dimmed/);
  await page.locator('.cv-row[data-path="node_modules"]').click();
  await page.locator('.cv-row[data-path="node_modules/lib.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("lib");
});

test("file names and content render as text rather than markup", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "<img src=x onerror=alert(1)>.txt": "<script>window.injected = true</script>", "other.txt": "Other" });
  await page.locator('.cv-row[data-path="<img src=x onerror=alert(1)>.txt"]').click();
  await expect(page.locator('.cv-row[data-path="<img src=x onerror=alert(1)>.txt"] .cv-row-name')).toHaveText("<img src=x onerror=alert(1)>.txt");
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("<script>window.injected = true</script>");
  expect(await page.locator("tv-code img, tv-code script").count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as Window & { injected?: boolean }).injected)).toBeUndefined();
});

test("dim attribute patterns and explicit overrides change row emphasis", async ({ page }) => {
  await ready(page);
  await setFiles(page, [{ path: "dist/a.ts", content: "A" }, { path: "dist/b.ts", content: "B", dimmed: false }, { path: "note.lock", content: "N" }]);
  await expect(page.locator('.cv-row[data-path="dist"]')).toHaveClass(/cv-row-dimmed/);
  await page.locator("tv-code").evaluate(element => element.setAttribute("dim", ""));
  await expect(page.locator('.cv-row[data-path="dist"]')).not.toHaveClass(/cv-row-dimmed/);
  await page.locator("tv-code").evaluate(element => element.setAttribute("dim", "dist,*.lock"));
  await page.locator('.cv-row[data-path="dist"]').click();
  await expect(page.locator('.cv-row[data-path="dist/a.ts"]')).toHaveClass(/cv-row-dimmed/);
  await expect(page.locator('.cv-row[data-path="dist/b.ts"]')).not.toHaveClass(/cv-row-dimmed/);
  await expect(page.locator('.cv-row[data-path="note.lock"]')).toHaveClass(/cv-row-dimmed/);
});

test("folder listing is lazy, failed listing has Retry, and root failure can retry", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    let root = 0; let nested = 0;
    (element as HTMLElement & { connection: object }).connection = {
      list: (path: string) => {
        if (!path && root++ === 0) throw new Error("Root failed");
        if (path === "src" && nested++ === 0) throw new Error("Folder failed");
        return path ? [{ name: "file.ts" }] : [{ name: "src", type: "dir" }];
      }, read: () => "body",
    };
  });
  await expect(page.locator(".cv-tree-failure")).toContainText("Root failed");
  await page.locator(".cv-tree-failure .cv-retry").click();
  await page.locator('.cv-row[data-path="src"]').click();
  await expect(page.locator(".cv-tree-failure")).toContainText("Folder failed");
  await page.locator(".cv-tree-failure .cv-retry").click();
  await expect(page.locator('.cv-row[data-path="src/file.ts"]')).toBeVisible();
});

test("folder spinner appears after 200 ms and a whole-subtree listing avoids child requests", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    const calls: string[] = [];
    (window as unknown as Window & { listCalls: string[]; finishListing: (value: object[]) => void }).listCalls = calls;
    (element as HTMLElement & { connection: object }).connection = {
      list: (path: string) => {
        calls.push(path);
        if (!path) return [{ name: "src", type: "folder" }];
        return new Promise(resolve => { (window as unknown as Window & { finishListing: (value: object[]) => void }).finishListing = resolve; });
      }, read: () => "body",
    };
  });
  await page.locator('.cv-row[data-path="src"]').click();
  await expect(page.locator('.cv-row[data-path="src"] .cv-caret')).toHaveClass(/cv-caret-spinning/);
  await page.evaluate(() => (window as unknown as Window & { finishListing: (value: object[]) => void }).finishListing([{ path: "src/deep/file.ts" }]));
  await expect(page.locator('.cv-row[data-path="src/deep"]')).toBeVisible();
  await page.locator('.cv-row[data-path="src/deep"]').click();
  await expect(page.locator('.cv-row[data-path="src/deep/file.ts"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Window & { listCalls: string[] }).listCalls)).toEqual(["", "src"]);
});

test("slow root listing shows placeholders after 200 ms and then No files", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: () => new Promise(resolve => { (window as unknown as Window & { finishListing: (value: object[]) => void }).finishListing = resolve; }),
      read: () => "",
    };
  });
  await expect(page.locator(".cv-tree-placeholder")).toHaveCount(5);
  await page.evaluate(() => (window as unknown as Window & { finishListing: (value: object[]) => void }).finishListing([]));
  await expect(page.locator(".cv-tree-empty")).toHaveText("No files");
});

test("keyboard arrows, parent and type-ahead move focus without opening a file", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "src/a.ts": "A", "src/b.ts": "B", "zebra.ts": "Z" });
  await page.locator('.cv-row[data-path="src"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.cv-row[data-path="src/a.ts"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.cv-row[data-path="src/b.ts"]')).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('.cv-row[data-path="src"]')).toBeFocused();
  await page.keyboard.press("z");
  await expect(page.locator('.cv-row[data-path="zebra.ts"]')).toBeFocused();
  await expect(page.locator("tv-code")).not.toHaveAttribute("selected", /./);
});

test("tree reentry focuses the open file and an empty tree remains reachable", async ({ page }) => {
  await ready(page);
  await expect(page.locator(".cv-tree")).toHaveAttribute("tabindex", "0");
  await setFiles(page, { "a.ts": "A", "b.ts": "B" });
  await page.locator('.cv-row[data-path="b.ts"]').click();
  await page.locator('.cv-row[data-path="a.ts"]').focus();
  await page.locator(".cv-sidebar-header button").first().focus();
  await expect(page.locator('.cv-row[data-path="b.ts"]')).toHaveAttribute("tabindex", "0");
  await expect(page.locator('.cv-row[data-path="a.ts"]')).toHaveAttribute("tabindex", "-1");
});

test("tree type-ahead combines keys for 500 ms, then starts a new query", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "alpha.ts": "A", "beta.ts": "B", "berry.ts": "R", "charlie.ts": "C" });
  await page.locator('.cv-row[data-path="alpha.ts"]').focus();
  await page.keyboard.press("b");
  await expect(page.locator('.cv-row[data-path="berry.ts"]')).toBeFocused();
  await page.keyboard.press("e");
  await expect(page.locator('.cv-row[data-path="beta.ts"]')).toBeFocused();
  await page.waitForTimeout(550);
  await page.keyboard.press("c");
  await expect(page.locator('.cv-row[data-path="charlie.ts"]')).toBeFocused();
});

test("selected reveals ancestors, reader selection emits once, and property selection emits none", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "src/lib/a.ts": "A", "src/lib/b.ts": "B" });
  await page.locator("tv-code").evaluate(element => {
    element.addEventListener("select", event => { document.body.dataset.events = String(Number(document.body.dataset.events ?? "0") + 1); document.body.dataset.detail = JSON.stringify((event as CustomEvent).detail); });
    (element as HTMLElement & { selected: string }).selected = "src/lib/a.ts";
  });
  await expect(page.locator('.cv-row[data-path="src/lib/a.ts"]')).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-events", /./);
  await page.locator('.cv-row[data-path="src/lib/b.ts"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-events", "1");
  await expect(page.locator("body")).toHaveAttribute("data-detail", '{"path":"src/lib/b.ts","lines":null}');
});

test("a selected path can precede connection listings and is revealed when listed", async ({ page }) => {
  await ready(page, '<tv-code selected="src/deep/a.ts"></tv-code>');
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: (path: string) => path === "" ? [{ name: "src", type: "folder" }] : path === "src" ? [{ name: "deep", type: "folder" }] : [{ name: "a.ts" }],
      read: () => "A",
    };
  });
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("A");
  await expect(page.locator('.cv-row[data-path="src/deep/a.ts"]')).toBeVisible();
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/deep/a.ts");
});

test("tree rows retain DOM identity, focus and scroll position across a refresh", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: () => {
        document.body.dataset.listCalls = String(Number(document.body.dataset.listCalls ?? "0") + 1);
        return Array.from({ length: 100 }, (_, index) => ({ name: `file${index}.ts` }));
      },
      read: () => "content",
    };
  });
  const target = page.locator('.cv-row[data-path="file50.ts"]');
  await target.focus();
  await page.evaluate(() => {
    const tree = document.querySelector<HTMLElement>(".cv-tree")!;
    tree.scrollTop = 200;
    (window as unknown as Window & { rowBefore: Element; scrollBefore: number }).rowBefore = document.querySelector('.cv-row[data-path="file50.ts"]')!;
    (window as unknown as Window & { rowBefore: Element; scrollBefore: number }).scrollBefore = tree.scrollTop;
    (document.querySelector("tv-code") as HTMLElement & { refresh: () => void }).refresh();
  });
  await expect(page.locator("body")).toHaveAttribute("data-list-calls", "2");
  await expect(target).toBeFocused();
  expect(await page.evaluate(() => ({
    same: (window as unknown as Window & { rowBefore: Element }).rowBefore === document.querySelector('.cv-row[data-path="file50.ts"]'),
    scroll: document.querySelector<HTMLElement>(".cv-tree")!.scrollTop,
    before: (window as unknown as Window & { scrollBefore: number }).scrollBefore,
  }))).toMatchObject({ same: true, scroll: 200, before: 200 });
});

test("folder selection preserves the open file and reader choice clears lines", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "src/a.ts": "A", "src/b.ts": "B" });
  await page.locator("tv-code").evaluate(element => {
    const viewer = element as HTMLElement & { selected: string; lines: string; wrap: boolean; showSource: boolean };
    viewer.selected = "src/a.ts";
    viewer.lines = "12-20";
    viewer.wrap = true;
    viewer.showSource = true;
    viewer.selected = "src";
  });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "src/a.ts");
  await expect(page.locator(".cv-line")).toHaveCount(1);
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "1");
  await expect(page.locator("tv-code")).toHaveAttribute("wrap", "");
  await expect(page.locator("tv-code")).toHaveAttribute("show-source", "");
  await page.locator("tv-code").evaluate(element => { (element as any).lines = "1"; });
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "1");
  await page.locator('.cv-row[data-path="src/b.ts"]').click();
  await expect(page.locator("tv-code")).not.toHaveAttribute("lines", /./);
});

test("the finder selection seam emits one select event with its requested line", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "a.ts": "one\ntwo" });
  await page.locator("tv-code").evaluate(element => {
    const viewer = element as HTMLElement & { selected: string; openFromFinder: (path: string, line: number) => void };
    viewer.selected = "a.ts";
    element.addEventListener("select", event => { document.body.dataset.finderSelect = JSON.stringify((event as CustomEvent).detail); document.body.dataset.finderCount = String(Number(document.body.dataset.finderCount ?? "0") + 1); });
    viewer.openFromFinder("a.ts", 2);
  });
  await expect(page.locator("tv-code")).toHaveAttribute("lines", "2");
  await expect(page.locator("body")).toHaveAttribute("data-finder-select", '{"path":"a.ts","lines":"2"}');
  await expect(page.locator("body")).toHaveAttribute("data-finder-count", "1");
});

test("breadcrumb folders open the sidebar and shortcuts call the finder hook", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "src/a.ts": "A", "other.ts": "Other" });
  await page.locator("tv-code").evaluate(element => {
    const viewer = element as HTMLElement & { selected: string; openFinder: () => void };
    viewer.selected = "src/a.ts";
    viewer.openFinder = () => { document.body.dataset.finderCalls = String(Number(document.body.dataset.finderCalls ?? "0") + 1); };
  });
  await page.locator(".cv-resize-handle").evaluate(element => {
    // Closing through a drag is separately covered; this only checks the
    // breadcrumb's open-and-reveal effect.
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 7, clientX: 260 }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: 10 }));
  });
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  // The path starts at the first folder; the root label is only in the sidebar.
  await expect(page.locator(".cv-pane-path")).toHaveText("src/a.ts");
  await page.locator(".cv-crumb").filter({ hasText: "src" }).click();
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-sidebar-closed/);
  await page.keyboard.press("t");
  await page.keyboard.press("Control+p");
  await page.locator('.cv-row[data-path="src/a.ts"]').focus();
  await page.keyboard.press("t");
  await expect(page.locator("body")).toHaveAttribute("data-finder-calls", "3");
});

test("README opens silently and the pane reports slow read progress then content", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "README.md": "Read me", "other.txt": "Other" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Read me");
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "slow.txt" }],
      read: () => new Promise(resolve => { (window as unknown as Window & { finish?: (value: string) => void }).finish = resolve; }),
    };
  });
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { selected: string }).selected = "slow.txt"; });
  await expect(page.locator(".cv-pane-progress-active")).toBeVisible();
  await expect(page.locator(".cv-pane-content")).toHaveClass(/cv-pane-faded/);
  await page.evaluate(() => (window as unknown as Window & { finish: (value: string) => void }).finish("Slow body"));
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Slow body");
});

test("README.md takes precedence over other root README names", async ({ page }) => {
  await ready(page);
  await setFiles(page, { README: "Plain", "README.md": "# Markdown", "README.txt": "Text" });
  await expect(page.locator("tv-code")).toHaveAttribute("selected", "README.md");
});

test("refresh observes changed connection data, deletion and recovery", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    (window as unknown as Window & { names: string[]; body: string }).names = ["a.ts"];
    (window as unknown as Window & { body: string }).body = "one";
    const element = document.querySelector("tv-code") as HTMLElement & { connection: object };
    element.connection = { list: () => (window as unknown as Window & { names: string[] }).names.map(name => ({ name })), read: () => (window as unknown as Window & { body: string }).body };
  });
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("one");
  await page.evaluate(() => { (window as unknown as Window & { body: string }).body = "two"; (document.querySelector("tv-code") as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("two");
  await page.evaluate(() => { (window as unknown as Window & { names: string[] }).names = []; (document.querySelector("tv-code") as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await page.evaluate(() => { (window as unknown as Window & { names: string[] }).names = ["a.ts"]; (document.querySelector("tv-code") as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-deleted")).toHaveCount(0);
});

test("file failure retries, while refresh failure preserves content with a Retry bar", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    let reads = 0;
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "a.ts" }],
      read: () => { reads++; if (reads === 1) throw new Error("First failed"); if (reads === 3) throw new Error("Refresh failed"); return "Content"; },
    };
  });
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(page.locator(".cv-pane-content .cv-failure")).toContainText("First failed");
  await page.locator(".cv-pane-content .cv-retry").click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Content");
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-pane-notice .cv-failure")).toContainText("Refresh failed");
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Content");
  await page.locator(".cv-pane-notice .cv-retry").click();
  await expect(page.locator(".cv-pane-notice .cv-failure")).toHaveCount(0);
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Content");
});

test("a 404 refresh read marks Deleted and the next refresh restores the content", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    let reads = 0;
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "a.ts" }],
      read: () => ++reads === 2 ? new Response("Missing", { status: 404 }) : "Content",
    };
  });
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Content");
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("Content");
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-deleted")).toHaveCount(0);
});

test("a first read returning 404 marks the file Deleted", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "missing.ts" }],
      read: () => new Response("Missing", { status: 404 }),
    };
  });
  await page.locator('.cv-row[data-path="missing.ts"]').click();
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-pane-progress-active")).toHaveCount(0);
});

test("a 404 after switching files does not show the previous file's body", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "a.ts" }, { name: "missing.ts" }],
      read: (path: string) => path === "a.ts" ? "A body" : new Response("Missing", { status: 404 }),
    };
  });
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("A body");
  await page.locator('.cv-row[data-path="missing.ts"]').click();
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveCount(0);
  await expect(page.locator(".cv-pane-empty")).toHaveText("File deleted");
});

test("deletion keeps the previous large-file message faded", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    let present = true;
    (window as unknown as Window & { removeFile: () => void }).removeFile = () => { present = false; };
    (element as HTMLElement & { connection: object }).connection = {
      list: () => present ? [{ name: "large.txt", size: 2 * 1024 * 1024 + 1 }] : [],
      read: () => { throw new Error("large file should not be read"); },
    };
  });
  await page.locator('.cv-row[data-path="large.txt"]').click();
  await expect(page.locator(".cv-pane-empty")).toContainText("File too large");
  await page.evaluate(() => {
    (window as unknown as Window & { removeFile: () => void }).removeFile();
    (document.querySelector("tv-code") as HTMLElement & { refresh: () => void }).refresh();
  });
  await expect(page.locator(".cv-deleted")).toBeVisible();
  await expect(page.locator(".cv-pane-empty")).toContainText("File too large");
  await expect(page.locator(".cv-pane-content")).toHaveClass(/cv-pane-faded/);
});

test("failed refresh listing retains visible children and Retry reloads that folder", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    let nested = 0;
    (element as HTMLElement & { connection: object }).connection = {
      list: (path: string) => {
        if (!path) return [{ name: "src", type: "folder" }];
        if (++nested === 2) throw new Error("Could not update");
        return [{ name: "a.ts" }];
      }, read: () => "A",
    };
  });
  await page.locator('.cv-row[data-path="src"]').click();
  await expect(page.locator('.cv-row[data-path="src/a.ts"]')).toBeVisible();
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { refresh: () => void }).refresh(); });
  await expect(page.locator(".cv-tree-failure")).toContainText("Could not update");
  await expect(page.locator('.cv-row[data-path="src/a.ts"]')).toBeVisible();
  await page.locator(".cv-tree-failure .cv-retry").click();
  await expect(page.locator(".cv-tree-failure")).toHaveCount(0);
});

test("sidebar resizes, snaps shut, reopens and resets on double click", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "a.ts": "A", "b.ts": "B" });
  const handle = page.locator(".cv-resize-handle");
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error("missing handle");
  await page.mouse.move(bounds.x + 3, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 103, bounds.y + 50);
  await page.mouse.up();
  await expect(page.locator(".cv-app")).toHaveCSS("--cv-sidebar-width", "360px");
  await handle.dblclick();
  await expect(page.locator(".cv-app")).toHaveCSS("--cv-sidebar-width", "260px");
  await expect(page.locator(".cv-sidebar")).toHaveCSS("width", "260px");
  const next = await handle.boundingBox();
  if (!next) throw new Error("missing handle");
  await page.mouse.move(next.x + 3, next.y + 50);
  await page.mouse.down();
  await page.mouse.move(25, next.y + 50);
  await page.mouse.up();
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-sidebar-closed/);
});

test("the resize separator is operable from the keyboard", async ({ page }) => {
  await ready(page);
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "270");
  await page.keyboard.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "160");
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "480");
});

test("sidebar width is remembered by pathname across viewer reconstruction", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => localStorage.setItem(`tv-code:sidebar-width:${location.pathname}`, "333"));
  await page.evaluate(() => { document.querySelector("#host")!.innerHTML = "<tv-code></tv-code>"; });
  await expect(page.locator(".cv-app")).toHaveCSS("--cv-sidebar-width", "333px");
});

test("narrow sidebar overlays and closes on Escape, backdrop, or file choice", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "a.ts": "A", "b.ts": "B" });
  await page.locator("tv-code").evaluate(element => { element.style.width = "500px"; });
  await expect(page.locator(".cv-app")).toHaveClass(/cv-app-narrow/);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.locator(".cv-sidebar-backdrop")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.locator(".cv-sidebar-backdrop").click({ position: { x: 490, y: 100 } });
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(page.locator(".cv-app")).toHaveClass(/cv-sidebar-closed/);
});

test("a folder with 5000 entries opens in under 200 ms", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    (element as HTMLElement & { files: object }).files = Array.from({ length: 5000 }, (_, i) => ({ path: `src/file${i}.ts`, content: "x" }));
  });
  const duration = await page.locator('.cv-row[data-path="src"]').evaluate(row => {
    const start = performance.now();
    (row as HTMLElement).click();
    const count = document.querySelectorAll('.cv-row[data-path^="src/"]').length;
    if (count < 100) throw new Error(`Rendered only ${count} files initially`);
    return performance.now() - start;
  });
  expect(duration).toBeLessThan(200);
  await expect(page.locator('.cv-row[data-path^="src/"]')).toHaveCount(5000);
  await page.locator("tv-code").evaluate(element => { (element as HTMLElement & { selected: string }).selected = "src/file4999.ts"; });
  await expect(page.locator('.cv-row[data-path="src/file4999.ts"]')).toBeInViewport();
});

test("sidebar and pane surfaces follow the page's dark color scheme", async ({ page }) => {
  await ready(page);
  const light = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector(".cv-sidebar")!).backgroundColor,
    pane: getComputedStyle(document.querySelector(".cv-pane")!).backgroundColor,
  }));
  await page.evaluate(() => { document.documentElement.style.colorScheme = "dark"; });
  const dark = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector(".cv-sidebar")!).backgroundColor,
    pane: getComputedStyle(document.querySelector(".cv-pane")!).backgroundColor,
  }));
  expect(dark.sidebar).not.toBe(light.sidebar);
  expect(dark.pane).not.toBe(light.pane);
  expect(dark.sidebar).not.toBe(dark.pane);
});

test("a superseded connection listing never replaces the newer tree", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    const viewer = element as HTMLElement & { connection: object };
    viewer.connection = {
      list: () => new Promise(resolve => { (window as unknown as Window & { finishOld: (entries: object[]) => void }).finishOld = resolve; }),
      read: () => "old",
    };
    viewer.connection = { list: () => [{ name: "new.ts" }], read: () => "new" };
  });
  await expect(page.locator('.cv-row[data-path="new.ts"]')).toBeVisible();
  await page.evaluate(() => (window as unknown as Window & { finishOld: (entries: object[]) => void }).finishOld([{ name: "old.ts" }]));
  await expect(page.locator('.cv-row[data-path="old.ts"]')).toHaveCount(0);
  await expect(page.locator('.cv-row[data-path="new.ts"]')).toBeVisible();
});

test("switching away and back during a read shows only the newer response", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(element => {
    const finishes: Array<(value: string) => void> = [];
    (window as unknown as Window & { finishes: typeof finishes }).finishes = finishes;
    (element as HTMLElement & { connection: object }).connection = {
      list: () => [{ name: "a.ts" }, { name: "b.ts" }],
      read: (path: string) => path === "a.ts" ? new Promise(resolve => { finishes.push(resolve); }) : "B",
    };
  });
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { finishes: unknown[] }).finishes.length)).toBe(1);
  await page.locator('.cv-row[data-path="b.ts"]').click();
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("B");
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await page.evaluate(() => (window as unknown as Window & { finishes: Array<(value: string) => void> }).finishes[0]!("Old A"));
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { finishes: unknown[] }).finishes.length)).toBe(2);
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).not.toHaveText("Old A");
  await page.evaluate(() => (window as unknown as Window & { finishes: Array<(value: string) => void> }).finishes[1]!("New A"));
  await expect(page.locator(".cv-code-view, .cv-markdown-view")).toHaveText("New A");
});

test("disconnecting during a drag releases page pointer listeners and reconnects cleanly", async ({ page }) => {
  await ready(page);
  await setFiles(page, { "a.ts": "A", "b.ts": "B" });
  await page.evaluate(() => {
    const viewer = document.querySelector("tv-code")!;
    const handle = viewer.querySelector(".cv-resize-handle")!;
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 42, clientX: 260 }));
    viewer.remove();
    document.querySelector("#host")!.append(viewer);
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 42, clientX: 400 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 42, clientX: 400 }));
  });
  await expect(page.locator(".cv-app")).not.toHaveClass(/cv-app-dragging/);
  await expect(page.locator(".cv-app")).toHaveCSS("--cv-sidebar-width", "260px");
  await page.locator("tv-code").evaluate(element => {
    const file = document.createElement("tv-code-file");
    file.setAttribute("path", "added.txt");
    file.textContent = "Added";
    element.append(file);
  });
  // Assigned files keep precedence after reconnection.
  await expect(page.locator('.cv-row[data-path="added.txt"]')).toHaveCount(0);
  await expect(page.locator('.cv-row[data-path="a.ts"]')).toBeVisible();
});
