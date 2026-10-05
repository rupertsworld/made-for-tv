/** Reader-visible code rows, selection, updates, copying, and responsiveness. */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/packages/tv-code/test/browser/code-view-fixture.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
});

test("line numbers stay out of an exact text selection and highlighting arrives", async ({ page }) => {
  await page.evaluate(() => (window as any).view.show({ text: 'const x = "a";\n\nnext();', languageId: "typescript" }));
  await expect(page.locator(".cv-line-number")).toHaveCount(3);
  expect(await page.locator(".cv-line-number").first().evaluate(element => getComputedStyle(element, "::before").content)).toBe('"1"');
  await expect(page.locator(".cv-t-keyword")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).view.highlighted)).toBe("done");
  expect(await page.locator(".cv-code-view").evaluate(element => getComputedStyle(element).tabSize)).toBe("4");
  expect(await page.locator(".cv-line").first().evaluate(element => element.getBoundingClientRect().height)).toBe(18);
  const result = await page.evaluate(() => {
    const range = document.createRange();
    const first = document.querySelector(".cv-code-text")!;
    const last = document.querySelectorAll(".cv-code-text")[2];
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    return getSelection()!.toString();
  });
  expect(result).toBe('const x = "a";\n\nnext();');
});

test("selection preserves terminal newlines, tabs and empty lines", async ({ page }) => {
  for (const source of ["a\n", "\n", "a\n\n", "\t<&\n  \nend", "a\r\nb\r\n"]) {
    const selected = await page.evaluate(text => {
      const view = (window as any).view;
      view.show({ text, languageId: null });
      const code = view.element.querySelectorAll(".cv-code-text");
      const range = document.createRange();
      range.setStart(code[0], 0);
      range.setEnd(code[code.length - 1], code[code.length - 1].childNodes.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return getSelection()!.toString();
    }, source);
    expect(selected, JSON.stringify(source)).toBe(source);
  }
});

test("copying highlighted text across blocks preserves tabs and empty lines", async ({ page }) => {
  const source = Array.from({ length: 260 }, (_, index) =>
    index % 13 === 0 ? "" : `\tconst value${index} = "<&";`).join("\n");
  await page.evaluate(text => (window as any).view.show({ text, languageId: "typescript" }), source);
  await expect.poll(() => page.evaluate(() => (window as any).view.highlighted)).toBe("done");
  const copied = await page.evaluate(() => {
    const code = document.querySelectorAll(".cv-code-text");
    const range = document.createRange();
    range.setStart(code[0], 0);
    range.setEnd(code[code.length - 1], code[code.length - 1].childNodes.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    return getSelection()!.toString();
  });
  expect(copied).toBe(source);
  await expect(page.locator(".cv-code-text script")).toHaveCount(0);
});

test("wrapping aligns continuation lines and gutter remains sticky", async ({ page }) => {
  await page.evaluate(() => (window as any).view.show({ text: "a".repeat(300), languageId: null }));
  const before = await page.locator(".cv-line-number").first().boundingBox();
  await page.locator(".cv-code-view").evaluate(element => { element.scrollLeft = 500; });
  const after = await page.locator(".cv-line-number").first().boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 0);
  await page.evaluate(() => { (window as any).view.wrap = true; });
  expect(await page.locator(".cv-code-view").evaluate(element => element.scrollLeft)).toBe(0);
  expect(await page.locator(".cv-line").first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(20);
});

test("wrapped continuation rows keep the indentation of their line", async ({ page }) => {
  const long = "word ".repeat(80);
  await page.evaluate(text => {
    const view = (window as any).view;
    view.wrap = true;
    view.show({ text, languageId: null });
  }, `${long}\n    ${long}\n\t\t${long}\n${" ".repeat(200)}${long}`);
  // The left edge of the first and second visual rows of a line's text.
  const rows = (line: number) => page.locator(`.cv-line[data-line="${line}"] .cv-code-text`).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
    const firstText = element.textContent!.search(/\S/);
    const textRange = document.createRange();
    textRange.setStart(element.firstChild!, firstText);
    textRange.setEnd(element.firstChild!, firstText + 1);
    const tops = [...new Set(rects.map(rect => Math.round(rect.top)))].sort((a, b) => a - b);
    const second = rects.filter(rect => Math.round(rect.top) === tops[1]).sort((a, b) => a.left - b.left)[0];
    return { text: textRange.getBoundingClientRect().left, continuation: second.left, start: element.getBoundingClientRect().left };
  });
  const flat = await rows(1);
  const spaces = await rows(2);
  const tabs = await rows(3);
  const deep = await rows(4);
  // An unindented line wraps to the start of the code.
  expect(flat.continuation).toBeCloseTo(flat.text, 0);
  // Indented lines wrap to where their text starts, for spaces and for tabs.
  expect(spaces.continuation).toBeCloseTo(spaces.text, 0);
  expect(tabs.continuation).toBeCloseTo(tabs.text, 0);
  expect(tabs.text).toBeGreaterThan(spaces.text);
  // The line number stays on the first row of a wrapped line.
  const number = await page.locator('.cv-line-number[data-line="2"]').evaluate(element => {
    const row = element.closest(".cv-line")!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return { rowTop: row.top, numberTop: box.top + parseFloat(getComputedStyle(element).paddingTop), lineHeight: parseFloat(getComputedStyle(element).lineHeight), content: getComputedStyle(element).alignItems };
  });
  expect(number.content).toBe("flex-start");
  // A very deep indentation is capped, so continuation rows keep room.
  const width = await page.locator(".cv-code-view").evaluate(element => element.clientWidth);
  expect(deep.continuation - deep.start).toBeLessThan(width * 0.5);
});

test("line clicks, shift ranges, clearing and programmatic scrolling", async ({ page }) => {
  await page.evaluate(() => (window as any).view.show({ text: Array.from({ length: 100 }, (_, n) => `line ${n + 1}`).join("\n"), languageId: null }));
  await page.locator('.cv-line-number[data-line="3"]').click();
  await page.locator('.cv-line-number[data-line="6"]').click({ modifiers: ["Shift"] });
  expect(await page.evaluate(() => (window as any).view.lines)).toEqual({ start: 3, end: 6 });
  expect(await page.evaluate(() => (window as any).changes)).toEqual([{ start: 3, end: 3 }, { start: 3, end: 6 }]);
  await page.locator('.cv-line-number[data-line="8"]').click();
  await page.locator('.cv-line-number[data-line="8"]').click();
  expect(await page.evaluate(() => (window as any).view.lines)).toBeNull();
  await page.evaluate(() => { (window as any).view.lines = { start: 80, end: 82 }; });
  expect(await page.locator(".cv-code-view").evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
  await page.evaluate(() => { (window as any).view.lines = { start: 99, end: 200 }; });
  expect(await page.evaluate(() => (window as any).view.lines)).toEqual({ start: 99, end: 100 });
  await page.evaluate(() => { (window as any).view.lines = { start: 200, end: 300 }; });
  expect(await page.evaluate(() => (window as any).view.lines)).toEqual({ start: 100, end: 100 });
  expect(await page.evaluate(() => (window as any).changes)).toHaveLength(4);
});

test("updates remap the viewport and selection, and change marks expire", async ({ page }) => {
  const original = Array.from({ length: 100 }, (_, n) => `line ${n + 1}`);
  await page.evaluate(text => { (window as any).view.show({ text, languageId: null }); (window as any).view.lines = { start: 30, end: 30 }; }, original.join("\n"));
  await page.locator(".cv-code-view").evaluate(element => { element.scrollTop = 600; });
  const newer = original.slice();
  newer.splice(3, 0, "added");
  newer[30] = "edited";
  newer.splice(60, 1);
  await page.evaluate(text => (window as any).view.update({ text, languageId: null }), newer.join("\n"));
  expect(await page.evaluate(() => (window as any).view.lines)).toEqual({ start: 31, end: 31 });
  expect(await page.locator(".cv-code-view").evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(600);
  await expect(page.locator(".cv-line-added")).toHaveCount(2);
  await expect(page.locator(".cv-line-removed-before")).toHaveCount(1);
  await page.waitForTimeout(2700);
  await expect(page.locator(".cv-line-added")).toHaveCount(0);
  await expect(page.locator(".cv-line-removed-before")).toHaveCount(0);
});

test("a wrapped top line stays anchored when lines are inserted above it", async ({ page }) => {
  const long = "wrapped ".repeat(30);
  const tail = Array.from({ length: 30 }, (_, index) => `tail ${index}`);
  const original = ["first", long, "third", ...tail].join("\n");
  await page.evaluate(text => { const view = (window as any).view; view.wrap = true; view.show({ text, languageId: null }); }, original);
  await page.locator(".cv-code-view").evaluate(element => {
    const row = element.querySelector('.cv-line[data-line="3"]')!;
    element.scrollTop = row.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });
  await page.evaluate(text => (window as any).view.update({ text, languageId: null }),
    ["inserted", "first", long, "third", ...tail].join("\n"));
  const position = await page.locator('.cv-line[data-line="4"]').evaluate(element =>
    element.getBoundingClientRect().top - element.closest(".cv-code-view")!.getBoundingClientRect().top);
  expect(Math.abs(position)).toBeLessThan(20);
});

for (const position of ["above", "inside", "below"] as const) {
  test(`an insertion ${position} the viewport keeps its top line`, async ({ page }) => {
    const original = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`);
    await page.evaluate(text => (window as any).view.show({ text, languageId: null }), original.join("\n"));
    await page.locator(".cv-code-view").evaluate(element => {
      const row = element.querySelector('.cv-line[data-line="50"]')!;
      element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top;
    });
    const newer = original.slice();
    newer.splice(position === "above" ? 10 : position === "inside" ? 60 : 100, 0, "inserted");
    await page.evaluate(text => (window as any).view.update({ text, languageId: null }), newer.join("\n"));
    const anchored = page.locator(".cv-line").filter({ hasText: /^line 50/ });
    const offset = await anchored.evaluate(element => element.getBoundingClientRect().top -
      element.closest(".cv-code-view")!.getBoundingClientRect().top);
    expect(Math.abs(offset)).toBeLessThan(20);
    await expect(page.locator(".cv-line-added")).toHaveCount(1);
  });
}

test("a highlighted update retains the old view until the replacement is highlighted", async ({ page }) => {
  await page.evaluate(() => (window as any).view.show({ text: "const oldValue = 1;", languageId: "typescript" }));
  await expect(page.locator(".cv-t-keyword")).toHaveCount(1);
  const immediate = await page.evaluate(() => {
    const view = (window as any).view;
    view.update({ text: "const newValue = 2;", languageId: "typescript" });
    return { state: view.highlighted, text: view.element.textContent };
  });
  expect(immediate.state).toBe("pending");
  expect(immediate.text).toContain("oldValue");
  await expect(page.locator(".cv-code-text")).toHaveText("const newValue = 2;");
  await expect(page.locator(".cv-t-keyword")).toHaveCount(1);
});

test("scrolling and selecting during a highlighted update are retained", async ({ page }) => {
  const original = Array.from({ length: 150 }, (_, index) => `const line${index + 1} = ${index + 1};`);
  await page.evaluate(text => (window as any).view.show({ text, languageId: "typescript" }), original.join("\n"));
  await expect.poll(() => page.evaluate(() => (window as any).view.highlighted)).toBe("done");
  const newer = original.slice();
  newer.splice(4, 0, "const inserted = 0;");
  await page.evaluate(text => {
    const view = (window as any).view;
    view.update({ text, languageId: "typescript" });
    view.lines = { start: 90, end: 90 };
    const row = view.element.querySelector('.cv-line[data-line="80"]');
    view.element.scrollTop += row.getBoundingClientRect().top - view.element.getBoundingClientRect().top;
  }, newer.join("\n"));
  await expect.poll(() => page.evaluate(() => (window as any).view.highlighted)).toBe("done");
  expect(await page.evaluate(() => (window as any).view.lines)).toEqual({ start: 91, end: 91 });
  const offset = await page.locator('.cv-line[data-line="81"]').evaluate(element =>
    element.getBoundingClientRect().top - element.closest(".cv-code-view")!.getBoundingClientRect().top);
  expect(Math.abs(offset)).toBeLessThan(20);
});

test("rapid shows abort stale highlighting and 20,001 lines stay plain and responsive", async ({ page }) => {
  const result = await page.evaluate(() => {
    const view = (window as any).view;
    view.show({ text: "const stale = true;", languageId: "typescript" });
    view.show({ text: "plain", languageId: null });
    const start = performance.now();
    view.show({ text: Array.from({ length: 20001 }, (_, n) => String(n)).join("\n"), languageId: "typescript" });
    return { duration: performance.now() - start, state: view.highlighted };
  });
  expect(result.state).toBe("off");
  expect(result.duration).toBeLessThan(1000);
  await expect(page.locator(".cv-line")).toHaveCount(20001);
  await expect(page.locator(".cv-code-block")).toHaveCount(101);
  expect(await page.locator(".cv-code-block").first().evaluate(element => getComputedStyle(element).contentVisibility)).toBe("visible");
  expect(await page.locator(".cv-code-block").nth(1).evaluate(element => getComputedStyle(element).contentVisibility)).toBe("auto");
  await expect(page.locator(".cv-t-keyword")).toHaveCount(0);
});

test("reduced motion keeps change marks steady until their 2.5-second removal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const view = (window as any).view;
    view.show({ text: "one\ntwo", languageId: null });
    view.update({ text: "one\nchanged", languageId: null });
  });
  const mark = page.locator(".cv-line-added");
  await expect(mark).toHaveCount(1);
  expect(await mark.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await page.waitForTimeout(2700);
  await expect(mark).toHaveCount(0);
});

test("change marks fade without fading the code text", async ({ page }) => {
  await page.evaluate(() => {
    const view = (window as any).view;
    view.show({ text: "one\ntwo", languageId: null });
    view.update({ text: "one\nchanged", languageId: null });
  });
  await page.waitForTimeout(1900);
  expect(await page.locator(".cv-line-added").evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  await expect(page.locator(".cv-line-added")).toHaveCount(0, { timeout: 1500 });
});

test("warmed highlighting of 5,000 TypeScript lines yields between portions", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const view = (window as any).view;
    view.show({ text: "const warm = 1;", languageId: "typescript" });
    while (view.highlighted === "pending") await new Promise(resolve => setTimeout(resolve, 10));
    // Only tasks that start after `show` returns are highlighting; the task
    // that builds the plain rows synchronously is measured separately by the
    // large-file test.
    const entries: PerformanceEntry[] = [];
    const observer = new PerformanceObserver(list => entries.push(...list.getEntries()));
    observer.observe({ entryTypes: ["longtask"] });
    const text = Array.from({ length: 5000 }, (_, index) => `const value${index}: Array<string> = ["item"];`).join("\n");
    view.show({ text, languageId: "typescript" });
    const shownAt = performance.now();
    while (view.highlighted === "pending") await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => setTimeout(resolve, 100));
    observer.disconnect();
    const durations = entries.filter(entry => entry.startTime >= shownAt).map(entry => entry.duration);
    return { maxLongTask: Math.max(0, ...durations), lines: view.element.querySelectorAll(".cv-line").length };
  });
  expect(result.lines).toBe(5000);
  expect(result.maxLongTask).toBeLessThanOrEqual(75);
});
