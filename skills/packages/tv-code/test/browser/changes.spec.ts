/** Change letters in the tree, and the diff of a changed file in the file pane. */
import { expect, test, type Page, type Route } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/packages/tv-code/test/browser/fixture.html");
  await page.locator("#host").evaluate(host => { host.innerHTML = "<tv-code></tv-code>"; });
  await page.evaluate(() => customElements.whenDefined("tv-code"));
}

const status = (page: Page, path: string) => page.locator(`.cv-row[data-path="${path}"] .cv-row-status`);
/** The diff in view, not one still drawing unseen. */
const diffBody = (page: Page) => page.locator(".cv-pane-content > .cv-pane-diff:not(.cv-pane-diff-pending)");
const modes = (page: Page) => page.getByRole("group", { name: "View mode" }).getByRole("button");
const mode = (page: Page, name: string) => page.getByRole("group", { name: "View mode" }).getByRole("button", { name, exact: true });
const counts = (page: Page) => page.locator(".cv-pane-path .cv-diff-counts");

/** The lines of the diff in view, as [kind, text]: context, change-addition or change-deletion. */
async function diffLines(page: Page): Promise<string[][]> {
  const lines = diffBody(page).locator("diffs-container [data-content] > [data-line-type]");
  await expect(lines.first()).toBeVisible();
  return lines.evaluateAll(rows => rows.map(row => [row.getAttribute("data-line-type") ?? "", (row.textContent ?? "").replace(/\n$/, "")]));
}

/**
 * Record, on each animation frame from now on, the open file whenever the
 * content area shows nothing drawn: no text, and no diff lines. Returns a
 * function that gives the files recorded.
 */
async function recordBlankFrames(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const blanks: string[] = (window as any).blanks = [];
    const content = document.querySelector(".cv-pane-content")!;
    const sample = () => {
      const shown = [...content.children].filter(child => !child.classList.contains("cv-pane-diff-pending"));
      if (!shown.some(child => child.textContent?.trim() || child.querySelector("diffs-container")?.shadowRoot?.querySelector("[data-content]")?.textContent?.trim()))
        blanks.push(document.querySelector(".cv-path-file")?.textContent ?? "");
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return () => page.evaluate(() => (window as any).blanks);
}

/** Hold requests for the diff module until the returned function is called. */
async function holdDiffModule(page: Page): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/tv-code-diff.js", async (route: Route) => { await released; await route.continue(); });
  return release;
}

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

test("a changed file opens on the diff of its two versions, beside its rendered and source views", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).reads = [];
    const versions: Record<string, object> = {
      "changed.md": { before: "# Title\n\nold line\n", after: "# Title\n\nnew line\nadded line\n" },
      "changed.ts": { before: "const a = 1;\n", after: "const a = 2;\n" },
    };
    (viewer as any).diff = async (path: string) => versions[path] ?? null;
    (viewer as any).connection = {
      list: () => ["changed.md", "changed.ts", "same.md", "same.ts"].map(name => ({ name, type: "file" })),
      read: (path: string) => { (window as any).reads.push(path); return `contents of ${path}`; },
    };
    (viewer as any).selected = "changed.md";
  });
  expect(await diffLines(page)).toEqual([
    ["context", "# Title"], ["context", ""], ["change-deletion", "old line"],
    ["change-addition", "new line"], ["change-addition", "added line"],
  ]);
  await expectModes(page, ["Preview", "Source", "Diff"], "Diff");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toHaveCount(0);
  await expect(counts(page)).toHaveText("+2\u22121");
  // The diff fills the width of the content area, and the file is not read.
  const width = await page.locator(".cv-pane-content").evaluate(content => [content.clientWidth, content.querySelector("diffs-container")!.clientWidth]);
  expect(width[1]).toBe(width[0]);
  expect(await page.evaluate(() => (window as any).reads)).toEqual([]);

  await mode(page, "Preview").click();
  await expect(page.locator(".cv-markdown-view")).toContainText("contents of changed.md");
  await expectModes(page, ["Preview", "Source", "Diff"], "Preview");
  await expect(counts(page)).toHaveText("+2\u22121");
  await mode(page, "Source").click();
  await expect(page.locator(".cv-code-text")).toHaveText("contents of changed.md");
  await expectModes(page, ["Preview", "Source", "Diff"], "Source");
  await expect(page.locator("tv-code")).toHaveAttribute("show-source", "");
  await expect(page.getByRole("button", { name: "Wrap lines" })).toBeVisible();
  await mode(page, "Diff").click();
  expect(await diffLines(page)).toContainEqual(["change-addition", "added line"]);
  await expectModes(page, ["Preview", "Source", "Diff"], "Diff");
  await expect(page.locator(".cv-code-text")).toHaveCount(0);
  await mode(page, "Preview").click();
  await expect(page.locator(".cv-markdown-view")).toBeVisible();
  await expect(diffBody(page)).toHaveCount(0);

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
  expect(await diffLines(page)).toEqual([["change-deletion", "const a = 1;"], ["change-addition", "const a = 2;"]]);
  await expectModes(page, ["Source", "Diff"], "Diff");
  await expect(counts(page)).toHaveText("+1\u22121");
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

test("a missing version is an empty file, so an added or removed file shows every line as changed", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const versions: Record<string, object> = {
      "added.ts": { after: "one\ntwo\nthree\n" },
      "removed.ts": { before: "one\ntwo\n", after: null },
    };
    (viewer as any).diff = (path: string) => versions[path] ?? null;
    (viewer as any).files = [{ path: "added.ts", content: "one\ntwo\nthree\n", status: "added" }, { path: "removed.ts", content: "one\ntwo\n", status: "removed" }];
    (viewer as any).selected = "added.ts";
  });
  expect(await diffLines(page)).toEqual([["change-addition", "one"], ["change-addition", "two"], ["change-addition", "three"]]);
  await expect(counts(page)).toHaveText("+3\u22120");
  await page.locator('.cv-row[data-path="removed.ts"]').click();
  await expect(page.locator(".cv-pane-path .cv-path-file")).toHaveText("removed.ts");
  await expect(counts(page)).toHaveText("+0\u22122");
  expect(await diffLines(page)).toEqual([["change-deletion", "one"], ["change-deletion", "two"]]);
});

test("equal versions show No differences in the Diff view, with no counts", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).diff = () => ({ before: "same\n", after: "same\n" });
    (viewer as any).files = { "a.ts": "same\n", "b.ts": "other\n" };
    (viewer as any).selected = "a.ts";
  });
  await expect(diffBody(page)).toHaveText("No differences");
  await expect(diffBody(page).getByRole("status")).toHaveText("No differences");
  await expect(diffBody(page).locator("diffs-container")).toHaveCount(0);
  await expectModes(page, ["Source", "Diff"], "Diff");
  await expect(counts(page)).toHaveCount(0);
});

test("a diff function that throws, rejects or returns another shape counts as no diff", async ({ page }) => {
  await ready(page);
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.locator("tv-code").evaluate(viewer => {
    const results: Record<string, () => unknown> = {
      "throws.ts": () => { throw new Error("no versions"); },
      "rejects.ts": () => Promise.reject(new Error("no versions")),
      "shape.ts": () => ({ before: 1, after: "two" }),
    };
    (viewer as any).diff = (path: string) => results[path]();
    (viewer as any).files = { "throws.ts": "a", "rejects.ts": "b", "shape.ts": "c" };
  });
  for (const [path, text] of [["throws.ts", "a"], ["rejects.ts", "b"], ["shape.ts", "c"]]) {
    await page.locator(`.cv-row[data-path="${path}"]`).click();
    await expect(page.locator(".cv-code-text")).toHaveText(text);
    await expect(modes(page)).toHaveCount(0);
  }
  await expect.poll(() => errors.filter(error => error.startsWith("tv-code diff failed")).length).toBe(3);
});

test("the diff module loads only once the page gives the versions of a file", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/tv-code-diff.js")) requests.push(request.url()); });
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).files = { "a.ts": "a", "b.ts": "b", "README.md": "# Readme" };
    (viewer as any).selected = "a.ts";
  });
  await expect(page.locator(".cv-code-text")).toHaveText("a");
  await page.locator('.cv-row[data-path="README.md"]').click();
  await expect(page.locator(".cv-markdown-view")).toContainText("Readme");
  // A diff function that has no versions for the open files does not need it either.
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).changed = new Set<string>();
    (viewer as any).diff = (path: string) => (window as any).changed.has(path) ? { before: "a\n", after: "b\n" } : null;
  });
  await page.locator('.cv-row[data-path="b.ts"]').click();
  await expect(page.locator(".cv-code-text")).toHaveText("b");
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual([]);

  await page.evaluate(() => (window as any).changed.add("a.ts"));
  await page.locator('.cv-row[data-path="a.ts"]').click();
  expect(await diffLines(page)).toEqual([["change-deletion", "a"], ["change-addition", "b"]]);
  expect(requests).toHaveLength(1);
});

test("a failed diff module load shows Retry while Source still works", async ({ page }) => {
  let moduleAvailable = false;
  await page.route("**/tv-code-diff.js*", route => moduleAvailable ? route.continue() : route.abort());
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).files = { "changed.ts": "new\n", "other.ts": "other\n" };
    (viewer as any).diff = () => ({ before: "old\n", after: "new\n" });
    (viewer as any).selected = "changed.ts";
  });
  await expect(page.locator(".cv-pane-content .cv-failure")).toContainText("Could not load diff");
  await expectModes(page, ["Source", "Diff"], "Diff");
  await mode(page, "Source").click();
  await expect(page.locator(".cv-code-text").first()).toHaveText("new");
  await expectModes(page, ["Source", "Diff"], "Source");
  await mode(page, "Diff").click();
  await expect(page.locator(".cv-pane-content .cv-failure")).toContainText("Could not load diff");
  moduleAvailable = true;
  await page.locator(".cv-pane-content .cv-retry").click();
  expect(await diffLines(page)).toEqual([["change-deletion", "old"], ["change-addition", "new"]]);
  await expect(page.locator(".cv-pane-content .cv-failure")).toHaveCount(0);
});

test("a refresh asks for the versions again and draws the change in place, or shows the file when it is unchanged", async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 900, height: 400 });
  await page.locator("tv-code").evaluate(viewer => {
    // Sixty changed lines, so the diff is taller than the pane.
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`);
    const state = { changed: true, after: lines.map(line => line.replace("line", "changed")).join(""), calls: [] as string[] };
    (window as any).state = state;
    (viewer as any).diff = (path: string) => {
      state.calls.push(path);
      return state.changed && path === "a.ts" ? { before: lines.join(""), after: state.after } : null;
    };
    (viewer as any).connection = { list: () => [{ name: "a.ts", type: "file" }, { name: "b.ts", type: "file" }], read: () => "text" };
    (viewer as any).selected = "a.ts";
  });
  await expect(counts(page)).toHaveText("+60\u221260");
  await expect(diffBody(page)).toBeVisible();
  const before = await page.locator(".cv-pane-content").evaluate(content => {
    content.scrollTop = 150;
    (window as any).container = content.querySelector("diffs-container");
    return content.scrollTop;
  });
  expect(before).toBe(150);

  // A refresh of another file leaves the diff alone; one of the open file updates it.
  const calls = await page.evaluate(() => (window as any).state.calls.length);
  await page.locator("tv-code").evaluate(viewer => (viewer as any).refresh("b.ts"));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).state.calls.length)).toBe(calls);
  await page.locator("tv-code").evaluate(viewer => {
    (window as any).state.after += "line 61\nline 62\n";
    (viewer as any).refresh("a.ts");
  });
  await expect(counts(page)).toHaveText("+62\u221260");
  await expect.poll(() => diffLines(page).then(lines => lines.some(([, text]) => text === "line 62"))).toBe(true);
  const after = await page.locator(".cv-pane-content").evaluate(content => ({
    scrollTop: content.scrollTop,
    same: content.querySelector("diffs-container") === (window as any).container,
  }));
  expect(after).toEqual({ scrollTop: 150, same: true });

  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = false; (viewer as any).refresh(); });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(modes(page)).toHaveCount(0);
  await expect(counts(page)).toHaveCount(0);
  await page.locator("tv-code").evaluate(viewer => { (window as any).state.changed = true; (viewer as any).refresh("a.ts"); });
  await expect(diffBody(page)).toBeVisible();
  // Clearing the property shows the file again.
  await page.locator("tv-code").evaluate(viewer => { (viewer as any).diff = null; });
  await expect(page.locator(".cv-code-text")).toHaveText("text");
  await expect(modes(page)).toHaveCount(0);
});

test("an older diff refresh cannot replace a newer result or its counts", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const state = { calls: 0, pending: [] as Array<(after: string) => void> };
    (window as any).state = state;
    (viewer as any).diff = () => {
      if (++state.calls === 1) return { before: "old\n", after: "first\n" };
      return new Promise(resolve => state.pending.push(after => resolve({ before: "old\n", after })));
    };
    (viewer as any).connection = {
      list: () => [{ name: "changed.ts", type: "file" }, { name: "other.ts", type: "file" }],
      read: () => "first\n",
    };
    (viewer as any).selected = "changed.ts";
  });
  await expect(counts(page)).toHaveText("+1\u22121");
  await page.locator("tv-code").evaluate(viewer => (viewer as any).refresh("changed.ts"));
  await expect.poll(() => page.evaluate(() => (window as any).state.pending.length)).toBe(1);
  await page.locator("tv-code").evaluate(viewer => (viewer as any).refresh("changed.ts"));
  await expect.poll(() => page.evaluate(() => (window as any).state.pending.length)).toBe(2);
  await page.evaluate(() => (window as any).state.pending[1]("new\nadded\n"));
  await expect(counts(page)).toHaveText("+2\u22121");
  expect(await diffLines(page)).toContainEqual(["change-addition", "added"]);
  await page.evaluate(() => (window as any).state.pending[0]("stale\n"));
  await expect.poll(() => page.evaluate(() => (window as any).state.pending.length)).toBe(2);
  await page.waitForTimeout(100);
  await expect(counts(page)).toHaveText("+2\u22121");
  expect(await diffLines(page)).toContainEqual(["change-addition", "added"]);
  expect(await diffLines(page)).not.toContainEqual(["change-addition", "stale"]);
});

test("a refresh that removes a diff cannot later overwrite a newer changed version", async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { calls: 0, newer: false, release: null as null | ((value: unknown) => void) };
    (window as any).state = state;
    (viewer as any).diff = () => {
      state.calls++;
      if (state.calls === 1) return { before: 'old\n', after: 'initial\n' };
      if (state.calls === 2) return null;
      if (!state.newer) return new Promise(resolve => { state.release = resolve; });
      return { before: 'old\n', after: 'latest\nextra\n' };
    };
    (viewer as any).connection = { list: () => [{ name: 'changed.ts', type: 'file' }], read: () => 'plain\n' };
    (viewer as any).selected = 'changed.ts';
  });
  await expect(diffBody(page)).toBeVisible();
  await page.locator('tv-code').evaluate(viewer => (viewer as any).refresh('changed.ts'));
  await expect.poll(() => page.evaluate(() => Boolean((window as any).state.release || document.querySelector('.cv-code-text')))).toBe(true);
  await page.locator('tv-code').evaluate(viewer => { (window as any).state.newer = true; (viewer as any).refresh('changed.ts'); });
  await expect(counts(page)).toHaveText('+2\u22121');
  expect(await diffLines(page)).toContainEqual(['change-addition', 'extra']);
  await page.evaluate(() => (window as any).state.release?.({ before: 'old\n', after: 'stale\n' }));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).state.calls)).toBe(3);
  await expect(counts(page)).toHaveText('+2\u22121');
  expect(await diffLines(page)).toContainEqual(['change-addition', 'extra']);
  expect(await diffLines(page)).not.toContainEqual(['change-addition', 'stale']);
});

test('clearing diff while its first comparison waits opens the file and ignores the old answer', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    (viewer as any).diff = () => new Promise(resolve => { (window as any).finishOldComparison = resolve; });
    (viewer as any).files = { 'a.ts': 'ordinary body' };
    (viewer as any).selected = 'a.ts';
  });
  await page.locator('tv-code').evaluate(viewer => { (viewer as any).diff = null; });
  await expect(page.locator('.cv-code-text')).toHaveText('ordinary body');
  await page.evaluate(() => (window as any).finishOldComparison({ before: 'old\n', after: 'stale\n' }));
  await expect(modes(page)).toHaveCount(0);
  await expect(diffBody(page)).toHaveCount(0);
  await expect(page.locator('.cv-code-text')).toHaveText('ordinary body');
});

for (const removedVersion of [null, { before: 'old\n', after: 'changed\n' }]) {
  test(`a deleted changed file keeps its last diff when refresh returns ${removedVersion ? 'versions' : 'null'}`, async ({ page }) => {
    await ready(page);
    await page.locator('tv-code').evaluate((viewer, removedVersion) => {
      const state = { present: true, version: { before: 'old\n', after: 'last\n' } as unknown };
      (window as any).state = state;
      (viewer as any).diff = () => state.version;
      (viewer as any).connection = {
        list: () => state.present ? [{ name: 'changed.ts', type: 'file' }] : [],
        read: () => 'last\n',
      };
      (viewer as any).selected = 'changed.ts';
      (window as any).removedVersion = removedVersion;
    }, removedVersion);
    expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
    await page.locator('tv-code').evaluate(viewer => {
      (window as any).state.present = false;
      (window as any).state.version = (window as any).removedVersion;
      (viewer as any).refresh('changed.ts');
    });
    await expect(page.locator('.cv-deleted')).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
    await expect(diffBody(page)).toBeVisible();
    expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
    await expect(page.locator('.cv-pane-content .cv-failure')).toHaveCount(0);
    await page.locator('tv-code').evaluate(viewer => {
      (window as any).state.present = true;
      (window as any).state.version = { before: 'old\n', after: 'returned\n' };
      (viewer as any).refresh('changed.ts');
    });
    await expect(page.locator('.cv-deleted')).toHaveCount(0);
    expect(await diffLines(page)).toContainEqual(['change-addition', 'returned']);
    await expect(page.locator('.cv-pane-content')).not.toHaveClass(/cv-pane-faded/);
  });
}

test('a comparison already in flight cannot redraw a file deleted by refresh', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { present: true, calls: 0, release: null as null | ((value: unknown) => void) };
    (window as any).state = state;
    (viewer as any).diff = () => {
      state.calls++;
      return state.calls === 1 ? { before: 'old\n', after: 'last\n' } :
        new Promise(resolve => { state.release = resolve; });
    };
    (viewer as any).connection = {
      list: () => state.present ? [{ name: 'changed.ts', type: 'file' }] : [],
      read: () => 'last\n',
    };
    (viewer as any).selected = 'changed.ts';
  });
  expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
  await page.locator('tv-code').evaluate(viewer => (viewer as any).refresh('changed.ts'));
  await expect.poll(() => page.evaluate(() => (window as any).state.calls)).toBe(2);
  await page.locator('tv-code').evaluate(viewer => { (window as any).state.present = false; (viewer as any).refresh('changed.ts'); });
  await expect(page.locator('.cv-deleted')).toBeVisible();
  await page.evaluate(() => (window as any).state.release({ before: 'old\n', after: 'stale\n' }));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).state.calls)).toBe(2);
  expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
  await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
});

test('a pending diff draw cannot revive a file removed by its listing', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { present: true, finishDraw: null as null | (() => void) };
    (window as any).state = state;
    (viewer as any).connection = {
      list: () => state.present ? [{ name: 'a.ts', type: 'file' }] : [],
      read: () => 'last body',
    };
    (viewer as any).selected = 'a.ts';
  });
  await expect(page.locator('.cv-line')).toContainText('last body');
  await page.locator('tv-code').evaluate(viewer => {
    const controller = (viewer as any).openFile;
    controller.requests.compare = async () => ({
      kind: 'ready', change: { additions: 1, deletions: 1, metadata: null },
      createView: (drawn: () => void) => ({
        element: document.createElement('div'),
        show: () => { (window as any).state.finishDraw = drawn; },
        destroy: () => undefined,
      }),
    });
    (viewer as any).diff = () => ({ before: 'old', after: 'new' });
  });
  await expect(page.locator('.cv-pane-diff-pending')).toHaveCount(1);
  await page.locator('tv-code').evaluate(viewer => {
    (window as any).state.present = false;
    (viewer as any).refresh('a.ts');
  });
  await expect(page.locator('.cv-deleted')).toBeVisible();
  await page.evaluate(() => (window as any).state.finishDraw());
  await expect(page.locator('.cv-pane-diff')).toHaveCount(0);
  await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
  await expect(page.locator('.cv-line')).toContainText('last body');
});

test('a 404 after a listing keeps Deleted despite a later comparison', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { missing: false, comparisons: 0 };
    (window as any).state = state;
    (viewer as any).diff = () => { state.comparisons++; return { before: 'old\n', after: 'new\n' }; };
    (viewer as any).connection = {
      list: () => [{ name: 'a.ts', type: 'file' }],
      read: () => state.missing ? new Response('gone', { status: 404 }) : 'last body',
    };
    (viewer as any).selected = 'a.ts';
  });
  await expect(diffBody(page)).toBeVisible();
  await mode(page, 'Source').click();
  await expect(page.locator('.cv-line')).toContainText('last body');
  await page.locator('tv-code').evaluate(viewer => { (window as any).state.missing = true; (viewer as any).refresh('a.ts'); });
  await expect(page.locator('.cv-deleted')).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
  await expect(page.locator('.cv-line')).toContainText('last body');
  await expect(page.locator('.cv-pane-content .cv-failure')).toHaveCount(0);
});

test('a failed read after a diff disappears keeps the diff and shows Retry', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { changed: true, finishRead: null as null | ((value: Response) => void) };
    (window as any).state = state;
    (viewer as any).diff = () => state.changed ? { before: 'old\n', after: 'last\n' } : null;
    (viewer as any).connection = {
      list: () => [{ name: 'a.ts', type: 'file' }],
      read: () => new Promise<Response>(resolve => { state.finishRead = resolve; }),
    };
    (viewer as any).selected = 'a.ts';
  });
  expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
  await page.locator('tv-code').evaluate(viewer => { (window as any).state.changed = false; (viewer as any).refresh('a.ts'); });
  await expect(page.locator('.cv-pane-progress')).toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
  await page.evaluate(() => (window as any).state.finishRead(new Response('{"error":"offline"}', {
    status: 503, headers: { 'Content-Type': 'application/json' },
  })));
  await expect(page.locator('.cv-pane-notice')).toContainText('offline');
  await expect(page.locator('.cv-pane-notice .cv-retry')).toBeVisible();
  expect(await diffLines(page)).toContainEqual(['change-addition', 'last']);
  await expect(page.locator('.cv-pane-progress')).not.toHaveClass(/cv-pane-progress-active/);
});

test("mode changes reuse the held comparison while the diff function stalls", async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    const state = { calls: 0, reads: 0 };
    (window as any).state = state;
    (viewer as any).diff = () => {
      state.calls++;
      return state.calls === 1 ? { before: 'old\n', after: 'new\n' } : new Promise(() => {});
    };
    (viewer as any).connection = {
      list: () => [{ name: 'changed.ts', type: 'file' }],
      read: () => { state.reads++; return 'new\n'; },
    };
    (viewer as any).selected = 'changed.ts';
  });
  await expect(diffBody(page)).toBeVisible();
  await mode(page, 'Source').click();
  await expect(page.locator('.cv-code-view')).toContainText('new');
  await mode(page, 'Diff').click();
  await expect(diffBody(page)).toBeVisible();
  expect(await page.evaluate(() => ({ calls: (window as any).state.calls, reads: (window as any).state.reads }))).toEqual({ calls: 1, reads: 1 });
});

test('a pending Source read fades the old Diff and shows progress', async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    (viewer as any).diff = () => ({ before: 'old\n', after: 'new\n' });
    (viewer as any).connection = {
      list: () => [{ name: 'changed.ts', type: 'file' }],
      read: () => new Promise(resolve => { (window as any).finishRead = resolve; }),
    };
    (viewer as any).selected = 'changed.ts';
  });
  await expect(diffBody(page)).toBeVisible();
  await mode(page, 'Source').click();
  await expectModes(page, ['Source', 'Diff'], 'Source');
  await expect(page.locator('.cv-pane-progress')).toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator('.cv-pane-content')).toHaveClass(/cv-pane-faded/);
  await expect(diffBody(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishRead)).toBe('function');
  await page.evaluate(() => (window as any).finishRead('source\n'));
  await expect(page.locator('.cv-code-view')).toContainText('source');
  await expect(page.locator('.cv-pane-progress')).not.toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator('.cv-pane-content')).not.toHaveClass(/cv-pane-faded/);
});

test("a mode change keeps a newer comparison already in flight", async ({ page }) => {
  await ready(page);
  await page.locator('tv-code').evaluate(viewer => {
    (viewer as any).diff = () => ({ before: 'old\n', after: 'first\n' });
    (viewer as any).files = { 'changed.ts': 'source\n' };
    (viewer as any).selected = 'changed.ts';
  });
  await expect(diffBody(page)).toBeVisible();
  await page.locator('tv-code').evaluate(viewer => {
    (viewer as any).diff = () => new Promise(resolve => { (window as any).finishComparison = resolve; });
  });
  await mode(page, 'Source').click();
  await expect(page.locator('.cv-code-view')).toContainText('source');
  await page.evaluate(() => (window as any).finishComparison({ before: 'old\n', after: 'second\nextra\n' }));
  await expect(counts(page)).toHaveText('+2\u22121');
  await expectModes(page, ['Source', 'Diff'], 'Source');
});

for (const [path, content] of [
  ['README.md', '# Current'],
  ['icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'],
] as const) {
  test(`${path} view clicks do not request another comparison`, async ({ page }) => {
    await ready(page);
    await page.locator('tv-code').evaluate((viewer, { path, content }) => {
      const state = { calls: 0 };
      (window as any).state = state;
      (viewer as any).diff = () => {
        state.calls++;
        return state.calls === 1 ? { before: 'before', after: content } : new Promise(() => {});
      };
      (viewer as any).files = { [path]: content };
      (viewer as any).selected = path;
    }, { path, content });
    await expect(diffBody(page)).toBeVisible();
    await mode(page, 'Source').click();
    await expect(page.locator('.cv-code-text')).toContainText(content);
    await mode(page, 'Preview').click();
    await expect(page.locator(path.endsWith('.md') ? '.cv-markdown-view' : '.cv-media-image')).toBeVisible();
    expect(await page.evaluate(() => (window as any).state.calls)).toBe(1);
  });
}

test("a diff draws unseen behind the previous content and replaces it once drawn", async ({ page }) => {
  await ready(page);
  const release = await holdDiffModule(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).diff = (path: string) => path === "changed.ts" ? { before: "old\n", after: "new\n" } : null;
    (viewer as any).connection = {
      list: () => [{ name: "changed.ts", type: "file" }, { name: "same.ts", type: "file" }],
      read: (path: string) => `contents of ${path}`,
    };
    (viewer as any).selected = "same.ts";
  });
  await expect(page.locator(".cv-code-text")).toHaveText("contents of same.ts");
  await page.locator('.cv-row[data-path="changed.ts"]').click();
  // The header moves to the new file at once; the old body stays in view, faded.
  await expect(page.locator(".cv-pane-path")).toHaveText("changed.ts");
  await expect(page.locator(".cv-code-text")).toHaveText("contents of same.ts");
  await expect(page.locator(".cv-pane-progress")).toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator(".cv-pane-content")).toHaveClass(/cv-pane-faded/);
  // The first diff waits for the highlighter to start, unseen.
  const blanks = await recordBlankFrames(page);
  release();
  expect(await diffLines(page)).toEqual([["change-deletion", "old"], ["change-addition", "new"]]);
  expect(await blanks()).toEqual([]);
  await expect(page.locator(".cv-code-text")).toHaveCount(0);
  await expect(page.locator(".cv-pane-content > *")).toHaveCount(1);
  expect(await diffBody(page).evaluate(wrapper => getComputedStyle(wrapper).opacity)).toBe("1");
  await expect(page.locator(".cv-pane-progress")).not.toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator(".cv-pane-content")).not.toHaveClass(/cv-pane-faded/);
  await expectModes(page, ["Source", "Diff"], "Diff");
});

test("a diff opened first shows the loading pane, not the empty state, until it is drawn", async ({ page }) => {
  await ready(page);
  const release = await holdDiffModule(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).diff = () => ({ before: "old\n", after: "new\n" });
    (viewer as any).connection = { list: () => [{ name: "changed.ts", type: "file" }, { name: "other.ts", type: "file" }], read: () => "text" };
    (viewer as any).selected = "changed.ts";
  });
  await expect(page.locator(".cv-pane-path")).toHaveText("changed.ts");
  await expect(page.locator(".cv-pane-progress")).toHaveClass(/cv-pane-progress-active/);
  await expect(page.getByText("No file open")).toHaveCount(0);
  release();
  await expect(diffBody(page)).toBeVisible();
  await expect(page.locator(".cv-pane-content > *")).toHaveCount(1);
});

test("returning to an already drawn diff clears loading while another file waits", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    let resolveOther!: (value: object) => void;
    (window as any).releaseOther = () => resolveOther({ before: "old\n", after: "other\n" });
    (viewer as any).diff = (path: string) => path === "a.ts"
      ? { before: "old\n", after: "new\n" }
      : new Promise(resolve => { resolveOther = resolve; });
    (viewer as any).files = { "a.ts": "new\n", "b.ts": "other\n" };
    (viewer as any).selected = "a.ts";
  });
  await expect(diffBody(page)).toBeVisible();
  await page.locator('.cv-row[data-path="b.ts"]').click();
  await expect(page.locator(".cv-pane-progress")).toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator(".cv-pane-content")).toHaveClass(/cv-pane-faded/);
  await page.locator('.cv-row[data-path="a.ts"]').click();
  await expect(diffBody(page)).toBeVisible();
  await expect(page.locator(".cv-pane-progress")).not.toHaveClass(/cv-pane-progress-active/);
  await expect(page.locator(".cv-pane-content")).not.toHaveClass(/cv-pane-faded/);
  await page.evaluate(() => (window as any).releaseOther());
});

test("opening one changed file after another keeps a drawn pane in view throughout", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    const text = (name: string, count: number) => Array.from({ length: count }, (_, index) => `const ${name}${index} = ${index};\n`).join("");
    (viewer as any).diff = (path: string) => ({ before: text(path[0], 40), after: text(path[0], 45) });
    (viewer as any).files = ["a.ts", "b.ts", "c.md", "d.py"].map(path => ({ path, content: "", status: "modified" }));
    (viewer as any).selected = "a.ts";
  });
  await expect(diffBody(page)).toBeVisible();
  const blanks = await recordBlankFrames(page);
  for (const path of ["b.ts", "c.md", "d.py", "a.ts"]) {
    await page.locator(`.cv-row[data-path="${path}"]`).click();
    await expect(counts(page)).toHaveText("+5\u22120");
    await expect.poll(() => diffLines(page).then(lines => lines.at(-1)?.[1])).toBe(`const ${path[0]}44 = 44;`);
  }
  expect(await blanks()).toEqual([]);
});

test("the diff uses the code font, the pane background and the colour scheme of the element", async ({ page }) => {
  await ready(page);
  await page.locator("tv-code").evaluate(viewer => {
    (viewer as any).diff = () => ({ before: "const a = 1;\n", after: "const a = 2;\n" });
    (viewer as any).files = { "a.ts": "const a = 2;\n", "b.ts": "" };
    (viewer as any).selected = "a.ts";
  });
  await expect(diffBody(page)).toBeVisible();
  const look = (scheme: string) => page.locator("tv-code").evaluate(async (viewer, scheme) => {
    (viewer as HTMLElement).style.colorScheme = scheme;
    await new Promise(requestAnimationFrame);
    const root = viewer.querySelector("diffs-container")!.shadowRoot!;
    const line = root.querySelector("[data-content] > [data-line-type]")!;
    const keyword = line.querySelector("span")!;
    const code = getComputedStyle(viewer.querySelector(".cv-pane")!);
    return {
      font: [getComputedStyle(line).fontFamily, getComputedStyle(line).fontSize, getComputedStyle(line).lineHeight],
      codeFont: [code.getPropertyValue("--_font-mono").trim(), code.getPropertyValue("--_code-size").trim(), code.getPropertyValue("--_code-line-height").trim()],
      background: getComputedStyle(root.querySelector("pre")!).backgroundColor,
      pane: code.backgroundColor,
      keyword: getComputedStyle(keyword).color,
    };
  }, scheme);
  const light = await look("light");
  const dark = await look("dark");
  for (const scheme of [light, dark]) {
    expect(scheme.font).toEqual(scheme.codeFont);
    expect(scheme.background).toBe(scheme.pane);
  }
  expect(light.pane).not.toBe(dark.pane);
  // The GitHub light and dark colours of a keyword.
  expect(light.keyword).toBe("rgb(215, 58, 73)");
  expect(dark.keyword).toBe("rgb(249, 117, 131)");
});
