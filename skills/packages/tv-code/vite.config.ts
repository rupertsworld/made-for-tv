/**
 * Build the skill: tv-code.js with its dependencies bundled, tv-code-diff.js,
 * the diff module that tv-code.js imports on first use, and the copied files.
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { skillNotices } from "../../scripts/skill-notices.mjs";
import template from "../../spec/tv-code/templates/tv-code";
import { stylesheet } from "../../spec/types";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(packageDirectory, "dist");
const entry = path.join(packageDirectory, "src", "tv-code.ts");
const diffModule = path.join(packageDirectory, "src", "tv-code-diff.ts");
// The module names @pierre/diffs imports that reach every Shiki grammar and
// theme; src/diff-highlighting.ts replaces them. See that file.
const replacedModules = new Set(["shiki", "shiki/wasm", "@pierre/theming/themes"]);

/** Every module the entry reaches, except through the diff module. */
let mainModules: Set<string> | undefined;

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "diff-highlighting",
      enforce: "pre",
      resolveId(source, importer) {
        if (replacedModules.has(source) && importer?.includes("/node_modules/@pierre/"))
          return path.join(packageDirectory, "src", "diff-highlighting.ts");
      },
    },
    skillNotices(),
    {
      name: "two-files",
      // A third file means a dynamic import has become a chunk of its own,
      // which a page copying the two files would not have.
      generateBundle(_options, bundle) {
        const chunks = Object.values(bundle).filter(output => output.type === "chunk").map(chunk => chunk.fileName).sort();
        if (chunks.join() !== "tv-code-diff.js,tv-code.js") throw new Error(`Expected tv-code.js and tv-code-diff.js, built ${chunks.join(", ")}`);
      },
    },
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "src", "index.md"), path.join(outputDirectory, "SKILL.md"));
        // The viewer renders Markdown with the bundled tv-markdown element, so its
        // stylesheet ships after the viewer stylesheet in one file.
        const markdownStyle = readFileSync(path.join(skillsRoot, "spec", "tv-markdown", "style.css"), "utf8");
        writeFileSync(
          path.join(outputDirectory, "tv-code.css"),
          [stylesheet(template.style), markdownStyle].join("\n"),
        );
      },
    },
  ],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "tv-code.js",
    },
    rollupOptions: {
      // tv-code-diff.js imports the code it shares with tv-code.js, such as
      // the highlighter, from tv-code.js, which therefore gains exports.
      preserveEntrySignatures: "allow-extension",
      output: {
        chunkFileNames: "[name].js",
        // Everything the entry reaches stays in tv-code.js, including the
        // grammars it imports dynamically so that each is compiled only when
        // needed. Only what the diff module alone reaches goes in its file.
        manualChunks(id, { getModuleInfo }) {
          mainModules ??= reachable(entry, id => getModuleInfo(id), diffModule);
          return mainModules.has(id) ? "tv-code" : undefined;
        },
      },
      onwarn(warning, warn) {
        // Rollup notes that some grammars are both imported dynamically and
        // embedded by other grammars. All of them are in tv-code.js anyway.
        if (warning.message.includes("dynamic import will not move module into another chunk")) return;
        warn(warning);
      },
    },
  },
});

/** The modules reachable from `start` through static and dynamic imports, not entering `excluded`. */
function reachable(start: string, info: (id: string) => { importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] } | null, excluded: string): Set<string> {
  const seen = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id) || id === excluded) continue;
    seen.add(id);
    const module = info(id);
    if (module) pending.push(...module.importedIds, ...module.dynamicallyImportedIds);
  }
  return seen;
}
