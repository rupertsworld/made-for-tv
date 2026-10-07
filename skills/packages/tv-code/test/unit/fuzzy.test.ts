/** Character matching and ranking contracts for the file finder. */
import { describe, expect, it } from "vitest";
import { fuzzyMatch, fuzzyScore } from "../../src/fuzzy";

describe("fuzzyMatch", () => {
  it("requires every non-space query character in order, without regard to case", () => {
    expect(fuzzyMatch(" T V M D ", "skills/tv-markdown/tv-markdown.js")?.positions).toHaveLength(4);
    expect(fuzzyMatch("abc", "a/b-c")?.positions).toEqual([0, 2, 4]);
    expect(fuzzyMatch("acb", "a/b-c")).toBeNull();
    expect(fuzzyMatch("missing", "src/index.ts")).toBeNull();
  });

  it("treats an empty or whitespace-only query as a zero-score match", () => {
    expect(fuzzyMatch("   ", "src/index.ts")).toEqual({ score: 0, positions: [] });
  });

  it("chooses positions in the file name over an earlier greedy folder match", () => {
    expect(fuzzyMatch("ab", "a/xb/ab.ts")?.positions).toEqual([5, 6]);
  });

  it("ranks file names, word starts, consecutive runs, exact case, then shorter paths", () => {
    const score = (path: string, query = "index") => fuzzyMatch(query, path)!.score;
    expect(score("src/index.ts")).toBeGreaterThan(score("src/lib/indexer/x.ts"));
    expect(score("src/index.ts")).toBeGreaterThan(score("src/ixndex.ts"));
    expect(score("src/my-index.ts", "index")).toBeGreaterThan(score("src/myindex.ts", "index"));
    expect(score("src/Index.ts", "Index")).toBeGreaterThan(score("src/index.ts", "Index"));
    expect(score("src/index.ts")).toBeGreaterThan(score("longer/folder/index.ts"));
  });

  it("prefers a complete file-name word to a longer word with the same prefix", () => {
    const vite = fuzzyMatch("vite", "packages/tv-code-viewer/vite.config.ts")!.score;
    const vitest = fuzzyMatch("vite", "vitest.config.ts")!.score;
    expect(vite).toBeGreaterThan(vitest);
    expect(fuzzyMatch("index", "src/index.ts")!.score)
      .toBeGreaterThan(fuzzyMatch("index", "src/indexer.ts")!.score);
  });

  it("matches a slash across path segments and treats spec in names and folders sensibly", () => {
    expect(fuzzyMatch("src/in", "src/lib/index.ts")?.positions).toEqual([0, 1, 2, 3, 8, 9]);
    expect(fuzzyMatch("spec", "spec/index.md")).not.toBeNull();
    expect(fuzzyMatch("spec", "src/foo.spec.ts")).not.toBeNull();
    expect(fuzzyMatch("spec", "src/foo.spec.ts")!.score)
      .toBeGreaterThan(fuzzyMatch("spec", "spec/index.md")!.score);
  });

  it("scores short and long prefiltered candidates exactly as the position matcher does", () => {
    const paths = ["a/xb/ab.ts", "ab-a-b.ts", "src/foo.spec.ts", "src/index.ts",
      "src/component-199.ts", "skills/tv-markdown/tv-markdown.js", `src/${"a".repeat(48)}-1.ts`];
    for (const query of ["a", "aa", "aaa", "ab", "spec", "tvmd", "x/y", "INDEX"]) {
      for (const path of paths) {
        expect(fuzzyScore(query, path, path.toLowerCase()))
          .toBe(fuzzyMatch(query, path)?.score ?? null);
      }
    }
  });

  it("keeps the fast score and optimal-position score equal across short path patterns", () => {
    let paths = [""];
    for (let length = 1; length <= 4; length++) {
      paths = paths.flatMap(path => ["a", "b", "A", "-", "/"].map(character => path + character));
      for (const path of paths) {
        for (const query of ["a", "ab", "ba", "aa", "aB", "b/a"]) {
          expect(fuzzyScore(query, path, path.toLowerCase()), `query ${query}, path ${path}`)
            .toBe(fuzzyMatch(query, path)?.score ?? null);
        }
      }
    }
  });
});
