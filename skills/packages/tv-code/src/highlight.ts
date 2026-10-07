/** Shiki's TextMate grammars mapped to stable CSS syntax roles. The core and
 * grammars load only when code first needs highlighting, with no WASM engine. */
import { createHighlighterCore, type GrammarState, type LanguageRegistration } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { detectLanguage } from "./languages";

/** Presentation roles shared with the viewer stylesheet. */
export type SyntaxRole = "keyword" | "string" | "number" | "comment" | "function" | "type"
  | "property" | "parameter" | "tag" | "attribute" | "operator" | "punctuation"
  | "regexp" | "escape" | "heading" | "link" | "inserted" | "deleted";

const roles: SyntaxRole[] = ["keyword", "string", "number", "comment", "function", "type",
  "property", "parameter", "tag", "attribute", "operator", "punctuation", "regexp",
  "escape", "heading", "link", "inserted", "deleted"];
const colors = Object.fromEntries(roles.map((role, index) =>
  [role, `#${(index + 1).toString(16).padStart(6, "0")}`])) as Record<SyntaxRole, string>;
const colorRoles = new Map(Object.entries(colors).map(([role, color]) => [color.toLowerCase(), role as SyntaxRole]));

// Specific selectors override broad selectors in the TextMate theme engine.
// A sentinel foreground carries only a role; CSS owns its actual colour.
const scopes: Record<SyntaxRole, string[]> = {
  keyword: ["keyword.control", "keyword.other", "storage.type", "storage.modifier", "keyword"],
  string: ["string", "meta.embedded string", "support.constant.color"],
  number: ["constant.numeric", "constant.language"],
  comment: ["comment"],
  function: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "variable.function"],
  type: ["entity.name.type", "entity.name.class", "support.type", "storage.type.class",
    "entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css"],
  property: ["support.type.property-name", "variable.other.property", "variable.other.object.property", "meta.object-literal.key", "entity.other.attribute-name.css", "entity.name.tag.yaml"],
  parameter: ["variable.parameter", "meta.function.parameters variable.other"],
  tag: ["entity.name.tag", "support.class.component"],
  attribute: ["entity.other.attribute-name", "meta.tag attribute"],
  operator: ["keyword.operator", "storage.type.function.arrow"],
  punctuation: ["punctuation.separator", "punctuation.terminator", "punctuation.section",
    "punctuation.definition.parameters", "punctuation.definition.block",
    "punctuation.definition.array", "punctuation.definition.tag", "meta.brace"],
  regexp: ["string.regexp", "constant.regexp"],
  escape: ["constant.character.escape", "constant.character.entity"],
  heading: ["markup.heading", "entity.name.section.markdown"],
  link: ["markup.underline.link", "string.other.link", "meta.link.inline", "markup.link"],
  inserted: ["markup.inserted", "meta.diff.header.from-file"],
  deleted: ["markup.deleted", "meta.diff.header.to-file"],
};
const theme = {
  name: "television-code-roles",
  type: "light" as const,
  colors: { "editor.foreground": "#000000", "editor.background": "#ffffff" },
  settings: [
    { settings: { foreground: "#000000", background: "#ffffff" } },
    ...roles.map(role => ({ scope: scopes[role], settings: { foreground: colors[role] } })),
  ],
};

// Each grammar is imported individually and registered only when requested.
// The final single-file build includes their code, but avoids compiling every
// TextMate grammar when a reader opens just one language.
const grammarLoaders: Record<string, () => Promise<{ default: LanguageRegistration[] }>> = {
  javascript: () => import("@shikijs/langs/javascript"), typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"), tsx: () => import("@shikijs/langs/tsx"),
  json: () => import("@shikijs/langs/json"), jsonc: () => import("@shikijs/langs/jsonc"),
  html: () => import("@shikijs/langs/html"), css: () => import("@shikijs/langs/css"),
  scss: () => import("@shikijs/langs/scss"), less: () => import("@shikijs/langs/less"),
  markdown: () => import("@shikijs/langs/markdown"), yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"), xml: () => import("@shikijs/langs/xml"),
  python: () => import("@shikijs/langs/python"), ruby: () => import("@shikijs/langs/ruby"),
  go: () => import("@shikijs/langs/go"), rust: () => import("@shikijs/langs/rust"),
  java: () => import("@shikijs/langs/java"), kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"), c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"), csharp: () => import("@shikijs/langs/csharp"),
  sql: () => import("@shikijs/langs/sql"), bash: () => import("@shikijs/langs/bash"),
  powershell: () => import("@shikijs/langs/powershell"), dockerfile: () => import("@shikijs/langs/dockerfile"),
  makefile: () => import("@shikijs/langs/makefile"), ini: () => import("@shikijs/langs/ini"),
  diff: () => import("@shikijs/langs/diff"), graphql: () => import("@shikijs/langs/graphql"),
  lua: () => import("@shikijs/langs/lua"), vue: () => import("@shikijs/langs/vue"),
  svelte: () => import("@shikijs/langs/svelte"),
};

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
const languageLoads = new Map<string, Promise<void>>();
const elementVersions = new WeakMap<HTMLElement, number>();
function highlighter(): ReturnType<typeof createHighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

async function loadLanguage(core: Awaited<ReturnType<typeof createHighlighterCore>>, id: string): Promise<void> {
  const loader = grammarLoaders[id];
  if (!loader) throw new Error(`Unknown syntax language: ${id}`);
  let loading = languageLoads.get(id);
  if (!loading) {
    loading = loader().then(async module => {
      await core.loadLanguage(module.default);
      // The JavaScript engine's first scan can treat a whole line as one
      // token while its regex scanners initialize. Prime it on whitespace.
      core.codeToTokensBase(" ", { lang: id, theme: theme.name });
    });
    languageLoads.set(id, loading);
    void loading.catch(() => languageLoads.delete(id));
  }
  await loading;
}

function embeddedLanguages(text: string, languageId: string): string[] {
  if (languageId === "html" || languageId === "vue" || languageId === "svelte")
    return ["javascript", "typescript", "css"];
  if (languageId !== "markdown") return [];
  const ids = new Set<string>();
  for (const match of text.matchAll(/^ {0,3}(?:`{3,}|~{3,})([\w+#-]+)/gm)) {
    const id = detectLanguage("", match[1])?.id;
    if (id) ids.add(id);
  }
  return [...ids];
}

function withAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Tokenize each source line in bounded portions, preserving TextMate state
 * across boundaries. The returned fragments contain only source characters. */
export async function highlightLines(text: string, languageId: string, signal?: AbortSignal): Promise<DocumentFragment[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const sourceLines = text.split("\n");
  const result: DocumentFragment[] = [];
  const core = await withAbort(highlighter(), signal);
  for (const id of [languageId, ...embeddedLanguages(text, languageId)])
    await withAbort(loadLanguage(core, id), signal);
  let grammarState: GrammarState | undefined;
  // Parsing a few dozen lines per task keeps the JavaScript regex engine from
  // monopolizing the main thread on large files. The first portion yields too:
  // otherwise it runs in the same task as the caller's synchronous rendering.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  for (let start = 0; start < sourceLines.length; start += 25) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const portion = sourceLines.slice(start, start + 25);
    const tokens = core.codeToTokensBase(portion.join("\n"), {
      lang: languageId,
      theme: theme.name,
      grammarState,
      tokenizeMaxLineLength: 4_000,
    });
    grammarState = core.getLastGrammarState(tokens);
    for (const [index, lineTokens] of tokens.entries()) {
      const fragment = document.createDocumentFragment();
      const originalLine = portion[index];
      const tokenText = lineTokens.map(token => token.content).join("");
      if (tokenText !== originalLine && tokenText !== originalLine.replace(/\r$/, "")) {
        // Grammars may stop early on a malformed or exceptionally long line.
        // The source is authoritative even when its roles cannot be recovered.
        fragment.append(document.createTextNode(originalLine));
        result.push(fragment);
        continue;
      }
      for (const token of lineTokens) {
        const role = token.color ? colorRoles.get(token.color.toLowerCase()) : undefined;
        if (role) {
          const span = document.createElement("span");
          span.className = `cv-t-${role}`;
          span.textContent = token.content;
          fragment.append(span);
        } else fragment.append(document.createTextNode(token.content));
      }
      if (originalLine.endsWith("\r") && !tokenText.endsWith("\r"))
        fragment.append(document.createTextNode("\r"));
      result.push(fragment);
    }
    if (start + 25 < sourceLines.length)
      await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  while (result.length < sourceLines.length) result.push(document.createDocumentFragment());
  return result;
}

/** Highlight the text of a Markdown <code> element in place. */
export async function highlightElement(code: HTMLElement, languageId: string, signal?: AbortSignal): Promise<void> {
  const source = code.textContent ?? "";
  const version = (elementVersions.get(code) ?? 0) + 1;
  elementVersions.set(code, version);
  const lines = await highlightLines(source, languageId, signal);
  if (signal?.aborted || elementVersions.get(code) !== version || code.textContent !== source) return;
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    if (index) fragment.append(document.createTextNode("\n"));
    fragment.append(line);
  });
  code.replaceChildren(fragment);
}
