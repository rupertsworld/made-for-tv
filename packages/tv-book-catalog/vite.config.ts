/** Build a self-contained browser module and write the specified element CSS. */
import { copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import template from "../../spec/tv-book-catalog/templates/tv-book-catalog";
import { stylesheet } from "../../spec/types";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(repositoryRoot, "skills", "tv-book-catalog");

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "SKILL.md"), path.join(outputDirectory, "SKILL.md"));
        writeFileSync(path.join(outputDirectory, "tv-book-catalog.css"), stylesheet(template.style));
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
