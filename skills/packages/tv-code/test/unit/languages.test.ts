/** File kind and grammar detection across bundled languages and file names. */
import { describe, expect, test } from "vitest";
import { detectLanguage, fileKind } from "../../src/languages.js";

describe("file kinds", () => {
  test("recognises image and Markdown extensions case insensitively", () => {
    for (const extension of ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"])
      expect(fileKind(`x.${extension.toUpperCase()}`)).toBe("image");
    for (const extension of ["md", "markdown", "mdx"])
      expect(fileKind(`x.${extension.toUpperCase()}`)).toBe("markdown");
  });

  test("recognises common binary families and leaves unknown files as text", () => {
    for (const extension of ["woff2", "zip", "pdf", "mp3", "mp4", "exe", "dll", "docx", "sqlite", "wasm"])
      expect(fileKind(`file.${extension}`)).toBe("binary");
    expect(fileKind("notes.odd")).toBe("text");
  });
});

describe("language detection", () => {
  test("detects every bundled language by extension or conventional name", () => {
    const cases: Record<string, string> = {
      "a.js": "javascript", "a.ts": "typescript", "a.jsx": "jsx", "a.tsx": "tsx", "a.json": "json",
      "tsconfig.json": "jsonc", "a.html": "html", "a.css": "css", "a.scss": "scss", "a.less": "less",
      "a.md": "markdown", "a.yaml": "yaml", "a.toml": "toml", "a.xml": "xml", "a.svg": "xml",
      "a.py": "python", "a.rb": "ruby", "a.go": "go", "a.rs": "rust", "a.java": "java",
      "a.kt": "kotlin", "a.swift": "swift", "a.c": "c", "a.cpp": "cpp", "a.cs": "csharp",
      "a.sql": "sql", "a.sh": "bash", "a.ps1": "powershell", "Dockerfile": "dockerfile",
      "Makefile": "makefile", "a.ini": "ini", "a.diff": "diff", "a.graphql": "graphql",
      "a.lua": "lua", "a.vue": "vue", "a.svelte": "svelte",
    };
    for (const [path, id] of Object.entries(cases)) expect(detectLanguage(path)?.id, path).toBe(id);
  });

  test("handles special names, aliases and unknown overrides", () => {
    expect(detectLanguage("src/a.d.ts")?.id).toBe("typescript");
    expect(detectLanguage("src/a.MJS")?.id).toBe("javascript");
    expect(detectLanguage(".gitignore")?.id).toBe("bash");
    expect(detectLanguage(".env")?.id).toBe("bash");
    expect(detectLanguage(".zshrc")?.id).toBe("bash");
    expect(detectLanguage("a.txt", "TS")?.id).toBe("typescript");
    expect(detectLanguage("a.ts", "nonesuch")).toBeNull();
    expect(detectLanguage("a.unknown")).toBeNull();
  });
});
