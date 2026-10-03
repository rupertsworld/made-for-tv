/** Line changes and identity mapping for incremental code updates. */
import { expect, test } from "vitest";
import { diffLines } from "../../src/diff.js";

test("insertions at start, middle and end mark only inserted lines", () => {
  const start = diffLines("b\nc", "a\nb\nc");
  expect([...start.changed]).toEqual([1]);
  expect(start.map(1)).toBe(2);
  const middle = diffLines("a\nc", "a\nb\nc");
  expect([...middle.changed]).toEqual([2]);
  expect(middle.map(2)).toBe(3);
  const end = diffLines("a\nb", "a\nb\nc");
  expect([...end.changed]).toEqual([3]);
});

test("deletions mark their following position and map removed lines sensibly", () => {
  const middle = diffLines("a\nb\nc\nd", "a\nd");
  expect([...middle.changed]).toEqual([]);
  expect([...middle.removedBefore]).toEqual([2]);
  expect(middle.map(2)).toBe(2);
  expect(middle.map(3)).toBe(2);
  expect(diffLines("a\nb", "a").removedBefore).toEqual(new Set([2]));
  expect(diffLines("a\nb", "b").removedBefore).toEqual(new Set([1]));
});

test("replacement marks changed new lines and removed excess old lines", () => {
  const diff = diffLines("a\nb\nc\nd", "a\nB\nd");
  expect([...diff.changed]).toEqual([2]);
  expect([...diff.removedBefore]).toEqual([3]);
  expect(diff.map(2)).toBe(2);
  expect(diff.map(3)).toBe(3);
});

test("empty content and a 5,000-line single edit", () => {
  expect(diffLines("", "x").changed).toEqual(new Set([1]));
  expect(diffLines("x", "").removedBefore).toEqual(new Set([1]));
  const oldLines = Array.from({ length: 5000 }, (_, index) => `line ${index + 1}`);
  const newLines = oldLines.slice();
  newLines[2500] = "edited";
  const start = performance.now();
  const diff = diffLines(oldLines.join("\n"), newLines.join("\n"));
  expect([...diff.changed]).toEqual([2501]);
  expect(diff.map(4900)).toBe(4900);
  expect(performance.now() - start).toBeLessThan(1000);
});
