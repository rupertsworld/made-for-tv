/**
 * Emit licence notices for every npm module in a Vite bundle. Shiki's npm
 * licence does not replace the upstream terms of its redistributed TextMate
 * grammars and themes, so those assets are traced from the same module graph
 * and matched with metadata installed from tm-grammars or tm-themes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const divider = "=".repeat(80);
const separator = "-".repeat(80);

// Upstream terms that tm-grammars does not record, read from each source
// repository. The GLSL grammar, embedded by the C++ grammar, states none.
const textmateBundleTerms = `Permission to copy, use, modify, sell and distribute this
software is granted. This software is provided "as is" without
express or implied warranty, and with no claim as to its
suitability for any purpose.
`;
const recordedTerms = new Map([
  ["toml", { license: "TextMate bundle licence", text: textmateBundleTerms }],
  ["yaml", { license: "TextMate bundle licence", text: textmateBundleTerms }],
  ["glsl", { license: "None stated by the source repository" }],
]);

/** Return a Vite plugin that emits THIRD-PARTY-NOTICES.txt when dependencies are bundled. */
export function skillNotices() {
  return {
    name: "skill-third-party-notices",
    async generateBundle(_options, bundle) {
      const modulePaths = new Set(Object.values(bundle)
        .filter(output => output.type === "chunk")
        .flatMap(output => Object.keys(output.modules)));
      if (typeof this.getModuleIds === "function") {
        for (const modulePath of this.getModuleIds()) modulePaths.add(modulePath);
      }
      const packages = collectPackages(modulePaths);
      if (packages.size === 0) return;

      const textmateSections = [];
      const grammars = await collectTextmateAssets(modulePaths, {
        packageName: "@shikijs/langs",
        metadataPackage: "tm-grammars",
        metadataExports: ["grammars", "injections"],
        label: "GRAMMARS",
      });
      if (grammars !== null) textmateSections.push(grammars);
      const themes = await collectTextmateAssets(modulePaths, {
        packageName: "@shikijs/themes",
        metadataPackage: "tm-themes",
        metadataExports: ["themes"],
        label: "THEMES",
      });
      if (themes !== null) textmateSections.push(themes);

      const header = "TV-SKILLS THIRD-PARTY NOTICES\n\n"
        + "This skill bundles third-party software under the following licence terms.\n\n";
      const packageSections = [...packages].sort(([left], [right]) => left.localeCompare(right))
        .map(([name, { license, texts }]) =>
          `${divider}\n${name}\nLicense: ${license}\n${separator}\n`
          + texts.map(({ name: fileName, text }) =>
            `${fileName}\n\n${text}${text.endsWith("\n") ? "" : "\n"}`,
          ).join("\n"),
        );
      const source = header + [...packageSections, ...textmateSections].join("\n") + "\n";
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source });
    },
  };
}

function collectPackages(modulePaths) {
  const packages = new Map();
  for (const modulePath of modulePaths) {
    const packageRoot = findPackageRoot(modulePath);
    if (packageRoot === null) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const licenseFiles = fs.readdirSync(packageRoot)
      .filter(name => /^(LICENSE|LICENCE|COPYING)([.-]|$)/i.test(name))
      .sort();
    if (!manifest.license || licenseFiles.length === 0)
      throw new Error(`Missing published licence details for ${manifest.name}`);
    const noticeFiles = fs.readdirSync(packageRoot)
      .filter(name => /^(NOTICE|COPYRIGHT)([.-]|$)/i.test(name))
      .sort();
    packages.set(`${manifest.name}@${manifest.version}`, {
      license: manifest.license,
      texts: [...licenseFiles, ...noticeFiles].map(name => ({
        name,
        text: fs.readFileSync(path.join(packageRoot, name), "utf8"),
      })),
    });
  }
  return packages;
}

async function collectTextmateAssets(modulePaths, options) {
  const marker = `/node_modules/${options.packageName}/dist/`;
  const assetModules = [...modulePaths]
    .map(cleanModulePath)
    .filter(modulePath => modulePath.split(path.sep).join("/").includes(marker));
  if (assetModules.length === 0) return null;

  const assets = new Map();
  for (const modulePath of assetModules) {
    const imported = await import(pathToFileURL(modulePath).href);
    const registrations = Array.isArray(imported.default) ? imported.default : [imported.default];
    for (const registration of registrations) {
      if (registration && typeof registration.name === "string")
        assets.set(registration.name, registration);
    }
  }

  let metadataModule;
  try {
    metadataModule = await import(options.metadataPackage);
  } catch (error) {
    throw new Error(
      `${options.metadataPackage} must be installed to publish ${options.packageName} notices`,
      { cause: error },
    );
  }
  const metadata = options.metadataExports.flatMap(name => metadataModule[name] ?? []);
  const metadataByName = new Map(metadata.map(item => [item.name, item]));
  const metadataRoot = findPackageRoot(import.meta.resolve(options.metadataPackage));
  if (metadataRoot === null)
    throw new Error(`Could not find installed metadata for ${options.metadataPackage}`);
  const upstreamNotices = parseUpstreamNotices(
    fs.readFileSync(path.join(metadataRoot, "NOTICE"), "utf8"),
  );

  const noticeGroups = new Map();
  const entries = [...assets].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, registration]) => {
      const details = metadataByName.get(name);
      const recorded = recordedTerms.get(name);
      const upstreamNotice = upstreamNotices.get(`${name}.json`) ?? (recorded?.text ? { text: recorded.text } : undefined);
      let noticeName = "Not available in installed metadata";
      if (upstreamNotice) {
        let group = noticeGroups.get(upstreamNotice.text);
        if (!group) {
          group = { number: noticeGroups.size + 1, names: [], text: upstreamNotice.text };
          noticeGroups.set(upstreamNotice.text, group);
        }
        group.names.push(name);
        noticeName = `Upstream notice ${group.number}`;
      }
      return `${separator}\n${name}\n`
        + `License: ${details?.license ?? recorded?.license ?? "Not stated in installed metadata"}\n`
        + `Copyright and licence text: ${noticeName}\n`
        + `Source: ${details?.source ?? "Not stated in installed metadata"}\n`
        + `Display name: ${details?.displayName ?? registration.displayName ?? name}\n`;
    });

  const notices = [...noticeGroups.values()].map(group =>
    `${separator}\nUpstream notice ${group.number}\n`
    + `Grammars or themes: ${group.names.sort().join(", ")}\n`
    + `${group.text.endsWith("\n") ? group.text : `${group.text}\n`}`,
  );
  return `${divider}\nBUNDLED TEXTMATE ${options.label} (${assets.size})\n`
    + "The package notice above covers Shiki's code. These entries record the separate "
    + "upstream terms supplied for the TextMate data embedded in that package.\n"
    + entries.join("")
    + (notices.length === 0 ? "" : `\nUPSTREAM COPYRIGHT AND LICENCE TEXTS\n${notices.join("")}`);
}

function parseUpstreamNotices(source) {
  const sections = source.split(/^={80,}\r?$/m).slice(1);
  const notices = new Map();
  for (const section of sections) {
    const text = section.replace(/^\r?\n/, "").trimEnd();
    const lines = text.split(/\r?\n/);
    if (!lines[0]?.startsWith("Files:")) continue;
    const files = lines[0].slice("Files:".length).split(",").map(name => name.trim());
    const notice = lines.slice(1).join("\n") + "\n";
    for (const file of files) notices.set(file, { text: notice });
  }
  return notices;
}

function findPackageRoot(modulePath) {
  const cleanPath = cleanModulePath(modulePath);
  if (!cleanPath.split(path.sep).join("/").includes("/node_modules/")) return null;
  let directory = path.dirname(cleanPath);
  while (directory !== path.dirname(directory)) {
    const manifestPath = path.join(directory, "package.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      // Some packages, including yaml/browser, use nested package.json files
      // only to set the module type. The package root above owns the identity
      // and licence files used in the published notice.
      if (manifest.name && manifest.version) return directory;
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Could not find package.json for ${modulePath}`);
}

function cleanModulePath(modulePath) {
  const withoutQuery = modulePath.split("?")[0].replace(/^\0/, "");
  return withoutQuery.startsWith("file:") ? fileURLToPath(withoutQuery) : withoutQuery;
}
