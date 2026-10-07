/** Core contracts: paths, page input, tree state, and connection loading. */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { baseName, formatLines, joinPath, normalizePath, parentPath, parseLineFragment, parseLines, resolvePath } from "../../src/paths";
import { decodeRead, dedent, fromChildTags, fromFiles, normalizeEntries } from "../../src/input";
import { TreeModel } from "../../src/tree-model";
import { Loader } from "../../src/loader";

describe("paths and input", () => {
  it("normalizes segments and parses and formats inclusive line ranges", () => {
    expect(normalizePath("//src///app.ts/" )).toBe("src/app.ts");
    expect(joinPath("src/", "/lib//x.ts")).toBe("src/lib/x.ts");
    expect(parentPath("src/lib/x.ts")).toBe("src/lib");
    expect(baseName("src/lib/x.ts")).toBe("x.ts");
    expect(resolvePath("src/lib", "../readme.md")).toBe("src/readme.md");
    expect(parseLines("12-20")).toEqual({ start: 12, end: 20 });
    expect(formatLines({ start: 12, end: 12 })).toBe("12");
    expect(parseLineFragment("#L12-L20")).toEqual({ start: 12, end: 20 });
    expect(parseLineFragment("#section")).toBeNull();
  });

  it("dedents only shared indentation and accepts both files forms and type synonyms", () => {
    expect(dedent("\n    one\n      two\n\n")).toBe("one\n  two");
    expect(fromFiles({ "//a//b.txt/": "ok" })).toEqual([{ path: "a/b.txt", type: "file", content: "ok" }]);
    expect(fromFiles([{ path: "dir", type: "directory" }, { path: "other", type: "dir" }]).map(e => e.type)).toEqual(["folder", "folder"]);
    expect(normalizeEntries([{ path: "/x/", type: "unknown", size: 3, ignored: true } as never])).toEqual([{ path: "x", type: "file", size: 3 }]);
  });

  it("reads nested child tags and raw script or text content", () => {
    const host = document.createElement("tv-code");
    host.innerHTML = '<tv-code-folder path="src" dimmed><tv-code-file path="app.ts" language="ts"><script type="text/plain">\n    const x = "<tag>";\n</script></tv-code-file><tv-code-file path="note.txt">\n  Hello\n</tv-code-file></tv-code-folder>';
    expect(fromChildTags(host)).toEqual([
      { path: "src", type: "folder", dimmed: true },
      { path: "src/app.ts", type: "file", language: "ts", content: 'const x = "<tag>";' },
      { path: "src/note.txt", type: "file", content: "Hello" },
    ]);
  });

  it("decodes strings, responses, blobs and buffers and detects binary and large input", async () => {
    expect(await decodeRead("a\u0000b", "text")).toMatchObject({ kind: "binary" });
    expect(await decodeRead(new Uint8Array([104, 105]), "text")).toEqual({ kind: "text", text: "hi" });
    expect(await decodeRead(new Blob(["hi"]), "bytes")).toMatchObject({ kind: "bytes" });
    expect(await decodeRead(new Response("ignored", { headers: { "Content-Length": "2097153" } }), "text")).toMatchObject({ kind: "large" });
    expect(await decodeRead(new Response(JSON.stringify({ error: "gone" }), { status: 404, headers: { "Content-Type": "application/json" } }), "text")).toEqual({ kind: "failure", message: "gone", status: 404 });
    expect(await decodeRead(new Response(JSON.stringify({ error: 1, message: "retry later" }), { status: 503, headers: { "Content-Type": "application/json" } }), "text")).toEqual({ kind: "failure", message: "retry later", status: 503 });
    expect(await decodeRead(new Response("no", { status: 500, statusText: "Server Error" }), "text")).toEqual({ kind: "failure", message: "500 Server Error", status: 500 });
  });
});

describe("tree model", () => {
  it("implies folders, orders folders before files with numeric and case-insensitive collation", () => {
    const model = new TreeModel();
    model.replace([{ path: "file10" }, { path: "src/z" }, { path: "file2" }, { path: "A" }, { path: "src/a" }]);
    expect(model.children("").map(n => n.path)).toEqual(["src", "A", "file2", "file10"]);
    expect(model.children("src").map(n => n.path)).toEqual(["src/a", "src/z"]);
  });

  it("applies direct listings by name or path and marks a whole subtree listed", () => {
    const model = new TreeModel();
    model.applyListing("", [{ name: "src", type: "dir" }]);
    expect(model.get("src")?.listing).toBe("unlisted");
    model.applyListing("src", [{ name: "one.ts" }, { path: "src/deep/two.ts" }]);
    expect(model.get("src/deep")?.listing).toBe("listed");
    expect(model.children("src").map(n => n.path)).toEqual(["src/deep", "src/one.ts"]);
  });

  it("dims matching names and descendants, with an entry override", () => {
    const model = new TreeModel();
    model.replace([{ path: "node_modules/a.ts" }, { path: "node_modules/b.ts", dimmed: false }, { path: "ok.ts", dimmed: true }]);
    expect(model.isDimmed("node_modules/a.ts")).toBe(true);
    expect(model.isDimmed("node_modules/b.ts")).toBe(false);
    expect(model.isDimmed("ok.ts")).toBe(true);
    model.setDimPatterns("");
    expect(model.isDimmed("node_modules/a.ts")).toBe(false);
  });

  it("drops listed descendants when a folder becomes a file", () => {
    const model = new TreeModel();
    model.applyListing("", [{ name: "src", type: "folder" }]);
    model.applyListing("src", [{ name: "old.ts" }]);
    model.applyListing("", [{ name: "src", type: "file" }]);
    expect(model.get("src")?.type).toBe("file");
    expect(model.get("src/old.ts")).toBeUndefined();
  });
});

describe("loader", () => {
  it("deduplicates concurrent listings and reads and discards stale connection results", async () => {
    let release!: (entries: { name: string }[]) => void;
    const model = new TreeModel();
    const list = vi.fn(() => new Promise<{ name: string }[]>(resolve => { release = resolve; }));
    const loader = new Loader(model, () => {});
    loader.setConnection({ list, read: () => "text" });
    const a = loader.list("");
    const b = loader.list("");
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
    loader.setConnection(null);
    release([{ name: "stale" }]);
    await Promise.all([a, b]);
    expect(model.get("stale")).toBeUndefined();
  });

  it("combines refresh calls and runs one more round after in-flight changes", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      let resolveSecond!: (value: { name: string }[]) => void;
      const list = vi.fn().mockResolvedValueOnce([{ name: "a" }]).mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; })).mockResolvedValue([{ name: "a" }]);
      const read = vi.fn().mockResolvedValue("body");
      const loader = new Loader(model, () => {});
      loader.setConnection({ list, read });
      await loader.list("");
      loader.setOpenFile("a");
      loader.refresh();
      loader.refresh("a");
      await vi.advanceTimersByTimeAsync(100);
      expect(list).toHaveBeenCalledTimes(2);
      loader.refresh();
      loader.refresh("a");
      resolveSecond([{ name: "a" }]);
      await vi.advanceTimersByTimeAsync(100);
      expect(list).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("combines calls made less than 100 ms apart into a single trailing round", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      const list = vi.fn(() => [{ name: "a.ts" }]);
      const loader = new Loader(model, () => {});
      loader.setConnection({ list, read: () => "a" });
      await loader.list("");
      list.mockClear();
      loader.refresh();
      await vi.advanceTimersByTimeAsync(60);
      loader.refresh();
      await vi.advanceTimersByTimeAsync(40);
      expect(list).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60);
      expect(list).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("does not read a known large entry and drops an old open-file read", async () => {
    const model = new TreeModel();
    const read = vi.fn();
    let finish!: (value: string) => void;
    read.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const loader = new Loader(model, () => {});
    loader.setConnection({ list: () => [], read });
    model.replace([{ path: "large.txt", size: 2 * 1024 * 1024 + 1 }, { path: "old.txt" }, { path: "new.txt" }]);
    expect(await loader.read("large.txt")).toMatchObject({ kind: "large" });
    expect(read).not.toHaveBeenCalled();
    loader.setOpenFile("old.txt");
    const pending = loader.read("old.txt");
    await Promise.resolve();
    loader.setOpenFile("new.txt");
    finish("late");
    expect(await pending).toBeNull();
  });

  it("shares one connection read while giving both callers a decodable Response", async () => {
    const model = new TreeModel();
    const read = vi.fn(() => new Response("shared"));
    const loader = new Loader(model, () => {});
    loader.setConnection({ list: () => [], read });
    model.replace([{ path: "shared.txt" }]);
    loader.setOpenFile("shared.txt");
    const [first, second] = await Promise.all([loader.read("shared.txt"), loader.read("shared.txt")]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ kind: "text", text: "shared" });
    expect(second).toEqual(first);
  });

  it("lists non-dimmed unlisted folders with no more than four concurrent calls", async () => {
    const model = new TreeModel();
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const list = vi.fn((path: string) => path ? new Promise<{ name: string }[]>(resolve => {
      active++;
      peak = Math.max(peak, active);
      releases.push(() => { active--; resolve([]); });
    }) : [...Array.from({ length: 7 }, (_, index) => ({ name: `dir${index}`, type: "folder" })), { name: "node_modules", type: "folder" }]);
    const loader = new Loader(model, () => {});
    loader.setConnection({ list, read: () => "" });
    await loader.list("");
    const pendingCounts: number[] = [];
    const discovery = loader.listAllUndimmed(count => pendingCounts.push(count));
    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBe(4);
    for (let index = 0; index < 7; index++) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()!();
    }
    await discovery;
    expect(peak).toBe(4);
    expect(list).toHaveBeenCalledTimes(8);
    expect(list.mock.calls.map(call => call[0])).not.toContain("node_modules");
    expect(pendingCounts.at(-1)).toBe(0);
  });

  it("skips a listed folder removed by its parent during refresh", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      let rootCount = 0;
      const list = vi.fn((path: string) => path ? [{ name: "a.ts" }] : rootCount++ ? [] : [{ name: "src", type: "folder" }]);
      const loader = new Loader(model, () => {});
      loader.setConnection({ list, read: () => "body" });
      await loader.list("");
      await loader.list("src");
      loader.refresh();
      await vi.advanceTimersByTimeAsync(100);
      expect(list.mock.calls.map(call => call[0])).toEqual(["", "src", ""]);
      expect(model.get("src")).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("refresh(path) fetches its listed parent and folder or open file only", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      const list = vi.fn((path: string) => path === "" ? [{ name: "src", type: "folder" }, { name: "other", type: "folder" }] : [{ name: "a.ts" }]);
      const read = vi.fn(() => "A");
      const loader = new Loader(model, () => {});
      loader.setConnection({ list, read });
      await loader.list("");
      await loader.list("src");
      await loader.list("other");
      expect([model.get("")?.listing, model.get("src")?.listing, model.get("other")?.listing]).toEqual(["listed", "listed", "listed"]);
      loader.setOpenFile("src/a.ts");
      list.mockClear();
      loader.refresh("src");
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      expect(list.mock.calls.map(call => call[0])).toEqual(["", "src"]);
      expect(read).not.toHaveBeenCalled();
      list.mockClear();
      loader.refresh("src/a.ts");
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      expect(list.mock.calls.map(call => call[0])).toEqual(["src"]);
      expect(read).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("ignores a listing when its folder was removed and recreated while it was pending", async () => {
    const model = new TreeModel();
    let finish!: (entries: { name: string }[]) => void;
    const loader = new Loader(model, () => {});
    loader.setConnection({ list: () => new Promise(resolve => { finish = resolve; }), read: () => "" });
    model.applyListing("", [{ name: "src", type: "folder" }]);
    const pending = loader.list("src");
    await Promise.resolve();
    model.applyListing("", []);
    model.applyListing("", [{ name: "src", type: "folder" }]);
    finish([{ name: "stale.ts" }]);
    await pending;
    expect(model.get("src/stale.ts")).toBeUndefined();
    expect(model.get("src")?.listing).toBe("unlisted");
  });

  it("stops an old refresh round when the connection changes", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      let finish!: (entries: { name: string }[]) => void;
      const oldList = vi.fn((path: string) => path ? [] : new Promise<{ name: string }[]>(resolve => { finish = resolve; }));
      const freshList = vi.fn((path: string) => path ? [{ name: "fresh.ts" }] : [{ name: "src", type: "folder" }]);
      const loader = new Loader(model, () => {});
      loader.setConnection({ list: oldList, read: () => "old" });
      model.applyListing("", [{ name: "src", type: "folder" }]);
      model.applyListing("src", [{ name: "old.ts" }]);
      loader.setOpenFile("fresh.ts");
      loader.refresh();
      await vi.advanceTimersByTimeAsync(100);
      loader.setConnection({ list: freshList, read: () => "fresh" });
      await loader.list("");
      finish([{ name: "stale.ts" }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(freshList).toHaveBeenCalledTimes(1);
      expect(model.get("src")?.type).toBe("folder");
      expect(model.get("stale.ts")).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("starts a fresh read when a file is reopened before its old read finishes", async () => {
    const model = new TreeModel();
    const finishes: Array<(value: string) => void> = [];
    const read = vi.fn(() => new Promise<string>(resolve => { finishes.push(resolve); }));
    const loader = new Loader(model, () => {});
    loader.setConnection({ list: () => [], read });
    model.replace([{ path: "a.ts" }, { path: "b.ts" }]);
    loader.setOpenFile("a.ts");
    const oldRead = loader.read("a.ts");
    await Promise.resolve();
    loader.setOpenFile("b.ts");
    loader.setOpenFile("a.ts");
    const newRead = loader.read("a.ts");
    expect(read).toHaveBeenCalledTimes(1);
    finishes[0]!("old");
    expect(await oldRead).toBeNull();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    finishes[1]!("new");
    expect(await newRead).toEqual({ kind: "text", text: "new" });
  });

  it("refresh fetches again after an initial listing and read still in flight", async () => {
    vi.useFakeTimers();
    try {
      const model = new TreeModel();
      const listingFinishes: Array<(value: { name: string }[]) => void> = [];
      const readFinishes: Array<(value: string) => void> = [];
      const list = vi.fn(() => new Promise<{ name: string }[]>(resolve => listingFinishes.push(resolve)));
      const read = vi.fn(() => new Promise<string>(resolve => readFinishes.push(resolve)));
      const loader = new Loader(model, () => {});
      loader.setConnection({ list, read });
      model.applyListing("", [{ name: "a.ts" }]);
      loader.setOpenFile("a.ts");
      const initialList = loader.list("", true);
      const initialRead = loader.read("a.ts");
      await Promise.resolve();
      loader.refresh();
      await vi.advanceTimersByTimeAsync(100);
      expect(list).toHaveBeenCalledTimes(1);
      listingFinishes[0]!([{ name: "a.ts" }]);
      await initialList;
      await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      listingFinishes[1]!([{ name: "a.ts" }]);
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      readFinishes[0]!("old");
      await initialRead;
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
      readFinishes[1]!("new");
      await vi.advanceTimersByTimeAsync(0);
      expect(list).toHaveBeenCalledTimes(2);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
