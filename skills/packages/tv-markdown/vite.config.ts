/** Build a self-contained browser module and copy the skill's authored files. */
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { skillNotices } from "../../scripts/skill-notices.mjs";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(packageDirectory, "dist");

export default defineConfig({
  root: packageDirectory,
  plugins: [
    skillNotices(),
    {
      name: "copy-skill-files",
      closeBundle() {
        copyFileSync(path.join(packageDirectory, "src", "index.md"), path.join(outputDirectory, "SKILL.md"));
        copyFileSync(
          path.join(skillsRoot, "spec", "tv-markdown", "style.css"),
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
