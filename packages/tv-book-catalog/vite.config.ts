/** Build a self-contained browser module and write the specified element CSS. */
import { copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Template } from "../../spec/types.ts";
import template from "../../spec/tv-book-catalog/templates/tv-book-catalog.ts";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(repositoryRoot, "skills", "tv-book-catalog");
const element: Template<Parameters<typeof template.render>[0]> = template;

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "SKILL.md"), path.join(outputDirectory, "SKILL.md"));
        writeFileSync(path.join(outputDirectory, "tv-book-catalog.css"),
          [...new Set(element.style)].join("\n"));
      },
    },
  ],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: path.join(packageDirectory, "src", "tv-book-catalog.ts"),
      formats: ["es"],
      fileName: () => "tv-book-catalog.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
