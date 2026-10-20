/**
 * What @pierre/diffs imports as `shiki`, `shiki/wasm` and
 * `@pierre/theming/themes`, cut down to what tv-code bundles. The build
 * resolves those three module names to this file (see vite.config.ts).
 *
 * The real modules list every Shiki grammar and theme behind dynamic imports.
 * The tv-code build places dynamic imports in its own files rather than in
 * separate chunks, so it would carry all of them, about 13 MB, although a diff
 * needs one grammar and two themes. Here the grammars are the ones tv-code
 * already bundles for code files, so a language highlights the same way in
 * both views, and the themes are the GitHub light and dark themes the diff
 * uses. @pierre/diffs is pinned to an exact version because this file
 * matches the names it imports.
 */
import { createThemeCollection } from "@pierre/theming";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createBundledHighlighter, normalizeTheme, type ThemeRegistrationAny } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { grammarLoaders } from "./highlight";

export * from "shiki/core";
export { createJavaScriptRegexEngine };

// ---------------------------------------------------------------------------
// `shiki`
// ---------------------------------------------------------------------------

/** The grammars @pierre/diffs may load by language id: those tv-code bundles. */
export const bundledLanguages = grammarLoaders;

/** Shiki's `createHighlighter`, knowing only the bundled grammars and no themes by name. */
export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: {},
  engine: createJavaScriptRegexEngine,
});

/**
 * @pierre/diffs uses the WebAssembly regex engine only when asked to, and
 * tv-code never asks; the JavaScript engine needs no binary. This also
 * stands in for `shiki/wasm`, so the binary is not bundled.
 */
export function createOnigurumaEngine(): never {
  throw new Error("tv-code bundles no WebAssembly regex engine");
}

// ---------------------------------------------------------------------------
// `@pierre/theming/themes`
// ---------------------------------------------------------------------------

interface ThemeDescriptor {
  name: string;
  load: () => ThemeRegistrationAny | Promise<ThemeRegistrationAny>;
  colorScheme?: "light" | "dark";
  collection?: string;
  displayName?: string;
}

/** A theme descriptor whose loader returns the theme normalised, as the real `createTheme` does. */
export function createTheme({ load, ...descriptor }: ThemeDescriptor) {
  return { ...descriptor, load: async () => normalizeTheme(await load()) };
}

/** The Pierre themes, none of which tv-code uses. */
export const pierreThemes = createThemeCollection({ themes: [] });

/** The Shiki themes that @pierre/diffs can load by name: the two the diff uses. */
export const shikiThemes = createThemeCollection({
  themes: [
    createTheme({ name: "github-light", colorScheme: "light", collection: "shiki", load: () => githubLight }),
    createTheme({ name: "github-dark", colorScheme: "dark", collection: "shiki", load: () => githubDark }),
  ],
});
