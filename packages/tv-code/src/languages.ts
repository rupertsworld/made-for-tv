/** File classification and the fixed vocabulary of bundled syntax grammars. */

/** How the pane presents a file before examining its bytes. */
export type FileKind = "image" | "markdown" | "binary" | "text";

const images = new Set("png jpg jpeg gif webp avif bmp ico svg".split(" "));
const markdown = new Set("md markdown mdx".split(" "));
const binary = new Set(`apng tiff tif heic heif jxl psd ai eps
  woff woff2 ttf otf eot fnt pfb pfa
  zip gz gzip tgz bz2 xz 7z rar tar zst br lz4 dmg iso img
  pdf epub mobi azw azw3
  mp3 m4a aac wav flac ogg oga opus aiff mid midi
  mp4 m4v mov avi mkv webm wmv flv mpg mpeg 3gp
  exe dll so dylib a o obj lib class jar pyc pyo bin elf app deb rpm apk ipa
  doc docx xls xlsx ppt pptx odt ods odp pages numbers key
  db sqlite sqlite3 mdb accdb parquet arrow feather
  wasm dat pak lockb`.split(/\s+/));

const languages = new Set(`javascript typescript jsx tsx json jsonc html css scss less
  markdown yaml toml xml python ruby go rust java kotlin swift c cpp csharp sql
  bash powershell dockerfile makefile ini diff graphql lua vue svelte`.split(/\s+/));

const extensions: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsm: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", jsx: "jsx", tsx: "tsx",
  json: "json", jsonc: "jsonc", html: "html", htm: "html", css: "css",
  scss: "scss", sass: "scss", less: "less", md: "markdown", markdown: "markdown",
  mdx: "markdown", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml",
  svg: "xml", py: "python", pyw: "python", rb: "ruby", rake: "ruby",
  go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp",
  hpp: "cpp", hxx: "cpp", cs: "csharp", sql: "sql", sh: "bash",
  bash: "bash", zsh: "bash", ps1: "powershell", psm1: "powershell",
  dockerfile: "dockerfile", mk: "makefile", make: "makefile", ini: "ini",
  cfg: "ini", conf: "ini", diff: "diff", patch: "diff", graphql: "graphql",
  gql: "graphql", lua: "lua", vue: "vue", svelte: "svelte",
};

const fullNames: Record<string, string> = {
  dockerfile: "dockerfile", makefile: "makefile", gnumakefile: "makefile",
  ".gitignore": "bash", ".gitattributes": "bash", ".dockerignore": "bash",
  ".env": "bash", ".env.example": "bash", ".bashrc": "bash", ".zshrc": "bash",
  ".bash_profile": "bash", ".profile": "bash", ".babelrc": "jsonc",
  ".eslintrc": "jsonc", ".prettierrc": "jsonc", "tsconfig.json": "jsonc",
  "jsconfig.json": "jsonc", "package.json": "json", "package-lock.json": "json",
};

const aliases: Record<string, string> = {
  js: "javascript", node: "javascript", ts: "typescript", mts: "typescript",
  cts: "typescript", json5: "jsonc", md: "markdown", yml: "yaml",
  py: "python", rb: "ruby", rs: "rust", kt: "kotlin", cc: "cpp",
  cxx: "cpp", "c++": "cpp", cs: "csharp", "c#": "csharp",
  sh: "bash", shell: "bash", zsh: "bash", fish: "bash", ps: "powershell",
  ps1: "powershell", docker: "dockerfile", make: "makefile", gql: "graphql",
  html5: "html", svg: "xml", text: "text", plaintext: "text", txt: "text",
};

/** Classify an extension without reading the file. */
export function fileKind(path: string): FileKind {
  const extension = path.split("/").pop()?.toLowerCase().split(".").pop() ?? "";
  if (images.has(extension)) return "image";
  if (markdown.has(extension)) return "markdown";
  if (binary.has(extension)) return "binary";
  return "text";
}

/** Find the bundled grammar for a path, or resolve an explicit language override. */
export function detectLanguage(path: string, override?: string): { id: string } | null {
  const basename = path.split("/").pop()?.toLowerCase() ?? "";
  const extension = basename.split(".").pop() ?? "";
  const requested = override === undefined
    ? fullNames[basename] ?? (basename.startsWith(".env.") ? "bash" : extensions[extension])
    : override.toLowerCase();
  const id = aliases[requested] ?? requested;
  return languages.has(id) ? { id } : null;
}
