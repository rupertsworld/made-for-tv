/**
 * Carry the published license text for every npm package Vite bundles into a
 * skill. The notice is built from the actual module graph, so dependencies
 * added later cannot silently be omitted from the shipped artifact.
 */
import fs from "node:fs";
import path from "node:path";

/** Return a Vite plugin that emits THIRD-PARTY-NOTICES.txt. */
export function skillNotices() {
  return {
    name: "skill-third-party-notices",
    generateBundle(_options, bundle) {
      const packages = new Map();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const modulePath of Object.keys(output.modules)) {
          const packageRoot = findPackageRoot(modulePath);
          if (packageRoot === null) continue;

          const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
          const licenseFiles = fs.readdirSync(packageRoot)
            .filter((name) => /^(LICENSE|LICENCE|COPYING)([.-]|$)/i.test(name))
            .sort();
          if (!manifest.license || licenseFiles.length === 0) {
            throw new Error(`Missing published license details for ${manifest.name}`);
          }
          packages.set(`${manifest.name}@${manifest.version}`, {
            license: manifest.license,
            texts: licenseFiles.map((name) => ({
              name,
              text: fs.readFileSync(path.join(packageRoot, name), "utf8"),
            })),
          });
        }
      }

      if (packages.size === 0) {
        this.emitFile({
          type: "asset",
          fileName: "THIRD-PARTY-NOTICES.txt",
          source: "TV-SKILLS THIRD-PARTY NOTICES\n\nNo third-party code is bundled in this skill.\n",
        });
        return;
      }

      const header = "TV-SKILLS THIRD-PARTY NOTICES\n\n"
        + "This skill bundles third-party software under the following license terms.\n\n";
      const entries = [...packages].sort(([left], [right]) => left.localeCompare(right));
      const source = header + entries.map(([name, { license, texts }]) =>
        `${"=".repeat(80)}\n${name}\nLicense: ${license}\n${"-".repeat(80)}\n`
        + texts.map(({ name: fileName, text }) =>
          `${fileName}\n\n${text}${text.endsWith("\n") ? "" : "\n"}`,
        ).join("\n"),
      ).join("\n") + "\n";
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source });
    },
  };
}

function findPackageRoot(modulePath) {
  if (!modulePath.includes(`${path.sep}node_modules${path.sep}`)) return null;
  let directory = path.dirname(modulePath.split("?")[0]);
  while (directory !== path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, "package.json"))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error(`Could not find package.json for ${modulePath}`);
}
