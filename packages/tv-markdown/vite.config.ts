/** Build a self-contained browser module and copy the skill's authored files. */
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { skillNotices } from "../../scripts/skill-notices.mjs";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageDirectory, "../..");
const outputDirectory = path.join(repositoryRoot, "skills", "tv-markdown");

export default defineConfig({
  root: packageDirectory,
  plugins: [
    {
      name: "yaml-license-root",
      generateBundle(_options, bundle) {
        // YAML's browser folder has a package.json containing only its module
        // type. Point notice discovery at the package root, which owns LICENSE.
        for (const output of Object.values(bundle)) {
          if (output.type !== "chunk") continue;
          for (const [modulePath, details] of Object.entries(output.modules)) {
            if (!modulePath.includes("/node_modules/yaml/browser/")) continue;
            delete output.modules[modulePath];
            output.modules[modulePath.replace("/node_modules/yaml/browser/", "/node_modules/yaml/")] = details;
          }
        }
      },
    },
    skillNotices(),
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
