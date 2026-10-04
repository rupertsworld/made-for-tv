/** Build a self-contained browser module and copy the skill's authored files. */
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(repositoryRoot, "skills", "tv-markdown");

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "SKILL.md"), path.join(outputDirectory, "SKILL.md"));
        copyFileSync(
          path.join(repositoryRoot, "spec", "tv-markdown", "style.css"),
          path.join(outputDirectory, "tv-markdown.css"),
        );
      },
    },
  ],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: path.join(packageDirectory, "src", "tv-markdown.ts"),
      formats: ["es"],
      fileName: () => "tv-markdown.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
