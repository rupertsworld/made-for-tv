/** Build a self-contained browser module and copy the skill's authored files. */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import template from "../../spec/tv-code/templates/tv-code";
import { stylesheet } from "../../spec/types";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(repositoryRoot, "skills", "tv-code");

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "SKILL.md"), path.join(outputDirectory, "SKILL.md"));
        // The viewer renders Markdown with the bundled tv-markdown element, so its
        // stylesheet ships after the viewer stylesheet in one file.
        const markdownStyle = readFileSync(path.join(repositoryRoot, "spec", "tv-markdown", "style.css"), "utf8");
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
      entry: path.join(packageDirectory, "src", "tv-code.ts"),
      formats: ["es"],
      fileName: () => "tv-code.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
