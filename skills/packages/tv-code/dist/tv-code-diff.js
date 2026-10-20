var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a, _b;
import { g as grammarLoaders, c as createBundledHighlighter, n as normalizeTheme, a as createJavaScriptRegexEngine, R as toHtml, T as h, S as ShikiError, b as addClassToHast, d as applyColorReplacements, e as codeToHast, f as codeToHtml, h as codeToTokens, i as codeToTokensBase, j as codeToTokensWithThemes, k as createCssVariablesTheme, l as createHighlighterCore, m as createHighlighterCoreSync, o as createPositionConverter, p as createShikiInternal, q as createShikiInternalSync, r as createShikiPrimitive, s as createShikiPrimitiveAsync, t as createSingletonShorthands, u as flatTokenVariants, v as getLastGrammarState, w as getSingletonHighlighterCore, x as getTokenStyleObject, y as guessEmbeddedLanguages, z as hastToHtml, A as isNoneTheme, B as isPlainLang, C as isSpecialLang, D as isSpecialTheme, E as makeSingletonHighlighter, F as makeSingletonHighlighterCore, G as normalizeGetter, H as resolveColorReplacements, I as splitLines$1, J as splitToken, K as splitTokens, L as stringifyTokenStyle, M as toArray, N as tokenizeAnsiWithTheme, O as tokenizeWithTheme, P as tokensToHast, Q as transformerDecorations } from "./tv-code.js";
const DIFFS_TAG_NAME = "diffs-container";
(() => {
  try {
    return process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
})();
const GIT_DIFF_FILE_BREAK_REGEX = /(?=^diff --git)/gm;
const SPLIT_WITH_NEWLINES = new RegExp("(?<=\\n)");
const FILENAME_HEADER_REGEX = /^(---|\+\+\+)\s+([^\t\r\n]+)/;
const FILENAME_HEADER_REGEX_GIT = /^(---|\+\+\+)\s+[ab]\/([^\t\r\n]+)/;
const ALTERNATE_FILE_NAMES_GIT = /^diff --git (?:"a\/(.+?)"|a\/(.+?)) (?:"b\/(.+?)"|b\/(.+?))$/;
const INDEX_LINE_METADATA = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?$/i;
const HEADER_PREFIX_SLOT_ID = "header-prefix";
const HEADER_FILENAME_SUFFIX_SLOT_ID = "header-filename-suffix";
const HEADER_METADATA_SLOT_ID = "header-metadata";
const CUSTOM_HEADER_SLOT_ID = "header-custom";
const DEFAULT_THEMES = {
  dark: "pierre-dark",
  light: "pierre-light"
};
const THEME_CSS_ATTRIBUTE = "data-theme-css";
const UNSAFE_CSS_ATTRIBUTE = "data-unsafe-css";
const DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE = "data-diffs-scrollbar-measure";
const DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY = "--diffs-scrollbar-gutter-measured";
const DEFAULT_TOKENIZE_MAX_LENGTH = 1e5;
const DEFAULT_EXPANDED_REGION = Object.freeze({
  fromStart: 0,
  fromEnd: 0
});
const DEFAULT_RENDER_RANGE = {
  startingLine: 0,
  totalLines: Infinity,
  bufferBefore: 0,
  bufferAfter: 0
};
const EMPTY_RENDER_RANGE = {
  startingLine: 0,
  totalLines: 0,
  bufferBefore: 0,
  bufferAfter: 0
};
const ResolvedLanguages = /* @__PURE__ */ new Map();
const ResolvingLanguages = /* @__PURE__ */ new Map();
const RegisteredCustomLanguages = /* @__PURE__ */ new Map();
const AttachedLanguages = /* @__PURE__ */ new Set();
function areLanguagesAttached(languages) {
  for (const language of Array.isArray(languages) ? languages : [languages]) {
    if (language === "text" || language === "ansi") continue;
    if (!AttachedLanguages.has(language)) return false;
  }
  return true;
}
function attachResolvedLanguages(resolvedLanguages, highlighter2) {
  resolvedLanguages = Array.isArray(resolvedLanguages) ? resolvedLanguages : [resolvedLanguages];
  for (const resolvedLang of resolvedLanguages) {
    if (AttachedLanguages.has(resolvedLang.name)) continue;
    let lang = ResolvedLanguages.get(resolvedLang.name);
    if (lang == null) {
      lang = resolvedLang;
      ResolvedLanguages.set(resolvedLang.name, lang);
    }
    const grammar = lang.data.find((grammar2) => {
      var _a2;
      return grammar2.name === lang.name || ((_a2 = grammar2.aliases) == null ? void 0 : _a2.includes(lang.name)) === true;
    });
    if (grammar == null) throw new Error(`attachResolvedLanguages: No returned grammar declares "${lang.name}" as its name or an alias.`);
    highlighter2.loadLanguageSync(lang.data);
    try {
      highlighter2.getLanguage(lang.name);
    } catch {
      throw new Error(`attachResolvedLanguages: "${grammar.name}" is already loaded without alias "${lang.name}". Load the alias first or give the grammar a unique name.`);
    }
    AttachedLanguages.add(lang.name);
  }
}
function isWorkerContext() {
  return typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
}
function createThemeCollection(options) {
  const descriptors = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of getCollectionEntries(options.themes)) {
    const themes = isThemeCollectionSource(entry) ? entry.getThemes() : [entry];
    for (const descriptor of themes) {
      if (seen.has(descriptor.name)) throw new Error(`Theme collection already contains theme "${descriptor.name}"`);
      seen.add(descriptor.name);
      descriptors.push(descriptor);
    }
  }
  const allThemes = Object.freeze([...descriptors]);
  const lightThemes = Object.freeze(allThemes.filter((descriptor) => descriptor.colorScheme === "light"));
  const darkThemes = Object.freeze(allThemes.filter((descriptor) => descriptor.colorScheme === "dark"));
  const themesByName = new Map(allThemes.map((descriptor) => [descriptor.name, descriptor]));
  const allNames = Object.freeze(allThemes.map((descriptor) => descriptor.name));
  const lightNames = Object.freeze(lightThemes.map((descriptor) => descriptor.name));
  const darkNames = Object.freeze(darkThemes.map((descriptor) => descriptor.name));
  function filteredThemes(filterOptions) {
    if (filterOptions == null) return allThemes;
    const { colorScheme, collection } = filterOptions;
    if (collection == null) {
      if (colorScheme === "light") return lightThemes;
      if (colorScheme === "dark") return darkThemes;
      return allThemes;
    }
    return allThemes.filter((descriptor) => {
      if (descriptor.collection !== collection) return false;
      return colorScheme == null || descriptor.colorScheme === colorScheme;
    });
  }
  return {
    getTheme(name) {
      return themesByName.get(name);
    },
    getThemes(themeOptions) {
      return filteredThemes(themeOptions);
    },
    getThemeNames(namesOptions) {
      if ((namesOptions == null ? void 0 : namesOptions.collection) == null) {
        if ((namesOptions == null ? void 0 : namesOptions.colorScheme) === "light") return lightNames;
        if ((namesOptions == null ? void 0 : namesOptions.colorScheme) === "dark") return darkNames;
        return allNames;
      }
      return filteredThemes(namesOptions).map((descriptor) => descriptor.name);
    },
    hasTheme(name) {
      return themesByName.has(name);
    },
    orderBy(compare) {
      return createThemeCollection({ themes: allThemes.map((descriptor, index) => ({
        descriptor,
        index
      })).sort((a, b) => {
        const result = compare(a.descriptor, b.descriptor);
        if (result !== 0) return result;
        return a.index - b.index;
      }).map((entry) => entry.descriptor) });
    },
    pick(names) {
      const picked = [];
      const pickedNames = /* @__PURE__ */ new Set();
      for (const name of names) {
        if (pickedNames.has(name)) throw new Error(`Theme collection pick already includes theme "${name}"`);
        pickedNames.add(name);
        const descriptor = themesByName.get(name);
        if (descriptor == null) throw new Error(`Theme collection does not contain theme "${name}"`);
        picked.push(descriptor);
      }
      return createThemeCollection({ themes: picked });
    },
    registerInto(resolver) {
      for (const descriptor of allThemes) resolver.registerThemeIfAbsent(descriptor.name, descriptor.load);
    }
  };
}
function getCollectionEntries(input) {
  if (isThemeCollectionEntry(input)) return [input];
  return input;
}
function isThemeCollectionEntry(input) {
  return isThemeCollectionSource(input) || isThemeDescriptor(input);
}
function isThemeDescriptor(input) {
  return typeof input.name === "string" && typeof input.load === "function";
}
function isThemeCollectionSource(entry) {
  return typeof entry.getThemes === "function";
}
function unwrapDefault(value) {
  return value !== null && typeof value === "object" && "default" in value ? value.default : value;
}
var DuplicateThemeError = class extends Error {
  constructor(name) {
    super(`Theme "${name}" is already registered`);
    this.name = "DuplicateThemeError";
  }
};
var UnregisteredThemeError = class extends Error {
  constructor(name) {
    super(`No loader registered for theme "${name}"`);
    this.name = "UnregisteredThemeError";
  }
};
var UnresolvedThemeError = class extends Error {
  constructor(name) {
    super(`Theme "${name}" has not been resolved`);
    this.name = "UnresolvedThemeError";
  }
};
function createThemeResolver() {
  const loaders = /* @__PURE__ */ new Map();
  const resolved = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  let cacheGeneration = 0;
  function registerTheme(name, loader) {
    if (loaders.has(name)) throw new DuplicateThemeError(name);
    loaders.set(name, loader);
  }
  function registerThemeIfAbsent(name, loader) {
    if (loaders.has(name)) return false;
    loaders.set(name, loader);
    return true;
  }
  function hasRegisteredTheme(name) {
    return loaders.has(name);
  }
  function resolveTheme2(name) {
    const cached = resolved.get(name);
    if (cached !== void 0) return Promise.resolve(cached);
    const existing = inflight.get(name);
    if (existing !== void 0) return existing;
    const loader = loaders.get(name);
    if (loader === void 0) return Promise.reject(new UnregisteredThemeError(name));
    const generation = cacheGeneration;
    const promise = loader().then((result) => {
      const theme = unwrapDefault(result);
      if (generation === cacheGeneration) resolved.set(name, theme);
      if (inflight.get(name) === promise) inflight.delete(name);
      return theme;
    }).catch((err) => {
      if (inflight.get(name) === promise) inflight.delete(name);
      throw err;
    });
    inflight.set(name, promise);
    return promise;
  }
  function resolveThemes(names) {
    return Promise.all(names.map((name) => resolveTheme2(name)));
  }
  function seedResolvedTheme(name, theme) {
    resolved.set(name, theme);
  }
  function seedResolvedThemes(entries) {
    for (const [name, theme] of entries) seedResolvedTheme(name, theme);
  }
  function getResolvedTheme(name) {
    return resolved.get(name);
  }
  function getResolvedThemes(names) {
    const themes = [];
    for (const name of names) {
      const theme = resolved.get(name);
      if (theme === void 0) throw new UnresolvedThemeError(name);
      themes.push(theme);
    }
    return themes;
  }
  function hasResolvedTheme(name) {
    return resolved.has(name);
  }
  function hasResolvedThemes(names) {
    for (const name of names) if (!resolved.has(name)) return false;
    return true;
  }
  function getResolvedOrResolveTheme2(name) {
    const cached = resolved.get(name);
    if (cached !== void 0) return cached;
    return resolveTheme2(name);
  }
  function clearResolvedThemes() {
    cacheGeneration++;
    resolved.clear();
    inflight.clear();
  }
  return {
    clearResolvedThemes,
    getResolvedOrResolveTheme: getResolvedOrResolveTheme2,
    getResolvedTheme,
    getResolvedThemes,
    hasRegisteredTheme,
    hasResolvedTheme,
    hasResolvedThemes,
    registerTheme,
    registerThemeIfAbsent,
    resolveTheme: resolveTheme2,
    resolveThemes,
    seedResolvedTheme,
    seedResolvedThemes
  };
}
const githubDark = Object.freeze(JSON.parse('{"colors":{"activityBar.activeBorder":"#f9826c","activityBar.background":"#24292e","activityBar.border":"#1b1f23","activityBar.foreground":"#e1e4e8","activityBar.inactiveForeground":"#6a737d","activityBarBadge.background":"#0366d6","activityBarBadge.foreground":"#fff","badge.background":"#044289","badge.foreground":"#c8e1ff","breadcrumb.activeSelectionForeground":"#d1d5da","breadcrumb.focusForeground":"#e1e4e8","breadcrumb.foreground":"#959da5","breadcrumbPicker.background":"#2b3036","button.background":"#176f2c","button.foreground":"#dcffe4","button.hoverBackground":"#22863a","button.secondaryBackground":"#444d56","button.secondaryForeground":"#fff","button.secondaryHoverBackground":"#586069","checkbox.background":"#444d56","checkbox.border":"#1b1f23","debugToolBar.background":"#2b3036","descriptionForeground":"#959da5","diffEditor.insertedTextBackground":"#28a74530","diffEditor.removedTextBackground":"#d73a4930","dropdown.background":"#2f363d","dropdown.border":"#1b1f23","dropdown.foreground":"#e1e4e8","dropdown.listBackground":"#24292e","editor.background":"#24292e","editor.findMatchBackground":"#ffd33d44","editor.findMatchHighlightBackground":"#ffd33d22","editor.focusedStackFrameHighlightBackground":"#2b6a3033","editor.foldBackground":"#58606915","editor.foreground":"#e1e4e8","editor.inactiveSelectionBackground":"#3392FF22","editor.lineHighlightBackground":"#2b3036","editor.linkedEditingBackground":"#3392FF22","editor.selectionBackground":"#3392FF44","editor.selectionHighlightBackground":"#17E5E633","editor.selectionHighlightBorder":"#17E5E600","editor.stackFrameHighlightBackground":"#C6902625","editor.wordHighlightBackground":"#17E5E600","editor.wordHighlightBorder":"#17E5E699","editor.wordHighlightStrongBackground":"#17E5E600","editor.wordHighlightStrongBorder":"#17E5E666","editorBracketHighlight.foreground1":"#79b8ff","editorBracketHighlight.foreground2":"#ffab70","editorBracketHighlight.foreground3":"#b392f0","editorBracketHighlight.foreground4":"#79b8ff","editorBracketHighlight.foreground5":"#ffab70","editorBracketHighlight.foreground6":"#b392f0","editorBracketMatch.background":"#17E5E650","editorBracketMatch.border":"#17E5E600","editorCursor.foreground":"#c8e1ff","editorError.foreground":"#f97583","editorGroup.border":"#1b1f23","editorGroupHeader.tabsBackground":"#1f2428","editorGroupHeader.tabsBorder":"#1b1f23","editorGutter.addedBackground":"#28a745","editorGutter.deletedBackground":"#ea4a5a","editorGutter.modifiedBackground":"#2188ff","editorIndentGuide.activeBackground":"#444d56","editorIndentGuide.background":"#2f363d","editorLineNumber.activeForeground":"#e1e4e8","editorLineNumber.foreground":"#444d56","editorOverviewRuler.border":"#1b1f23","editorWarning.foreground":"#ffea7f","editorWhitespace.foreground":"#444d56","editorWidget.background":"#1f2428","errorForeground":"#f97583","focusBorder":"#005cc5","foreground":"#d1d5da","gitDecoration.addedResourceForeground":"#34d058","gitDecoration.conflictingResourceForeground":"#ffab70","gitDecoration.deletedResourceForeground":"#ea4a5a","gitDecoration.ignoredResourceForeground":"#6a737d","gitDecoration.modifiedResourceForeground":"#79b8ff","gitDecoration.submoduleResourceForeground":"#6a737d","gitDecoration.untrackedResourceForeground":"#34d058","input.background":"#2f363d","input.border":"#1b1f23","input.foreground":"#e1e4e8","input.placeholderForeground":"#959da5","list.activeSelectionBackground":"#39414a","list.activeSelectionForeground":"#e1e4e8","list.focusBackground":"#044289","list.hoverBackground":"#282e34","list.hoverForeground":"#e1e4e8","list.inactiveFocusBackground":"#1d2d3e","list.inactiveSelectionBackground":"#282e34","list.inactiveSelectionForeground":"#e1e4e8","notificationCenterHeader.background":"#24292e","notificationCenterHeader.foreground":"#959da5","notifications.background":"#2f363d","notifications.border":"#1b1f23","notifications.foreground":"#e1e4e8","notificationsErrorIcon.foreground":"#ea4a5a","notificationsInfoIcon.foreground":"#79b8ff","notificationsWarningIcon.foreground":"#ffab70","panel.background":"#1f2428","panel.border":"#1b1f23","panelInput.border":"#2f363d","panelTitle.activeBorder":"#f9826c","panelTitle.activeForeground":"#e1e4e8","panelTitle.inactiveForeground":"#959da5","peekViewEditor.background":"#1f242888","peekViewEditor.matchHighlightBackground":"#ffd33d33","peekViewResult.background":"#1f2428","peekViewResult.matchHighlightBackground":"#ffd33d33","pickerGroup.border":"#444d56","pickerGroup.foreground":"#e1e4e8","progressBar.background":"#0366d6","quickInput.background":"#24292e","quickInput.foreground":"#e1e4e8","scrollbar.shadow":"#0008","scrollbarSlider.activeBackground":"#6a737d88","scrollbarSlider.background":"#6a737d33","scrollbarSlider.hoverBackground":"#6a737d44","settings.headerForeground":"#e1e4e8","settings.modifiedItemIndicator":"#0366d6","sideBar.background":"#1f2428","sideBar.border":"#1b1f23","sideBar.foreground":"#d1d5da","sideBarSectionHeader.background":"#1f2428","sideBarSectionHeader.border":"#1b1f23","sideBarSectionHeader.foreground":"#e1e4e8","sideBarTitle.foreground":"#e1e4e8","statusBar.background":"#24292e","statusBar.border":"#1b1f23","statusBar.debuggingBackground":"#931c06","statusBar.debuggingForeground":"#fff","statusBar.foreground":"#d1d5da","statusBar.noFolderBackground":"#24292e","statusBarItem.prominentBackground":"#282e34","statusBarItem.remoteBackground":"#24292e","statusBarItem.remoteForeground":"#d1d5da","tab.activeBackground":"#24292e","tab.activeBorder":"#24292e","tab.activeBorderTop":"#f9826c","tab.activeForeground":"#e1e4e8","tab.border":"#1b1f23","tab.hoverBackground":"#24292e","tab.inactiveBackground":"#1f2428","tab.inactiveForeground":"#959da5","tab.unfocusedActiveBorder":"#24292e","tab.unfocusedActiveBorderTop":"#1b1f23","tab.unfocusedHoverBackground":"#24292e","terminal.ansiBlack":"#586069","terminal.ansiBlue":"#2188ff","terminal.ansiBrightBlack":"#959da5","terminal.ansiBrightBlue":"#79b8ff","terminal.ansiBrightCyan":"#56d4dd","terminal.ansiBrightGreen":"#85e89d","terminal.ansiBrightMagenta":"#b392f0","terminal.ansiBrightRed":"#f97583","terminal.ansiBrightWhite":"#fafbfc","terminal.ansiBrightYellow":"#ffea7f","terminal.ansiCyan":"#39c5cf","terminal.ansiGreen":"#34d058","terminal.ansiMagenta":"#b392f0","terminal.ansiRed":"#ea4a5a","terminal.ansiWhite":"#d1d5da","terminal.ansiYellow":"#ffea7f","terminal.foreground":"#d1d5da","terminal.tab.activeBorder":"#f9826c","terminalCursor.background":"#586069","terminalCursor.foreground":"#79b8ff","textBlockQuote.background":"#24292e","textBlockQuote.border":"#444d56","textCodeBlock.background":"#2f363d","textLink.activeForeground":"#c8e1ff","textLink.foreground":"#79b8ff","textPreformat.foreground":"#d1d5da","textSeparator.foreground":"#586069","titleBar.activeBackground":"#24292e","titleBar.activeForeground":"#e1e4e8","titleBar.border":"#1b1f23","titleBar.inactiveBackground":"#1f2428","titleBar.inactiveForeground":"#959da5","tree.indentGuidesStroke":"#2f363d","welcomePage.buttonBackground":"#2f363d","welcomePage.buttonHoverBackground":"#444d56"},"displayName":"GitHub Dark","name":"github-dark","semanticHighlighting":true,"tokenColors":[{"scope":["comment","punctuation.definition.comment","string.comment"],"settings":{"foreground":"#6a737d"}},{"scope":["constant","entity.name.constant","variable.other.constant","variable.other.enummember","variable.language"],"settings":{"foreground":"#79b8ff"}},{"scope":["entity","entity.name"],"settings":{"foreground":"#b392f0"}},{"scope":"variable.parameter.function","settings":{"foreground":"#e1e4e8"}},{"scope":"entity.name.tag","settings":{"foreground":"#85e89d"}},{"scope":"keyword","settings":{"foreground":"#f97583"}},{"scope":["storage","storage.type"],"settings":{"foreground":"#f97583"}},{"scope":["storage.modifier.package","storage.modifier.import","storage.type.java"],"settings":{"foreground":"#e1e4e8"}},{"scope":["string","punctuation.definition.string","string punctuation.section.embedded source"],"settings":{"foreground":"#9ecbff"}},{"scope":"support","settings":{"foreground":"#79b8ff"}},{"scope":"meta.property-name","settings":{"foreground":"#79b8ff"}},{"scope":"variable","settings":{"foreground":"#ffab70"}},{"scope":"variable.other","settings":{"foreground":"#e1e4e8"}},{"scope":"invalid.broken","settings":{"fontStyle":"italic","foreground":"#fdaeb7"}},{"scope":"invalid.deprecated","settings":{"fontStyle":"italic","foreground":"#fdaeb7"}},{"scope":"invalid.illegal","settings":{"fontStyle":"italic","foreground":"#fdaeb7"}},{"scope":"invalid.unimplemented","settings":{"fontStyle":"italic","foreground":"#fdaeb7"}},{"scope":"carriage-return","settings":{"background":"#f97583","content":"^M","fontStyle":"italic underline","foreground":"#24292e"}},{"scope":"message.error","settings":{"foreground":"#fdaeb7"}},{"scope":"string variable","settings":{"foreground":"#79b8ff"}},{"scope":["source.regexp","string.regexp"],"settings":{"foreground":"#dbedff"}},{"scope":["string.regexp.character-class","string.regexp constant.character.escape","string.regexp source.ruby.embedded","string.regexp string.regexp.arbitrary-repitition"],"settings":{"foreground":"#dbedff"}},{"scope":"string.regexp constant.character.escape","settings":{"fontStyle":"bold","foreground":"#85e89d"}},{"scope":"support.constant","settings":{"foreground":"#79b8ff"}},{"scope":"support.variable","settings":{"foreground":"#79b8ff"}},{"scope":"meta.module-reference","settings":{"foreground":"#79b8ff"}},{"scope":"punctuation.definition.list.begin.markdown","settings":{"foreground":"#ffab70"}},{"scope":["markup.heading","markup.heading entity.name"],"settings":{"fontStyle":"bold","foreground":"#79b8ff"}},{"scope":"markup.quote","settings":{"foreground":"#85e89d"}},{"scope":"markup.italic","settings":{"fontStyle":"italic","foreground":"#e1e4e8"}},{"scope":"markup.bold","settings":{"fontStyle":"bold","foreground":"#e1e4e8"}},{"scope":["markup.underline"],"settings":{"fontStyle":"underline"}},{"scope":["markup.strikethrough"],"settings":{"fontStyle":"strikethrough"}},{"scope":"markup.inline.raw","settings":{"foreground":"#79b8ff"}},{"scope":["markup.deleted","meta.diff.header.from-file","punctuation.definition.deleted"],"settings":{"background":"#86181d","foreground":"#fdaeb7"}},{"scope":["markup.inserted","meta.diff.header.to-file","punctuation.definition.inserted"],"settings":{"background":"#144620","foreground":"#85e89d"}},{"scope":["markup.changed","punctuation.definition.changed"],"settings":{"background":"#c24e00","foreground":"#ffab70"}},{"scope":["markup.ignored","markup.untracked"],"settings":{"background":"#79b8ff","foreground":"#2f363d"}},{"scope":"meta.diff.range","settings":{"fontStyle":"bold","foreground":"#b392f0"}},{"scope":"meta.diff.header","settings":{"foreground":"#79b8ff"}},{"scope":"meta.separator","settings":{"fontStyle":"bold","foreground":"#79b8ff"}},{"scope":"meta.output","settings":{"foreground":"#79b8ff"}},{"scope":["brackethighlighter.tag","brackethighlighter.curly","brackethighlighter.round","brackethighlighter.square","brackethighlighter.angle","brackethighlighter.quote"],"settings":{"foreground":"#d1d5da"}},{"scope":"brackethighlighter.unmatched","settings":{"foreground":"#fdaeb7"}},{"scope":["constant.other.reference.link","string.other.link"],"settings":{"fontStyle":"underline","foreground":"#dbedff"}}],"type":"dark"}'));
const githubLight = Object.freeze(JSON.parse('{"colors":{"activityBar.activeBorder":"#f9826c","activityBar.background":"#fff","activityBar.border":"#e1e4e8","activityBar.foreground":"#2f363d","activityBar.inactiveForeground":"#959da5","activityBarBadge.background":"#2188ff","activityBarBadge.foreground":"#fff","badge.background":"#dbedff","badge.foreground":"#005cc5","breadcrumb.activeSelectionForeground":"#586069","breadcrumb.focusForeground":"#2f363d","breadcrumb.foreground":"#6a737d","breadcrumbPicker.background":"#fafbfc","button.background":"#159739","button.foreground":"#fff","button.hoverBackground":"#138934","button.secondaryBackground":"#e1e4e8","button.secondaryForeground":"#1b1f23","button.secondaryHoverBackground":"#d1d5da","checkbox.background":"#fafbfc","checkbox.border":"#d1d5da","debugToolBar.background":"#fff","descriptionForeground":"#6a737d","diffEditor.insertedTextBackground":"#34d05822","diffEditor.removedTextBackground":"#d73a4922","dropdown.background":"#fafbfc","dropdown.border":"#e1e4e8","dropdown.foreground":"#2f363d","dropdown.listBackground":"#fff","editor.background":"#fff","editor.findMatchBackground":"#ffdf5d","editor.findMatchHighlightBackground":"#ffdf5d66","editor.focusedStackFrameHighlightBackground":"#28a74525","editor.foldBackground":"#d1d5da11","editor.foreground":"#24292e","editor.inactiveSelectionBackground":"#0366d611","editor.lineHighlightBackground":"#f6f8fa","editor.linkedEditingBackground":"#0366d611","editor.selectionBackground":"#0366d625","editor.selectionHighlightBackground":"#34d05840","editor.selectionHighlightBorder":"#34d05800","editor.stackFrameHighlightBackground":"#ffd33d33","editor.wordHighlightBackground":"#34d05800","editor.wordHighlightBorder":"#24943e99","editor.wordHighlightStrongBackground":"#34d05800","editor.wordHighlightStrongBorder":"#24943e50","editorBracketHighlight.foreground1":"#005cc5","editorBracketHighlight.foreground2":"#e36209","editorBracketHighlight.foreground3":"#5a32a3","editorBracketHighlight.foreground4":"#005cc5","editorBracketHighlight.foreground5":"#e36209","editorBracketHighlight.foreground6":"#5a32a3","editorBracketMatch.background":"#34d05840","editorBracketMatch.border":"#34d05800","editorCursor.foreground":"#044289","editorError.foreground":"#cb2431","editorGroup.border":"#e1e4e8","editorGroupHeader.tabsBackground":"#f6f8fa","editorGroupHeader.tabsBorder":"#e1e4e8","editorGutter.addedBackground":"#28a745","editorGutter.deletedBackground":"#d73a49","editorGutter.modifiedBackground":"#2188ff","editorIndentGuide.activeBackground":"#d7dbe0","editorIndentGuide.background":"#eff2f6","editorLineNumber.activeForeground":"#24292e","editorLineNumber.foreground":"#1b1f234d","editorOverviewRuler.border":"#fff","editorWarning.foreground":"#f9c513","editorWhitespace.foreground":"#d1d5da","editorWidget.background":"#f6f8fa","errorForeground":"#cb2431","focusBorder":"#2188ff","foreground":"#444d56","gitDecoration.addedResourceForeground":"#28a745","gitDecoration.conflictingResourceForeground":"#e36209","gitDecoration.deletedResourceForeground":"#d73a49","gitDecoration.ignoredResourceForeground":"#959da5","gitDecoration.modifiedResourceForeground":"#005cc5","gitDecoration.submoduleResourceForeground":"#959da5","gitDecoration.untrackedResourceForeground":"#28a745","input.background":"#fafbfc","input.border":"#e1e4e8","input.foreground":"#2f363d","input.placeholderForeground":"#959da5","list.activeSelectionBackground":"#e2e5e9","list.activeSelectionForeground":"#2f363d","list.focusBackground":"#cce5ff","list.hoverBackground":"#ebf0f4","list.hoverForeground":"#2f363d","list.inactiveFocusBackground":"#dbedff","list.inactiveSelectionBackground":"#e8eaed","list.inactiveSelectionForeground":"#2f363d","notificationCenterHeader.background":"#e1e4e8","notificationCenterHeader.foreground":"#6a737d","notifications.background":"#fafbfc","notifications.border":"#e1e4e8","notifications.foreground":"#2f363d","notificationsErrorIcon.foreground":"#d73a49","notificationsInfoIcon.foreground":"#005cc5","notificationsWarningIcon.foreground":"#e36209","panel.background":"#f6f8fa","panel.border":"#e1e4e8","panelInput.border":"#e1e4e8","panelTitle.activeBorder":"#f9826c","panelTitle.activeForeground":"#2f363d","panelTitle.inactiveForeground":"#6a737d","pickerGroup.border":"#e1e4e8","pickerGroup.foreground":"#2f363d","progressBar.background":"#2188ff","quickInput.background":"#fafbfc","quickInput.foreground":"#2f363d","scrollbar.shadow":"#6a737d33","scrollbarSlider.activeBackground":"#959da588","scrollbarSlider.background":"#959da533","scrollbarSlider.hoverBackground":"#959da544","settings.headerForeground":"#2f363d","settings.modifiedItemIndicator":"#2188ff","sideBar.background":"#f6f8fa","sideBar.border":"#e1e4e8","sideBar.foreground":"#586069","sideBarSectionHeader.background":"#f6f8fa","sideBarSectionHeader.border":"#e1e4e8","sideBarSectionHeader.foreground":"#2f363d","sideBarTitle.foreground":"#2f363d","statusBar.background":"#fff","statusBar.border":"#e1e4e8","statusBar.debuggingBackground":"#f9826c","statusBar.debuggingForeground":"#fff","statusBar.foreground":"#586069","statusBar.noFolderBackground":"#fff","statusBarItem.prominentBackground":"#e8eaed","statusBarItem.remoteBackground":"#fff","statusBarItem.remoteForeground":"#586069","tab.activeBackground":"#fff","tab.activeBorder":"#fff","tab.activeBorderTop":"#f9826c","tab.activeForeground":"#2f363d","tab.border":"#e1e4e8","tab.hoverBackground":"#fff","tab.inactiveBackground":"#f6f8fa","tab.inactiveForeground":"#6a737d","tab.unfocusedActiveBorder":"#fff","tab.unfocusedActiveBorderTop":"#e1e4e8","tab.unfocusedHoverBackground":"#fff","terminal.ansiBlack":"#24292e","terminal.ansiBlue":"#0366d6","terminal.ansiBrightBlack":"#959da5","terminal.ansiBrightBlue":"#005cc5","terminal.ansiBrightCyan":"#3192aa","terminal.ansiBrightGreen":"#22863a","terminal.ansiBrightMagenta":"#5a32a3","terminal.ansiBrightRed":"#cb2431","terminal.ansiBrightWhite":"#d1d5da","terminal.ansiBrightYellow":"#b08800","terminal.ansiCyan":"#1b7c83","terminal.ansiGreen":"#28a745","terminal.ansiMagenta":"#5a32a3","terminal.ansiRed":"#d73a49","terminal.ansiWhite":"#6a737d","terminal.ansiYellow":"#dbab09","terminal.foreground":"#586069","terminal.tab.activeBorder":"#f9826c","terminalCursor.background":"#d1d5da","terminalCursor.foreground":"#005cc5","textBlockQuote.background":"#fafbfc","textBlockQuote.border":"#e1e4e8","textCodeBlock.background":"#f6f8fa","textLink.activeForeground":"#005cc5","textLink.foreground":"#0366d6","textPreformat.foreground":"#586069","textSeparator.foreground":"#d1d5da","titleBar.activeBackground":"#fff","titleBar.activeForeground":"#2f363d","titleBar.border":"#e1e4e8","titleBar.inactiveBackground":"#f6f8fa","titleBar.inactiveForeground":"#6a737d","tree.indentGuidesStroke":"#e1e4e8","welcomePage.buttonBackground":"#f6f8fa","welcomePage.buttonHoverBackground":"#e1e4e8"},"displayName":"GitHub Light","name":"github-light","semanticHighlighting":true,"tokenColors":[{"scope":["comment","punctuation.definition.comment","string.comment"],"settings":{"foreground":"#6a737d"}},{"scope":["constant","entity.name.constant","variable.other.constant","variable.other.enummember","variable.language"],"settings":{"foreground":"#005cc5"}},{"scope":["entity","entity.name"],"settings":{"foreground":"#6f42c1"}},{"scope":"variable.parameter.function","settings":{"foreground":"#24292e"}},{"scope":"entity.name.tag","settings":{"foreground":"#22863a"}},{"scope":"keyword","settings":{"foreground":"#d73a49"}},{"scope":["storage","storage.type"],"settings":{"foreground":"#d73a49"}},{"scope":["storage.modifier.package","storage.modifier.import","storage.type.java"],"settings":{"foreground":"#24292e"}},{"scope":["string","punctuation.definition.string","string punctuation.section.embedded source"],"settings":{"foreground":"#032f62"}},{"scope":"support","settings":{"foreground":"#005cc5"}},{"scope":"meta.property-name","settings":{"foreground":"#005cc5"}},{"scope":"variable","settings":{"foreground":"#e36209"}},{"scope":"variable.other","settings":{"foreground":"#24292e"}},{"scope":"invalid.broken","settings":{"fontStyle":"italic","foreground":"#b31d28"}},{"scope":"invalid.deprecated","settings":{"fontStyle":"italic","foreground":"#b31d28"}},{"scope":"invalid.illegal","settings":{"fontStyle":"italic","foreground":"#b31d28"}},{"scope":"invalid.unimplemented","settings":{"fontStyle":"italic","foreground":"#b31d28"}},{"scope":"carriage-return","settings":{"background":"#d73a49","content":"^M","fontStyle":"italic underline","foreground":"#fafbfc"}},{"scope":"message.error","settings":{"foreground":"#b31d28"}},{"scope":"string variable","settings":{"foreground":"#005cc5"}},{"scope":["source.regexp","string.regexp"],"settings":{"foreground":"#032f62"}},{"scope":["string.regexp.character-class","string.regexp constant.character.escape","string.regexp source.ruby.embedded","string.regexp string.regexp.arbitrary-repitition"],"settings":{"foreground":"#032f62"}},{"scope":"string.regexp constant.character.escape","settings":{"fontStyle":"bold","foreground":"#22863a"}},{"scope":"support.constant","settings":{"foreground":"#005cc5"}},{"scope":"support.variable","settings":{"foreground":"#005cc5"}},{"scope":"meta.module-reference","settings":{"foreground":"#005cc5"}},{"scope":"punctuation.definition.list.begin.markdown","settings":{"foreground":"#e36209"}},{"scope":["markup.heading","markup.heading entity.name"],"settings":{"fontStyle":"bold","foreground":"#005cc5"}},{"scope":"markup.quote","settings":{"foreground":"#22863a"}},{"scope":"markup.italic","settings":{"fontStyle":"italic","foreground":"#24292e"}},{"scope":"markup.bold","settings":{"fontStyle":"bold","foreground":"#24292e"}},{"scope":["markup.underline"],"settings":{"fontStyle":"underline"}},{"scope":["markup.strikethrough"],"settings":{"fontStyle":"strikethrough"}},{"scope":"markup.inline.raw","settings":{"foreground":"#005cc5"}},{"scope":["markup.deleted","meta.diff.header.from-file","punctuation.definition.deleted"],"settings":{"background":"#ffeef0","foreground":"#b31d28"}},{"scope":["markup.inserted","meta.diff.header.to-file","punctuation.definition.inserted"],"settings":{"background":"#f0fff4","foreground":"#22863a"}},{"scope":["markup.changed","punctuation.definition.changed"],"settings":{"background":"#ffebda","foreground":"#e36209"}},{"scope":["markup.ignored","markup.untracked"],"settings":{"background":"#005cc5","foreground":"#f6f8fa"}},{"scope":"meta.diff.range","settings":{"fontStyle":"bold","foreground":"#6f42c1"}},{"scope":"meta.diff.header","settings":{"foreground":"#005cc5"}},{"scope":"meta.separator","settings":{"fontStyle":"bold","foreground":"#005cc5"}},{"scope":"meta.output","settings":{"foreground":"#005cc5"}},{"scope":["brackethighlighter.tag","brackethighlighter.curly","brackethighlighter.round","brackethighlighter.square","brackethighlighter.angle","brackethighlighter.quote"],"settings":{"foreground":"#586069"}},{"scope":"brackethighlighter.unmatched","settings":{"foreground":"#b31d28"}},{"scope":["constant.other.reference.link","string.other.link"],"settings":{"fontStyle":"underline","foreground":"#032f62"}}],"type":"light"}'));
const bundledLanguages = grammarLoaders;
const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: {},
  engine: createJavaScriptRegexEngine
});
function createOnigurumaEngine() {
  throw new Error("tv-code bundles no WebAssembly regex engine");
}
function createTheme({ load, ...descriptor }) {
  return { ...descriptor, load: async () => normalizeTheme(await load()) };
}
const pierreThemes = createThemeCollection({ themes: [] });
const shikiThemes = createThemeCollection({
  themes: [
    createTheme({ name: "github-light", colorScheme: "light", collection: "shiki", load: () => githubLight }),
    createTheme({ name: "github-dark", colorScheme: "dark", collection: "shiki", load: () => githubDark })
  ]
});
const diffHighlighting = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ShikiError,
  addClassToHast,
  applyColorReplacements,
  bundledLanguages,
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createBundledHighlighter,
  createCssVariablesTheme,
  createHighlighter,
  createHighlighterCore,
  createHighlighterCoreSync,
  createJavaScriptRegexEngine,
  createOnigurumaEngine,
  createPositionConverter,
  createShikiInternal,
  createShikiInternalSync,
  createShikiPrimitive,
  createShikiPrimitiveAsync,
  createSingletonShorthands,
  createTheme,
  flatTokenVariants,
  getLastGrammarState,
  getSingletonHighlighterCore,
  getTokenStyleObject,
  guessEmbeddedLanguages,
  hastToHtml,
  isNoneTheme,
  isPlainLang,
  isSpecialLang,
  isSpecialTheme,
  makeSingletonHighlighter,
  makeSingletonHighlighterCore,
  normalizeGetter,
  normalizeTheme,
  pierreThemes,
  resolveColorReplacements,
  shikiThemes,
  splitLines: splitLines$1,
  splitToken,
  splitTokens,
  stringifyTokenStyle,
  toArray,
  tokenizeAnsiWithTheme,
  tokenizeWithTheme,
  tokensToHast,
  transformerDecorations
}, Symbol.toStringTag, { value: "Module" }));
async function resolveLanguage(lang) {
  if (isWorkerContext()) throw new Error(`resolveLanguage("${lang}") cannot be called from a worker context. Languages must be pre-resolved on the main thread and passed to the worker via the resolvedLanguages parameter.`);
  const resolver = ResolvingLanguages.get(lang);
  if (resolver != null) return resolver;
  try {
    let loader = RegisteredCustomLanguages.get(lang);
    if (loader == null && Object.prototype.hasOwnProperty.call(bundledLanguages, lang)) loader = bundledLanguages[lang];
    if (loader == null) throw new Error(`resolveLanguage: "${lang}" not found in bundled or custom languages`);
    const resolver2 = loader().then(({ default: data }) => {
      const resolvedLang = {
        name: lang,
        data
      };
      if (!ResolvedLanguages.has(lang)) ResolvedLanguages.set(lang, resolvedLang);
      return resolvedLang;
    });
    ResolvingLanguages.set(lang, resolver2);
    return await resolver2;
  } finally {
    ResolvingLanguages.delete(lang);
  }
}
function getResolvedOrResolveLanguage(language) {
  return ResolvedLanguages.get(language) ?? resolveLanguage(language);
}
function getThemes(theme = DEFAULT_THEMES) {
  const themesArr = [];
  if (typeof theme === "string") themesArr.push(theme);
  else {
    themesArr.push(theme.dark);
    themesArr.push(theme.light);
  }
  return themesArr;
}
const AttachedThemes = /* @__PURE__ */ new Set();
function areThemesAttached(themes) {
  for (const theme of getThemes(themes)) if (!AttachedThemes.has(theme)) return false;
  return true;
}
const themeResolver = createThemeResolver();
function attachResolvedThemes(themes, highlighter2) {
  themes = Array.isArray(themes) ? themes : [themes];
  for (let themeRef of themes) {
    let resolvedTheme;
    if (typeof themeRef === "string") {
      resolvedTheme = themeResolver.getResolvedTheme(themeRef);
      if (resolvedTheme == null) throw new Error(`loadResolvedThemes: ${themeRef} is not resolved, you must resolve it before calling loadResolvedThemes`);
    } else {
      resolvedTheme = themeRef;
      themeRef = themeRef.name;
      if (themeResolver.getResolvedTheme(themeRef) == null) themeResolver.seedResolvedTheme(themeRef, resolvedTheme);
    }
    if (AttachedThemes.has(themeRef)) continue;
    AttachedThemes.add(themeRef);
    highlighter2.loadThemeSync(resolvedTheme);
  }
}
function prepareThemeResolution(themeName) {
  if (isWorkerContext()) throw new Error(`Theme "${themeName}" cannot be resolved from a worker context. Themes must be pre-resolved on the main thread and passed to the worker via the resolvedLanguages parameter.`);
  if (themeResolver.hasRegisteredTheme(themeName)) return;
  const descriptor = shikiThemes.getTheme(themeName);
  if (descriptor != null) {
    themeResolver.registerThemeIfAbsent(descriptor.name, descriptor.load);
    return;
  }
  throw new Error(`No valid theme loader registered for "${themeName}"`);
}
function validateResolvedThemeName(themeName, theme) {
  if (theme.name !== themeName) throw new Error(`resolvedTheme: themeName: ${themeName} does not match theme.name: ${theme.name}`);
}
async function resolveTheme(themeName) {
  prepareThemeResolution(themeName);
  const theme = await themeResolver.resolveTheme(themeName);
  validateResolvedThemeName(themeName, theme);
  return theme;
}
function getResolvedOrResolveTheme(themeName) {
  return themeResolver.getResolvedTheme(themeName) ?? resolveTheme(themeName);
}
let highlighter;
async function getSharedHighlighter({ themes, langs, preferredHighlighter = "shiki-js" }) {
  highlighter ?? (highlighter = createHighlighter({
    themes: [],
    langs: ["text"],
    engine: preferredHighlighter === "shiki-wasm" ? createOnigurumaEngine(Promise.resolve().then(() => diffHighlighting)) : createJavaScriptRegexEngine()
  }));
  const instance = isHighlighterLoading(highlighter) ? await highlighter : highlighter;
  highlighter = instance;
  const languageLoaders = [];
  for (const language of Array.from(new Set(langs))) {
    if (language === "text" || language === "ansi") continue;
    const maybeResolvedLanguage = getResolvedOrResolveLanguage(language);
    if ("then" in maybeResolvedLanguage) languageLoaders.push(maybeResolvedLanguage);
    else attachResolvedLanguages(maybeResolvedLanguage, instance);
  }
  const themeLoaders = [];
  for (const themeName of themes) {
    const maybeResolvedTheme = getResolvedOrResolveTheme(themeName);
    if ("then" in maybeResolvedTheme) themeLoaders.push(maybeResolvedTheme);
    else attachResolvedThemes(maybeResolvedTheme, highlighter);
  }
  if (languageLoaders.length > 0 || themeLoaders.length > 0) await Promise.all([Promise.all(languageLoaders).then((languages) => {
    attachResolvedLanguages(languages, instance);
  }), Promise.all(themeLoaders).then((themes2) => {
    attachResolvedThemes(themes2, instance);
  })]);
  return instance;
}
function getHighlighterIfLoaded(withSettings) {
  if (highlighter == null || "then" in highlighter) return;
  if (withSettings != null && (!areThemesAttached(withSettings.theme) || !areLanguagesAttached(withSettings.lang))) return;
  return highlighter;
}
function isHighlighterLoading(h2 = highlighter) {
  return h2 != null && "then" in h2;
}
for (const descriptor of pierreThemes.getThemes()) themeResolver.registerThemeIfAbsent(descriptor.name, descriptor.load);
const callbacks = /* @__PURE__ */ new Set();
let frameId = null;
function queueRender(callback) {
  callbacks.add(callback);
  frameId ?? (frameId = requestAnimationFrame(render));
}
function dequeueRender(callback) {
  if (callbacks.delete(callback) && callbacks.size === 0 && frameId != null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}
function render(time) {
  const toIterate = new Set(callbacks);
  callbacks.clear();
  for (const callback of toIterate) try {
    callback(time);
  } catch (error) {
    console.error(error);
  }
  if (callbacks.size > 0) frameId = requestAnimationFrame(render);
  else frameId = null;
}
function areThemesEqual(themeA, themeB) {
  if (themeA == null || themeB == null || typeof themeA === "string" || typeof themeB === "string") return themeA === themeB;
  return themeA.dark === themeB.dark && themeA.light === themeB.light;
}
function areSelectionsEqual(selectionA, selectionB) {
  return (selectionA == null ? void 0 : selectionA.start) === (selectionB == null ? void 0 : selectionB.start) && (selectionA == null ? void 0 : selectionA.end) === (selectionB == null ? void 0 : selectionB.end) && (selectionA == null ? void 0 : selectionA.side) === (selectionB == null ? void 0 : selectionB.side) && (selectionA == null ? void 0 : selectionA.endSide) === (selectionB == null ? void 0 : selectionB.endSide);
}
function createTextNodeElement(value) {
  return {
    type: "text",
    value
  };
}
function createHastElement({ tagName, children = [], properties = {} }) {
  return {
    type: "element",
    tagName,
    properties,
    children
  };
}
function createIconElement({ name, width = 16, height = 16, properties }) {
  return createHastElement({
    tagName: "svg",
    properties: {
      width,
      height,
      viewBox: "0 0 16 16",
      ...properties
    },
    children: [createHastElement({
      tagName: "use",
      properties: { href: `#${name.replace(/^#/, "")}` }
    })]
  });
}
function findCodeElement(nodes) {
  let firstChild = nodes.children[0];
  while (firstChild != null) {
    if (firstChild.type === "element" && firstChild.tagName === "code") return firstChild;
    if ("children" in firstChild) firstChild = firstChild.children[0];
    else firstChild = null;
  }
}
function createGutterWrapper(children) {
  return createHastElement({
    tagName: "div",
    properties: { "data-gutter": "" },
    children
  });
}
function createGutterItem(lineType, lineNumber, lineIndex, properties = {}) {
  return createHastElement({
    tagName: "div",
    properties: {
      "data-line-type": lineType,
      "data-column-number": lineNumber,
      "data-line-index": lineIndex,
      ...properties
    },
    children: lineNumber != null ? [createHastElement({
      tagName: "span",
      properties: { "data-line-number-content": "" },
      children: [createTextNodeElement(`${lineNumber}`)]
    })] : void 0
  });
}
function createGutterGap(type, bufferType, size) {
  return createHastElement({
    tagName: "div",
    properties: {
      "data-gutter-buffer": bufferType,
      "data-buffer-size": size,
      "data-line-type": bufferType === "annotation" ? void 0 : type,
      style: bufferType === "annotation" ? `grid-row: span ${size};` : `grid-row: span ${size};min-height:calc(${size} * 1lh);`
    }
  });
}
function createGutterUtilityElement() {
  return createHastElement({
    tagName: "button",
    properties: {
      "data-utility-button": "",
      type: "button"
    },
    children: [createIconElement({
      name: "diffs-icon-plus",
      properties: { "data-icon": "" }
    })]
  });
}
function areSelectionPointsEqual(a, b) {
  return a.lineNumber === b.lineNumber && a.side === b.side;
}
function isGutterUtilityPath(path) {
  for (const element of path) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.hasAttribute("data-utility-button") || element.hasAttribute("data-gutter-utility-slot") || element.getAttribute("slot") === "gutter-utility-slot" || element.getAttribute("name") === "gutter-utility-slot") return true;
  }
  return false;
}
var InteractionManager = class {
  constructor(mode, options) {
    __publicField(this, "mode");
    __publicField(this, "options");
    __publicField(this, "hoveredLine");
    __publicField(this, "hoveredToken");
    __publicField(this, "pre");
    __publicField(this, "gutterUtilityLine");
    __publicField(this, "gutterUtilityContainer");
    __publicField(this, "gutterUtilityButton");
    __publicField(this, "gutterUtilitySlot");
    __publicField(this, "interactiveLinesAttr", false);
    __publicField(this, "interactiveLineNumbersAttr", false);
    __publicField(this, "hasPointerListeners", false);
    __publicField(this, "hasDocumentPointerListeners", false);
    __publicField(this, "selectedRange", null);
    __publicField(this, "selectedRangeHighlightSide");
    __publicField(this, "selectedRangeLineNumberOnly", false);
    __publicField(this, "editorActiveLine", null);
    __publicField(this, "editorActiveLineSide");
    __publicField(this, "editorLineNumberOnly", false);
    __publicField(this, "proposedSelectedRange");
    __publicField(this, "renderedSelectedLinesState");
    __publicField(this, "renderedEditorActiveLineState");
    __publicField(this, "selectionAnchor");
    __publicField(this, "pointerSession", { mode: "idle" });
    __publicField(this, "getHoveredLine", () => {
      const gutterUtilityLine = this.gutterUtilityLine ?? this.hoveredLine;
      if (gutterUtilityLine != null) {
        if (this.mode === "diff" && gutterUtilityLine.type === "diff-line") return {
          lineNumber: gutterUtilityLine.lineNumber,
          side: gutterUtilityLine.annotationSide
        };
        if (this.mode === "file" && gutterUtilityLine.type === "line") return { lineNumber: gutterUtilityLine.lineNumber };
      }
    });
    __publicField(this, "handlePointerClick", (event) => {
      const { onHunkExpand, onLineClick, onLineNumberClick, onTokenClick, onMergeConflictActionClick } = this.options;
      if (onHunkExpand == null && onLineClick == null && onLineNumberClick == null && onMergeConflictActionClick == null && onTokenClick == null) return;
      if (this.options.onGutterUtilityClick != null && isGutterUtilityPath(event.composedPath())) return;
      debugLogIfEnabled(this.options.__debugPointerEvents, "click", "FileDiff.DEBUG.handlePointerClick:", event);
      this.handlePointerEvent({
        eventType: "click",
        event
      });
    });
    __publicField(this, "handlePointerMove", (event) => {
      if (event.pointerType !== "mouse") return;
      const { lineHoverHighlight = "disabled", onLineEnter, onLineLeave, onTokenEnter, onTokenLeave, enableGutterUtility = false } = this.options;
      if (lineHoverHighlight === "disabled" && !enableGutterUtility && onLineEnter == null && onLineLeave == null && onTokenEnter == null && onTokenLeave == null) return;
      debugLogIfEnabled(this.options.__debugPointerEvents, "move", "FileDiff.DEBUG.handlePointerMove:", event);
      this.handlePointerEvent({
        eventType: "move",
        event
      });
    });
    __publicField(this, "handlePointerLeave", (event) => {
      var _a2, _b2, _c, _d;
      const { __debugPointerEvents } = this.options;
      debugLogIfEnabled(__debugPointerEvents, "move", "FileDiff.DEBUG.handlePointerLeave: no event");
      if (this.hoveredLine == null && this.hoveredToken == null) {
        debugLogIfEnabled(__debugPointerEvents, "move", "FileDiff.DEBUG.handlePointerLeave: returned early, no hovered line or token");
        return;
      }
      if (this.hoveredToken != null) {
        (_b2 = (_a2 = this.options).onTokenLeave) == null ? void 0 : _b2.call(_a2, this.hoveredToken, event);
        this.clearHoveredToken();
      }
      if (this.hoveredLine != null) {
        (_d = (_c = this.options).onLineLeave) == null ? void 0 : _d.call(_c, {
          ...this.hoveredLine,
          event
        });
        this.clearHoveredLine();
      }
      this.placeUtility();
    });
    __publicField(this, "handlePointerDown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0 || this.pre == null || this.pointerSession.mode !== "idle") return;
      const path = event.composedPath();
      if (isGutterUtilityPath(path) && this.options.onGutterUtilityClick != null) this.startGutterSelectionFromPointerDown(event);
      else {
        if (event.pointerType !== "mouse") this.revealUtilityFromGutterPath(path);
        this.startLineSelectionFromPointerDown(event);
      }
    });
    __publicField(this, "handleDocumentPointerMove", (event) => {
      switch (this.pointerSession.mode) {
        case "idle":
          return;
        case "gutterSelecting": {
          if (event.pointerId !== this.pointerSession.pointerId) return;
          event.preventDefault();
          const point = this.resolveSelectionPoint(event, { source: "coordinates-first" });
          if (point == null) return;
          this.pointerSession.current = point;
          this.updateSelection(point.lineNumber, point.side);
          return;
        }
        case "selecting": {
          if (event.pointerId !== this.pointerSession.pointerId) return;
          event.preventDefault();
          const pointerInfo = this.resolveSelectionInfo(event, {
            source: "coordinates-first",
            requireNumberColumn: false
          });
          if (pointerInfo == null || this.selectionAnchor == null) return;
          this.updateSelection(pointerInfo.lineNumber, pointerInfo.eventSide);
          return;
        }
        case "pendingSingleLineUnselect": {
          if (event.pointerId !== this.pointerSession.pointerId) return;
          event.preventDefault();
          const pointerInfo = this.resolveSelectionInfo(event, {
            source: "coordinates-first",
            requireNumberColumn: false
          });
          if (pointerInfo == null || this.selectionAnchor == null) return;
          const point = {
            lineNumber: pointerInfo.lineNumber,
            side: pointerInfo.eventSide
          };
          if (areSelectionPointsEqual(this.pointerSession.pending, point)) return;
          this.updateSelection(pointerInfo.lineNumber, pointerInfo.eventSide, false);
          this.notifySelectionStart(this.getCurrentSelectionRange());
          this.notifySelectionChangeDelta();
          this.pointerSession = {
            mode: "selecting",
            pointerId: event.pointerId
          };
          return;
        }
      }
    });
    __publicField(this, "handleDocumentPointerUp", (event) => {
      const { onGutterUtilityClick } = this.options;
      switch (this.pointerSession.mode) {
        case "idle":
          return;
        case "gutterSelecting": {
          const { pointerSession: session } = this;
          if (event.pointerId !== session.pointerId) return;
          event.preventDefault();
          const point = this.resolveSelectionPoint(event, { source: "coordinates-first" });
          if (point != null) {
            session.current = point;
            this.updateSelection(point.lineNumber, point.side);
          }
          const completedRange = this.buildSelectedLineRange(session.anchor, session.current);
          onGutterUtilityClick == null ? void 0 : onGutterUtilityClick({ ...completedRange });
          this.selectionAnchor = void 0;
          this.notifySelectionEnd(completedRange);
          this.notifySelectionCommitted(completedRange);
          this.clearProposedSelection();
          this.clearPointerSession();
          this.detachDocumentPointerListeners();
          return;
        }
        case "pendingSingleLineUnselect":
          if (event.pointerId !== this.pointerSession.pointerId) return;
          event.preventDefault();
          this.updateSelection(null, void 0, false);
          this.selectionAnchor = void 0;
          this.clearPendingSingleLineState();
          this.detachDocumentPointerListeners();
          this.notifySelectionEnd(this.getCurrentSelectionRange());
          this.notifySelectionCommitted(this.getCurrentSelectionRange());
          this.clearProposedSelection();
          return;
        case "selecting":
          if (event.pointerId !== this.pointerSession.pointerId) return;
          event.preventDefault();
          this.selectionAnchor = void 0;
          this.detachDocumentPointerListeners();
          this.clearPointerSession();
          this.notifySelectionEnd(this.getCurrentSelectionRange());
          this.notifySelectionCommitted(this.getCurrentSelectionRange());
          this.clearProposedSelection();
      }
    });
    __publicField(this, "handleDocumentPointerCancel", (event) => {
      switch (this.pointerSession.mode) {
        case "idle":
          return;
        case "gutterSelecting":
        case "selecting":
        case "pendingSingleLineUnselect":
          if ("pointerId" in this.pointerSession) {
            if (event.pointerId !== this.pointerSession.pointerId) return;
          }
          this.selectionAnchor = void 0;
          this.clearProposedSelection();
          this.clearPendingSingleLineState();
          this.clearPointerSession();
          this.detachDocumentPointerListeners();
      }
    });
    __publicField(this, "renderSelection", () => {
      dequeueRender(this.renderSelection);
      const renderState = this.getSelectionRenderState();
      if (this.pre == null) return;
      const { editorActiveLine, selectedLines } = renderState;
      const selectedLinesChanged = !areLineRenderStatesEqual(this.renderedSelectedLinesState, selectedLines);
      const editorActiveLineChanged = !areLineRenderStatesEqual(this.renderedEditorActiveLineState, editorActiveLine);
      if (!selectedLinesChanged && !editorActiveLineChanged) return;
      if (selectedLinesChanged) this.renderedSelectedLinesState = void 0;
      if (editorActiveLineChanged) this.renderedEditorActiveLineState = void 0;
      const split = this.pre.getAttribute("data-diff-type") === "split";
      const selectedRowRange = !selectedLinesChanged ? void 0 : this.resolveLineRenderRange(selectedLines, split, "selected-lines");
      const editorRowRange = !editorActiveLineChanged ? void 0 : this.resolveLineRenderRange(editorActiveLine, split, "editor-active-line");
      const columns = this.getLineRenderColumns(selectedLinesChanged ? selectedLines : void 0, selectedRowRange, editorActiveLineChanged ? editorActiveLine : void 0, editorRowRange);
      const selectedLinesComplete = selectedLines.range == null || columns.some((column) => column.renderSelectedLines);
      const editorActiveLineComplete = editorActiveLine.range == null || columns.some((column) => column.renderEditorActiveLine);
      if (selectedLinesChanged) for (const element of this.pre.querySelectorAll("[data-selected-line]")) element.removeAttribute("data-selected-line");
      if (editorActiveLineChanged) for (const element of this.pre.querySelectorAll("[data-editor-active-line]")) element.removeAttribute("data-editor-active-line");
      const selectedFirst = selectedRowRange == null ? void 0 : Math.min(selectedRowRange.start, selectedRowRange.end);
      const selectedLast = selectedRowRange == null ? void 0 : Math.max(selectedRowRange.start, selectedRowRange.end);
      const selectedIsSingle = selectedFirst === selectedLast;
      const editorLineIndex = editorRowRange == null ? void 0 : editorRowRange.start;
      for (const column of columns) {
        const { content, gutter, renderEditorActiveLine, renderSelectedLines } = column;
        const finalLineIndex = Math.max(renderSelectedLines ? selectedLast ?? -Infinity : -Infinity, renderEditorActiveLine ? editorLineIndex ?? -Infinity : -Infinity);
        const len = content.children.length;
        for (let i = 0; i < len; i++) {
          const contentElement = content.children[i];
          const gutterElement = gutter.children[i];
          if (!(contentElement instanceof HTMLElement) || !(gutterElement instanceof HTMLElement)) continue;
          const lineIndex = this.parseLineIndex(contentElement, split);
          if ((lineIndex ?? 0) > finalLineIndex) break;
          if (lineIndex == null) continue;
          if (renderSelectedLines && selectedFirst != null && selectedLast != null && lineIndex >= selectedFirst && lineIndex <= selectedLast) {
            let attributeValue = selectedIsSingle ? "single" : lineIndex === selectedFirst ? "first" : lineIndex === selectedLast ? "last" : "";
            gutterElement.setAttribute("data-selected-line", attributeValue);
            if (!selectedLines.lineNumberOnly) {
              contentElement.setAttribute("data-selected-line", attributeValue);
              if (gutterElement.nextSibling instanceof HTMLElement && contentElement.nextSibling instanceof HTMLElement && (contentElement.nextSibling.hasAttribute("data-line-annotation") || contentElement.nextSibling.hasAttribute("data-merge-conflict-actions"))) {
                if (selectedIsSingle) {
                  attributeValue = "last";
                  contentElement.setAttribute("data-selected-line", "first");
                } else if (lineIndex === selectedFirst) attributeValue = "";
                else if (lineIndex === selectedLast) contentElement.setAttribute("data-selected-line", "");
                contentElement.nextSibling.setAttribute("data-selected-line", attributeValue);
                gutterElement.nextSibling.setAttribute("data-selected-line", attributeValue);
              }
            }
          }
          if (renderEditorActiveLine && lineIndex === editorLineIndex) {
            gutterElement.setAttribute("data-editor-active-line", "");
            if (!editorActiveLine.lineNumberOnly) contentElement.setAttribute("data-editor-active-line", "");
          }
        }
      }
      if (selectedLinesChanged && selectedLinesComplete) this.renderedSelectedLinesState = selectedLines;
      if (editorActiveLineChanged && editorActiveLineComplete) this.renderedEditorActiveLineState = editorActiveLine;
    });
    this.mode = mode;
    this.options = options;
  }
  setOptions(options) {
    this.options = options;
  }
  cleanUp() {
    var _a2, _b2, _c, _d, _e, _f, _g;
    (_a2 = this.pre) == null ? void 0 : _a2.removeEventListener("click", this.handlePointerClick);
    (_b2 = this.pre) == null ? void 0 : _b2.removeEventListener("pointerdown", this.handlePointerDown);
    (_c = this.pre) == null ? void 0 : _c.removeEventListener("pointermove", this.handlePointerMove);
    (_d = this.pre) == null ? void 0 : _d.removeEventListener("pointerleave", this.handlePointerLeave);
    (_e = this.pre) == null ? void 0 : _e.removeAttribute("data-interactive-lines");
    (_f = this.pre) == null ? void 0 : _f.removeAttribute("data-interactive-line-numbers");
    this.pre = void 0;
    (_g = this.gutterUtilityContainer) == null ? void 0 : _g.remove();
    this.gutterUtilityLine = void 0;
    this.gutterUtilityContainer = void 0;
    this.gutterUtilityButton = void 0;
    this.gutterUtilitySlot = void 0;
    this.clearHoveredLine();
    this.clearHoveredToken();
    this.detachDocumentPointerListeners();
    this.clearPointerSession();
    dequeueRender(this.renderSelection);
    this.interactiveLinesAttr = false;
    this.interactiveLineNumbersAttr = false;
    this.hasPointerListeners = false;
    this.setSelectionDirty();
  }
  setup(pre) {
    this.setSelectionDirty();
    const { usesCustomGutterUtility = false, enableGutterUtility = false } = this.options;
    if (this.pre !== pre) {
      this.cleanUp();
      this.pre = pre;
    }
    if (enableGutterUtility) this.ensureGutterUtilityNode(usesCustomGutterUtility);
    else if (this.gutterUtilityContainer != null) {
      this.gutterUtilityContainer.remove();
      this.gutterUtilityLine = void 0;
      this.gutterUtilityContainer = void 0;
      this.gutterUtilityButton = void 0;
      this.gutterUtilitySlot = void 0;
      if (this.pointerSession.mode === "gutterSelecting") {
        this.clearPointerSession();
        this.detachDocumentPointerListeners();
      }
    }
    this.syncPointerListeners(pre);
    this.updateInteractiveLineAttributes();
    this.renderSelection();
    this.placeUtility();
  }
  setSelectionDirty() {
    this.renderedSelectedLinesState = void 0;
    this.renderedEditorActiveLineState = void 0;
  }
  isSelectionDirty() {
    return this.renderedSelectedLinesState === void 0 || this.renderedEditorActiveLineState === void 0;
  }
  setSelection(range, options) {
    const isRangeChange = !(range === this.selectedRange || areSelectionsEqual(range ?? void 0, this.selectedRange ?? void 0));
    const lineNumberOnly = (options == null ? void 0 : options.lineNumberOnly) ?? false;
    const isStyleChange = (options == null ? void 0 : options.activeLineSide) !== this.selectedRangeHighlightSide || lineNumberOnly !== this.selectedRangeLineNumberOnly;
    if (!this.isSelectionDirty() && !isRangeChange && !isStyleChange) return;
    this.proposedSelectedRange = void 0;
    this.selectedRange = range;
    this.selectedRangeHighlightSide = options == null ? void 0 : options.activeLineSide;
    this.selectedRangeLineNumberOnly = lineNumberOnly;
    this.renderSelection();
    this.placeUtility();
    if (isRangeChange && (options == null ? void 0 : options.notify) !== false) this.notifySelectionCommitted(range);
  }
  setEditorActiveLine(lineNumber, { lineNumberOnly = false, side } = {}) {
    const isLineChange = lineNumber !== this.editorActiveLine;
    const isStyleChange = side !== this.editorActiveLineSide || lineNumberOnly !== this.editorLineNumberOnly;
    if (!this.isSelectionDirty() && !isLineChange && !isStyleChange) return;
    this.editorActiveLine = lineNumber;
    this.editorActiveLineSide = side;
    this.editorLineNumberOnly = lineNumberOnly;
    this.renderSelection();
  }
  getSelection() {
    return this.selectedRange;
  }
  handlePointerEvent({ eventType, event }) {
    var _a2, _b2;
    const { __debugPointerEvents } = this.options;
    const composedPath = event.composedPath();
    debugLogIfEnabled(__debugPointerEvents, eventType, "FileDiff.DEBUG.handlePointerEvent:", {
      eventType,
      composedPath
    });
    const target = this.resolvePointerTarget(composedPath);
    debugLogIfEnabled(__debugPointerEvents, eventType, "FileDiff.DEBUG.handlePointerEvent: resolvePointerTarget result:", target);
    const { onLineClick, onLineNumberClick, onLineEnter, onLineLeave, onTokenClick, onTokenEnter, onTokenLeave, onHunkExpand, onMergeConflictActionClick } = this.options;
    switch (eventType) {
      case "move": {
        const sameLine = isHoverableLinePointerTarget(target) && ((_a2 = this.hoveredLine) == null ? void 0 : _a2.lineElement) === target.lineElement;
        if (!(isTokenPointerTarget(target) && ((_b2 = this.hoveredToken) == null ? void 0 : _b2.tokenElement) === target.tokenElement)) {
          if (this.hoveredToken != null) {
            onTokenLeave == null ? void 0 : onTokenLeave(this.hoveredToken, event);
            this.clearHoveredToken();
          }
          if (isTokenPointerTarget(target)) {
            this.setHoveredToken(this.toTokenEventBaseProps(target));
            onTokenEnter == null ? void 0 : onTokenEnter(this.hoveredToken, event);
          }
        }
        if (!sameLine) {
          if (this.hoveredLine != null) {
            onLineLeave == null ? void 0 : onLineLeave({
              ...this.hoveredLine,
              event
            });
            this.clearHoveredLine();
          }
          if (isHoverableLinePointerTarget(target)) {
            this.setHoveredLine(this.toEventBaseProps(target));
            this.placeUtility();
            onLineEnter == null ? void 0 : onLineEnter({
              ...this.hoveredLine,
              event
            });
          } else this.placeUtility();
        }
        break;
      }
      case "click": {
        if (target == null) break;
        if (isMergeConflictActionPointerTarget(target) && onMergeConflictActionClick != null) {
          onMergeConflictActionClick(target);
          break;
        }
        if (isExpandoPointerTarget(target) && onHunkExpand != null) {
          onHunkExpand(target.hunkIndex, target.all || event.shiftKey ? "both" : target.direction, target.all || event.shiftKey ? Number.POSITIVE_INFINITY : void 0);
          break;
        }
        if (!isHoverableLinePointerTarget(target)) break;
        if (isTokenPointerTarget(target) && onTokenClick != null) onTokenClick(this.toTokenEventBaseProps(target), event);
        const eventBase = this.toEventBaseProps(target);
        if (onLineNumberClick != null && target.numberColumn) onLineNumberClick({
          ...eventBase,
          event
        });
        else if (onLineClick != null) onLineClick({
          ...eventBase,
          event
        });
        break;
      }
    }
  }
  syncPointerListeners(pre) {
    const { __debugPointerEvents, lineHoverHighlight = "disabled", onLineClick, onLineNumberClick, onLineEnter, onLineLeave, onTokenClick, onTokenEnter, onTokenLeave, onHunkExpand, onMergeConflictActionClick, enableGutterUtility = false, enableLineSelection = false, onGutterUtilityClick } = this.options;
    const enableGutterSelection = onGutterUtilityClick != null;
    const shouldAttachPointerListeners = lineHoverHighlight !== "disabled" || onLineClick != null || onLineNumberClick != null || onLineEnter != null || onLineLeave != null || onTokenClick != null || onTokenEnter != null || onTokenLeave != null || onHunkExpand != null || onMergeConflictActionClick != null || enableGutterUtility || enableLineSelection || enableGutterSelection;
    if (shouldAttachPointerListeners && !this.hasPointerListeners) {
      pre.addEventListener("click", this.handlePointerClick);
      pre.addEventListener("pointerdown", this.handlePointerDown);
      pre.addEventListener("pointermove", this.handlePointerMove);
      pre.addEventListener("pointerleave", this.handlePointerLeave);
      this.hasPointerListeners = true;
      debugLogIfEnabled(__debugPointerEvents, "click", "FileDiff.DEBUG.attachEventListeners: Attaching click events for:", (() => {
        const reasons = [];
        if (__debugPointerEvents === "both" || __debugPointerEvents === "click") {
          if (onLineClick != null) reasons.push("onLineClick");
          if (onLineNumberClick != null) reasons.push("onLineNumberClick");
          if (onHunkExpand != null) reasons.push("expandable hunk separators");
          if (onMergeConflictActionClick != null) reasons.push("merge conflict actions");
        }
        return reasons;
      })());
      debugLogIfEnabled(__debugPointerEvents, "move", "FileDiff.DEBUG.attachEventListeners: Attaching pointer move event");
      debugLogIfEnabled(__debugPointerEvents, "move", "FileDiff.DEBUG.attachEventListeners: Attaching pointer leave event");
    } else if (!shouldAttachPointerListeners && this.hasPointerListeners) {
      pre.removeEventListener("click", this.handlePointerClick);
      pre.removeEventListener("pointerdown", this.handlePointerDown);
      pre.removeEventListener("pointermove", this.handlePointerMove);
      pre.removeEventListener("pointerleave", this.handlePointerLeave);
      this.hasPointerListeners = false;
    }
    const hasActiveLineSelectionSession = this.pointerSession.mode === "selecting" || this.pointerSession.mode === "pendingSingleLineUnselect";
    const hasActiveGutterSelectionSession = this.pointerSession.mode === "gutterSelecting";
    if (!enableLineSelection && hasActiveLineSelectionSession || !enableGutterSelection && hasActiveGutterSelectionSession) {
      this.clearPointerSession();
      this.detachDocumentPointerListeners();
      this.selectionAnchor = void 0;
      this.clearPendingSingleLineState();
    }
  }
  updateInteractiveLineAttributes() {
    if (this.pre == null) return;
    const { onLineClick, onLineNumberClick, enableLineSelection = false } = this.options;
    const shouldHaveInteractiveLines = onLineClick != null;
    const shouldHaveInteractiveLineNumbers = onLineNumberClick != null || enableLineSelection;
    if (shouldHaveInteractiveLines && !this.interactiveLinesAttr) {
      this.pre.setAttribute("data-interactive-lines", "");
      this.interactiveLinesAttr = true;
    } else if (!shouldHaveInteractiveLines && this.interactiveLinesAttr) {
      this.pre.removeAttribute("data-interactive-lines");
      this.interactiveLinesAttr = false;
    }
    if (shouldHaveInteractiveLineNumbers && !this.interactiveLineNumbersAttr) {
      this.pre.setAttribute("data-interactive-line-numbers", "");
      this.interactiveLineNumbersAttr = true;
    } else if (!shouldHaveInteractiveLineNumbers && this.interactiveLineNumbersAttr) {
      this.pre.removeAttribute("data-interactive-line-numbers");
      this.interactiveLineNumbersAttr = false;
    }
  }
  startLineSelectionFromPointerDown(event) {
    var _a2, _b2;
    const { enableLineSelection = false } = this.options;
    if (!enableLineSelection) return;
    const pointerInfo = this.resolveSelectionInfo(event, {
      source: "event-path",
      requireNumberColumn: true
    });
    if (pointerInfo == null) return;
    const { pre } = this;
    if (pre == null) return;
    const { lineNumber, eventSide, lineIndex } = pointerInfo;
    if (event.shiftKey && this.selectedRange != null) {
      const rowRange = this.getIndexesFromSelection(this.selectedRange, pre.getAttribute("data-diff-type") === "split");
      if (rowRange == null) return;
      const useStart = rowRange.start <= rowRange.end ? lineIndex >= rowRange.start : lineIndex <= rowRange.end;
      this.selectionAnchor = {
        lineNumber: useStart ? this.selectedRange.start : this.selectedRange.end,
        side: useStart ? this.selectedRange.side : this.selectedRange.endSide ?? this.selectedRange.side
      };
      this.updateSelection(lineNumber, eventSide, false);
      this.notifySelectionStart(this.getCurrentSelectionRange());
      this.pointerSession = {
        mode: "selecting",
        pointerId: event.pointerId
      };
      this.attachDocumentPointerListeners();
      return;
    }
    if (((_a2 = this.selectedRange) == null ? void 0 : _a2.start) === lineNumber && ((_b2 = this.selectedRange) == null ? void 0 : _b2.end) === lineNumber) {
      const point = {
        lineNumber,
        side: eventSide
      };
      this.selectionAnchor = point;
      this.pointerSession = {
        mode: "pendingSingleLineUnselect",
        pointerId: event.pointerId,
        anchor: point,
        pending: point
      };
      this.attachDocumentPointerListeners();
      return;
    }
    if (this.options.controlledSelection === true) this.proposedSelectedRange = null;
    else this.selectedRange = null;
    this.placeUtility();
    this.selectionAnchor = {
      lineNumber,
      side: eventSide
    };
    this.updateSelection(lineNumber, eventSide, false);
    this.notifySelectionStart(this.getCurrentSelectionRange());
    this.pointerSession = {
      mode: "selecting",
      pointerId: event.pointerId
    };
    this.attachDocumentPointerListeners();
  }
  startGutterSelectionFromPointerDown(event) {
    const { onGutterUtilityClick } = this.options;
    if (onGutterUtilityClick == null) return;
    const selectedEndpoints = this.currentSelectionEnds();
    const point = (selectedEndpoints == null ? void 0 : selectedEndpoints.bottom) ?? this.resolveSelectionPoint(event, {
      source: "event-path",
      excludeUtility: false
    });
    const anchor = (selectedEndpoints == null ? void 0 : selectedEndpoints.top) ?? point;
    if (point == null || anchor == null) return;
    event.preventDefault();
    event.stopPropagation();
    this.pointerSession = {
      mode: "gutterSelecting",
      pointerId: event.pointerId,
      anchor,
      current: point
    };
    this.selectionAnchor = {
      lineNumber: anchor.lineNumber,
      side: anchor.side
    };
    this.updateSelection(point.lineNumber, point.side, false);
    this.notifySelectionStart(this.getCurrentSelectionRange());
    this.attachDocumentPointerListeners();
  }
  clearHoveredLine() {
    if (this.hoveredLine == null) return;
    this.hoveredLine.lineElement.removeAttribute("data-hovered");
    this.hoveredLine.numberElement.removeAttribute("data-hovered");
    this.hoveredLine = void 0;
  }
  setHoveredLine(hoveredLine) {
    const { lineHoverHighlight = "disabled" } = this.options;
    if (this.hoveredLine != null) this.clearHoveredLine();
    this.hoveredLine = hoveredLine;
    if (lineHoverHighlight !== "disabled") {
      if (lineHoverHighlight === "both" || lineHoverHighlight === "line") this.hoveredLine.lineElement.setAttribute("data-hovered", "");
      if (lineHoverHighlight === "both" || lineHoverHighlight === "number") this.hoveredLine.numberElement.setAttribute("data-hovered", "");
    }
  }
  clearHoveredToken() {
    if (this.hoveredToken == null) return;
    this.hoveredToken = void 0;
  }
  setHoveredToken(hoveredToken) {
    if (this.hoveredToken != null) this.clearHoveredToken();
    this.hoveredToken = hoveredToken;
  }
  ensureGutterUtilityNode(useCustomGutterUtility) {
    var _a2;
    if (this.gutterUtilityContainer == null) {
      this.gutterUtilityContainer = document.createElement("div");
      this.gutterUtilityContainer.setAttribute("data-gutter-utility-slot", "");
    }
    if (useCustomGutterUtility) {
      if (this.gutterUtilityButton != null) {
        this.gutterUtilityButton.remove();
        this.gutterUtilityButton = void 0;
      }
      if (this.gutterUtilitySlot == null) {
        this.gutterUtilitySlot = document.createElement("slot");
        this.gutterUtilitySlot.name = "gutter-utility-slot";
      }
      if (this.gutterUtilitySlot.parentNode !== this.gutterUtilityContainer) this.gutterUtilityContainer.replaceChildren(this.gutterUtilitySlot);
    } else {
      (_a2 = this.gutterUtilitySlot) == null ? void 0 : _a2.remove();
      this.gutterUtilitySlot = void 0;
      if (this.gutterUtilityButton == null) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = toHtml(createGutterUtilityElement());
        const utilityButton = tempDiv.firstElementChild;
        if (!(utilityButton instanceof HTMLButtonElement)) throw new Error("InteractionManager.ensureGutterUtilityNode: Node element should be a button");
        utilityButton.remove();
        this.gutterUtilityButton = utilityButton;
      }
      if (this.gutterUtilityButton.parentNode !== this.gutterUtilityContainer) this.gutterUtilityContainer.replaceChildren(this.gutterUtilityButton);
    }
  }
  revealUtilityFromGutterPath(path) {
    if (this.placeUtilityFromSelection()) return;
    const target = this.resolvePointerTarget(path);
    if (isLinePointerTarget(target) && target.numberColumn) this.showUtilityOnLine(this.toEventBaseProps(target));
  }
  placeUtility() {
    if (this.placeUtilityFromSelection()) return;
    if (this.hoveredLine != null) {
      this.showUtilityOnLine(this.hoveredLine);
      return;
    }
    this.hideUtility();
  }
  placeUtilityFromSelection() {
    const endpoints = this.currentSelectionEnds();
    if (endpoints == null) return false;
    const target = this.targetForSelectionPoint(endpoints.bottom);
    if (target == null) this.hideUtility();
    else this.showUtilityOnLine(this.toEventBaseProps(target));
    return true;
  }
  showUtilityOnLine(line) {
    if (this.gutterUtilityContainer == null) return;
    this.gutterUtilityLine = line;
    line.numberElement.appendChild(this.gutterUtilityContainer);
  }
  hideUtility() {
    var _a2;
    (_a2 = this.gutterUtilityContainer) == null ? void 0 : _a2.remove();
    this.gutterUtilityLine = void 0;
  }
  currentSelectionEnds() {
    const range = this.getCurrentSelectionRange();
    return range == null ? void 0 : this.selectionEnds(range);
  }
  selectionEnds(range) {
    const start = {
      lineNumber: range.start,
      side: range.side
    };
    const end = {
      lineNumber: range.end,
      side: range.endSide ?? range.side
    };
    const startIndex = this.selectionPointRowIndex(start);
    const endIndex = this.selectionPointRowIndex(end);
    if (startIndex == null || endIndex == null) return;
    return startIndex > endIndex ? {
      top: end,
      bottom: start
    } : {
      top: start,
      bottom: end
    };
  }
  selectionPointRowIndex(point) {
    const indexes = this.getLineIndex(point.lineNumber, point.side);
    if (indexes == null) return;
    return this.isSplitDiff() ? indexes[1] : indexes[0];
  }
  targetForSelectionPoint(point) {
    if (this.pre == null) return;
    const indexes = this.getLineIndex(point.lineNumber, point.side);
    if (indexes == null) return;
    const lineIndex = this.mode === "diff" ? `${indexes[0]},${indexes[1]}` : `${indexes[0]}`;
    const candidates = this.pre.querySelectorAll(`[data-column-number="${point.lineNumber}"][data-line-index="${lineIndex}"]`);
    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) continue;
      const target = this.resolvePointerTarget(getElementPath(element));
      if (!isLinePointerTarget(target)) continue;
      if (this.mode === "diff" && point.side != null && target.side !== point.side) continue;
      return target;
    }
  }
  attachDocumentPointerListeners() {
    if (this.hasDocumentPointerListeners) return;
    document.addEventListener("pointermove", this.handleDocumentPointerMove);
    document.addEventListener("pointerup", this.handleDocumentPointerUp);
    document.addEventListener("pointercancel", this.handleDocumentPointerCancel);
    this.hasDocumentPointerListeners = true;
  }
  detachDocumentPointerListeners() {
    if (!this.hasDocumentPointerListeners) return;
    document.removeEventListener("pointermove", this.handleDocumentPointerMove);
    document.removeEventListener("pointerup", this.handleDocumentPointerUp);
    document.removeEventListener("pointercancel", this.handleDocumentPointerCancel);
    this.hasDocumentPointerListeners = false;
  }
  clearPointerSession() {
    this.pointerSession = { mode: "idle" };
  }
  clearPendingSingleLineState() {
    if (this.pointerSession.mode === "pendingSingleLineUnselect") this.pointerSession = { mode: "idle" };
  }
  selectionInfoFromPath(path, requireNumberColumn) {
    const target = this.resolvePointerTarget(path);
    if (!isLinePointerTarget(target)) return;
    if (requireNumberColumn && !target.numberColumn) return;
    if (target.splitLineIndex == null) return;
    return {
      lineIndex: target.splitLineIndex,
      lineNumber: target.lineNumber,
      eventSide: this.mode === "diff" ? target.side : void 0
    };
  }
  resolveSelectionInfo(event, options) {
    const path = this.resolveSelectionPath(event, options);
    return path != null ? this.selectionInfoFromPath(path, options.requireNumberColumn) : void 0;
  }
  selectionPointFromPath(path) {
    const target = this.resolvePointerTarget(path);
    if (!isLinePointerTarget(target)) return;
    return {
      lineNumber: target.lineNumber,
      side: this.mode === "diff" ? target.side : void 0
    };
  }
  resolveSelectionPoint(event, options) {
    const path = this.resolveSelectionPath(event, options);
    return path != null ? this.selectionPointFromPath(path) : void 0;
  }
  resolveSelectionPath(event, options) {
    const excludeUtility = options.excludeUtility !== false;
    switch (options.source) {
      case "event-path":
        return this.pathFromEventPath(event.composedPath(), excludeUtility);
      case "coordinates-first": {
        const coordinatePath = this.pathFromCoordinates(event, excludeUtility);
        if (coordinatePath !== void 0) return coordinatePath ?? void 0;
        return this.pathFromEventPath(event.composedPath(), excludeUtility);
      }
    }
  }
  pathFromCoordinates(event, excludeUtility) {
    const coordinateTarget = this.hitTest(event);
    if (coordinateTarget === void 0) return;
    if (coordinateTarget === null) return null;
    return this.pathFromElement(coordinateTarget, excludeUtility) ?? null;
  }
  pathFromEventPath(path, excludeUtility) {
    if (excludeUtility && isGutterUtilityPath(path)) return;
    for (const element of path) if (element instanceof Element) return this.pathFromElement(element, excludeUtility);
  }
  pathFromElement(element, excludeUtility) {
    const path = getElementPath(element);
    if (excludeUtility && isGutterUtilityPath(path)) return;
    const row = closestSelectableRow(element);
    if (row != null) return getElementPath(row);
    return this.pathFromAnnotationSlot(element);
  }
  pathFromAnnotationSlot(element) {
    var _a2;
    const annotatedLine = (_a2 = annotationRowFromSlot(element)) == null ? void 0 : _a2.previousElementSibling;
    if (annotatedLine instanceof HTMLElement && (annotatedLine.hasAttribute("data-line") || annotatedLine.hasAttribute("data-column-number"))) return getElementPath(annotatedLine);
    const point = selectionPointFromAnnotationSlotName(getAnnotationSlotName(element));
    if (point == null) return;
    const target = this.targetForSelectionPoint(point);
    return target != null ? getElementPath(target.lineElement) : void 0;
  }
  hitTest(event) {
    var _a2;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const root = (_a2 = this.pre) == null ? void 0 : _a2.getRootNode();
    const elementFromPointRoot = hasElementFromPoint(root) ? root : hasElementFromPoint(document) ? document : void 0;
    if (elementFromPointRoot == null) return;
    return elementFromPointRoot.elementFromPoint(event.clientX, event.clientY);
  }
  getLineIndex(lineNumber, side) {
    const { getLineIndex } = this.options;
    return getLineIndex != null ? getLineIndex(lineNumber, side) : [lineNumber - 1, lineNumber - 1];
  }
  getCurrentSelectionRange() {
    return this.proposedSelectedRange !== void 0 ? this.proposedSelectedRange : this.selectedRange;
  }
  clearProposedSelection() {
    this.proposedSelectedRange = void 0;
  }
  updateSelection(currentLine, side, emitChange = true) {
    var _a2, _b2;
    const previousRange = this.getCurrentSelectionRange();
    let nextRange;
    if (currentLine == null) nextRange = null;
    else {
      const anchorSide = ((_a2 = this.selectionAnchor) == null ? void 0 : _a2.side) ?? side;
      const anchorLine = ((_b2 = this.selectionAnchor) == null ? void 0 : _b2.lineNumber) ?? currentLine;
      nextRange = this.buildSelectionRange(anchorLine, currentLine, anchorSide, side);
    }
    if (areSelectionsEqual(previousRange ?? void 0, nextRange ?? void 0)) return;
    this.selectedRangeHighlightSide = void 0;
    this.selectedRangeLineNumberOnly = false;
    if (this.options.controlledSelection === true) this.proposedSelectedRange = nextRange;
    else {
      this.selectedRange = nextRange;
      queueRender(this.renderSelection);
    }
    this.placeUtility();
    if (emitChange) this.notifySelectionChangeDelta();
  }
  getIndexesFromSelection(selectedRange, split) {
    if (this.pre == null) return;
    const startIndexes = this.getLineIndex(selectedRange.start, selectedRange.side);
    const finalIndexes = this.getLineIndex(selectedRange.end, selectedRange.endSide ?? selectedRange.side);
    return startIndexes != null && finalIndexes != null ? {
      start: split ? startIndexes[1] : startIndexes[0],
      end: split ? finalIndexes[1] : finalIndexes[0]
    } : void 0;
  }
  getSelectionRenderState() {
    return {
      selectedLines: {
        range: this.selectedRange,
        highlightSide: this.selectedRangeHighlightSide,
        lineNumberOnly: this.selectedRangeLineNumberOnly
      },
      editorActiveLine: {
        range: this.editorActiveLine == null ? null : {
          start: this.editorActiveLine,
          end: this.editorActiveLine,
          side: this.editorActiveLineSide
        },
        highlightSide: this.editorActiveLineSide,
        lineNumberOnly: this.editorLineNumberOnly
      }
    };
  }
  resolveLineRenderRange(state, split, source) {
    if (state.range == null) return;
    const rowRange = this.getIndexesFromSelection(state.range, split);
    if (rowRange == null) {
      console.error({
        rowRange,
        range: state.range
      });
      throw new Error(`InteractionManager.renderSelection: No valid ${source} rowRange`);
    }
    return rowRange;
  }
  getLineRenderColumns(selectedLines, selectedRowRange, editorActiveLine, editorRowRange) {
    if (this.pre == null || selectedRowRange == null && editorRowRange == null) return [];
    const { children: codeElements } = this.pre;
    if (codeElements.length > 2) {
      console.error(codeElements);
      throw new Error("InteractionManager.renderSelection: Somehow there are more than 2 code elements...");
    }
    const columns = [];
    for (const code of codeElements) {
      const side = code.hasAttribute("data-deletions") ? "deletions" : code.hasAttribute("data-additions") ? "additions" : void 0;
      const renderSelectedLines = selectedLines != null && selectedRowRange != null && (selectedLines.highlightSide == null || side == null || selectedLines.highlightSide === side);
      const renderEditorActiveLine = editorActiveLine != null && editorRowRange != null && (editorActiveLine.highlightSide == null || side == null || editorActiveLine.highlightSide === side);
      if (!renderSelectedLines && !renderEditorActiveLine) continue;
      const [gutter, content] = code.children;
      if (!(gutter instanceof HTMLElement) || !(content instanceof HTMLElement)) throw new Error("InteractionManager.renderSelection: missing gutter or content element");
      if (content.children.length !== gutter.children.length) throw new Error("InteractionManager.renderSelection: gutter and content children dont match, something is wrong");
      columns.push({
        content,
        gutter,
        renderEditorActiveLine,
        renderSelectedLines
      });
    }
    return columns;
  }
  notifySelectionCommitted(range) {
    var _a2, _b2;
    (_b2 = (_a2 = this.options).onLineSelected) == null ? void 0 : _b2.call(_a2, range);
  }
  notifySelectionChangeDelta() {
    var _a2, _b2;
    (_b2 = (_a2 = this.options).onLineSelectionChange) == null ? void 0 : _b2.call(_a2, this.getCurrentSelectionRange() ?? null);
  }
  notifySelectionStart(range) {
    var _a2, _b2;
    (_b2 = (_a2 = this.options).onLineSelectionStart) == null ? void 0 : _b2.call(_a2, range);
  }
  notifySelectionEnd(range) {
    var _a2, _b2;
    (_b2 = (_a2 = this.options).onLineSelectionEnd) == null ? void 0 : _b2.call(_a2, range);
  }
  toEventBaseProps(target) {
    if (this.mode === "file") return {
      type: "line",
      lineElement: target.lineElement,
      lineNumber: target.lineNumber,
      numberColumn: target.numberColumn,
      numberElement: target.numberElement
    };
    return {
      type: "diff-line",
      annotationSide: target.side,
      lineType: target.lineType,
      lineElement: target.lineElement,
      numberElement: target.numberElement,
      lineNumber: target.lineNumber,
      numberColumn: target.numberColumn
    };
  }
  toTokenEventBaseProps({ lineCharEnd, lineCharStart, lineNumber, side, tokenElement, tokenText }) {
    if (this.mode === "file") return {
      type: "token",
      lineCharEnd,
      lineCharStart,
      lineNumber,
      tokenElement,
      tokenText
    };
    return {
      type: "token",
      lineCharEnd,
      lineCharStart,
      lineNumber,
      side,
      tokenElement,
      tokenText
    };
  }
  buildSelectedLineRange(anchor, current) {
    return this.buildSelectionRange(anchor.lineNumber, current.lineNumber, anchor.side, current.side);
  }
  buildSelectionRange(start, end, side, endSide) {
    return {
      start,
      end,
      ...side != null ? { side } : {},
      ...side !== endSide && endSide != null ? { endSide } : {}
    };
  }
  resolvePointerTarget(path) {
    let numberColumn = false;
    let lineType;
    let codeElement;
    let lineElement;
    let lineIndexValue;
    let numberElement;
    let tokenElement;
    let tokenInfo;
    let expandInfo;
    let lineNumber;
    let mergeConflictActionTarget;
    for (const element of path) {
      if (!(element instanceof HTMLElement)) continue;
      if (mergeConflictActionTarget == null && element.hasAttribute("data-merge-conflict-action")) {
        const resolutionValue = element.getAttribute("data-merge-conflict-action") ?? void 0;
        const conflictIndexValue = element.getAttribute("data-merge-conflict-conflict-index") ?? void 0;
        const conflictIndex = conflictIndexValue != null ? Number.parseInt(conflictIndexValue, 10) : NaN;
        if (isMergeConflictResolution(resolutionValue) && Number.isFinite(conflictIndex)) mergeConflictActionTarget = {
          kind: "merge-conflict-action",
          resolution: resolutionValue,
          conflictIndex
        };
      }
      if (tokenElement == null && element.hasAttribute("data-char")) {
        tokenElement = element;
        const startAttr = element.getAttribute("data-char");
        if (startAttr != null) {
          const lineCharStart = Number.parseInt(startAttr, 10);
          if (!Number.isNaN(lineCharStart)) {
            const tokenText = element.textContent ?? "";
            const lineCharEnd = lineCharStart + tokenText.length;
            if (tokenText.trim() !== "" || this.options.enableTokenInteractionsOnWhitespace === true) tokenInfo = {
              tokenElement,
              lineCharStart,
              lineCharEnd,
              tokenText
            };
            continue;
          }
        }
      }
      const columnNumber = numberElement == null ? element.getAttribute("data-column-number") ?? void 0 : void 0;
      if (columnNumber != null) {
        numberElement = element;
        lineNumber = Number.parseInt(columnNumber, 10);
        numberColumn = true;
        lineType = getLineTypeFromElement(element);
        lineIndexValue = element.getAttribute("data-line-index") ?? void 0;
        continue;
      }
      const lineAttr = lineElement == null ? element.getAttribute("data-line") ?? void 0 : void 0;
      if (lineAttr != null) {
        lineElement = element;
        lineNumber = Number.parseInt(lineAttr, 10);
        lineType = getLineTypeFromElement(element);
        lineIndexValue = element.getAttribute("data-line-index") ?? void 0;
        continue;
      }
      if (expandInfo == null && (element.hasAttribute("data-expand-button") || element.hasAttribute("data-unmodified-lines"))) {
        expandInfo = {
          hunkIndex: void 0,
          direction: (() => {
            if (element.hasAttribute("data-expand-up")) return "up";
            if (element.hasAttribute("data-expand-down")) return "down";
            return "both";
          })(),
          all: element.hasAttribute("data-expand-all-button")
        };
        continue;
      }
      const expandIndexValue = expandInfo != null ? element.getAttribute("data-expand-index") ?? void 0 : void 0;
      if (expandInfo != null && expandIndexValue != null) {
        const expandIndex = Number.parseInt(expandIndexValue, 10);
        if (!Number.isNaN(expandIndex)) expandInfo.hunkIndex = expandIndex;
        continue;
      }
      if (codeElement == null && element.hasAttribute("data-code")) {
        codeElement = element;
        break;
      }
    }
    if (mergeConflictActionTarget != null) return mergeConflictActionTarget;
    if ((expandInfo == null ? void 0 : expandInfo.hunkIndex) != null) return {
      type: "line-info",
      hunkIndex: expandInfo.hunkIndex,
      direction: expandInfo.direction,
      all: expandInfo.all
    };
    lineElement ?? (lineElement = lineIndexValue != null ? queryHTMLElement(codeElement, `[data-line][data-line-index="${lineIndexValue}"]`) : void 0);
    numberElement ?? (numberElement = lineIndexValue != null ? queryHTMLElement(codeElement, `[data-column-number][data-line-index="${lineIndexValue}"]`) : void 0);
    if (codeElement == null || lineElement == null || numberElement == null || lineType == null || lineNumber == null || Number.isNaN(lineNumber)) return;
    const splitLineIndex = this.parseLineIndex(lineElement, this.isSplitDiff());
    if (tokenInfo != null) {
      if (this.mode === "file") return {
        kind: "token",
        lineType,
        lineElement,
        lineNumber,
        numberColumn,
        numberElement,
        side: void 0,
        splitLineIndex,
        ...tokenInfo
      };
      return {
        kind: "token",
        lineType,
        lineElement,
        lineNumber,
        numberColumn,
        numberElement,
        side: getAnnotationSide(lineType, codeElement),
        splitLineIndex,
        ...tokenInfo
      };
    }
    if (this.mode === "file") return {
      kind: "line",
      lineType,
      lineElement,
      lineNumber,
      numberColumn,
      numberElement,
      side: void 0,
      splitLineIndex
    };
    return {
      kind: "line",
      lineType,
      lineElement,
      lineNumber,
      numberColumn,
      numberElement,
      side: getAnnotationSide(lineType, codeElement),
      splitLineIndex
    };
  }
  isSplitDiff() {
    var _a2;
    return ((_a2 = this.pre) == null ? void 0 : _a2.getAttribute("data-diff-type")) === "split";
  }
  parseLineIndex(element, split) {
    const lineIndexes = (element.getAttribute("data-line-index") ?? "").split(",").map((value) => Number.parseInt(value, 10)).filter((value) => !Number.isNaN(value));
    if (split && lineIndexes.length === 2) return lineIndexes[1];
    if (!split) return lineIndexes[0];
  }
};
function pluckInteractionOptions({ enableTokenInteractionsOnWhitespace, enableGutterUtility, lineHoverHighlight, onGutterUtilityClick, onLineClick, onLineEnter, onLineLeave, onLineNumberClick, onTokenClick, onTokenEnter, onTokenLeave, renderGutterUtility, __debugPointerEvents, enableLineSelection, controlledSelection, onLineSelected, onLineSelectionStart, onLineSelectionChange, onLineSelectionEnd }, onHunkExpand, getLineIndex, onMergeConflictActionClick) {
  return {
    enableTokenInteractionsOnWhitespace,
    enableGutterUtility: resolveEnableGutterUtilityOption({
      enableGutterUtility,
      renderGutterUtility,
      onGutterUtilityClick
    }),
    usesCustomGutterUtility: renderGutterUtility != null,
    lineHoverHighlight,
    onGutterUtilityClick,
    onHunkExpand,
    onMergeConflictActionClick,
    onLineClick,
    onLineEnter,
    onLineLeave,
    onLineNumberClick,
    onTokenClick,
    onTokenEnter,
    onTokenLeave,
    __debugPointerEvents,
    enableLineSelection,
    controlledSelection,
    onLineSelected,
    onLineSelectionStart,
    onLineSelectionChange,
    onLineSelectionEnd,
    getLineIndex
  };
}
function resolveEnableGutterUtilityOption({ enableGutterUtility, renderGutterUtility, onGutterUtilityClick }) {
  if (onGutterUtilityClick != null && renderGutterUtility != null) throw new Error("Cannot use both 'onGutterUtilityClick' and 'renderGutterUtility'. Use only one gutter utility API.");
  return enableGutterUtility ?? false;
}
function isLinePointerTarget(target) {
  return target != null && "kind" in target && target.kind === "line";
}
function isTokenPointerTarget(target) {
  return target != null && "kind" in target && target.kind === "token";
}
function isHoverableLinePointerTarget(target) {
  return isLinePointerTarget(target) || isTokenPointerTarget(target);
}
function isExpandoPointerTarget(target) {
  return "type" in target && target.type === "line-info";
}
function isMergeConflictActionPointerTarget(target) {
  return "kind" in target && target.kind === "merge-conflict-action";
}
function isMergeConflictResolution(value) {
  return value === "current" || value === "incoming" || value === "both";
}
function queryHTMLElement(parent, query) {
  const element = parent == null ? void 0 : parent.querySelector(query);
  return element instanceof HTMLElement ? element : void 0;
}
function getElementPath(element) {
  const path = [];
  let current = element;
  while (current != null) {
    path.push(current);
    current = current.parentNode;
  }
  return path;
}
function closestSelectableRow(element) {
  const row = element.closest("[data-line], [data-column-number]");
  if (row instanceof HTMLElement) return row;
  const annotationRow = element.closest('[data-line-annotation], [data-gutter-buffer="annotation"]');
  if (!(annotationRow instanceof HTMLElement)) return;
  const previousRow = annotationRow.previousElementSibling;
  return previousRow instanceof HTMLElement && (previousRow.hasAttribute("data-line") || previousRow.hasAttribute("data-column-number")) ? previousRow : void 0;
}
function annotationRowFromSlot(element) {
  var _a2;
  const slotted = element.closest('[slot^="annotation-"]');
  const row = (_a2 = slotted instanceof HTMLElement && slotted.assignedSlot != null ? slotted.assignedSlot : element.tagName === "SLOT" ? element : void 0) == null ? void 0 : _a2.closest("[data-line-annotation]");
  return row instanceof HTMLElement ? row : void 0;
}
function getAnnotationSlotName(element) {
  const slottedElement = element.closest('[slot^="annotation-"]');
  if (slottedElement instanceof HTMLElement) return slottedElement.getAttribute("slot") ?? void 0;
  if (element instanceof HTMLElement) {
    const slotName = element.getAttribute("name") ?? void 0;
    return slotName != null && slotName.startsWith("annotation-") ? slotName : void 0;
  }
}
function selectionPointFromAnnotationSlotName(slotName) {
  if (slotName == null) return;
  const match = /^annotation-(?:(additions|deletions)-)?(\d+)$/.exec(slotName);
  if (match == null) return;
  const lineNumber = Number.parseInt(match[2], 10);
  if (!Number.isFinite(lineNumber) || lineNumber <= 0) return;
  return {
    lineNumber,
    side: match[1]
  };
}
function hasElementFromPoint(value) {
  return value != null && typeof value.elementFromPoint === "function";
}
function areSelectionRangesEqual(first, second) {
  return first === second || areSelectionsEqual(first ?? void 0, second ?? void 0);
}
function areLineRenderStatesEqual(first, second) {
  return (first == null ? void 0 : first.highlightSide) === second.highlightSide && (first == null ? void 0 : first.lineNumberOnly) === second.lineNumberOnly && areSelectionRangesEqual((first == null ? void 0 : first.range) ?? null, second.range);
}
function getAnnotationSide(lineType, codeElement) {
  switch (lineType) {
    case "change-deletion":
      return "deletions";
    case "change-addition":
      return "additions";
    default:
      return codeElement.hasAttribute("data-deletions") ? "deletions" : "additions";
  }
}
function getLineTypeFromElement(element) {
  const lineType = element.getAttribute("data-line-type");
  if (lineType == null) return;
  switch (lineType) {
    case "change-deletion":
    case "change-addition":
    case "context":
    case "context-expanded":
      return lineType;
    default:
      return;
  }
}
function debugLogIfEnabled(debugLogType = "none", logIfType, ...args) {
  switch (debugLogType) {
    case "none":
      return;
    case "both":
      break;
    case "click":
      if (logIfType !== "click") return;
      break;
    case "move":
      if (logIfType !== "move") return;
  }
  console.log(...args);
}
var ResizeManager = (_a = class {
  constructor() {
    __publicField(this, "observedNodes", /* @__PURE__ */ new Map());
    __publicField(this, "applyColumnUpdates", (queuedUpdates) => {
      for (const [item, update] of queuedUpdates) {
        const nextCodeWidth = update.codeInlineSize != null ? resolveCodeWidth(update.codeInlineSize) : item.codeWidth;
        const nextNumberWidth = update.numberInlineSize != null ? resolveNumberWidth(update.numberInlineSize) : item.numberWidth;
        const codeWidthChanged = nextCodeWidth !== item.codeWidth;
        const numberWidthChanged = nextNumberWidth !== item.numberWidth;
        if (!codeWidthChanged && !numberWidthChanged) continue;
        item.codeWidth = nextCodeWidth;
        item.numberWidth = nextNumberWidth;
        if (item.applyColumnVariables) applyCodeColumnVariables(item, {
          codeWidthChanged,
          numberWidthChanged
        });
      }
    });
  }
  static getResizeObserver() {
    const resizeObserver = _a.resizeObserver ?? new ResizeObserver(_a.handleSharedResizeEntries);
    _a.resizeObserver = resizeObserver;
    return resizeObserver;
  }
  static handleSharedResizeEntries(entries) {
    const entriesByManager = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const manager = _a.managersByElement.get(entry.target);
      if (manager == null) continue;
      const managerEntries = entriesByManager.get(manager);
      if (managerEntries == null) entriesByManager.set(manager, [entry]);
      else managerEntries.push(entry);
    }
    for (const [manager, managerEntries] of entriesByManager) manager.handleResizeEntries(managerEntries);
  }
  setup(pre, { disableAnnotations, columnVariables = "apply" }) {
    const annotationUpdates = /* @__PURE__ */ new Set();
    const applyColumnVariables = columnVariables === "apply";
    let columnCount = 0;
    const observedNodes = new Map(this.observedNodes);
    this.observedNodes.clear();
    for (const element of pre.children) {
      if (columnCount === 2) break;
      const codeElement = (() => {
        if (element instanceof HTMLElement && element.tagName === "CODE") return element;
      })();
      if (codeElement == null) continue;
      columnCount++;
      let item = observedNodes.get(codeElement);
      if (item != null && item.type !== "code") throw new Error("ResizeManager.setup: somehow a code node is being used for an annotation, should be impossible");
      let numberElement = codeElement.firstElementChild;
      if (!(numberElement instanceof HTMLElement)) numberElement = null;
      if (item != null) {
        this.observedNodes.set(codeElement, item);
        observedNodes.delete(codeElement);
        if (item.numberElement !== numberElement) {
          if (item.numberElement != null) {
            this.unobserve(item.numberElement);
            observedNodes.delete(item.numberElement);
          }
          if (numberElement != null) {
            this.observe(numberElement);
            observedNodes.delete(numberElement);
            this.observedNodes.set(numberElement, item);
          }
          item.numberElement = numberElement;
          item.numberWidth = 0;
        } else if (item.numberElement != null) {
          observedNodes.delete(item.numberElement);
          this.observedNodes.set(item.numberElement, item);
        } else item.numberWidth = 0;
        syncColumnVariableMode(item, applyColumnVariables);
      } else {
        item = {
          type: "code",
          codeElement,
          numberElement,
          codeWidth: "auto",
          numberWidth: 0,
          applyColumnVariables
        };
        this.observedNodes.set(codeElement, item);
        this.observe(codeElement);
        if (numberElement != null) {
          this.observedNodes.set(numberElement, item);
          this.observe(numberElement);
        }
      }
    }
    if (columnCount > 1 && !disableAnnotations) {
      const annotationElements = pre.querySelectorAll('[data-line-annotation*=","]');
      const elementMap = /* @__PURE__ */ new Map();
      for (const element of annotationElements) {
        if (!(element instanceof HTMLElement)) continue;
        const lineAnnotation = element.getAttribute("data-line-annotation") ?? "";
        if (!/^-?\d+,-?\d+$/.test(lineAnnotation)) {
          console.error("DiffFileRenderer.setupResizeObserver: Invalid element or annotation", {
            lineAnnotation,
            element
          });
          continue;
        }
        let pairs = elementMap.get(lineAnnotation);
        if (pairs == null) {
          pairs = [];
          elementMap.set(lineAnnotation, pairs);
        }
        pairs.push(element);
      }
      for (const [key, pair] of elementMap) {
        if (pair.length !== 2) {
          console.error("DiffFileRenderer.setupResizeObserver: Bad Pair", key, pair);
          continue;
        }
        const [container1, container2] = pair;
        const child1 = container1.firstElementChild;
        const child2 = container2.firstElementChild;
        if (!(container1 instanceof HTMLElement) || !(container2 instanceof HTMLElement) || !(child1 instanceof HTMLElement) || !(child2 instanceof HTMLElement)) continue;
        let item = observedNodes.get(child1);
        if (item != null) {
          this.observedNodes.set(child1, item);
          this.observedNodes.set(child2, item);
          observedNodes.delete(child1);
          observedNodes.delete(child2);
          continue;
        }
        const child1Height = child1.getBoundingClientRect().height;
        const child2Height = child2.getBoundingClientRect().height;
        item = {
          type: "annotations",
          column1: {
            container: container1,
            child: child1,
            childHeight: child1Height
          },
          column2: {
            container: container2,
            child: child2,
            childHeight: child2Height
          },
          currentHeight: "auto"
        };
        annotationUpdates.add({
          child1,
          child2,
          item,
          newHeight: Math.max(child1Height, child2Height)
        });
      }
      for (const pendingUpdate of annotationUpdates) {
        this.applyNewHeight(pendingUpdate.item, pendingUpdate.newHeight);
        this.observedNodes.set(pendingUpdate.child1, pendingUpdate.item);
        this.observedNodes.set(pendingUpdate.child2, pendingUpdate.item);
        this.observe(pendingUpdate.child1);
        this.observe(pendingUpdate.child2);
      }
      annotationUpdates.clear();
    }
    for (const [element, item] of observedNodes) {
      this.unobserve(element);
      if (item.type === "code") cleanupStaleCodeItem(item);
      else cleanupStaleAnnotationItem(item);
    }
    observedNodes.clear();
  }
  cleanUp() {
    for (const element of this.observedNodes.keys()) this.unobserve(element);
    this.observedNodes.clear();
  }
  observe(element) {
    const { managersByElement } = _a;
    const owner = managersByElement.get(element);
    if (owner === this) return;
    else if (owner != null && owner !== this) throw new Error("ResizeManager.observe: element is already owned by another ResizeManager");
    managersByElement.set(element, this);
    _a.getResizeObserver().observe(element);
  }
  unobserve(element) {
    const { managersByElement, resizeObserver } = _a;
    const owner = managersByElement.get(element);
    if (owner == null) return;
    else if (owner !== this) throw new Error("ResizeManager.unobserve: element is owned by another ResizeManager");
    managersByElement.delete(element);
    resizeObserver == null ? void 0 : resizeObserver.unobserve(element);
    if (resizeObserver != null && managersByElement.size === 0) {
      resizeObserver.disconnect();
      _a.resizeObserver = void 0;
    }
  }
  handleResizeEntries(entries) {
    const codeUpdates = /* @__PURE__ */ new Map();
    const annotationUpdates = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const { target, borderBoxSize, contentBoxSize } = entry;
      if (!(target instanceof HTMLElement)) {
        console.error("ResizeManager.handleResizeEntries: Invalid element for ResizeObserver", entry);
        continue;
      }
      const item = this.observedNodes.get(target);
      if (item == null) {
        console.error("ResizeManager.handleResizeEntries: Not a valid observed node", entry);
        continue;
      }
      if (item.type === "annotations") {
        const column = (() => {
          if (target === item.column1.child) return item.column1;
          if (target === item.column2.child) return item.column2;
        })();
        if (column == null) {
          console.error(`ResizeManager.handleResizeEntries: Couldn't find a column for`, {
            item,
            target
          });
          continue;
        }
        column.childHeight = borderBoxSize[0].blockSize;
        annotationUpdates.add(item);
      } else if (item.type === "code") {
        const update = codeUpdates.get(item) ?? {};
        const inlineSize = contentBoxSize[0].inlineSize;
        if (target === item.codeElement) update.codeInlineSize = inlineSize;
        else if (target === item.numberElement) update.numberInlineSize = inlineSize;
        codeUpdates.set(item, update);
      }
    }
    this.applyAnnotationUpdates(annotationUpdates);
    annotationUpdates.clear();
    this.applyColumnUpdates(codeUpdates);
    codeUpdates.clear();
  }
  applyAnnotationUpdates(annotationUpdates) {
    for (const item of annotationUpdates) this.applyNewHeight(item, Math.max(item.column1.childHeight, item.column2.childHeight));
  }
  applyNewHeight(item, newHeight) {
    if (newHeight !== item.currentHeight) {
      item.currentHeight = Math.max(newHeight, 0);
      item.column1.container.style.setProperty("--diffs-annotation-min-height", `${item.currentHeight}px`);
      item.column2.container.style.setProperty("--diffs-annotation-min-height", `${item.currentHeight}px`);
    }
  }
}, __publicField(_a, "resizeObserver"), __publicField(_a, "managersByElement", /* @__PURE__ */ new Map()), _a);
function resolveCodeWidth(inlineSize) {
  const width = Math.max(Math.floor(inlineSize), 0);
  return width === 0 ? "auto" : width;
}
function resolveNumberWidth(inlineSize) {
  return Math.max(Math.ceil(inlineSize), 0);
}
function syncColumnVariableMode(item, applyColumnVariables) {
  if (item.applyColumnVariables === applyColumnVariables) return;
  item.applyColumnVariables = applyColumnVariables;
  if (applyColumnVariables) applyCodeColumnVariables(item, {
    codeWidthChanged: true,
    numberWidthChanged: true
  });
  else removeCodeColumnVariables(item);
}
function applyCodeColumnVariables(item, { codeWidthChanged, numberWidthChanged }) {
  const { codeElement, codeWidth, numberWidth } = item;
  if (codeWidthChanged) codeElement.style.setProperty("--diffs-column-width", `${typeof codeWidth === "number" ? `${codeWidth}px` : "auto"}`);
  if (numberWidthChanged) codeElement.style.setProperty("--diffs-column-number-width", `${numberWidth === 0 ? "auto" : `${numberWidth}px`}`);
  if (codeWidthChanged || numberWidthChanged && codeWidth !== "auto") {
    const targetWidth = typeof codeWidth === "number" ? Math.max(codeWidth - numberWidth, 0) : 0;
    codeElement.style.setProperty("--diffs-column-content-width", `${targetWidth > 0 ? `${targetWidth}px` : "auto"}`);
  }
}
function removeCodeColumnVariables(item) {
  item.codeElement.style.removeProperty("--diffs-column-content-width");
  item.codeElement.style.removeProperty("--diffs-column-number-width");
  item.codeElement.style.removeProperty("--diffs-column-width");
}
function cleanupStaleCodeItem(item) {
  if (item.codeElement.isConnected) removeCodeColumnVariables(item);
}
function cleanupStaleAnnotationItem(item) {
  if (item.column1.container.isConnected) item.column1.container.style.removeProperty("--diffs-annotation-min-height");
  if (item.column2.container.isConnected) item.column2.container.style.removeProperty("--diffs-annotation-min-height");
}
function areRenderRangesEqual(renderRangeA, renderRangeB) {
  if (renderRangeA == null || renderRangeB == null) return renderRangeA === renderRangeB;
  return renderRangeA.startingLine === renderRangeB.startingLine && renderRangeA.totalLines === renderRangeB.totalLines && renderRangeA.bufferBefore === renderRangeB.bufferBefore && renderRangeA.bufferAfter === renderRangeB.bufferAfter;
}
function createAnnotationElement(span) {
  var _a2;
  return createHastElement({
    tagName: "div",
    children: [createHastElement({
      tagName: "div",
      children: (_a2 = span.annotations) == null ? void 0 : _a2.map((slotId) => createHastElement({
        tagName: "slot",
        properties: { name: slotId }
      })),
      properties: { "data-annotation-content": "" }
    })],
    properties: { "data-line-annotation": `${span.hunkIndex},${span.lineIndex}` }
  });
}
function getIconForType(type) {
  switch (type) {
    case "file":
      return "diffs-icon-file-code";
    case "change":
      return "diffs-icon-symbol-modified";
    case "new":
      return "diffs-icon-symbol-added";
    case "deleted":
      return "diffs-icon-symbol-deleted";
    case "rename-pure":
    case "rename-changed":
      return "diffs-icon-symbol-moved";
  }
}
function createFileHeaderElement({ fileOrDiff, mode, stickyHeader }) {
  const fileDiff = "type" in fileOrDiff ? fileOrDiff : void 0;
  const properties = {
    "data-diffs-header": mode,
    "data-change-type": fileDiff == null ? void 0 : fileDiff.type,
    "data-sticky": stickyHeader ? "" : void 0
  };
  return createHastElement({
    tagName: "div",
    children: [mode === "custom" ? createHastElement({
      tagName: "slot",
      properties: { name: CUSTOM_HEADER_SLOT_ID }
    }) : createHeaderElement({
      name: fileOrDiff.name,
      prevName: "prevName" in fileOrDiff ? fileOrDiff.prevName : void 0,
      iconType: (fileDiff == null ? void 0 : fileDiff.type) ?? "file"
    }), ...mode === "custom" ? [] : [createMetadataElement(fileDiff)]],
    properties
  });
}
function createHeaderElement({ name, prevName, iconType }) {
  const children = [createHastElement({
    tagName: "slot",
    properties: { name: HEADER_PREFIX_SLOT_ID }
  }), createIconElement({
    name: getIconForType(iconType),
    properties: { "data-change-icon": iconType }
  })];
  if (prevName != null) {
    children.push(createHastElement({
      tagName: "div",
      children: [createHastElement({
        tagName: "bdi",
        children: [createTextNodeElement(prevName)]
      })],
      properties: { "data-prev-name": "" }
    }));
    children.push(createIconElement({
      name: "diffs-icon-arrow-right-short",
      properties: { "data-rename-icon": "" }
    }));
  }
  children.push(createHastElement({
    tagName: "div",
    children: [createHastElement({
      tagName: "bdi",
      children: [createTextNodeElement(name)]
    })],
    properties: { "data-title": "" }
  }));
  children.push(createHastElement({
    tagName: "slot",
    properties: { name: HEADER_FILENAME_SUFFIX_SLOT_ID }
  }));
  return createHastElement({
    tagName: "div",
    children,
    properties: { "data-header-content": "" }
  });
}
function createMetadataElement(fileDiff) {
  const children = [];
  if (fileDiff != null) {
    let additions = 0;
    let deletions = 0;
    for (const hunk of fileDiff.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
    if (deletions > 0 || additions === 0) children.push(createHastElement({
      tagName: "span",
      children: [createTextNodeElement(`-${deletions}`)],
      properties: { "data-deletions-count": "" }
    }));
    if (additions > 0 || deletions === 0) children.push(createHastElement({
      tagName: "span",
      children: [createTextNodeElement(`+${additions}`)],
      properties: { "data-additions-count": "" }
    }));
  }
  children.push(createHastElement({
    tagName: "slot",
    properties: { name: HEADER_METADATA_SLOT_ID }
  }));
  return createHastElement({
    tagName: "div",
    children,
    properties: { "data-metadata": "" }
  });
}
function createPreElement(options) {
  return createHastElement({
    tagName: "pre",
    properties: createPreWrapperProperties(options)
  });
}
function createPreWrapperProperties({ diffIndicators, disableBackground, disableLineNumbers, overflow, split, totalLines, type, customProperties }) {
  return {
    ...customProperties,
    "data-diff": type === "diff" ? "" : void 0,
    "data-file": type === "file" ? "" : void 0,
    "data-diff-type": type === "diff" ? split ? "split" : "single" : void 0,
    "data-overflow": overflow,
    "data-disable-line-numbers": disableLineNumbers ? "" : void 0,
    "data-background": !disableBackground ? "" : void 0,
    "data-indicators": diffIndicators === "bars" || diffIndicators === "classic" ? diffIndicators : void 0,
    style: `--diffs-min-number-column-width-default:${`${totalLines}`.length}ch;`
  };
}
const CUSTOM_EXTENSION_TO_FILE_FORMAT = /* @__PURE__ */ new Map();
const EXTENSION_TO_FILE_FORMAT = {
  "1c": "1c",
  abap: "abap",
  as: "actionscript-3",
  ada: "ada",
  adb: "ada",
  ads: "ada",
  adoc: "asciidoc",
  asciidoc: "asciidoc",
  "component.html": "angular-html",
  "component.ts": "angular-ts",
  conf: "nginx",
  htaccess: "apache",
  cls: "tex",
  trigger: "apex",
  apl: "apl",
  applescript: "applescript",
  scpt: "applescript",
  ara: "ara",
  asm: "asm",
  s: "riscv",
  astro: "astro",
  awk: "awk",
  bal: "ballerina",
  sh: "zsh",
  bash: "zsh",
  bat: "cmd",
  cmd: "cmd",
  be: "berry",
  beancount: "beancount",
  bib: "bibtex",
  bicep: "bicep",
  "blade.php": "blade",
  bsl: "bsl",
  c: "c",
  h: "objective-cpp",
  cs: "csharp",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hh: "cpp",
  cdc: "cdc",
  cairo: "cairo",
  clar: "clarity",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  soy: "soy",
  cmake: "cmake",
  "CMakeLists.txt": "cmake",
  cob: "cobol",
  cbl: "cobol",
  cobol: "cobol",
  CODEOWNERS: "codeowners",
  ql: "ql",
  coffee: "coffeescript",
  lisp: "lisp",
  cl: "lisp",
  lsp: "lisp",
  log: "log",
  v: "verilog",
  cql: "cql",
  cr: "crystal",
  css: "css",
  csv: "csv",
  cue: "cue",
  cypher: "cypher",
  cyp: "cypher",
  d: "d",
  dart: "dart",
  dax: "dax",
  desktop: "desktop",
  diff: "diff",
  patch: "diff",
  Dockerfile: "dockerfile",
  dockerfile: "dockerfile",
  env: "dotenv",
  dm: "dream-maker",
  edge: "edge",
  el: "emacs-lisp",
  ex: "elixir",
  exs: "elixir",
  elm: "elm",
  erb: "erb",
  erl: "erlang",
  hrl: "erlang",
  f: "fortran-fixed-form",
  for: "fortran-fixed-form",
  fs: "fsharp",
  fsi: "fsharp",
  fsx: "fsharp",
  f03: "f03",
  f08: "f08",
  f18: "f18",
  f77: "f77",
  f90: "fortran-free-form",
  f95: "fortran-free-form",
  fnl: "fennel",
  fish: "fish",
  ftl: "ftl",
  tres: "gdresource",
  res: "gdresource",
  gd: "gdscript",
  gdshader: "gdshader",
  gs: "genie",
  feature: "gherkin",
  COMMIT_EDITMSG: "git-commit",
  "git-rebase-todo": "git-rebase",
  gjs: "glimmer-js",
  gleam: "gleam",
  gts: "glimmer-ts",
  glsl: "glsl",
  vert: "glsl",
  frag: "glsl",
  shader: "shaderlab",
  gp: "gnuplot",
  plt: "gnuplot",
  gnuplot: "gnuplot",
  go: "go",
  graphql: "graphql",
  gql: "graphql",
  groovy: "groovy",
  gvy: "groovy",
  hack: "hack",
  haml: "haml",
  hbs: "handlebars",
  handlebars: "handlebars",
  hs: "haskell",
  lhs: "haskell",
  hx: "haxe",
  hcl: "hcl",
  hjson: "hjson",
  hlsl: "hlsl",
  fx: "hlsl",
  html: "html",
  htm: "html",
  http: "http",
  rest: "http",
  hxml: "hxml",
  hy: "hy",
  imba: "imba",
  ini: "ini",
  cfg: "ini",
  jade: "pug",
  pug: "pug",
  java: "java",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jinja: "jinja",
  jinja2: "jinja",
  j2: "jinja",
  jison: "jison",
  jl: "julia",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsonl: "jsonl",
  jsonnet: "jsonnet",
  libsonnet: "jsonnet",
  jssm: "jssm",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kts",
  kql: "kusto",
  tex: "tex",
  ltx: "tex",
  lean: "lean4",
  less: "less",
  liquid: "liquid",
  lit: "lit",
  ll: "llvm",
  logo: "logo",
  lua: "lua",
  luau: "luau",
  Makefile: "makefile",
  mk: "makefile",
  makefile: "makefile",
  md: "markdown",
  markdown: "markdown",
  marko: "marko",
  m: "wolfram",
  mat: "matlab",
  mdc: "mdc",
  mdx: "mdx",
  wiki: "wikitext",
  mediawiki: "wikitext",
  mmd: "mermaid",
  mermaid: "mermaid",
  mips: "mipsasm",
  mojo: "mojo",
  "🔥": "mojo",
  move: "move",
  nar: "narrat",
  nf: "nextflow",
  nim: "nim",
  nims: "nim",
  nimble: "nim",
  nix: "nix",
  nu: "nushell",
  mm: "objective-cpp",
  ml: "ocaml",
  mli: "ocaml",
  mll: "ocaml",
  mly: "ocaml",
  pas: "pascal",
  p: "pascal",
  pl: "prolog",
  pm: "perl",
  t: "perl",
  raku: "raku",
  p6: "raku",
  pl6: "raku",
  php: "php",
  phtml: "php",
  pls: "plsql",
  sql: "sql",
  po: "po",
  polar: "polar",
  pcss: "postcss",
  pot: "pot",
  potx: "potx",
  pq: "powerquery",
  pqm: "powerquery",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  prisma: "prisma",
  pro: "prolog",
  P: "prolog",
  properties: "properties",
  proto: "protobuf",
  pp: "puppet",
  purs: "purescript",
  py: "python",
  pyw: "python",
  pyi: "python",
  qml: "qml",
  qmldir: "qmldir",
  qss: "qss",
  r: "r",
  R: "r",
  rkt: "racket",
  rktl: "racket",
  razor: "razor",
  cshtml: "razor",
  rb: "ruby",
  rbw: "ruby",
  reg: "reg",
  regex: "regexp",
  rel: "rel",
  rs: "rust",
  rst: "rst",
  rake: "ruby",
  gemspec: "ruby",
  jbuilder: "ruby",
  builder: "ruby",
  rabl: "ruby",
  arb: "ruby",
  ru: "ruby",
  podspec: "ruby",
  Gemfile: "ruby",
  Rakefile: "ruby",
  Guardfile: "ruby",
  Capfile: "ruby",
  Berksfile: "ruby",
  Brewfile: "ruby",
  Vagrantfile: "ruby",
  Thorfile: "ruby",
  Appraisals: "ruby",
  Dangerfile: "ruby",
  sas: "sas",
  sass: "sass",
  scala: "scala",
  sc: "scala",
  scm: "scheme",
  ss: "scheme",
  sld: "scheme",
  scss: "scss",
  sdbl: "sdbl",
  shadergraph: "shader",
  st: "smalltalk",
  sol: "solidity",
  sparql: "sparql",
  rq: "sparql",
  spl: "splunk",
  config: "ssh-config",
  do: "stata",
  ado: "stata",
  dta: "stata",
  styl: "stylus",
  stylus: "stylus",
  svelte: "svelte",
  swift: "swift",
  sv: "system-verilog",
  svh: "system-verilog",
  service: "systemd",
  socket: "systemd",
  device: "systemd",
  timer: "systemd",
  talon: "talonscript",
  tasl: "tasl",
  tcl: "tcl",
  templ: "templ",
  tf: "tf",
  tfvars: "tfvars",
  toml: "toml",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsp: "typespec",
  tsv: "tsv",
  tsx: "tsx",
  ttl: "turtle",
  twig: "twig",
  typ: "typst",
  vv: "v",
  vala: "vala",
  vapi: "vala",
  vb: "vb",
  vbs: "vb",
  bas: "vb",
  vh: "verilog",
  vhd: "vhdl",
  vhdl: "vhdl",
  vim: "vimscript",
  vue: "vue",
  "vine.ts": "vue-vine",
  vy: "vyper",
  wasm: "wasm",
  wat: "wasm",
  wy: "文言",
  wgsl: "wgsl",
  wit: "wit",
  wl: "wolfram",
  nb: "wolfram",
  xml: "xml",
  xsl: "xsl",
  xslt: "xsl",
  yaml: "yaml",
  yml: "yml",
  zs: "zenscript",
  zig: "zig",
  zsh: "zsh",
  sty: "tex"
};
function getFiletypeFromFileName(fileName) {
  var _a2;
  if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(fileName)) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(fileName) ?? "text";
  if (EXTENSION_TO_FILE_FORMAT[fileName] != null) return EXTENSION_TO_FILE_FORMAT[fileName];
  const compoundMatch = fileName.match(/\.([^/\\]+\.[^/\\]+)$/);
  if (compoundMatch != null) {
    if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(compoundMatch[1])) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(compoundMatch[1]) ?? "text";
    if (EXTENSION_TO_FILE_FORMAT[compoundMatch[1]] != null) return EXTENSION_TO_FILE_FORMAT[compoundMatch[1]] ?? "text";
  }
  const simpleMatch = ((_a2 = fileName.match(/\.([^.]+)$/)) == null ? void 0 : _a2[1]) ?? "";
  if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(simpleMatch)) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(simpleMatch) ?? "text";
  return EXTENSION_TO_FILE_FORMAT[simpleMatch] ?? "text";
}
function getHighlighterOptions(lang, { theme, preferredHighlighter = "shiki-js" }) {
  return {
    langs: Array.isArray(lang) ? lang : [lang ?? "text"],
    themes: getThemes(theme),
    preferredHighlighter
  };
}
function getLineAnnotationName(annotation) {
  return `annotation-${"side" in annotation ? `${annotation.side}-` : ""}${annotation.lineNumber}`;
}
function isDefaultRenderRange(renderRange) {
  return renderRange.startingLine === 0 && renderRange.totalLines === Infinity && renderRange.bufferBefore === 0 && renderRange.bufferAfter === 0;
}
function processLine(node, line, state) {
  const lineInfo = typeof state.lineInfo === "function" ? state.lineInfo(line) : state.lineInfo[line - 1];
  if (lineInfo == null) {
    const errorMessage = `processLine: line ${line}, contains no state.lineInfo`;
    console.error(errorMessage, {
      node,
      line,
      state
    });
    throw new Error(errorMessage);
  }
  node.tagName = "div";
  node.properties["data-line"] = lineInfo.lineNumber;
  node.properties["data-alt-line"] = lineInfo.altLineNumber;
  node.properties["data-line-type"] = lineInfo.type;
  node.properties["data-line-index"] = lineInfo.lineIndex;
  if (node.children.length === 0) node.children.push(createTextNodeElement("\n"));
  return node;
}
const NO_TOKEN = Symbol("no-token");
const MULTIPLE_TOKENS = Symbol("multiple-tokens");
function wrapTokenFragments(container) {
  const ownTokenChar = getTokenChar(container);
  if (ownTokenChar != null) return ownTokenChar;
  let containerTokenState = NO_TOKEN;
  const wrappedChildren = [];
  let currentTokenChildren = [];
  let currentTokenChar;
  const flushTokenChildren = () => {
    if (currentTokenChildren.length === 0 || currentTokenChar == null) {
      currentTokenChildren = [];
      currentTokenChar = void 0;
      return;
    }
    if (currentTokenChildren.length === 1) {
      const child = currentTokenChildren[0];
      if ((child == null ? void 0 : child.type) === "element") {
        setTokenChar(child, currentTokenChar);
        for (const grandChild of child.children) stripTokenChar(grandChild);
      } else stripTokenChar(child);
      wrappedChildren.push(child);
      currentTokenChildren = [];
      currentTokenChar = void 0;
      return;
    }
    for (const child of currentTokenChildren) stripTokenChar(child);
    wrappedChildren.push(createHastElement({
      tagName: "span",
      properties: { "data-char": currentTokenChar },
      children: currentTokenChildren
    }));
    currentTokenChildren = [];
    currentTokenChar = void 0;
  };
  const mergeContainerTokenState = (childTokenState) => {
    if (childTokenState === NO_TOKEN) return;
    if (childTokenState === MULTIPLE_TOKENS) {
      containerTokenState = MULTIPLE_TOKENS;
      return;
    }
    if (containerTokenState === NO_TOKEN) {
      containerTokenState = childTokenState;
      return;
    }
    if (containerTokenState !== childTokenState) containerTokenState = MULTIPLE_TOKENS;
  };
  for (const child of container.children) {
    const childTokenState = child.type === "element" ? wrapTokenFragments(child) : NO_TOKEN;
    mergeContainerTokenState(childTokenState);
    if (typeof childTokenState !== "number") {
      flushTokenChildren();
      wrappedChildren.push(child);
      continue;
    }
    if (currentTokenChar != null && currentTokenChar !== childTokenState) flushTokenChildren();
    currentTokenChar ?? (currentTokenChar = childTokenState);
    currentTokenChildren.push(child);
  }
  flushTokenChildren();
  container.children = wrappedChildren;
  return containerTokenState;
}
function getTokenChar(node) {
  const value = node.properties["data-char"];
  if (typeof value === "number") return value;
}
function stripTokenChar(node) {
  if (node.type !== "element") return;
  node.properties["data-char"] = void 0;
  for (const child of node.children) stripTokenChar(child);
}
function setTokenChar(node, char) {
  node.properties["data-char"] = char;
}
function transformerStyleToClass(options = {}) {
  const { classPrefix = "__shiki_", classSuffix = "", classReplacer = (className) => className } = options;
  const classToStyle = /* @__PURE__ */ new Map();
  function stringifyStyle(style) {
    return Object.entries(style).map(([key, value]) => `${key}:${value}`).join(";");
  }
  function registerStyle(style) {
    const str = typeof style === "string" ? style : stringifyStyle(style);
    let className = classPrefix + cyrb53(str) + classSuffix;
    className = classReplacer(className);
    if (!classToStyle.has(className)) classToStyle.set(className, typeof style === "string" ? style : { ...style });
    return className;
  }
  return {
    name: "@shikijs/transformers:style-to-class",
    pre(t) {
      if (!t.properties.style) return;
      const className = registerStyle(t.properties.style);
      delete t.properties.style;
      this.addClassToHast(t, className);
    },
    tokens(lines) {
      for (const line of lines) for (const token of line) {
        if (!token.htmlStyle) continue;
        const className = registerStyle(token.htmlStyle);
        token.htmlStyle = {};
        token.htmlAttrs || (token.htmlAttrs = {});
        if (!token.htmlAttrs.class) token.htmlAttrs.class = className;
        else token.htmlAttrs.class += ` ${className}`;
      }
    },
    getClassRegistry() {
      return classToStyle;
    },
    getCSS() {
      let css = "";
      for (const [className, style] of classToStyle.entries()) css += `.${className}{${typeof style === "string" ? style : stringifyStyle(style)}}`;
      return css;
    },
    clearRegistry() {
      classToStyle.clear();
    }
  };
}
function cyrb53(str, seed = 0) {
  let h1 = 3735928559 ^ seed;
  let h2 = 1103547991 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507);
  h1 ^= Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
  h2 ^= Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).slice(0, 6);
}
function createTransformerWithState(useTokenTransformer = false, useCSSClasses = false) {
  const state = { lineInfo: [] };
  const transformers = [{
    line(node) {
      delete node.properties.class;
      return node;
    },
    pre(pre) {
      const code = findCodeElement(pre);
      const children = [];
      if (code != null) {
        let index = 1;
        for (const node of code.children) {
          if (node.type !== "element") continue;
          if (useTokenTransformer) wrapTokenFragments(node);
          children.push(processLine(node, index, state));
          index++;
        }
        code.children = children;
      }
      return pre;
    },
    ...useTokenTransformer ? {
      tokens(lines) {
        for (const line of lines) {
          let col = 0;
          for (const token of line) {
            const tokenWithOriginalRange = token;
            tokenWithOriginalRange.__lineChar ?? (tokenWithOriginalRange.__lineChar = col);
            col += token.content.length;
          }
        }
      },
      preprocess(_code, options) {
        options.mergeWhitespaces = "never";
      },
      span(hast, _line, _char, _lineElement, token) {
        if ((token == null ? void 0 : token.offset) != null && token.content != null) {
          const tokenChar = token.__lineChar;
          if (tokenChar != null) hast.properties["data-char"] = tokenChar;
          return hast;
        }
        return hast;
      }
    } : null
  }];
  if (useCSSClasses) transformers.push(tokenStyleNormalizer, toClass);
  if (useTokenTransformer) transformers.push({ line: (node) => {
    if (node.type === "element" && node.children.length === 0) node.children.push({
      type: "element",
      tagName: "br",
      properties: {},
      children: []
    });
    return node;
  } });
  return {
    state,
    transformers,
    toClass
  };
}
const toClass = transformerStyleToClass({ classPrefix: "hl-" });
const tokenStyleNormalizer = {
  name: "token-style-normalizer",
  tokens(lines) {
    for (const line of lines) for (const token of line) {
      if (token.htmlStyle != null) continue;
      const style = {};
      if (token.color != null) style.color = token.color;
      if (token.bgColor != null) style["background-color"] = token.bgColor;
      if (token.fontStyle != null && token.fontStyle !== 0) {
        if ((token.fontStyle & 1) !== 0) style["font-style"] = "italic";
        if ((token.fontStyle & 2) !== 0) style["font-weight"] = "bold";
        if ((token.fontStyle & 4) !== 0) style["text-decoration"] = "underline";
      }
      if (Object.keys(style).length > 0) token.htmlStyle = style;
    }
  }
};
function formatCSSVariablePrefix(type) {
  return `--${type === "token" ? "diffs-token" : "diffs"}-`;
}
const HEX_TRANSPARENT_RE = /^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/i;
const ALPHA_ZERO_RE = /^0(?:\.0+)?%?$/;
function getFunctionalAlpha(color) {
  var _a2;
  const openParen = color.indexOf("(");
  if (openParen <= 0 || !color.endsWith(")")) return;
  const fn = color.slice(0, openParen).trim();
  if (!/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)$/i.test(fn)) return;
  const inner = color.slice(openParen + 1, -1).trim();
  if (inner.length === 0) return;
  const slashIndex = inner.lastIndexOf("/");
  if (slashIndex !== -1) return inner.slice(slashIndex + 1).trim();
  if (/^(?:rgba|hsla)$/i.test(fn)) {
    const parts = inner.split(",");
    if (parts.length === 4) return (_a2 = parts[3]) == null ? void 0 : _a2.trim();
  }
}
function parseHexRgba(color) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.exec(color.trim());
  if (match == null) return null;
  const hex = match[1];
  let expanded;
  let alpha = 1;
  if (hex.length === 3) expanded = hex.split("").map((c) => c + c).join("");
  else if (hex.length === 6) expanded = hex;
  else {
    expanded = hex.slice(0, 6);
    alpha = parseInt(hex.slice(6, 8), 16) / 255;
  }
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
    alpha
  ];
}
function relativeLuminance(color) {
  if (color == null) return null;
  const rgba = parseHexRgba(color);
  if (rgba == null) return null;
  const r = rgba[0] / 255;
  const g = rgba[1] / 255;
  const b = rgba[2] / 255;
  const channel = (v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function isFullyTransparent(color) {
  if (color == null) return false;
  const normalized = color.trim().toLowerCase();
  if (normalized === "transparent") return true;
  if (HEX_TRANSPARENT_RE.test(normalized)) return true;
  const alpha = getFunctionalAlpha(normalized);
  return alpha != null && ALPHA_ZERO_RE.test(alpha);
}
function hoverWouldEraseText(hover, bg, fg) {
  if (bg == null || fg == null) return false;
  const hoverL = relativeLuminance(hover);
  const bgL = relativeLuminance(bg);
  const fgL = relativeLuminance(fg);
  if (hoverL == null || bgL == null || fgL == null) return false;
  return Math.abs(hoverL - fgL) < Math.abs(hoverL - bgL);
}
const cache = /* @__PURE__ */ new WeakMap();
function normalizeThemeColors(theme) {
  const cached = cache.get(theme);
  if (cached != null) return cached;
  const originalColors = theme.colors ?? {};
  const colors = { ...originalColors };
  const editorBackground = originalColors["editor.background"] ?? theme.bg;
  const editorForeground = originalColors["editor.foreground"] ?? theme.fg;
  const sidebarBackground = originalColors["sideBar.background"] ?? editorBackground;
  const sidebarForeground = originalColors["sideBar.foreground"] ?? editorForeground;
  fill(colors, "editor.background", editorBackground);
  fill(colors, "editor.foreground", editorForeground);
  fill(colors, "sideBar.background", sidebarBackground);
  fill(colors, "sideBar.foreground", sidebarForeground);
  fill(colors, "input.background", originalColors["input.background"] ?? sidebarBackground);
  fill(colors, "sideBarSectionHeader.foreground", originalColors["sideBarSectionHeader.foreground"] ?? sidebarForeground);
  fill(colors, "list.activeSelectionForeground", originalColors["list.activeSelectionForeground"] ?? sidebarForeground);
  fill(colors, "gitDecoration.addedResourceForeground", firstColor(originalColors["gitDecoration.addedResourceForeground"], originalColors["terminal.ansiGreen"], originalColors["editorGutter.addedBackground"]));
  fill(colors, "gitDecoration.modifiedResourceForeground", firstColor(originalColors["gitDecoration.modifiedResourceForeground"], originalColors["terminal.ansiBlue"], originalColors["editorGutter.modifiedBackground"]));
  fill(colors, "gitDecoration.deletedResourceForeground", firstColor(originalColors["gitDecoration.deletedResourceForeground"], originalColors["terminal.ansiRed"], originalColors["editorGutter.deletedBackground"]));
  const focusRing = (isFullyTransparent(originalColors["list.focusOutline"]) ? void 0 : originalColors["list.focusOutline"]) ?? (isFullyTransparent(originalColors["focusBorder"]) ? void 0 : originalColors["focusBorder"]);
  if (focusRing != null) colors["list.focusOutline"] = focusRing;
  else delete colors["list.focusOutline"];
  const hover = originalColors["list.hoverBackground"];
  if (hover != null && (matchesSurface(hover, sidebarBackground) || hoverWouldEraseText(hover, sidebarBackground, sidebarForeground))) delete colors["list.hoverBackground"];
  const result = Object.freeze({
    ...theme,
    colors: Object.freeze(colors)
  });
  cache.set(theme, result);
  return result;
}
function fill(colors, key, value) {
  if (value != null && value !== "") colors[key] = value;
}
function firstColor(...candidates) {
  for (const candidate of candidates) if (candidate != null && candidate !== "") return candidate;
}
function matchesSurface(color, surface) {
  return surface != null && color.toLowerCase() === surface.toLowerCase();
}
function getHighlighterThemeStyles({ theme = DEFAULT_THEMES, highlighter: highlighter2, prefix }) {
  let styles = "";
  if (typeof theme === "string") {
    const themeData = highlighter2.getTheme(theme);
    const normalized = normalizeThemeColors(themeData);
    styles += `color:${normalized.fg};`;
    styles += `background-color:${normalized.bg};`;
    styles += `${formatCSSVariablePrefix("global")}fg:${normalized.fg};`;
    styles += `${formatCSSVariablePrefix("global")}bg:${normalized.bg};`;
    styles += getGitVariables(themeData, prefix);
  } else {
    let themeData = highlighter2.getTheme(theme.dark);
    let normalized = normalizeThemeColors(themeData);
    styles += `${formatCSSVariablePrefix("global")}dark:${normalized.fg};`;
    styles += `${formatCSSVariablePrefix("global")}dark-bg:${normalized.bg};`;
    styles += getGitVariables(themeData, "dark");
    themeData = highlighter2.getTheme(theme.light);
    normalized = normalizeThemeColors(themeData);
    styles += `${formatCSSVariablePrefix("global")}light:${normalized.fg};`;
    styles += `${formatCSSVariablePrefix("global")}light-bg:${normalized.bg};`;
    styles += getGitVariables(themeData, "light");
  }
  return styles;
}
function getGitVariables(themeData, modePrefix) {
  var _a2, _b2, _c, _d, _e, _f;
  modePrefix = modePrefix != null ? `${modePrefix}-` : "";
  let styles = "";
  const additionGreen = ((_a2 = themeData.colors) == null ? void 0 : _a2["gitDecoration.addedResourceForeground"]) ?? ((_b2 = themeData.colors) == null ? void 0 : _b2["terminal.ansiGreen"]);
  if (additionGreen != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}addition-color:${additionGreen};`;
  const deletionRed = ((_c = themeData.colors) == null ? void 0 : _c["gitDecoration.deletedResourceForeground"]) ?? ((_d = themeData.colors) == null ? void 0 : _d["terminal.ansiRed"]);
  if (deletionRed != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}deletion-color:${deletionRed};`;
  const modifiedBlue = ((_e = themeData.colors) == null ? void 0 : _e["gitDecoration.modifiedResourceForeground"]) ?? ((_f = themeData.colors) == null ? void 0 : _f["terminal.ansiBlue"]);
  if (modifiedBlue != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}modified-color:${modifiedBlue};`;
  return styles;
}
function getLineNodes(nodes) {
  let firstChild = nodes.children[0];
  while (firstChild != null) {
    if (firstChild.type === "element" && firstChild.tagName === "code") return firstChild.children;
    if ("children" in firstChild) firstChild = firstChild.children[0];
    else firstChild = null;
  }
  console.error(nodes);
  throw new Error("getLineNodes: Unable to find children");
}
function appendItems(target, items) {
  for (const item of items) target.push(item);
}
function getFileAnnotations(annotations) {
  const fileAnnotations = annotations[0];
  return fileAnnotations != null && fileAnnotations.length > 0 ? fileAnnotations : void 0;
}
function shouldRenderFileAnnotations(renderRange) {
  return renderRange.startingLine === 0 && renderRange.totalLines > 0;
}
function applyLineTextWithNewline(line, lineText) {
  if (line.endsWith("\r\n")) return lineText + "\r\n";
  if (line.endsWith("\r")) return lineText + "\r";
  if (line.endsWith("\n")) return lineText + "\n";
  return lineText;
}
function createContentColumn(children, rowCount) {
  return createHastElement({
    tagName: "div",
    children,
    properties: {
      "data-content": "",
      style: `grid-row: span ${rowCount}`
    }
  });
}
const SVGSpriteSheet = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  <symbol id="diffs-icon-arrow-right-short" viewBox="0 0 16 16">
    <path d="M8.47 4.22a.75.75 0 0 0 0 1.06l1.97 1.97H3.75a.75.75 0 0 0 0 1.5h6.69l-1.97 1.97a.75.75 0 1 0 1.06 1.06l3.25-3.25a.75.75 0 0 0 0-1.06L9.53 4.22a.75.75 0 0 0-1.06 0"/>
  </symbol>
  <symbol id="diffs-icon-brand-github" viewBox="0 0 16 16">
    <path d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27s-1.36.09-2 .27c-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8"/>
  </symbol>
  <symbol id="diffs-icon-chevron" viewBox="0 0 16 16">
    <path d="M1.47 4.47a.75.75 0 0 1 1.06 0L8 9.94l5.47-5.47a.75.75 0 1 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 0 1 0-1.06"/>
  </symbol>
  <symbol id="diffs-icon-chevrons-narrow" viewBox="0 0 10 16">
    <path d="M4.47 2.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1-1.06 1.06L5 3.81 2.28 6.53a.75.75 0 0 1-1.06-1.06zM1.22 9.47a.75.75 0 0 1 1.06 0L5 12.19l2.72-2.72a.75.75 0 0 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 0-1.06"/>
  </symbol>
  <symbol id="diffs-icon-diff-split" viewBox="0 0 16 16">
    <path d="M14 0H8.5v16H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2m-1.5 6.5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1a.5.5 0 0 1 1 0"/><path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5.5V0zm.5 7.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1" opacity=".3"/>
  </symbol>
  <symbol id="diffs-icon-diff-unified" viewBox="0 0 16 16">
    <path fill-rule="evenodd" d="M16 14a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V8.5h16zm-8-4a.5.5 0 0 0-.5.5v1h-1a.5.5 0 0 0 0 1h1v1a.5.5 0 0 0 1 0v-1h1a.5.5 0 0 0 0-1h-1v-1A.5.5 0 0 0 8 10" clip-rule="evenodd"/><path fill-rule="evenodd" d="M14 0a2 2 0 0 1 2 2v5.5H0V2a2 2 0 0 1 2-2zM6.5 3.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1z" clip-rule="evenodd" opacity=".4"/>
  </symbol>
  <symbol id="diffs-icon-expand" viewBox="0 0 16 16">
    <path d="M3.47 5.47a.75.75 0 0 1 1.06 0L8 8.94l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06"/>
  </symbol>
  <symbol id="diffs-icon-expand-all" viewBox="0 0 16 16">
    <path d="M11.47 9.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06L8 12.94zM7.526 1.418a.75.75 0 0 1 1.004.052l4 4a.75.75 0 1 1-1.06 1.06L8 3.06 4.53 6.53a.75.75 0 1 1-1.06-1.06l4-4z"/>
  </symbol>
  <symbol id="diffs-icon-file-code" viewBox="0 0 16 16">
    <path d="M10.75 0c.199 0 .39.08.53.22l3.5 3.5c.14.14.22.331.22.53v9A2.75 2.75 0 0 1 12.25 16h-8.5A2.75 2.75 0 0 1 1 13.25V2.75A2.75 2.75 0 0 1 3.75 0zm-7 1.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V5h-1.25A2.25 2.25 0 0 1 10 2.75V1.5z"/><path d="M7.248 6.19a.75.75 0 0 1 .063 1.058L5.753 9l1.558 1.752a.75.75 0 0 1-1.122.996l-2-2.25a.75.75 0 0 1 0-.996l2-2.25a.75.75 0 0 1 1.06-.063M8.69 7.248a.75.75 0 1 1 1.12-.996l2 2.25a.75.75 0 0 1 0 .996l-2 2.25a.75.75 0 1 1-1.12-.996L10.245 9z"/>
  </symbol>
  <symbol id="diffs-icon-plus" viewBox="0 0 16 16">
    <path d="M8 3a.75.75 0 0 1 .75.75v3.5h3.5a.75.75 0 0 1 0 1.5h-3.5v3.5a.75.75 0 0 1-1.5 0v-3.5h-3.5a.75.75 0 0 1 0-1.5h3.5v-3.5A.75.75 0 0 1 8 3"/>
  </symbol>
  <symbol id="diffs-icon-symbol-added" viewBox="0 0 16 16">
    <path d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4"/><path d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"/>
  </symbol>
  <symbol id="diffs-icon-symbol-deleted" viewBox="0 0 16 16">
    <path d="M4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8"/><path d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"/>
  </symbol>
  <symbol id="diffs-icon-symbol-diffstat" viewBox="0 0 16 16">
    <path d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"/><path d="M8.75 4.296a.75.75 0 0 0-1.5 0V6.25h-2a.75.75 0 0 0 0 1.5h2v1.5h1.5v-1.5h2a.75.75 0 0 0 0-1.5h-2zM5.25 10a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5z"/>
  </symbol>
  <symbol id="diffs-icon-symbol-ignored" viewBox="0 0 16 16">
    <path d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706s.826.607 1.706.802c.898.2 2.091.288 3.704.288s2.806-.088 3.704-.288c.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5s-2.806.088-3.704.288c-.88.196-1.381.478-1.706.802s-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8M0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8m11.53-2.47a.75.75 0 0 0-1.06-1.06l-6 6a.75.75 0 1 0 1.06 1.06z"/>
  </symbol>
  <symbol id="diffs-icon-symbol-modified" viewBox="0 0 16 16">
    <path d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706s.826.607 1.706.802c.898.2 2.091.288 3.704.288s2.806-.088 3.704-.288c.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5s-2.806.088-3.704.288c-.88.196-1.381.478-1.706.802s-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8M0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8m8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
  </symbol>
  <symbol id="diffs-icon-symbol-moved" viewBox="0 0 16 16">
    <path d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"/><path d="M8.495 4.695a.75.75 0 0 0-.05 1.06L10.486 8l-2.041 2.246a.75.75 0 0 0 1.11 1.008l2.5-2.75a.75.75 0 0 0 0-1.008l-2.5-2.75a.75.75 0 0 0-1.06-.051m-4 0a.75.75 0 0 0-.05 1.06l2.044 2.248-1.796 1.995a.75.75 0 0 0 1.114 1.004l2.25-2.5a.75.75 0 0 0-.002-1.007l-2.5-2.75a.75.75 0 0 0-1.06-.05"/>
  </symbol>
  <symbol id="diffs-icon-symbol-ref" viewBox="0 0 16 16">
    <path d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706.286.286.71.54 1.41.73V1.86c-.7.19-1.124.444-1.41.73-.324.325-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8m4 6.397c.697.07 1.522.103 2.5.103 1.613 0 2.806-.088 3.704-.288.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5c-.978 0-1.803.033-2.5.103zM0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8m7-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/>
  </symbol>
</svg>`;
function arePrePropertiesEqual(propsA, propsB) {
  if (propsA == null || propsB == null) return propsA === propsB;
  return areCustomPropertiesEqual(propsA.customProperties, propsB.customProperties) && propsA.type === propsB.type && propsA.diffIndicators === propsB.diffIndicators && propsA.disableBackground === propsB.disableBackground && propsA.disableLineNumbers === propsB.disableLineNumbers && propsA.overflow === propsB.overflow && propsA.split === propsB.split && propsA.totalLines === propsB.totalLines;
}
const EMPTY_CUSTOM_PROPERTIES = {};
function areCustomPropertiesEqual(customPropertiesA = EMPTY_CUSTOM_PROPERTIES, customPropertiesB = EMPTY_CUSTOM_PROPERTIES) {
  if (customPropertiesA === customPropertiesB) return true;
  const keysA = Object.keys(customPropertiesA);
  const keysB = Object.keys(customPropertiesB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) if (customPropertiesA[key] !== customPropertiesB[key]) return false;
  return true;
}
function createAnnotationWrapperNode(slot) {
  const wrapper = document.createElement("div");
  wrapper.dataset.annotationSlot = "";
  wrapper.slot = slot;
  wrapper.style.whiteSpace = "normal";
  return wrapper;
}
function createGutterUtilityContentNode() {
  const gutterUtilityContent = document.createElement("div");
  gutterUtilityContent.slot = "gutter-utility-slot";
  gutterUtilityContent.style.position = "absolute";
  gutterUtilityContent.style.top = "0";
  gutterUtilityContent.style.bottom = "0";
  gutterUtilityContent.style.textAlign = "center";
  gutterUtilityContent.style.whiteSpace = "normal";
  gutterUtilityContent.style.touchAction = "none";
  return gutterUtilityContent;
}
function createUnsafeCSSStyleNode() {
  const node = document.createElement("style");
  node.setAttribute(UNSAFE_CSS_ATTRIBUTE, "");
  return node;
}
var style_default = '@layer base {\n  :host {\n    --diffs-font-fallback: "SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono",\n      "Courier New", monospace;\n    --diffs-header-font-fallback: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",\n      "Noto Sans", "Liberation Sans", Arial, sans-serif;\n    --diffs-mixer: light-dark(#000, #fff);\n    --diffs-gap-fallback: 8px;\n    --diffs-scrollbar-gutter-fallback: 6px;\n    --diffs-scrollbar-gutter: var(--diffs-scrollbar-gutter-override, var(--diffs-scrollbar-gutter-measured, var(--diffs-scrollbar-gutter-fallback)));\n    --diffs-added-light: #0dbe4e;\n    --diffs-added-dark: #5ecc71;\n    --diffs-modified-light: #009fff;\n    --diffs-modified-dark: #69b1ff;\n    --diffs-deleted-light: #ff2e3f;\n    --diffs-deleted-dark: #ff6762;\n    --diffs-warning-light: #d5a910;\n    --diffs-warning-dark: #ffd452;\n    color-scheme: light dark;\n    font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));\n    font-size: var(--diffs-font-size, 13px);\n    line-height: var(--diffs-line-height, 20px);\n    font-feature-settings: var(--diffs-font-features);\n    --diffs-bg: light-dark(var(--diffs-light-bg, #fff), var(--diffs-dark-bg, #000));\n    --diffs-bg-buffer: var(--diffs-bg-buffer-override, light-dark(color-mix(in lab, var(--diffs-bg) 92%, var(--diffs-mixer)), color-mix(in lab, var(--diffs-bg) 92%, var(--diffs-mixer))));\n    --diffs-bg-context: var(--diffs-bg-context-override, light-dark(color-mix(in lab, var(--diffs-bg) 98.5%, var(--diffs-mixer)), color-mix(in lab, var(--diffs-bg) 92.5%, var(--diffs-mixer))));\n    --diffs-bg-context-gutter: var(--diffs-bg-context-gutter-override, light-dark(color-mix(in lab, var(--diffs-bg-context) 90%, var(--diffs-bg)), color-mix(in lab, var(--diffs-bg-context) 45%, var(--diffs-bg))));\n    --diffs-bg-separator: var(--diffs-bg-separator-override, light-dark(color-mix(in lab, var(--diffs-bg) 96%, var(--diffs-mixer)), color-mix(in lab, var(--diffs-bg) 85%, var(--diffs-mixer))));\n    --diffs-fg: light-dark(var(--diffs-light, #000), var(--diffs-dark, #fff));\n    --diffs-fg-number: var(--diffs-fg-number-override, light-dark(color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg)), color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg))));\n    --diffs-fg-conflict-marker: var(--diffs-fg-conflict-marker-override, var(--diffs-fg-number));\n    --diffs-deletion-base: var(--diffs-deletion-color-override, light-dark(var(--diffs-light-deletion-color, var(--diffs-deletion-color, var(--diffs-deleted-light))), var(--diffs-dark-deletion-color, var(--diffs-deletion-color, var(--diffs-deleted-dark)))));\n    --diffs-addition-base: var(--diffs-addition-color-override, light-dark(var(--diffs-light-addition-color, var(--diffs-addition-color, var(--diffs-added-light))), var(--diffs-dark-addition-color, var(--diffs-addition-color, var(--diffs-added-dark)))));\n    --diffs-modified-base: var(--diffs-modified-color-override, light-dark(var(--diffs-light-modified-color, var(--diffs-modified-color, var(--diffs-modified-light))), var(--diffs-dark-modified-color, var(--diffs-modified-color, var(--diffs-modified-dark)))));\n    --diffs-bg-deletion: var(--diffs-bg-deletion-override, light-dark(color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-deletion-base)), color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-deletion-base))));\n    --diffs-bg-deletion-emphasis: var(--diffs-bg-deletion-emphasis-override, light-dark(rgb(from var(--diffs-deletion-base) r g b / .15), rgb(from var(--diffs-deletion-base) r g b / .2)));\n    --diffs-bg-addition: var(--diffs-bg-addition-override, light-dark(color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-addition-base)), color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-addition-base))));\n    --diffs-bg-addition-emphasis: var(--diffs-bg-addition-emphasis-override, light-dark(rgb(from var(--diffs-addition-base) r g b / .15), rgb(from var(--diffs-addition-base) r g b / .2)));\n    --diffs-selection-base: var(--diffs-modified-base);\n    --diffs-selection-number-fg: light-dark(color-mix(in lab, var(--diffs-selection-base) 65%, var(--diffs-mixer)), color-mix(in lab, var(--diffs-selection-base) 75%, var(--diffs-mixer)));\n    background-color: var(--diffs-bg);\n    color: var(--diffs-fg);\n    display: block;\n  }\n\n  pre, code, [data-error-wrapper] {\n    isolation: isolate;\n    font-family: var(--diffs-font-family, var(--diffs-font-fallback));\n    outline: none;\n    margin: 0;\n    padding: 0;\n    display: block;\n  }\n\n  pre, code {\n    background-color: var(--diffs-bg);\n  }\n\n  code {\n    contain: content;\n  }\n\n  input, button {\n    font-family: inherit;\n    font-size: inherit;\n    line-height: inherit;\n  }\n\n  *, :before, :after {\n    box-sizing: border-box;\n  }\n\n  [data-icon-sprite] {\n    display: none;\n  }\n\n  [data-diffs-header], [data-separator] {\n    font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));\n  }\n\n  [data-diffs-header][data-sticky] {\n    z-index: 1;\n    background-color: var(--diffs-bg);\n    position: sticky;\n    top: 0;\n  }\n\n  [data-file-info] {\n    color: var(--fg);\n    background-color: color-mix(in lab, var(--bg) 98%, var(--fg));\n    border-block: 1px solid color-mix(in lab, var(--bg) 95%, var(--fg));\n    padding: 10px;\n    font-weight: 700;\n  }\n\n  [data-diff], [data-file] {\n    --diffs-grid-number-column-width: minmax(min-content, max-content);\n    --diffs-code-grid: var(--diffs-grid-number-column-width) 1fr;\n\n    &[data-dehydrated] {\n      --diffs-code-grid: var(--diffs-grid-number-column-width) minmax(0, 1fr);\n    }\n\n    &:hover [data-code]::-webkit-scrollbar-thumb {\n      background-color: var(--diffs-bg-context);\n    }\n  }\n\n  @supports (-webkit-touch-callout: none) {\n    :host {\n      --diffs-scrollbar-gutter-fallback: 0px;\n    }\n  }\n\n  [data-line] span, [data-edit-prediction-suffix] span {\n    color: light-dark(var(--diffs-token-light, var(--diffs-light)), var(--diffs-token-dark, var(--diffs-dark)));\n    background-color: light-dark(var(--diffs-token-light-bg, inherit), var(--diffs-token-dark-bg, inherit));\n    font-weight: light-dark(var(--diffs-token-light-font-weight, inherit), var(--diffs-token-dark-font-weight, inherit));\n    font-style: light-dark(var(--diffs-token-light-font-style, inherit), var(--diffs-token-dark-font-style, inherit));\n    text-decoration: light-dark(var(--diffs-token-light-text-decoration, inherit), var(--diffs-token-dark-text-decoration, inherit));\n  }\n\n  [data-line], [data-gutter-buffer], [data-column-number], [data-line-annotation], [data-no-newline], [data-merge-conflict], [data-merge-conflict-actions], [data-editor-overlay] {\n    --diffs-computed-decoration-bg: var(--diffs-bg);\n    --diffs-computed-diff-line-bg: var(--diffs-computed-decoration-bg);\n    --diffs-computed-selected-line-bg: var(--diffs-computed-diff-line-bg);\n    --diffs-computed-editor-active-line-bg: var(--diffs-computed-selected-line-bg);\n    --diffs-computed-hovered-line-bg: var(--diffs-computed-editor-active-line-bg);\n    --diffs-hover-mix-target: var(--diffs-bg-hover-override, var(--diffs-mixer));\n    --diffs-line-bg: var(--diffs-computed-hovered-line-bg);\n    color: var(--diffs-fg);\n    background-color: var(--diffs-line-bg, var(--diffs-bg));\n  }\n\n  [data-line], [data-no-newline] {\n    &[data-decoration-bg] {\n      --mix-deco-light: 92%;\n      --mix-deco-dark: 85%;\n\n      &[data-decoration-bg-depth="2"] {\n        --mix-deco-light: 88%;\n        --mix-deco-dark: 80%;\n      }\n\n      &[data-decoration-bg-depth="3"] {\n        --mix-deco-light: 85%;\n        --mix-deco-dark: 78%;\n      }\n\n      --diffs-hover-mix-target: var(--diffs-decoration-bg);\n      --diffs-computed-decoration-bg: light-dark(color-mix(in lab,\n          var(--diffs-bg) var(--mix-deco-light),\n          var(--diffs-decoration-bg)), color-mix(in lab,\n          var(--diffs-bg) var(--mix-deco-dark),\n          var(--diffs-decoration-bg)));\n    }\n  }\n\n  [data-line-annotation], [data-gutter-buffer="annotation"] {\n    --diffs-annotation-bg: var(--diffs-bg-context);\n    --diffs-computed-decoration-bg: var(--diffs-annotation-bg);\n    --diffs-hover-mix-target: var(--diffs-computed-editor-active-line-bg);\n  }\n\n  [data-merge-conflict-actions], [data-gutter-buffer="merge-conflict-action"], [data-gutter-buffer="merge-conflict-marker-base"], [data-gutter-buffer="merge-conflict-marker-separator"], [data-merge-conflict="marker-base"], [data-merge-conflict="marker-separator"] {\n    --diffs-computed-decoration-bg: var(--diffs-bg-context);\n    --diffs-hover-mix-target: var(--diffs-computed-editor-active-line-bg);\n  }\n\n  [data-gutter-buffer="merge-conflict-marker-start"], [data-merge-conflict="marker-start"] {\n    --diffs-computed-decoration-bg: light-dark(color-mix(in lab,\n        var(--diffs-bg) 78%,\n        var(--conflict-bg-current-header-override, var(--diffs-addition-base))), color-mix(in lab,\n        var(--diffs-bg) 68%,\n        var(--conflict-bg-current-header-override, var(--diffs-addition-base))));\n    --diffs-hover-mix-target: var(--diffs-computed-editor-active-line-bg);\n  }\n\n  [data-gutter-buffer="merge-conflict-marker-end"], [data-merge-conflict="marker-end"] {\n    --diffs-computed-decoration-bg: light-dark(color-mix(in lab,\n        var(--diffs-bg) 78%,\n        var(--conflict-bg-incoming-header-override, var(--diffs-modified-base))), color-mix(in lab,\n        var(--diffs-bg) 68%,\n        var(--conflict-bg-incoming-header-override, var(--diffs-modified-base))));\n    --diffs-hover-mix-target: var(--diffs-computed-editor-active-line-bg);\n  }\n\n  [data-has-merge-conflict] [data-line-annotation], [data-has-merge-conflict] [data-gutter-buffer="annotation"] {\n    --diffs-computed-decoration-bg: var(--diffs-bg);\n    --diffs-hover-mix-target: var(--diffs-computed-editor-active-line-bg);\n  }\n\n  :where([data-background]) {\n    & [data-gutter-buffer], & [data-column-number] {\n      --mix-light: 91%;\n      --mix-dark: 85%;\n    }\n\n    & [data-line], & [data-no-newline] {\n      --mix-light: 88%;\n      --mix-dark: 80%;\n    }\n\n    & [data-gutter-buffer], & [data-column-number], & [data-line], & [data-no-newline] {\n      --diffs-diff-line-mix-target: var(--diffs-bg);\n\n      &[data-line-type="change-deletion"] {\n        --diffs-diff-line-mix-target: var(--diffs-bg-deletion-override, var(--diffs-deletion-base));\n        --diffs-hover-mix-target: var(--diffs-diff-line-mix-target);\n\n        &:where([data-gutter-buffer], [data-column-number]) {\n          color: var(--diffs-fg-number-deletion-override, var(--diffs-deletion-base));\n          --diffs-diff-line-mix-target: var(--diffs-bg-deletion-number-override, var(--diffs-deletion-base));\n        }\n\n        --diffs-computed-diff-line-bg: light-dark(color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-light),\n            var(--diffs-diff-line-mix-target)), color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-dark),\n            var(--diffs-diff-line-mix-target)));\n      }\n\n      &[data-line-type="change-addition"] {\n        --diffs-diff-line-mix-target: var(--diffs-bg-addition-override, var(--diffs-addition-base));\n        --diffs-hover-mix-target: var(--diffs-diff-line-mix-target);\n\n        &:where([data-gutter-buffer], [data-column-number]) {\n          color: var(--diffs-fg-number-addition-override, var(--diffs-addition-base));\n          --diffs-diff-line-mix-target: var(--diffs-bg-addition-number-override, var(--diffs-addition-base));\n        }\n\n        --diffs-computed-diff-line-bg: light-dark(color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-light),\n            var(--diffs-diff-line-mix-target)), color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-dark),\n            var(--diffs-diff-line-mix-target)));\n      }\n\n      &[data-merge-conflict="current"] {\n        --diffs-diff-line-mix-target: var(--conflict-bg-current-override, var(--diffs-addition-base));\n        --diffs-hover-mix-target: var(--diffs-diff-line-mix-target);\n\n        &:where([data-gutter-buffer], [data-column-number]) {\n          color: var(--diffs-fg-number-addition-override, var(--diffs-addition-base));\n          --diffs-diff-line-mix-target: var(--conflict-bg-current-number-override, var(--diffs-addition-base));\n        }\n\n        --diffs-computed-diff-line-bg: light-dark(color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-light),\n            var(--diffs-diff-line-mix-target)), color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-dark),\n            var(--diffs-diff-line-mix-target)));\n      }\n\n      &[data-merge-conflict="incoming"] {\n        --diffs-diff-line-mix-target: var(--conflict-bg-incoming-override, var(--diffs-modified-base));\n        --diffs-hover-mix-target: var(--diffs-diff-line-mix-target);\n\n        &:where([data-gutter-buffer], [data-column-number]) {\n          color: var(--diffs-modified-base);\n          --diffs-diff-line-mix-target: var(--conflict-bg-incoming-number-override, var(--diffs-modified-base));\n        }\n\n        --diffs-computed-diff-line-bg: light-dark(color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-light),\n            var(--diffs-diff-line-mix-target)), color-mix(in lab,\n            var(--diffs-computed-decoration-bg) var(--mix-dark),\n            var(--diffs-diff-line-mix-target)));\n      }\n    }\n  }\n\n  [data-gutter-buffer], [data-column-number], [data-line], [data-line-annotation], [data-merge-conflict], [data-merge-conflict-actions], [data-no-newline], [data-editor-overlay] {\n    --diffs-selection-mix-target: var(--diffs-bg-selection-override, var(--diffs-selection-base));\n    --diffs-selection-emphasis-mix-target: var(--diffs-selection-mix-target);\n\n    &:where([data-editor-overlay]), &:where([data-line], [data-line-annotation], [data-merge-conflict], [data-merge-conflict-actions], [data-no-newline])[data-selected-line] {\n      --mix-selection-light: 82%;\n      --mix-selection-dark: 75%;\n      --diffs-hover-mix-target: var(--diffs-selection-mix-target);\n    }\n\n    &:where([data-gutter-buffer][data-selected-line], [data-column-number]:is([data-selected-line], [data-editor-active-line])) {\n      --mix-selection-light: 75%;\n      --mix-selection-dark: 60%;\n      --diffs-selection-mix-target: var(--diffs-bg-selection-number-override, var(--diffs-selection-base));\n      --diffs-hover-mix-target: var(--diffs-selection-mix-target);\n    }\n\n    &:where([data-line][data-selected-line]):is([data-line-type="change-addition"], [data-line-type="change-deletion"]) {\n      --diffs-selection-emphasis-mix-target: light-dark(color-mix(in lab,\n          var(--diffs-diff-line-mix-target, var(--diffs-selection-mix-target))\n            var(--mix-selection-light),\n          var(--diffs-selection-mix-target)), var(--diffs-selection-mix-target));\n    }\n\n    &:where([data-editor-overlay]), &[data-selected-line] {\n      --diffs-computed-selected-line-bg: light-dark(color-mix(in lab,\n          var(--diffs-computed-diff-line-bg) var(--mix-selection-light),\n          var(--diffs-selection-mix-target)), color-mix(in lab,\n          var(--diffs-computed-diff-line-bg) var(--mix-selection-dark),\n          var(--diffs-selection-mix-target)));\n    }\n  }\n\n  [data-line][data-editor-active-line], [data-column-number][data-editor-active-line] {\n    --diffs-computed-editor-active-line-bg: color-mix(in lab,\n      var(--diffs-computed-selected-line-bg)\n        var(--diffs-editor-active-line-source-mix, 100%),\n      var(--diffs-selection-emphasis-mix-target));\n  }\n\n  @media (pointer: fine) {\n    [data-line][data-hovered], [data-gutter-buffer][data-hovered], [data-column-number][data-hovered], [data-line-annotation][data-hovered], [data-no-newline][data-hovered], [data-merge-conflict][data-hovered], [data-merge-conflict-actions][data-hovered], [data-editor-overlay][data-hovered] {\n      --diffs-computed-hovered-line-bg: light-dark(color-mix(in lab,\n          var(--diffs-computed-editor-active-line-bg) 97%,\n          var(--diffs-hover-mix-target)), color-mix(in lab,\n          var(--diffs-computed-editor-active-line-bg) 91%,\n          var(--diffs-hover-mix-target)));\n    }\n  }\n\n  [data-gutter-buffer][data-selected-line], [data-column-number]:is([data-selected-line], [data-editor-active-line]) {\n    color: var(--diffs-selection-number-fg);\n  }\n\n  [data-no-newline] {\n    user-select: none;\n\n    & span {\n      opacity: .6;\n    }\n  }\n\n  [data-diff-type="split"][data-overflow="scroll"] {\n    grid-template-columns: 1fr 1fr;\n    display: grid;\n\n    & [data-additions] {\n      border-left: 1px solid var(--diffs-bg);\n    }\n\n    & [data-deletions] {\n      border-right: 1px solid var(--diffs-bg);\n    }\n  }\n\n  [data-code] {\n    grid-auto-flow: dense;\n    grid-template-columns: var(--diffs-code-grid);\n    overflow: var(--diffs-overflow-override, scroll) clip;\n    overscroll-behavior-x: none;\n    tab-size: var(--diffs-tab-size, 2);\n    padding-top: var(--diffs-gap-block, var(--diffs-gap-fallback));\n    padding-bottom: max(0px,\n      calc(var(--diffs-gap-block, var(--diffs-gap-fallback)) -\n          var(--diffs-scrollbar-gutter)));\n    scrollbar-gutter: stable;\n    align-self: flex-start;\n    display: grid;\n  }\n\n  [data-diffs-scrollbar-measure] {\n    opacity: 0;\n    pointer-events: none;\n    scrollbar-gutter: auto;\n    grid-template-columns: none;\n    width: 100px;\n    height: 100px;\n    padding: 0;\n    position: absolute;\n    top: -200px;\n    left: -200px;\n  }\n\n  [data-container-size] {\n    container-type: inline-size;\n  }\n\n  [data-code]::-webkit-scrollbar {\n    width: 0;\n    height: var(--diffs-scrollbar-gutter);\n  }\n\n  [data-code]::-webkit-scrollbar-track {\n    background: none;\n  }\n\n  [data-code]::-webkit-scrollbar-thumb {\n    background-color: #0000;\n    background-clip: content-box;\n    border: 1px solid #0000;\n    border-radius: 3px;\n  }\n\n  [data-code]::-webkit-scrollbar-corner {\n    background-color: #0000;\n  }\n\n  @supports ((-moz-appearance: none)) {\n    [data-code] {\n      scrollbar-width: thin;\n      scrollbar-color: var(--diffs-bg-context) transparent;\n      padding-bottom: var(--diffs-gap-block, var(--diffs-gap-fallback));\n    }\n  }\n\n  [data-diffs-header] ~ [data-diff], [data-diffs-header] ~ [data-file] {\n    & [data-code], &[data-overflow="wrap"], &[data-dehydrated][data-diff-type="split"][data-overflow="scroll"] {\n      padding-top: 0;\n    }\n  }\n\n  [data-gutter] {\n    grid-template-rows: subgrid;\n    grid-template-columns: subgrid;\n    z-index: 3;\n    background-color: var(--diffs-bg);\n    grid-column: 1;\n    display: grid;\n    position: relative;\n\n    & [data-gutter-buffer], & [data-column-number] {\n      border-right: var(--diffs-gap-style, 2px solid var(--diffs-bg));\n    }\n  }\n\n  [data-content] {\n    grid-template-rows: subgrid;\n    grid-template-columns: subgrid;\n    background-color: var(--diffs-bg);\n    grid-column: 2;\n    min-width: 0;\n    display: grid;\n  }\n\n  [data-diff-type="split"][data-overflow="wrap"], [data-dehydrated][data-diff-type="split"][data-overflow="scroll"] {\n    grid-auto-flow: dense;\n    grid-template-columns: repeat(2, var(--diffs-code-grid));\n    padding-block: var(--diffs-gap-block, var(--diffs-gap-fallback));\n    display: grid;\n\n    & [data-code] {\n      display: contents;\n    }\n\n    & [data-deletions] {\n      & [data-gutter] {\n        grid-column: 1;\n      }\n\n      & [data-content] {\n        border-right: 1px solid var(--diffs-bg);\n        grid-column: 2;\n      }\n    }\n\n    & [data-additions] {\n      & [data-gutter] {\n        border-left: 1px solid var(--diffs-bg);\n        grid-column: 3;\n      }\n\n      & [data-content] {\n        grid-column: 4;\n      }\n    }\n  }\n\n  [data-dehydrated][data-diff-type="split"][data-overflow="scroll"] [data-content] {\n    overflow: clip;\n  }\n\n  [data-overflow="scroll"] [data-gutter] {\n    position: sticky;\n    left: 0;\n  }\n\n  [data-interactive-lines] [data-line] {\n    cursor: pointer;\n  }\n\n  [data-interactive-line-numbers] [data-column-number] {\n    cursor: pointer;\n    touch-action: none;\n  }\n\n  [data-content-buffer], [data-gutter-buffer] {\n    user-select: none;\n    min-height: 1lh;\n    position: relative;\n  }\n\n  [data-gutter-buffer] {\n    padding-left: 2ch;\n    padding-right: 1ch;\n\n    &:before {\n      content: "";\n      min-width: var(--diffs-min-number-column-width, var(--diffs-min-number-column-width-default, 3ch));\n      display: block;\n    }\n  }\n\n  [data-gutter-buffer="annotation"] {\n    --diffs-annotation-bg: var(--diffs-bg-context-gutter);\n    min-height: 0;\n  }\n\n  [data-gutter-buffer="buffer"] {\n    --diffs-line-bg: var(--diffs-bg-context-gutter);\n  }\n\n  [data-content-buffer] {\n    background-position: 5px 0;\n    background-size: 8px 8px;\n    background-origin: border-box;\n    background-image: repeating-linear-gradient(-45deg,\n      transparent,\n      transparent calc(3px * 1.414),\n      var(--diffs-bg-buffer) calc(3px * 1.414),\n      var(--diffs-bg-buffer) calc(4px * 1.414));\n    grid-column: 1;\n  }\n\n  [data-separator] {\n    box-sizing: content-box;\n    background-color: var(--diffs-bg);\n  }\n\n  [data-separator="simple"] {\n    min-height: 4px;\n  }\n\n  [data-separator="line-info"], [data-separator="line-info-basic"], [data-separator="metadata"], [data-separator="simple"] {\n    background-color: var(--diffs-bg-separator);\n  }\n\n  [data-separator="line-info"], [data-separator="line-info-basic"], [data-separator="metadata"] {\n    height: 32px;\n    position: relative;\n  }\n\n  [data-separator-wrapper] {\n    user-select: none;\n    fill: currentColor;\n    background-color: var(--diffs-bg);\n    align-items: center;\n    height: 100%;\n    display: flex;\n    position: absolute;\n    inset-inline: 0;\n  }\n\n  [data-content] [data-separator-wrapper] {\n    display: none;\n  }\n\n  [data-separator="metadata"] [data-separator-wrapper] {\n    background-color: var(--diffs-bg-separator);\n    height: 100%;\n    color: var(--diffs-fg-number);\n    white-space: nowrap;\n    text-overflow: ellipsis;\n    min-width: min-content;\n    padding-inline: 1ch;\n    inset-inline: 100% auto;\n    overflow: hidden;\n  }\n\n  [data-separator="line-info"] {\n    margin-block: var(--diffs-gap-block, var(--diffs-gap-fallback));\n\n    & [data-separator-wrapper] {\n      min-width: 16px;\n    }\n  }\n\n  [data-separator="line-info-basic"], [data-separator="metadata"] {\n    margin-block: 0;\n  }\n\n  [data-separator="line-info"][data-separator-first] {\n    margin-top: 0;\n  }\n\n  [data-separator="line-info"][data-separator-last] {\n    margin-bottom: 0;\n  }\n\n  [data-expand-index] [data-separator-wrapper] {\n    grid-template-columns: 32px auto;\n    display: grid;\n  }\n\n  [data-expand-index] [data-separator-wrapper][data-separator-multi-button] {\n    grid-template-columns: 32px 32px auto;\n  }\n\n  [data-expand-button], [data-separator-content] {\n    background-color: var(--diffs-bg-separator);\n    flex: none;\n    align-items: center;\n    display: flex;\n  }\n\n  [data-expand-index] [data-separator-content]:hover {\n    cursor: pointer;\n    text-decoration: underline;\n  }\n\n  [data-expand-button] {\n    cursor: pointer;\n    min-width: 32px;\n    color: var(--diffs-fg-number);\n    border-right: 2px solid var(--diffs-bg);\n    flex-shrink: 0;\n    justify-content: center;\n    align-self: stretch;\n\n    &:hover {\n      color: var(--diffs-fg);\n    }\n\n    &[data-expand-all-button] {\n      display: none;\n    }\n  }\n\n  [data-expand-down] [data-icon] {\n    transform: scaleY(-1);\n  }\n\n  [data-separator-content] {\n    height: 100%;\n    color: var(--diffs-fg-number);\n    flex: auto;\n    justify-content: flex-start;\n    padding: 0 1ch;\n    overflow: hidden;\n  }\n\n  [data-separator="line-info"], [data-separator="line-info-basic"] {\n    & [data-separator-content] {\n      user-select: none;\n      height: 100%;\n      overflow: clip;\n    }\n  }\n\n  [data-unmodified-lines] {\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    flex: 0 auto;\n    min-width: 0;\n    display: block;\n    overflow: hidden;\n  }\n\n  @supports (width: 1cqi) {\n    [data-unified] {\n      & [data-separator="line-info"] [data-separator-wrapper] {\n        padding-inline: var(--diffs-gap-inline, var(--diffs-gap-fallback));\n        width: 100cqi;\n\n        & [data-separator-content] {\n          border-radius: 6px;\n        }\n      }\n\n      & [data-separator="line-info"][data-expand-index] [data-separator-wrapper] [data-separator-content] {\n        border-top-left-radius: unset;\n        border-bottom-left-radius: unset;\n      }\n    }\n\n    [data-gutter] {\n      & [data-separator="line-info"] [data-separator-wrapper] {\n        padding-left: var(--diffs-gap-inline, var(--diffs-gap-fallback));\n      }\n\n      & [data-separator="line-info"] [data-separator-content] {\n        border-top-left-radius: 6px;\n        border-bottom-left-radius: 6px;\n      }\n\n      & [data-separator="line-info"][data-expand-index] [data-separator-content] {\n        border-top-left-radius: unset;\n        border-bottom-left-radius: unset;\n      }\n    }\n\n    [data-additions] {\n      & [data-content] [data-separator="line-info"] {\n        background-color: var(--diffs-bg);\n\n        & [data-separator-wrapper] {\n          display: none;\n        }\n      }\n\n      & [data-gutter] [data-separator="line-info"] [data-separator-wrapper] {\n        background-color: var(--diffs-bg-separator);\n        border-top-right-radius: 6px;\n        border-bottom-right-radius: 6px;\n        height: 100%;\n        display: block;\n\n        & [data-separator-content], & [data-expand-button] {\n          display: none;\n        }\n      }\n    }\n\n    [data-overflow="scroll"] [data-additions] [data-gutter] [data-separator="line-info"] [data-separator-wrapper] {\n      width: calc(100cqi - var(--diffs-gap-inline, var(--diffs-gap-fallback)));\n    }\n\n    [data-overflow="wrap"] [data-additions] [data-content] [data-separator="line-info"] [data-separator-wrapper] {\n      background-color: var(--diffs-bg-separator);\n      height: 100%;\n      margin-right: var(--diffs-gap-inline, var(--diffs-gap-fallback));\n      border-top-right-radius: 6px;\n      border-bottom-right-radius: 6px;\n      display: block;\n\n      & [data-separator-content], & [data-expand-button] {\n        display: none;\n      }\n    }\n\n    [data-separator="line-info"] [data-separator-wrapper] {\n      & [data-expand-both], & [data-expand-down], & [data-expand-up] {\n        border-top-left-radius: 6px;\n        border-bottom-left-radius: 6px;\n      }\n    }\n\n    @media (pointer: fine) {\n      [data-separator="line-info"] [data-separator-wrapper] {\n        &[data-separator-multi-button] {\n          & [data-expand-up] {\n            border-top-left-radius: 6px;\n            border-bottom-left-radius: unset;\n          }\n\n          & [data-expand-down] {\n            border-bottom-left-radius: 6px;\n            border-top-left-radius: unset;\n          }\n        }\n      }\n    }\n  }\n\n  @media (pointer: coarse) {\n    [data-separator="line-info-basic"] [data-separator-wrapper][data-separator-multi-button] {\n      grid-template-columns: 34px 34px auto;\n\n      & [data-separator-content] {\n        grid-column: unset;\n        grid-row: unset;\n      }\n    }\n\n    @supports (width: 1cqi) {\n      [data-separator="line-info"] [data-separator-wrapper] {\n        & [data-expand-both], & [data-expand-down], & [data-expand-up] {\n          border-top-left-radius: 6px;\n          border-bottom-left-radius: 6px;\n        }\n\n        &[data-separator-multi-button] {\n          & [data-expand-up] {\n            border-top-left-radius: 6px;\n            border-bottom-left-radius: 6px;\n          }\n\n          & [data-expand-down] {\n            border-bottom-left-radius: unset;\n            border-top-left-radius: unset;\n          }\n        }\n      }\n    }\n  }\n\n  @media (pointer: fine) {\n    [data-separator-wrapper][data-separator-multi-button] {\n      grid-template-rows: 50% 50%;\n      display: grid;\n\n      & [data-separator-content] {\n        grid-area: 1 / 2 / -1;\n        min-width: min-content;\n      }\n\n      & [data-expand-button] {\n        grid-column: 1;\n      }\n    }\n\n    [data-separator="line-info"] [data-separator-wrapper], [data-separator="line-info"] [data-separator-wrapper][data-separator-multi-button] {\n      grid-template-columns: 34px auto;\n    }\n\n    [data-separator="line-info-basic"][data-expand-index] [data-separator-wrapper] {\n      grid-template-columns: 100% auto;\n    }\n\n    [data-separator="line-info"], [data-separator="line-info-basic"] {\n      & [data-separator-multi-button] {\n        & [data-expand-up] {\n          border-bottom: 1px solid var(--diffs-bg);\n          border-right: 2px solid var(--diffs-bg);\n        }\n\n        & [data-expand-down] {\n          border-top: 1px solid var(--diffs-bg);\n          border-right: 2px solid var(--diffs-bg);\n        }\n      }\n    }\n  }\n\n  [data-additions] [data-gutter] [data-separator-wrapper], [data-additions] [data-separator="line-info-basic"] [data-separator-wrapper], [data-content] [data-separator-wrapper] {\n    display: none;\n  }\n\n  [data-line-annotation] {\n    min-height: var(--diffs-annotation-min-height, 0);\n    z-index: 2;\n  }\n\n  [data-merge-conflict-actions] {\n    z-index: 2;\n  }\n\n  [data-separator="custom"] {\n    grid-template-columns: subgrid;\n    display: grid;\n  }\n\n  [data-line], [data-column-number], [data-no-newline] {\n    padding-inline: 1ch;\n    position: relative;\n  }\n\n  [data-indicators="classic"] [data-line] {\n    padding-inline-start: 2ch;\n  }\n\n  [data-indicators="classic"] {\n    & [data-line-type="change-addition"], & [data-line-type="change-deletion"] {\n      &[data-no-newline], &[data-line] {\n        &:before {\n          user-select: none;\n          width: 1ch;\n          height: 1lh;\n          display: inline-block;\n          position: absolute;\n          top: 0;\n          left: 0;\n        }\n      }\n    }\n\n    & [data-line-type="change-addition"] {\n      &[data-line], &[data-no-newline] {\n        &:before {\n          content: "+";\n          color: var(--diffs-addition-base);\n        }\n      }\n    }\n\n    & [data-line-type="change-deletion"] {\n      &[data-line], &[data-no-newline] {\n        &:before {\n          content: "-";\n          color: var(--diffs-deletion-base);\n        }\n      }\n    }\n  }\n\n  [data-indicators="bars"] {\n    & [data-line-type="change-deletion"], & [data-line-type="change-addition"] {\n      &[data-column-number] {\n        &:before {\n          content: "";\n          user-select: none;\n          contain: strict;\n          width: 4px;\n          height: 100%;\n          display: block;\n          position: absolute;\n          top: 0;\n          left: 0;\n        }\n      }\n    }\n\n    & [data-line-type="change-deletion"] {\n      &[data-column-number] {\n        &:before {\n          background-image: linear-gradient(0deg,\n            var(--diffs-bg-deletion) 50%,\n            var(--diffs-deletion-base) 50%);\n          background-repeat: repeat;\n          background-size: 2px 2px;\n          background-size: calc(1lh / round(1lh / 2px))\n            calc(1lh / round(1lh / 2px));\n        }\n      }\n    }\n\n    & [data-line-type="change-addition"] {\n      &[data-column-number] {\n        &:before {\n          background-color: var(--diffs-addition-base);\n        }\n      }\n    }\n  }\n\n  [data-overflow="wrap"] {\n    & [data-line] {\n      white-space: pre-wrap;\n      word-break: break-word;\n    }\n\n    & [data-annotation-content] {\n      word-break: break-word;\n    }\n  }\n\n  [data-overflow="scroll"] [data-line] {\n    white-space: pre;\n    min-height: 1lh;\n  }\n\n  [data-column-number] {\n    box-sizing: content-box;\n    text-align: right;\n    user-select: none;\n    color: var(--diffs-fg-number);\n    padding-left: 2ch;\n  }\n\n  [data-line-number-content] {\n    min-width: var(--diffs-min-number-column-width, var(--diffs-min-number-column-width-default, 3ch));\n    z-index: 1;\n    display: inline-block;\n    position: relative;\n  }\n\n  [data-disable-line-numbers] {\n    & [data-gutter-buffer], & [data-column-number] {\n      min-width: 4px;\n      padding: 0;\n\n      &:before {\n        min-width: 0;\n      }\n    }\n\n    & [data-line-number-content] {\n      display: none;\n    }\n\n    & [data-gutter-utility-slot] {\n      right: unset;\n      justify-content: flex-start;\n      left: 0;\n    }\n\n    &[data-indicators="bars"] [data-gutter-utility-slot] {\n      left: 6px;\n    }\n  }\n\n  [data-file][data-disable-line-numbers] {\n    & [data-gutter-buffer], & [data-column-number] {\n      border-right: 0;\n      min-width: 0;\n    }\n  }\n\n  [data-diff-span] {\n    box-decoration-break: clone;\n    border-radius: 3px;\n  }\n\n  [data-line-type="change-addition"] [data-diff-span] {\n    background-color: var(--diffs-bg-addition-emphasis);\n  }\n\n  [data-line-type="change-deletion"] [data-diff-span] {\n    background-color: var(--diffs-bg-deletion-emphasis);\n  }\n\n  [data-merge-conflict="marker-start"], [data-merge-conflict="marker-base"], [data-merge-conflict="marker-separator"], [data-merge-conflict="marker-end"] {\n    color: var(--diffs-fg);\n    padding-left: 1ch;\n  }\n\n  [data-merge-conflict="marker-start"], [data-merge-conflict="marker-end"] {\n    align-items: center;\n    display: flex;\n\n    &:after {\n      color: var(--diffs-fg-conflict-marker);\n      font-size: .75rem;\n      font-style: normal;\n      line-height: 1.25rem;\n      font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));\n      padding-left: 1ch;\n    }\n  }\n\n  [data-merge-conflict="marker-start"]:after {\n    content: "(Current Change)";\n  }\n\n  [data-merge-conflict="marker-end"]:after {\n    content: "(Incoming Change)";\n  }\n\n  [data-merge-conflict-actions-content] {\n    min-height: 1.75rem;\n    font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));\n    color: var(--diffs-fg);\n    align-items: center;\n    gap: .25rem;\n    padding-inline: .5rem;\n    font-size: .75rem;\n    line-height: 1.2;\n    display: flex;\n  }\n\n  [data-merge-conflict-action] {\n    appearance: none;\n    color: var(--diffs-fg-number);\n    font: inherit;\n    cursor: pointer;\n    background: none;\n    border: 0;\n    padding: 0;\n    font-style: normal;\n  }\n\n  [data-merge-conflict-action]:hover {\n    color: var(--diffs-fg);\n  }\n\n  [data-merge-conflict-action="current"]:hover {\n    color: var(--diffs-addition-base);\n  }\n\n  [data-merge-conflict-action="incoming"]:hover {\n    color: var(--diffs-modified-base);\n  }\n\n  [data-merge-conflict-action-separator] {\n    color: var(--diffs-fg-number);\n    opacity: .6;\n    user-select: none;\n  }\n\n  [data-diffs-header="default"] {\n    background-color: var(--diffs-bg);\n    justify-content: space-between;\n    align-items: center;\n    gap: var(--diffs-gap-inline, var(--diffs-gap-fallback));\n    min-height: calc(1lh + (var(--diffs-gap-block, var(--diffs-gap-fallback)) * 3));\n    z-index: 2;\n    flex-direction: row;\n    padding-inline: 16px;\n    display: flex;\n    position: relative;\n    top: 0;\n  }\n\n  [data-header-content] {\n    align-items: center;\n    gap: var(--diffs-gap-inline, var(--diffs-gap-fallback));\n    white-space: nowrap;\n    flex-direction: row;\n    min-width: 0;\n    display: flex;\n  }\n\n  [data-header-content] [data-prev-name], [data-header-content] [data-title] {\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    direction: rtl;\n    min-width: 0;\n    overflow: hidden;\n  }\n\n  [data-prev-name] {\n    opacity: .7;\n  }\n\n  [data-rename-icon] {\n    fill: currentColor;\n    flex-grow: 0;\n    flex-shrink: 0;\n  }\n\n  [data-diffs-header="default"] [data-metadata] {\n    white-space: nowrap;\n    align-items: center;\n    gap: 1ch;\n    display: flex;\n  }\n\n  [data-diffs-header="default"] [data-additions-count] {\n    font-family: var(--diffs-font-family, var(--diffs-font-fallback));\n    color: var(--diffs-addition-base);\n  }\n\n  [data-diffs-header="default"] [data-deletions-count] {\n    font-family: var(--diffs-font-family, var(--diffs-font-fallback));\n    color: var(--diffs-deletion-base);\n  }\n\n  [data-change-icon] {\n    fill: currentColor;\n    flex-shrink: 0;\n  }\n\n  [data-change-icon="change"], [data-change-icon="rename-pure"], [data-change-icon="rename-changed"] {\n    color: var(--diffs-modified-base);\n  }\n\n  [data-change-icon="new"] {\n    color: var(--diffs-addition-base);\n  }\n\n  [data-change-icon="deleted"] {\n    color: var(--diffs-deletion-base);\n  }\n\n  [data-change-icon="file"] {\n    opacity: .6;\n  }\n\n  [data-annotation-content] {\n    z-index: 2;\n    isolation: isolate;\n    white-space: normal;\n    align-self: flex-start;\n    min-width: 0;\n    display: flow-root;\n    position: relative;\n  }\n\n  [data-overflow="scroll"] [data-annotation-content], [data-overflow="scroll"] [data-merge-conflict-actions-content] {\n    width: var(--diffs-column-content-width, auto);\n    left: var(--diffs-column-number-width, 0);\n    position: sticky;\n  }\n\n  [data-annotation-slot] {\n    text-wrap-mode: wrap;\n    word-break: normal;\n    white-space-collapse: collapse;\n  }\n\n  [data-gutter-utility-slot] {\n    touch-action: none;\n    justify-content: flex-end;\n    display: flex;\n    position: absolute;\n    top: 0;\n    bottom: 0;\n    right: 0;\n  }\n\n  [data-utility-button] {\n    appearance: none;\n    cursor: pointer;\n    width: 1lh;\n    height: 1lh;\n    font-size: var(--diffs-font-size, 13px);\n    line-height: var(--diffs-line-height, 20px);\n    background-color: var(--diffs-modified-base);\n    color: var(--diffs-bg);\n    fill: currentColor;\n    z-index: 4;\n    touch-action: none;\n    border: none;\n    border-radius: 4px;\n    justify-content: center;\n    align-items: center;\n    margin-right: calc(-1lh + 1ch);\n    padding: 0;\n    display: flex;\n    position: relative;\n\n    &:before {\n      content: "";\n      display: block;\n      position: absolute;\n      inset: 0 0 0 -4px;\n    }\n  }\n\n  [data-decoration-bar-stack] {\n    pointer-events: none;\n    isolation: isolate;\n    z-index: 1;\n    background-color: var(--diffs-decoration-bar-color, transparent);\n    box-sizing: content-box;\n    border-left: 2px solid var(--diffs-bg);\n    border-right: 2px solid var(--diffs-bg);\n    width: 6px;\n    position: absolute;\n    top: 0;\n    bottom: 0;\n    right: -2px;\n\n    [data-decoration-bar-depth="1"] & {\n      background-color: color-mix(in lab,\n        var(--diffs-bg) 20%,\n        var(--diffs-decoration-bar-color, transparent));\n    }\n\n    [data-decoration-bar-depth="2"] & {\n      background-color: color-mix(in lab,\n        var(--diffs-bg) 45%,\n        var(--diffs-decoration-bar-color, transparent));\n    }\n\n    [data-decoration-bar-depth="3"] & {\n      background-color: color-mix(in lab,\n        var(--diffs-bg) 65%,\n        var(--diffs-decoration-bar-color, transparent));\n    }\n\n    [data-decoration-bar-start] & {\n      border-top-left-radius: 5px;\n      border-top-right-radius: 5px;\n    }\n\n    [data-decoration-bar-end] & {\n      z-index: 3;\n      border-bottom-right-radius: 5px;\n      border-bottom-left-radius: 5px;\n    }\n  }\n\n  [data-placeholder] {\n    contain: strict;\n  }\n\n  [data-error-wrapper] {\n    padding: var(--diffs-gap-block, var(--diffs-gap-fallback))\n      var(--diffs-gap-inline, var(--diffs-gap-fallback));\n    scrollbar-width: none;\n    max-height: 400px;\n    overflow: auto;\n\n    & [data-error-message] {\n      color: var(--diffs-deletion-base);\n      font-size: 18px;\n      font-weight: bold;\n    }\n\n    & [data-error-stack] {\n      color: var(--diffs-fg-number);\n    }\n  }\n}\n\n@layer theme, rendered, unsafe;\n';
let measuredScrollbarGutter;
function getMeasuredScrollbarGutter(shadowRoot) {
  if (measuredScrollbarGutter != null) return measuredScrollbarGutter;
  const host = shadowRoot.host;
  if (typeof HTMLElement !== "undefined" && host instanceof HTMLElement && !host.isConnected) return;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-code", "");
  wrapper.setAttribute(DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE, "true");
  const child = document.createElement("div");
  child.style.position = "relative";
  child.style.width = "200%";
  child.style.height = "200%";
  wrapper.appendChild(child);
  shadowRoot.appendChild(wrapper);
  measuredScrollbarGutter = Math.max(wrapper.offsetHeight - wrapper.clientHeight, 0);
  wrapper.remove();
  return measuredScrollbarGutter;
}
function createMeasuredScrollbarGutterDeclaration(scrollbarGutter) {
  const value = scrollbarGutter == null ? "var(--diffs-scrollbar-gutter-fallback)" : `${scrollbarGutter}px`;
  return `${DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY}: ${value};`;
}
const LAYER_ORDER = `@layer base, theme, rendered, unsafe;`;
const SCROLLBAR_GUTTER_DECLARATION_PATTERN = new RegExp(`${escapeRegExp(DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY)}\\s*:\\s*[^;]+;`);
function wrapUnsafeCSS(unsafeCSS) {
  return `${LAYER_ORDER}
@layer unsafe {
  ${unsafeCSS}
}`;
}
function wrapThemeCSS(themeCSS, themeType = "system", scrollbarGutter) {
  const colorSchemeRule = themeType === "system" ? "" : `
  color-scheme: ${themeType};`;
  const scrollbarGutterVar = createMeasuredScrollbarGutterDeclaration(scrollbarGutter);
  return `${LAYER_ORDER}
@layer rendered {
  :host {${colorSchemeRule}
  ${scrollbarGutterVar}
  ${themeCSS}
  }
}`;
}
function patchScrollbarGutterSize(themeCSS, scrollbarGutter) {
  const scrollbarGutterRule = createMeasuredScrollbarGutterDeclaration(scrollbarGutter);
  return themeCSS.replace(SCROLLBAR_GUTTER_DECLARATION_PATTERN, scrollbarGutterRule);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const lineAnnotationSources = /* @__PURE__ */ new WeakMap();
function getLineAnnotationSource(annotation) {
  const source = lineAnnotationSources.get(annotation);
  return source == null ? annotation : source;
}
function getOrCreateCodeNode({ code, pre, columnType, rowSpan, containerSize = false } = {}) {
  if (code == null) {
    code = document.createElement("code");
    code.setAttribute("data-code", "");
    if (columnType != null) code.setAttribute(`data-${columnType}`, "");
    pre == null ? void 0 : pre.appendChild(code);
  }
  if (rowSpan != null) code.style.setProperty("grid-row", `span ${rowSpan}`);
  else code.style.removeProperty("grid-row");
  if (containerSize) code.setAttribute("data-container-size", "");
  else code.removeAttribute("data-container-size");
  return code;
}
function prerenderHTMLIfNecessary(element, html) {
  if (html == null) return;
  const shadowRoot = element.shadowRoot ?? element.attachShadow({ mode: "open" });
  if (shadowRoot.innerHTML === "") shadowRoot.innerHTML = html;
}
function setPreNodeProperties(pre, { type, diffIndicators, disableBackground, disableLineNumbers, overflow, split, totalLines, customProperties }) {
  if (customProperties != null) for (const key in customProperties) {
    const value = customProperties[key];
    if (value != null) pre.setAttribute(key, `${value}`);
  }
  if (type === "diff") {
    pre.setAttribute("data-diff", "");
    pre.removeAttribute("data-file");
  } else {
    pre.setAttribute("data-file", "");
    pre.removeAttribute("data-diff");
  }
  switch (diffIndicators) {
    case "bars":
    case "classic":
      pre.setAttribute("data-indicators", diffIndicators);
      break;
    case "none":
      pre.removeAttribute("data-indicators");
  }
  if (disableLineNumbers) pre.setAttribute("data-disable-line-numbers", "");
  else pre.removeAttribute("data-disable-line-numbers");
  if (disableBackground) pre.removeAttribute("data-background");
  else pre.setAttribute("data-background", "");
  if (type === "diff") pre.setAttribute("data-diff-type", split ? "split" : "single");
  else pre.removeAttribute("data-diff-type");
  pre.setAttribute("data-overflow", overflow);
  pre.style.setProperty("--diffs-min-number-column-width-default", `${`${totalLines}`.length}ch`);
  return pre;
}
function isStyleNode(element) {
  if (typeof HTMLStyleElement !== "undefined" && element instanceof HTMLStyleElement) return true;
  const tagName = element.tagName ?? element.nodeName;
  return typeof tagName === "string" && tagName.toLowerCase() === "style";
}
function adoptEditSessionAnnotations(annotations, getName, previousSession) {
  const slotNames = /* @__PURE__ */ new Map();
  for (const annotation of annotations) {
    const source = getLineAnnotationSource(annotation);
    slotNames.set(source, (previousSession == null ? void 0 : previousSession.slotNames.get(source)) ?? getName(annotation));
  }
  return {
    provided: annotations,
    current: annotations,
    slotNames
  };
}
function writeEditSessionAnnotations(session, annotations, getName) {
  for (const annotation of annotations) {
    const source = getLineAnnotationSource(annotation);
    if (!session.slotNames.has(source)) session.slotNames.set(source, getName(annotation));
  }
  session.provided = annotations;
  session.current = annotations;
}
function resolveEditSessionSlotName(session, annotation, getName) {
  if (session == null) return getName(annotation);
  const source = getLineAnnotationSource(annotation);
  let name = session.slotNames.get(source);
  if (name == null) {
    name = getName(annotation);
    session.slotNames.set(source, name);
  }
  return name;
}
function shouldUseTokenTransformer(options) {
  return (options == null ? void 0 : options.useTokenTransformer) === true || (options == null ? void 0 : options.onTokenClick) != null || (options == null ? void 0 : options.onTokenEnter) != null || (options == null ? void 0 : options.onTokenLeave) != null;
}
function guardWebKitScrollDuringRebuild(pre, rebuild) {
  const height = (pre == null ? void 0 : pre.offsetHeight) ?? 0;
  if (pre == null || height === 0) {
    rebuild();
    return;
  }
  pre.style.minHeight = `${height}px`;
  try {
    rebuild();
    pre.offsetHeight;
  } finally {
    pre.style.minHeight = "";
  }
}
function upsertHostThemeStyle({ shadowRoot, currentNode, themeCSS }) {
  if (themeCSS.trim() === "") {
    currentNode == null ? void 0 : currentNode.remove();
    return;
  }
  currentNode ?? (currentNode = createHostThemeStyleNode());
  currentNode.textContent = themeCSS;
  if (currentNode.parentNode !== shadowRoot) shadowRoot.appendChild(currentNode);
  return currentNode;
}
function createHostThemeStyleNode() {
  const node = document.createElement("style");
  node.setAttribute(THEME_CSS_ATTRIBUTE, "");
  return node;
}
let _isSafari = void 0;
function isSafari() {
  return _isSafari ?? (_isSafari = "safari" in window && "pushNotification" in window.safari || /^((?!chrome|android).)*safari/i.test(navigator.userAgent));
}
if (typeof HTMLElement !== "undefined" && customElements.get("diffs-container") == null) {
  let sheet;
  class FileDiffContainer extends HTMLElement {
    constructor() {
      super();
      if (this.shadowRoot != null) return;
      const shadowRoot = this.attachShadow({ mode: "open" });
      if (sheet == null) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(style_default);
      }
      shadowRoot.adoptedStyleSheets = [sheet];
    }
    connectedCallback() {
      const shadowRoot = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      getMeasuredScrollbarGutter(shadowRoot);
    }
  }
  customElements.define(DIFFS_TAG_NAME, FileDiffContainer);
}
function areDiffTargetsEqual(diffA, diffB) {
  return (diffA == null ? void 0 : diffA.cacheKey) != null || (diffB == null ? void 0 : diffB.cacheKey) != null ? (diffA == null ? void 0 : diffA.cacheKey) === (diffB == null ? void 0 : diffB.cacheKey) : diffA === diffB;
}
function areFilesEqual(fileA, fileB) {
  return (fileA == null ? void 0 : fileA.cacheKey) === (fileB == null ? void 0 : fileB.cacheKey) && (fileA == null ? void 0 : fileA.contents) === (fileB == null ? void 0 : fileB.contents) && (fileA == null ? void 0 : fileA.name) === (fileB == null ? void 0 : fileB.name) && (fileA == null ? void 0 : fileA.lang) === (fileB == null ? void 0 : fileB.lang);
}
function cloneHunks(hunks) {
  return hunks.map((hunk) => ({
    ...hunk,
    hunkContent: hunk.hunkContent.map((content) => ({ ...content }))
  }));
}
function cloneFileDiffMetadata(fileDiff) {
  return {
    ...fileDiff,
    hunks: cloneHunks(fileDiff.hunks),
    deletionLines: [...fileDiff.deletionLines],
    additionLines: [...fileDiff.additionLines]
  };
}
function getHunkSideStartBoundary(start, count) {
  return start - (count === 0 ? 0 : 1);
}
function getHunkSideEndBoundary(start, count) {
  return getHunkSideStartBoundary(start, count) + count;
}
const CACHE_KEY_VERSION = 1;
function composeCacheKey(scope, ...segments) {
  return `ck${CACHE_KEY_VERSION}:${JSON.stringify([scope, ...segments])}`;
}
function splitFileContents$1(contents) {
  return contents !== "" ? contents.split(SPLIT_WITH_NEWLINES) : [];
}
function hydratePartialDiff(type, fileDiff, files) {
  const targetFileDiff = fileDiff;
  if (!targetFileDiff.isPartial) throw new Error("hydratePartialDiff: fileDiff must be partial");
  switch (targetFileDiff.type) {
    case "change":
    case "rename-changed":
      return hydrateTwoSidedFileDiff(targetFileDiff, requireOldFile(targetFileDiff, files), requireNewFile(targetFileDiff, files));
    case "rename-pure": {
      const newFile = requireNewFile(targetFileDiff, files);
      requireMissingOldFile(targetFileDiff, files);
      const lines = splitFileContents$1(newFile.contents);
      targetFileDiff.isPartial = false;
      targetFileDiff.deletionLines = lines;
      targetFileDiff.additionLines = lines;
      setHydratedCacheKey(targetFileDiff, null, newFile);
      return targetFileDiff;
    }
  }
  throw new Error(`hydratePartialDiff: ${targetFileDiff.type} diffs cannot be hydrated from loaded files`);
}
function hydrateTwoSidedFileDiff(fileDiff, oldFile, newFile) {
  const deletionLines = splitFileContents$1(oldFile.contents);
  const additionLines = splitFileContents$1(newFile.contents);
  const { hunks, splitLineCount, unifiedLineCount } = hydrateHunks(fileDiff.hunks, additionLines.length);
  fileDiff.hunks = hunks;
  fileDiff.splitLineCount = splitLineCount;
  fileDiff.unifiedLineCount = unifiedLineCount;
  fileDiff.isPartial = false;
  fileDiff.deletionLines = deletionLines;
  fileDiff.additionLines = additionLines;
  setHydratedCacheKey(fileDiff, oldFile, newFile);
  return fileDiff;
}
function hydrateHunks(hunks, totalAdditionLines) {
  let splitLineCount = 0;
  let unifiedLineCount = 0;
  let lastHunkAdditionEnd = 0;
  const hydratedHunks = [];
  for (const hunk of hunks) {
    const additionLineIndex = Math.max(hunk.additionStart - 1, 0);
    const deletionLineIndex = Math.max(hunk.deletionStart - 1, 0);
    let contentAdditionLineIndex = additionLineIndex;
    let contentDeletionLineIndex = deletionLineIndex;
    let hunkAdditionLines = 0;
    let hunkDeletionLines = 0;
    let hunkSplitLineCount = 0;
    let hunkUnifiedLineCount = 0;
    const hunkContent = [];
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        hunkContent.push({
          ...content,
          additionLineIndex: contentAdditionLineIndex,
          deletionLineIndex: contentDeletionLineIndex
        });
        contentAdditionLineIndex += content.lines;
        contentDeletionLineIndex += content.lines;
        hunkSplitLineCount += content.lines;
        hunkUnifiedLineCount += content.lines;
        continue;
      }
      hunkContent.push({
        ...content,
        additionLineIndex: contentAdditionLineIndex,
        deletionLineIndex: contentDeletionLineIndex
      });
      contentAdditionLineIndex += content.additions;
      contentDeletionLineIndex += content.deletions;
      hunkAdditionLines += content.additions;
      hunkDeletionLines += content.deletions;
      hunkSplitLineCount += Math.max(content.additions, content.deletions);
      hunkUnifiedLineCount += content.additions + content.deletions;
    }
    const collapsedBefore = Math.max(getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount) - lastHunkAdditionEnd, 0);
    hydratedHunks.push({
      ...hunk,
      collapsedBefore,
      additionLineIndex,
      deletionLineIndex,
      additionLines: hunkAdditionLines,
      deletionLines: hunkDeletionLines,
      hunkContent,
      splitLineStart: splitLineCount + collapsedBefore,
      unifiedLineStart: unifiedLineCount + collapsedBefore,
      splitLineCount: hunkSplitLineCount,
      unifiedLineCount: hunkUnifiedLineCount
    });
    splitLineCount += collapsedBefore + hunkSplitLineCount;
    unifiedLineCount += collapsedBefore + hunkUnifiedLineCount;
    lastHunkAdditionEnd = getHunkSideEndBoundary(hunk.additionStart, hunk.additionCount);
  }
  if (hydratedHunks.length > 0) {
    const lastHunk = hydratedHunks[hydratedHunks.length - 1];
    const lastHunkEnd = getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
    const collapsedAfter = Math.max(totalAdditionLines - lastHunkEnd, 0);
    splitLineCount += collapsedAfter;
    unifiedLineCount += collapsedAfter;
  }
  return {
    hunks: hydratedHunks,
    splitLineCount,
    unifiedLineCount
  };
}
function requireOldFile(fileDiff, files) {
  if (files.oldFile == null) throw new Error(`hydratePartialDiff: ${fileDiff.type} diff for ${fileDiff.name} requires oldFile`);
  return files.oldFile;
}
function requireNewFile(fileDiff, files) {
  if (files.newFile == null) throw new Error(`hydratePartialDiff: ${fileDiff.type} diff for ${fileDiff.name} requires newFile`);
  return files.newFile;
}
function requireMissingOldFile(fileDiff, files) {
  if (files.oldFile !== null) throw new Error(`hydratePartialDiff: ${fileDiff.type} diff for ${fileDiff.name} requires oldFile to be null`);
}
function getHydratedCacheKey(fileDiff, oldFile, newFile) {
  if (fileDiff.cacheKey != null) return `${fileDiff.cacheKey}:hydrated`;
  return getLoadedFileCacheKey(oldFile, newFile);
}
function setHydratedCacheKey(fileDiff, oldFile, newFile) {
  const cacheKey = getHydratedCacheKey(fileDiff, oldFile, newFile);
  if (cacheKey == null) {
    delete fileDiff.cacheKey;
    return;
  }
  fileDiff.cacheKey = cacheKey;
}
function getLoadedFileCacheKey(oldFile, newFile) {
  if (oldFile != null && newFile != null) return oldFile.cacheKey != null && newFile.cacheKey != null ? composeCacheKey("hydrated-files", oldFile.cacheKey, newFile.cacheKey) : void 0;
  return (oldFile == null ? void 0 : oldFile.cacheKey) ?? (newFile == null ? void 0 : newFile.cacheKey);
}
function cleanLastNewline(contents) {
  let end = contents.length;
  if (contents.charCodeAt(end - 1) === 10) {
    end--;
    if (contents.charCodeAt(end - 1) === 13) end--;
  }
  return contents.slice(0, end);
}
const stringDetachEncoder = new TextEncoder();
const stringDetachDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
const SURROGATE_CODE_UNIT_PATTERN = /[\uD800-\uDFFF]/;
const STRING_DETACH_INITIAL_BUFFER_SIZE = 1024;
let stringDetachBuffer = new Uint8Array(STRING_DETACH_INITIAL_BUFFER_SIZE);
function releaseStringDetachBuffer() {
  if (stringDetachBuffer.length !== STRING_DETACH_INITIAL_BUFFER_SIZE) stringDetachBuffer = new Uint8Array(STRING_DETACH_INITIAL_BUFFER_SIZE);
}
function detachString(value) {
  if (value.length === 0) return value;
  if (SURROGATE_CODE_UNIT_PATTERN.test(value)) return JSON.parse(JSON.stringify(value));
  const requiredByteLength = value.length * 3;
  if (stringDetachBuffer.length < requiredByteLength) stringDetachBuffer = new Uint8Array(requiredByteLength);
  const { written } = stringDetachEncoder.encodeInto(value, stringDetachBuffer);
  return stringDetachDecoder.decode(stringDetachBuffer.subarray(0, written));
}
const MAX_ALIGNMENT_COMPARISONS = 4096;
const MIN_IMPROVEMENT_PER_PAIR = 0.5;
function realignChangeContentBySimilarity(diff) {
  for (const hunk of diff.hunks) {
    for (let index = 0; index < hunk.hunkContent.length; index++) {
      const content = hunk.hunkContent[index];
      if (content.type !== "change") continue;
      const replacement = realignChangeBlock(diff, content);
      if (replacement != null) {
        hunk.hunkContent.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
    }
    slideBlankBoundaryBlocksUp(hunk, diff);
  }
}
function slideBlankBoundaryBlocksUp(hunk, diff) {
  const { hunkContent } = hunk;
  for (let index = 1; index < hunkContent.length; index++) {
    const block = hunkContent[index];
    const previous = hunkContent[index - 1];
    if (block.type !== "change" || block.additions > 0 && block.deletions > 0 || previous.type !== "context") continue;
    const isInsert = block.additions > 0;
    const lines = isInsert ? diff.additionLines : diff.deletionLines;
    const blockStart = isInsert ? block.additionLineIndex : block.deletionLineIndex;
    const blockLength = isInsert ? block.additions : block.deletions;
    const unit = lines[blockStart] ?? "";
    if (unit.trim() !== "") continue;
    let uniform = true;
    for (let offset = 1; offset < blockLength; offset++) if (lines[blockStart + offset] !== unit) {
      uniform = false;
      break;
    }
    if (!uniform) continue;
    let slide = 0;
    while (slide < previous.lines && diff.additionLines[previous.additionLineIndex + previous.lines - 1 - slide] === unit) slide++;
    if (slide === 0) continue;
    if (index === 1 && slide === previous.lines) continue;
    block.additionLineIndex -= slide;
    block.deletionLineIndex -= slide;
    const blockAdditionEnd = block.additionLineIndex + block.additions;
    const blockDeletionEnd = block.deletionLineIndex + block.deletions;
    const next = hunkContent[index + 1];
    if ((next == null ? void 0 : next.type) === "context") {
      next.lines += slide;
      next.additionLineIndex = blockAdditionEnd;
      next.deletionLineIndex = blockDeletionEnd;
    } else hunkContent.splice(index + 1, 0, {
      type: "context",
      lines: slide,
      additionLineIndex: blockAdditionEnd,
      deletionLineIndex: blockDeletionEnd
    });
    previous.lines -= slide;
    if (previous.lines === 0) {
      hunkContent.splice(index - 1, 1);
      index--;
    }
  }
}
function realignChangeBlock(diff, content) {
  const { deletions, additions, deletionLineIndex, additionLineIndex } = content;
  const pairCount = Math.min(deletions, additions);
  const surplus = Math.abs(additions - deletions);
  if (pairCount === 0 || surplus === 0 || pairCount * (surplus + 1) > MAX_ALIGNMENT_COMPARISONS) return null;
  const strippedDeletions = [];
  for (let line = 0; line < deletions; line++) strippedDeletions.push(stripWhitespace(diff.deletionLines[deletionLineIndex + line] ?? ""));
  const strippedAdditions = [];
  for (let line = 0; line < additions; line++) strippedAdditions.push(stripWhitespace(diff.additionLines[additionLineIndex + line] ?? ""));
  const additionsAreLonger = additions > deletions;
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset <= surplus; offset++) {
    let score = 0;
    for (let pair = 0; pair < pairCount; pair++) score += lineSimilarity(strippedDeletions[pair + (additionsAreLonger ? 0 : offset)], strippedAdditions[pair + (additionsAreLonger ? offset : 0)]);
    if (offset === 0) bestScore = score + pairCount * MIN_IMPROVEMENT_PER_PAIR;
    else if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  if (bestOffset === 0) return null;
  const blocks = [];
  const pushBlock = (blockDeletions, blockAdditions, blockDeletionIndex, blockAdditionIndex) => {
    if (blockDeletions > 0 || blockAdditions > 0) blocks.push({
      type: "change",
      deletions: blockDeletions,
      additions: blockAdditions,
      deletionLineIndex: blockDeletionIndex,
      additionLineIndex: blockAdditionIndex
    });
  };
  if (additionsAreLonger) {
    pushBlock(0, bestOffset, deletionLineIndex, additionLineIndex);
    pushBlock(pairCount, pairCount, deletionLineIndex, additionLineIndex + bestOffset);
    pushBlock(0, additions - pairCount - bestOffset, deletionLineIndex + pairCount, additionLineIndex + bestOffset + pairCount);
  } else {
    pushBlock(bestOffset, 0, deletionLineIndex, additionLineIndex);
    pushBlock(pairCount, pairCount, deletionLineIndex + bestOffset, additionLineIndex);
    pushBlock(deletions - pairCount - bestOffset, 0, deletionLineIndex + bestOffset + pairCount, additionLineIndex + pairCount);
  }
  return blocks;
}
const WHITESPACE = /\s+/g;
function stripWhitespace(line) {
  return line.replace(WHITESPACE, "");
}
function lineSimilarity(a, b) {
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  const minLength = Math.min(a.length, b.length);
  if (minLength === 0) return 0;
  let prefix = 0;
  while (prefix < minLength && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < minLength - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return (prefix + suffix) / maxLength;
}
function processFile(fileDiffString, options) {
  try {
    return _processFile(fileDiffString, options);
  } finally {
    releaseStringDetachBuffer();
  }
}
function _processFile(fileDiffString, { cacheKey, isGitDiff = GIT_DIFF_FILE_BREAK_REGEX.test(fileDiffString), oldFile, newFile, throwOnError = false } = {}) {
  let lastHunkEnd = 0;
  const hunks = splitAtLinePrefix(fileDiffString, "@@ ");
  let currentFile;
  const isPartial = oldFile == null || newFile == null;
  let deletionLineIndex = 0;
  let additionLineIndex = 0;
  for (const hunk of hunks) {
    const lines = splitWithNewlines(hunk);
    const firstLine = lines[0];
    if (firstLine == null) {
      if (throwOnError) throw Error("parsePatchContent: invalid hunk");
      else console.error("parsePatchContent: invalid hunk", hunk);
      continue;
    }
    const fileHeader = parseHunkHeader(firstLine);
    let additionLines = 0;
    let deletionLines = 0;
    if (fileHeader == null || currentFile == null) {
      if (currentFile != null) {
        if (throwOnError) throw Error("parsePatchContent: Invalid hunk");
        else console.error("parsePatchContent: Invalid hunk", hunk);
        continue;
      }
      currentFile = {
        name: "",
        type: "change",
        hunks: [],
        splitLineCount: 0,
        unifiedLineCount: 0,
        isPartial,
        additionLines: !isPartial && oldFile != null && newFile != null ? splitFileContents(newFile.contents) : [],
        deletionLines: !isPartial && oldFile != null && newFile != null ? splitFileContents(oldFile.contents) : [],
        cacheKey: maybeDetachOptionalString(cacheKey)
      };
      if (currentFile.additionLines.length === 1 && (newFile == null ? void 0 : newFile.contents) === "") currentFile.additionLines.length = 0;
      if (currentFile.deletionLines.length === 1 && (oldFile == null ? void 0 : oldFile.contents) === "") currentFile.deletionLines.length = 0;
      for (const line of lines) {
        if (line.startsWith("diff --git")) {
          const filenameMatch2 = line.trim().match(ALTERNATE_FILE_NAMES_GIT);
          const prevName = (filenameMatch2 == null ? void 0 : filenameMatch2[1]) ?? (filenameMatch2 == null ? void 0 : filenameMatch2[2]);
          const name = (filenameMatch2 == null ? void 0 : filenameMatch2[3]) ?? (filenameMatch2 == null ? void 0 : filenameMatch2[4]);
          if (prevName == null || name == null) {
            if (throwOnError) throw Error("parsePatchContent: invalid git diff header");
            else console.error("parsePatchContent: invalid git diff header", line);
            continue;
          }
          currentFile.name = detachString(name.trim());
          if (prevName !== name) currentFile.prevName = detachString(prevName.trim());
          continue;
        }
        const filenameMatch = line.startsWith("---") || line.startsWith("+++") ? line.match(isGitDiff ? FILENAME_HEADER_REGEX_GIT : FILENAME_HEADER_REGEX) : null;
        if (filenameMatch != null) {
          const [, type, fileName] = filenameMatch;
          if (type === "---" && fileName !== "/dev/null") {
            const detachedFileName = detachString(fileName.trim());
            currentFile.prevName = detachedFileName;
            currentFile.name = detachedFileName;
          } else if (type === "+++" && fileName !== "/dev/null") currentFile.name = detachString(fileName.trim());
        } else if (isGitDiff) {
          if (line.startsWith("new mode ")) currentFile.mode = detachString(line.slice(8).trim());
          if (line.startsWith("old mode ")) currentFile.prevMode = detachString(line.slice(8).trim());
          if (line.startsWith("new file mode")) {
            currentFile.type = "new";
            currentFile.mode = detachString(line.slice(13).trim());
          }
          if (line.startsWith("deleted file mode")) {
            currentFile.type = "deleted";
            currentFile.mode = detachString(line.slice(17).trim());
          }
          if (line.startsWith("similarity index")) {
            if (line.startsWith("similarity index 100%")) currentFile.type = "rename-pure";
            else currentFile.type = "rename-changed";
          }
          if (line.startsWith("index ")) {
            const [, prevObjectId, newObjectId, mode] = line.trim().match(INDEX_LINE_METADATA) ?? [];
            if (prevObjectId != null) currentFile.prevObjectId = detachString(prevObjectId);
            if (newObjectId != null) currentFile.newObjectId = detachString(newObjectId);
            if (mode != null) currentFile.mode = detachString(mode);
          }
          if (line.startsWith("rename from ")) currentFile.prevName = detachString(line.slice(12).trim());
          if (line.startsWith("rename to ")) currentFile.name = detachString(line.slice(10).trim());
        }
      }
      continue;
    }
    let currentContent;
    let lastLineType;
    while (lines.length > 0 && (lines[lines.length - 1] === "\n" || lines[lines.length - 1] === "\r" || lines[lines.length - 1] === "\r\n" || lines[lines.length - 1] === "")) lines.pop();
    const { additionStart, deletionStart } = fileHeader;
    deletionLineIndex = isPartial ? deletionLineIndex : deletionStart - 1;
    additionLineIndex = isPartial ? additionLineIndex : additionStart - 1;
    const hunkData = {
      collapsedBefore: 0,
      splitLineCount: 0,
      splitLineStart: 0,
      unifiedLineCount: 0,
      unifiedLineStart: 0,
      additionCount: fileHeader.additionCount,
      additionStart,
      additionLines,
      deletionCount: fileHeader.deletionCount,
      deletionStart,
      deletionLines,
      deletionLineIndex,
      additionLineIndex,
      hunkContent: [],
      hunkContext: maybeDetachOptionalString(fileHeader.hunkContext),
      hunkSpecs: detachString(firstLine),
      noEOFCRAdditions: false,
      noEOFCRDeletions: false
    };
    let parsedAdditionLines = 0;
    let parsedDeletionLines = 0;
    for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      if (parsedAdditionLines >= hunkData.additionCount && parsedDeletionLines >= hunkData.deletionCount && !rawLine.startsWith("\\")) {
        if (!(isHunkBodyLine(rawLine) && !isFormatPatchVersionSeparator(rawLine))) break;
        if (throwOnError) throw Error("parsePatchContent: hunk has more lines than expected");
      }
      const firstChar = rawLine[0];
      if (firstChar !== "+" && firstChar !== "-" && firstChar !== " " && firstChar !== "\\") {
        if (throwOnError) throw Error("parsePatchContent: invalid hunk line");
        console.error(`parseLineType: Invalid firstChar: "${firstChar}", full line: "${rawLine}"`);
        console.error("processFile: invalid rawLine:", rawLine);
        continue;
      }
      const type = parseRawLineType(firstChar);
      if (type === "addition") {
        if (throwOnError && parsedAdditionLines >= hunkData.additionCount) throw Error("parsePatchContent: hunk has too many addition lines");
        const line = getParsedLineContent(rawLine);
        if (currentContent == null || currentContent.type !== "change") {
          currentContent = createContentGroup("change", deletionLineIndex, additionLineIndex);
          hunkData.hunkContent.push(currentContent);
        }
        additionLineIndex++;
        parsedAdditionLines++;
        if (isPartial) currentFile.additionLines.push(line);
        currentContent.additions++;
        additionLines++;
        lastLineType = "addition";
      } else if (type === "deletion") {
        if (throwOnError && parsedDeletionLines >= hunkData.deletionCount) throw Error("parsePatchContent: hunk has too many deletion lines");
        const line = getParsedLineContent(rawLine);
        if (currentContent == null || currentContent.type !== "change") {
          currentContent = createContentGroup("change", deletionLineIndex, additionLineIndex);
          hunkData.hunkContent.push(currentContent);
        }
        deletionLineIndex++;
        parsedDeletionLines++;
        if (isPartial) currentFile.deletionLines.push(line);
        currentContent.deletions++;
        deletionLines++;
        lastLineType = "deletion";
      } else if (type === "context") {
        if (throwOnError && (parsedDeletionLines >= hunkData.deletionCount || parsedAdditionLines >= hunkData.additionCount)) throw Error("parsePatchContent: hunk has too many context lines");
        const line = getParsedLineContent(rawLine);
        if (currentContent == null || currentContent.type !== "context") {
          currentContent = createContentGroup("context", deletionLineIndex, additionLineIndex);
          hunkData.hunkContent.push(currentContent);
        }
        additionLineIndex++;
        deletionLineIndex++;
        parsedAdditionLines++;
        parsedDeletionLines++;
        if (isPartial) {
          currentFile.deletionLines.push(line);
          currentFile.additionLines.push(line);
        }
        currentContent.lines++;
        lastLineType = "context";
      } else if (type === "metadata" && currentContent != null) {
        if (currentContent.type === "context") {
          hunkData.noEOFCRAdditions = true;
          hunkData.noEOFCRDeletions = true;
        } else if (lastLineType === "deletion") hunkData.noEOFCRDeletions = true;
        else if (lastLineType === "addition") hunkData.noEOFCRAdditions = true;
        if (isPartial && (lastLineType === "addition" || lastLineType === "context")) {
          const lastIndex = currentFile.additionLines.length - 1;
          if (lastIndex >= 0) currentFile.additionLines[lastIndex] = cleanLastNewline(currentFile.additionLines[lastIndex]);
        }
        if (isPartial && (lastLineType === "deletion" || lastLineType === "context")) {
          const lastIndex = currentFile.deletionLines.length - 1;
          if (lastIndex >= 0) currentFile.deletionLines[lastIndex] = cleanLastNewline(currentFile.deletionLines[lastIndex]);
        }
      }
    }
    if (parsedAdditionLines !== hunkData.additionCount || parsedDeletionLines !== hunkData.deletionCount) {
      if (throwOnError) throw Error("parsePatchContent: hunk line count mismatch");
      console.error(`parsePatchContent: hunk line count mismatch: "${firstLine.trimEnd()}", declared old/new ${hunkData.deletionCount}/${hunkData.additionCount}, parsed old/new ${parsedDeletionLines}/${parsedAdditionLines}`);
      const repairedAdditionStart = getHunkSideStartBoundary(hunkData.additionStart, hunkData.additionCount) + (parsedAdditionLines === 0 ? 0 : 1);
      const repairedDeletionStart = getHunkSideStartBoundary(hunkData.deletionStart, hunkData.deletionCount) + (parsedDeletionLines === 0 ? 0 : 1);
      if (!isPartial) {
        const additionStartDelta = repairedAdditionStart - hunkData.additionStart;
        const deletionStartDelta = repairedDeletionStart - hunkData.deletionStart;
        hunkData.additionLineIndex += additionStartDelta;
        hunkData.deletionLineIndex += deletionStartDelta;
        for (const content of hunkData.hunkContent) {
          content.additionLineIndex += additionStartDelta;
          content.deletionLineIndex += deletionStartDelta;
        }
      }
      hunkData.additionStart = repairedAdditionStart;
      hunkData.deletionStart = repairedDeletionStart;
      hunkData.additionCount = parsedAdditionLines;
      hunkData.deletionCount = parsedDeletionLines;
    }
    hunkData.additionLines = additionLines;
    hunkData.deletionLines = deletionLines;
    hunkData.collapsedBefore = Math.max(getHunkSideStartBoundary(hunkData.additionStart, hunkData.additionCount) - lastHunkEnd, 0);
    currentFile.hunks.push(hunkData);
    lastHunkEnd = getHunkSideEndBoundary(hunkData.additionStart, hunkData.additionCount);
    for (const content of hunkData.hunkContent) if (content.type === "context") {
      hunkData.splitLineCount += content.lines;
      hunkData.unifiedLineCount += content.lines;
    } else {
      hunkData.splitLineCount += Math.max(content.additions, content.deletions);
      hunkData.unifiedLineCount += content.deletions + content.additions;
    }
    hunkData.splitLineStart = currentFile.splitLineCount + hunkData.collapsedBefore;
    hunkData.unifiedLineStart = currentFile.unifiedLineCount + hunkData.collapsedBefore;
    currentFile.splitLineCount += hunkData.collapsedBefore + hunkData.splitLineCount;
    currentFile.unifiedLineCount += hunkData.collapsedBefore + hunkData.unifiedLineCount;
  }
  if (currentFile == null) return;
  if (throwOnError && isPartial && !isGitDiff && currentFile.hunks.length === 0) throw Error("parsePatchContent: unified file has no hunks");
  if (currentFile.hunks.length > 0 && !isPartial && currentFile.additionLines.length > 0 && currentFile.deletionLines.length > 0) {
    const lastHunk = currentFile.hunks[currentFile.hunks.length - 1];
    const lastHunkEnd2 = getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
    const totalFileLines = currentFile.additionLines.length;
    const collapsedAfter = Math.max(totalFileLines - lastHunkEnd2, 0);
    currentFile.splitLineCount += collapsedAfter;
    currentFile.unifiedLineCount += collapsedAfter;
  }
  if (!isGitDiff) {
    if (currentFile.prevName != null && currentFile.name !== currentFile.prevName) {
      if (currentFile.hunks.length > 0) currentFile.type = "rename-changed";
      else currentFile.type = "rename-pure";
    } else if ((oldFile == null || oldFile.contents === "") && newFile != null && newFile.contents !== "") currentFile.type = "new";
    else if (oldFile != null && oldFile.contents !== "" && (newFile == null || newFile.contents === "")) currentFile.type = "deleted";
  }
  if (currentFile.type !== "rename-pure" && currentFile.type !== "rename-changed") currentFile.prevName = void 0;
  realignChangeContentBySimilarity(currentFile);
  return currentFile;
}
function splitFileContents(contents) {
  const lines = splitWithNewlines(contents);
  for (let index = 0; index < lines.length; index++) lines[index] = detachString(lines[index]);
  return lines;
}
function splitWithNewlines(contents) {
  if (contents.length === 0) return [""];
  const lines = [];
  let startIndex = 0;
  for (; ; ) {
    const newlineIndex = contents.indexOf("\n", startIndex);
    if (newlineIndex === -1) break;
    lines.push(contents.slice(startIndex, newlineIndex + 1));
    startIndex = newlineIndex + 1;
  }
  if (startIndex < contents.length) lines.push(contents.slice(startIndex));
  return lines;
}
function isHunkBodyLine(line) {
  const firstChar = line[0];
  return firstChar === "+" || firstChar === "-" || firstChar === " ";
}
function isFormatPatchVersionSeparator(line) {
  if (!line.startsWith("--")) return false;
  for (let index = 2; index < line.length; index++) {
    const char = line[index];
    if (char !== " " && char !== "	" && char !== "\n" && char !== "\r") return false;
  }
  return true;
}
function parseHunkHeader(line) {
  if (!line.startsWith("@@ -")) return;
  let index = 4;
  const deletionStartResult = readPositiveInteger(line, index);
  if (deletionStartResult == null) return;
  const deletionStart = deletionStartResult.value;
  index = deletionStartResult.endIndex;
  let deletionCount = 1;
  if (line[index] === ",") {
    const deletionCountResult = readPositiveInteger(line, index + 1);
    if (deletionCountResult == null) return;
    deletionCount = deletionCountResult.value;
    index = deletionCountResult.endIndex;
  }
  if (line[index] !== " " || line[index + 1] !== "+") return;
  index += 2;
  const additionStartResult = readPositiveInteger(line, index);
  if (additionStartResult == null) return;
  const additionStart = additionStartResult.value;
  index = additionStartResult.endIndex;
  let additionCount = 1;
  if (line[index] === ",") {
    const additionCountResult = readPositiveInteger(line, index + 1);
    if (additionCountResult == null) return;
    additionCount = additionCountResult.value;
    index = additionCountResult.endIndex;
  }
  if (line[index] !== " " || line[index + 1] !== "@" || line[index + 2] !== "@") return;
  let hunkContext;
  const contextStartIndex = index + 3;
  if (line[contextStartIndex] === " ") hunkContext = trimLineEnd(line.slice(contextStartIndex + 1));
  return {
    additionCount,
    additionStart,
    deletionCount,
    deletionStart,
    hunkContext
  };
}
function readPositiveInteger(value, startIndex) {
  let index = startIndex;
  let parsedValue = 0;
  for (; index < value.length; index++) {
    const digit = value.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) break;
    parsedValue = parsedValue * 10 + digit;
  }
  if (index === startIndex) return;
  return {
    value: parsedValue,
    endIndex: index
  };
}
function trimLineEnd(value) {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}
function splitAtLinePrefix(contents, prefix) {
  if (contents.length === 0) return [""];
  const newlinePrefix = `
${prefix}`;
  const firstBoundaryIndex = contents.startsWith(prefix) ? 0 : findLinePrefixIndex(contents, newlinePrefix, 0);
  if (firstBoundaryIndex === -1) return [contents];
  const parts = [];
  if (firstBoundaryIndex > 0) parts.push(contents.slice(0, firstBoundaryIndex));
  let startIndex = firstBoundaryIndex;
  for (; ; ) {
    const nextBoundaryIndex = findLinePrefixIndex(contents, newlinePrefix, startIndex + 1);
    if (nextBoundaryIndex === -1) break;
    parts.push(contents.slice(startIndex, nextBoundaryIndex));
    startIndex = nextBoundaryIndex;
  }
  parts.push(contents.slice(startIndex));
  return parts;
}
function findLinePrefixIndex(contents, newlinePrefix, fromIndex) {
  const index = contents.indexOf(newlinePrefix, fromIndex);
  return index === -1 ? -1 : index + 1;
}
function maybeDetachOptionalString(value) {
  return value == null ? value : detachString(value);
}
function parseRawLineType(firstChar) {
  return firstChar === " " ? "context" : firstChar === "\\" ? "metadata" : firstChar === "+" ? "addition" : "deletion";
}
function getParsedLineContent(rawLine) {
  const processedLine = rawLine.slice(1);
  return detachString(processedLine === "" ? "\n" : processedLine);
}
function createContentGroup(type, deletionLineIndex, additionLineIndex) {
  if (type === "change") return {
    type: "change",
    additions: 0,
    deletions: 0,
    additionLineIndex,
    deletionLineIndex
  };
  return {
    type: "context",
    lines: 0,
    additionLineIndex,
    deletionLineIndex
  };
}
class Diff {
  diff(oldStr, newStr, options = {}) {
    let callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if ("callback" in options) {
      callback = options.callback;
    }
    const oldString = this.castInput(oldStr, options);
    const newString = this.castInput(newStr, options);
    const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
    const newTokens = this.removeEmpty(this.tokenize(newString, options));
    return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
  }
  diffWithOptionsObj(oldTokens, newTokens, options, callback) {
    var _a2;
    const done = (value) => {
      value = this.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return void 0;
      } else {
        return value;
      }
    };
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let editLength = 1;
    let maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    const maxExecutionTime = (_a2 = options.timeout) !== null && _a2 !== void 0 ? _a2 : Infinity;
    const abortAfterTimestamp = Date.now() + maxExecutionTime;
    const bestPath = [{ oldPos: -1, lastComponent: void 0 }];
    let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
    }
    let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    const execEditLength = () => {
      for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        let basePath;
        const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        let canAdd = false;
        if (addPath) {
          const addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        const canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = this.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = this.addToPath(removePath, false, true, 1, options);
        }
        newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    };
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback(void 0);
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        const ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  }
  addToPath(path, added, removed, oldPosInc, options) {
    const last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: 1, added, removed, previousComponent: last }
      };
    }
  }
  extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
    }
    basePath.oldPos = oldPos;
    return newPos;
  }
  equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  }
  removeEmpty(array) {
    const ret = [];
    for (let i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  castInput(value, options) {
    return value;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenize(value, options) {
    return Array.from(value);
  }
  join(chars) {
    return chars.join("");
  }
  postProcess(changeObjects, options) {
    return changeObjects;
  }
  get useLongestToken() {
    return false;
  }
  buildValues(lastComponent, newTokens, oldTokens) {
    const components = [];
    let nextComponent;
    while (lastComponent) {
      components.push(lastComponent);
      nextComponent = lastComponent.previousComponent;
      delete lastComponent.previousComponent;
      lastComponent = nextComponent;
    }
    components.reverse();
    const componentLen = components.length;
    let componentPos = 0, newPos = 0, oldPos = 0;
    for (; componentPos < componentLen; componentPos++) {
      const component = components[componentPos];
      if (!component.removed) {
        if (!component.added && this.useLongestToken) {
          let value = newTokens.slice(newPos, newPos + component.count);
          value = value.map(function(value2, i) {
            const oldValue = oldTokens[oldPos + i];
            return oldValue.length > value2.length ? oldValue : value2;
          });
          component.value = this.join(value);
        } else {
          component.value = this.join(newTokens.slice(newPos, newPos + component.count));
        }
        newPos += component.count;
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
        oldPos += component.count;
      }
    }
    return components;
  }
}
class CharacterDiff extends Diff {
}
const characterDiff = new CharacterDiff();
function diffChars(oldStr, newStr, options) {
  return characterDiff.diff(oldStr, newStr, options);
}
const extendedWordChars = "a-zA-Z0-9_\\u{AD}\\u{C0}-\\u{D6}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";
class WordsWithSpaceDiff extends Diff {
  tokenize(value) {
    const regex = new RegExp(`(\\r?\\n)|[${extendedWordChars}]+|[^\\S\\n\\r]+|[^${extendedWordChars}]`, "ug");
    return value.match(regex) || [];
  }
}
const wordsWithSpaceDiff = new WordsWithSpaceDiff();
function diffWordsWithSpace(oldStr, newStr, options) {
  return wordsWithSpaceDiff.diff(oldStr, newStr, options);
}
class LineDiff extends Diff {
  constructor() {
    super(...arguments);
    this.tokenize = tokenize;
  }
  equals(left, right, options) {
    if (options.ignoreWhitespace) {
      if (!options.newlineIsToken || !left.includes("\n")) {
        left = left.trim();
      }
      if (!options.newlineIsToken || !right.includes("\n")) {
        right = right.trim();
      }
    } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
      if (left.endsWith("\n")) {
        left = left.slice(0, -1);
      }
      if (right.endsWith("\n")) {
        right = right.slice(0, -1);
      }
    }
    return super.equals(left, right, options);
  }
}
const lineDiff = new LineDiff();
function diffLines(oldStr, newStr, options) {
  return lineDiff.diff(oldStr, newStr, options);
}
function tokenize(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  const retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (let i = 0; i < linesAndNewlines.length; i++) {
    const line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
}
function needsQuoting(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] < " " || s[i] > "~" || s[i] === '"' || s[i] === "\\") {
      return true;
    }
  }
  return false;
}
function quoteFileNameIfNeeded(s) {
  if (!needsQuoting(s)) {
    return s;
  }
  let result = '"';
  const bytes = new TextEncoder().encode(s);
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 7) {
      result += "\\a";
    } else if (b === 8) {
      result += "\\b";
    } else if (b === 9) {
      result += "\\t";
    } else if (b === 10) {
      result += "\\n";
    } else if (b === 11) {
      result += "\\v";
    } else if (b === 12) {
      result += "\\f";
    } else if (b === 13) {
      result += "\\r";
    } else if (b === 34) {
      result += '\\"';
    } else if (b === 92) {
      result += "\\\\";
    } else if (b >= 32 && b <= 126) {
      result += String.fromCharCode(b);
    } else {
      result += "\\" + b.toString(8).padStart(3, "0");
    }
    i++;
  }
  result += '"';
  return result;
}
const INCLUDE_HEADERS = {
  includeIndex: true,
  includeUnderline: true,
  includeFileHeaders: true
};
function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  let optionsObj;
  if (!options) {
    optionsObj = {};
  } else if (typeof options === "function") {
    optionsObj = { callback: options };
  } else {
    optionsObj = options;
  }
  if (typeof optionsObj.context === "undefined") {
    optionsObj.context = 4;
  }
  const context = optionsObj.context;
  if (optionsObj.newlineIsToken) {
    throw new Error("newlineIsToken may not be used with patch-generation functions, only with diffing functions");
  }
  if (!optionsObj.callback) {
    return diffLinesResultToPatch(diffLines(oldStr, newStr, optionsObj));
  } else {
    const { callback } = optionsObj;
    diffLines(oldStr, newStr, Object.assign(Object.assign({}, optionsObj), { callback: (diff) => {
      const patch = diffLinesResultToPatch(diff);
      callback(patch);
    } }));
  }
  function diffLinesResultToPatch(diff) {
    if (!diff) {
      return;
    }
    diff.push({ value: "", lines: [] });
    function contextLines(lines) {
      return lines.map(function(entry) {
        return " " + entry;
      });
    }
    const hunks = [];
    let oldRangeStart = 0, newRangeStart = 0, curRange = [], oldLine = 1, newLine = 1;
    for (let i = 0; i < diff.length; i++) {
      const current = diff[i], lines = current.lines || splitLines(current.value);
      current.lines = lines;
      if (current.added || current.removed) {
        if (!oldRangeStart) {
          const prev = diff[i - 1];
          oldRangeStart = oldLine;
          newRangeStart = newLine;
          if (prev) {
            curRange = context > 0 ? contextLines(prev.lines.slice(-context)) : [];
            oldRangeStart -= curRange.length;
            newRangeStart -= curRange.length;
          }
        }
        for (const line of lines) {
          curRange.push((current.added ? "+" : "-") + line);
        }
        if (current.added) {
          newLine += lines.length;
        } else {
          oldLine += lines.length;
        }
      } else {
        if (oldRangeStart) {
          if (lines.length <= context * 2 && i < diff.length - 2) {
            for (const line of contextLines(lines)) {
              curRange.push(line);
            }
          } else {
            const contextSize = Math.min(lines.length, context);
            for (const line of contextLines(lines.slice(0, contextSize))) {
              curRange.push(line);
            }
            const hunk = {
              oldStart: oldRangeStart,
              oldLines: oldLine - oldRangeStart + contextSize,
              newStart: newRangeStart,
              newLines: newLine - newRangeStart + contextSize,
              lines: curRange
            };
            hunks.push(hunk);
            oldRangeStart = 0;
            newRangeStart = 0;
            curRange = [];
          }
        }
        oldLine += lines.length;
        newLine += lines.length;
      }
    }
    for (const hunk of hunks) {
      for (let i = 0; i < hunk.lines.length; i++) {
        if (hunk.lines[i].endsWith("\n")) {
          hunk.lines[i] = hunk.lines[i].slice(0, -1);
        } else {
          hunk.lines.splice(i + 1, 0, "\\ No newline at end of file");
          i++;
        }
      }
    }
    return {
      oldFileName,
      newFileName,
      oldHeader,
      newHeader,
      hunks
    };
  }
}
function formatPatch(patch, headerOptions) {
  var _a2, _b2, _c, _d, _e, _f;
  if (!headerOptions) {
    headerOptions = INCLUDE_HEADERS;
  }
  if (Array.isArray(patch)) {
    if (patch.length > 1 && !headerOptions.includeFileHeaders && !patch.every((p) => p.isGit)) {
      throw new Error("Cannot omit file headers on a multi-file patch. (The result would be unparseable; how would a tool trying to apply the patch know which changes are to which file?)");
    }
    return patch.map((p) => formatPatch(p, headerOptions)).join("\n");
  }
  const ret = [];
  if (patch.isGit) {
    headerOptions = INCLUDE_HEADERS;
    if (!patch.oldFileName) {
      throw new Error("oldFileName must be specified for Git patches");
    }
    if (!patch.newFileName) {
      throw new Error("newFileName must be specified for Git patches");
    }
    let gitOldName = patch.oldFileName;
    let gitNewName = patch.newFileName;
    if (patch.isCreate && gitOldName === "/dev/null") {
      gitOldName = gitNewName.replace(/^b\//, "a/");
    } else if (patch.isDelete && gitNewName === "/dev/null") {
      gitNewName = gitOldName.replace(/^a\//, "b/");
    }
    ret.push("diff --git " + quoteFileNameIfNeeded(gitOldName) + " " + quoteFileNameIfNeeded(gitNewName));
    if (patch.isDelete) {
      ret.push("deleted file mode " + ((_a2 = patch.oldMode) !== null && _a2 !== void 0 ? _a2 : "100644"));
    }
    if (patch.isCreate) {
      ret.push("new file mode " + ((_b2 = patch.newMode) !== null && _b2 !== void 0 ? _b2 : "100644"));
    }
    if (patch.oldMode && patch.newMode && !patch.isDelete && !patch.isCreate) {
      ret.push("old mode " + patch.oldMode);
      ret.push("new mode " + patch.newMode);
    }
    if (patch.isRename) {
      ret.push("rename from " + quoteFileNameIfNeeded(((_c = patch.oldFileName) !== null && _c !== void 0 ? _c : "").replace(/^a\//, "")));
      ret.push("rename to " + quoteFileNameIfNeeded(((_d = patch.newFileName) !== null && _d !== void 0 ? _d : "").replace(/^b\//, "")));
    }
    if (patch.isCopy) {
      ret.push("copy from " + quoteFileNameIfNeeded(((_e = patch.oldFileName) !== null && _e !== void 0 ? _e : "").replace(/^a\//, "")));
      ret.push("copy to " + quoteFileNameIfNeeded(((_f = patch.newFileName) !== null && _f !== void 0 ? _f : "").replace(/^b\//, "")));
    }
  } else {
    if (headerOptions.includeIndex && patch.oldFileName == patch.newFileName && patch.oldFileName !== void 0) {
      ret.push("Index: " + patch.oldFileName);
    }
    if (headerOptions.includeUnderline) {
      ret.push("===================================================================");
    }
  }
  const hasHunks = patch.hunks.length > 0;
  if (headerOptions.includeFileHeaders && patch.oldFileName !== void 0 && patch.newFileName !== void 0 && (!patch.isGit || hasHunks)) {
    ret.push("--- " + quoteFileNameIfNeeded(patch.oldFileName) + (patch.oldHeader ? "	" + patch.oldHeader : ""));
    ret.push("+++ " + quoteFileNameIfNeeded(patch.newFileName) + (patch.newHeader ? "	" + patch.newHeader : ""));
  }
  for (let i = 0; i < patch.hunks.length; i++) {
    const hunk = patch.hunks[i];
    const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart;
    const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart;
    ret.push("@@ -" + oldStart + "," + hunk.oldLines + " +" + newStart + "," + hunk.newLines + " @@");
    for (const line of hunk.lines) {
      ret.push(line);
    }
  }
  return ret.join("\n") + "\n";
}
function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  if (typeof options === "function") {
    options = { callback: options };
  }
  if (!(options === null || options === void 0 ? void 0 : options.callback)) {
    const patchObj = structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options);
    if (!patchObj) {
      return;
    }
    return formatPatch(patchObj, options === null || options === void 0 ? void 0 : options.headerOptions);
  } else {
    const { callback } = options;
    structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, Object.assign(Object.assign({}, options), { callback: (patchObj) => {
      if (!patchObj) {
        callback(void 0);
      } else {
        callback(formatPatch(patchObj, options.headerOptions));
      }
    } }));
  }
}
function splitLines(text) {
  const hasTrailingNl = text.endsWith("\n");
  const result = text.split("\n").map((line) => line + "\n");
  if (hasTrailingNl) {
    result.pop();
  } else {
    result.push(result.pop().slice(0, -1));
  }
  return result;
}
const MISSING_FILE_NAME = "/dev/null";
function parseDiffFromFile(oldFile, newFile, options, throwOnError = false) {
  if (oldFile === null && newFile === null) throw new Error("parseDiffFromFile: You must pass oldFile, newFile, or both");
  const resolvedOldFile = oldFile ?? createMissingFile();
  const resolvedNewFile = newFile ?? createMissingFile();
  const patch = createTwoFilesPatch(resolvedOldFile.name, resolvedNewFile.name, resolvedOldFile.contents, resolvedNewFile.contents, resolvedOldFile.header, resolvedNewFile.header, options);
  const fileData = processFile(patch, {
    cacheKey: (() => {
      const oldCacheKey = oldFile == null ? void 0 : oldFile.cacheKey;
      const newCacheKey = newFile == null ? void 0 : newFile.cacheKey;
      return oldCacheKey != null && newCacheKey != null ? composeCacheKey("diff", oldCacheKey, newCacheKey) : void 0;
    })(),
    oldFile: resolvedOldFile,
    newFile: resolvedNewFile,
    throwOnError
  });
  if (fileData == null) throw new Error("parseDiffFrom: FileInvalid diff -- probably need to fix something -- if the files are the same maybe?");
  if (oldFile === null) {
    fileData.type = "new";
    fileData.prevName = void 0;
  } else if (newFile === null) {
    fileData.type = "deleted";
    fileData.prevName = void 0;
  }
  const language = (newFile == null ? void 0 : newFile.lang) ?? (newFile === null ? oldFile == null ? void 0 : oldFile.lang : void 0);
  if (language != null) fileData.lang = language;
  return fileData;
}
function createMissingFile() {
  return {
    name: MISSING_FILE_NAME,
    contents: ""
  };
}
var ScrollSyncManager = class {
  constructor() {
    __publicField(this, "isDeletionsScrolling", false);
    __publicField(this, "isAdditionsScrolling", false);
    __publicField(this, "timeoutId", -1);
    __publicField(this, "codeDeletions");
    __publicField(this, "codeAdditions");
    __publicField(this, "enabled", false);
    __publicField(this, "handleDeletionsScroll", () => {
      var _a2, _b2;
      if (this.isAdditionsScrolling) return;
      this.isDeletionsScrolling = true;
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => {
        this.isDeletionsScrolling = false;
      }, 300);
      (_b2 = this.codeAdditions) == null ? void 0 : _b2.scrollTo({ left: (_a2 = this.codeDeletions) == null ? void 0 : _a2.scrollLeft });
    });
    __publicField(this, "handleAdditionsScroll", () => {
      var _a2, _b2;
      if (this.isDeletionsScrolling) return;
      this.isAdditionsScrolling = true;
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => {
        this.isAdditionsScrolling = false;
      }, 300);
      (_b2 = this.codeDeletions) == null ? void 0 : _b2.scrollTo({ left: (_a2 = this.codeAdditions) == null ? void 0 : _a2.scrollLeft });
    });
  }
  cleanUp() {
    var _a2, _b2;
    if (!this.enabled) return;
    (_a2 = this.codeDeletions) == null ? void 0 : _a2.removeEventListener("scroll", this.handleDeletionsScroll);
    (_b2 = this.codeAdditions) == null ? void 0 : _b2.removeEventListener("scroll", this.handleAdditionsScroll);
    clearTimeout(this.timeoutId);
    this.codeDeletions = void 0;
    this.codeAdditions = void 0;
    this.enabled = false;
  }
  setup(pre, codeDeletions, codeAdditions) {
    var _a2, _b2;
    if (codeDeletions == null || codeAdditions == null) for (const element of pre.children ?? []) {
      if (!(element instanceof HTMLElement)) continue;
      if ("deletions" in element.dataset) codeDeletions = element;
      else if ("additions" in element.dataset) codeAdditions = element;
    }
    if (codeAdditions == null || codeDeletions == null) {
      this.cleanUp();
      return;
    }
    if (this.codeDeletions !== codeDeletions) {
      (_a2 = this.codeDeletions) == null ? void 0 : _a2.removeEventListener("scroll", this.handleDeletionsScroll);
      this.codeDeletions = codeDeletions;
      codeDeletions.addEventListener("scroll", this.handleDeletionsScroll, { passive: true });
    }
    if (this.codeAdditions !== codeAdditions) {
      (_b2 = this.codeAdditions) == null ? void 0 : _b2.removeEventListener("scroll", this.handleAdditionsScroll);
      this.codeAdditions = codeAdditions;
      codeAdditions.addEventListener("scroll", this.handleAdditionsScroll, { passive: true });
    }
    this.enabled = true;
  }
};
function areDiffRenderOptionsEqual(optionsA, optionsB) {
  return areThemesEqual(optionsA.theme, optionsB.theme) && optionsA.useTokenTransformer === optionsB.useTokenTransformer && optionsA.tokenizeMaxLineLength === optionsB.tokenizeMaxLineLength && optionsA.lineDiffType === optionsB.lineDiffType && optionsA.maxLineDiffLength === optionsB.maxLineDiffLength;
}
function createEmptyRowBuffer(size) {
  return createHastElement({
    tagName: "div",
    properties: {
      "data-content-buffer": "",
      "data-buffer-size": size,
      style: `grid-row: span ${size};min-height:calc(${size} * 1lh)`
    }
  });
}
function createNoNewlineElement(type) {
  return createHastElement({
    tagName: "div",
    children: [createHastElement({
      tagName: "span",
      children: [createTextNodeElement("No newline at end of file")]
    })],
    properties: {
      "data-no-newline": "",
      "data-line-type": type,
      "data-column-content": ""
    }
  });
}
function createExpandButton(type) {
  return createHastElement({
    tagName: "div",
    children: [createIconElement({
      name: type === "both" ? "diffs-icon-expand-all" : "diffs-icon-expand",
      properties: { "data-icon": "" }
    })],
    properties: {
      role: "button",
      "data-expand-button": "",
      "data-expand-both": type === "both" ? "" : void 0,
      "data-expand-up": type === "up" ? "" : void 0,
      "data-expand-down": type === "down" ? "" : void 0
    }
  });
}
function createSeparator({ type, content, expandIndex, chunked = false, slotName, isFirstHunk, isLastHunk }) {
  let buttonCount = 0;
  const children = [];
  if (type === "metadata" && content != null) children.push(createHastElement({
    tagName: "div",
    children: [createTextNodeElement(content)],
    properties: { "data-separator-wrapper": "" }
  }));
  if ((type === "line-info" || type === "line-info-basic") && content != null) {
    const contentChildren = [];
    if (expandIndex != null) {
      if (!chunked) {
        contentChildren.push(createExpandButton(!isFirstHunk && !isLastHunk ? "both" : isFirstHunk ? "down" : "up"));
        buttonCount++;
      } else {
        if (!isFirstHunk) {
          contentChildren.push(createExpandButton("up"));
          buttonCount++;
        }
        if (!isLastHunk) {
          contentChildren.push(createExpandButton("down"));
          buttonCount++;
        }
      }
    }
    contentChildren.push(createHastElement({
      tagName: "div",
      children: [createHastElement({
        tagName: "span",
        children: [createTextNodeElement(content)],
        properties: { "data-unmodified-lines": "" }
      })],
      properties: { "data-separator-content": "" }
    }));
    if (chunked && expandIndex != null) contentChildren.push(createHastElement({
      tagName: "div",
      children: [createTextNodeElement("Expand all")],
      properties: {
        role: "button",
        "data-expand-button": "",
        "data-expand-all-button": ""
      }
    }));
    children.push(createHastElement({
      tagName: "div",
      children: contentChildren,
      properties: {
        "data-separator-wrapper": "",
        "data-separator-multi-button": buttonCount > 1 ? "" : void 0
      }
    }));
  }
  if (type === "custom" && slotName != null) children.push(createHastElement({
    tagName: "slot",
    properties: { name: slotName }
  }));
  return createHastElement({
    tagName: "div",
    children,
    properties: {
      "data-separator": children.length === 0 ? "simple" : type,
      "data-expand-index": expandIndex,
      "data-separator-first": isFirstHunk ? "" : void 0,
      "data-separator-last": isLastHunk ? "" : void 0
    }
  });
}
function getHunkSeparatorSlotName(type, hunkIndex) {
  return `hunk-separator-${type}-${hunkIndex}`;
}
function getTotalLineCountFromHunks(hunks) {
  const lastHunk = hunks.at(-1);
  if (lastHunk == null) return 0;
  return Math.max(getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount), getHunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount));
}
function createDiffSpanDecoration({ line, spanStart, spanLength }) {
  return {
    start: {
      line,
      character: spanStart
    },
    end: {
      line,
      character: spanStart + spanLength
    },
    properties: { "data-diff-span": "" },
    alwaysWrap: true
  };
}
function pushOrJoinSpan({ item, arr, enableJoin, isNeutral = false, isLastItem = false }) {
  const lastItem = arr[arr.length - 1];
  if (lastItem == null || isLastItem || !enableJoin) {
    arr.push([isNeutral ? 0 : 1, item.value]);
    return;
  }
  const isLastItemNeutral = lastItem[0] === 0;
  if (isNeutral === isLastItemNeutral || isNeutral && item.value.length === 1 && !isLastItemNeutral) {
    lastItem[1] += item.value;
    return;
  }
  arr.push([isNeutral ? 0 : 1, item.value]);
}
function getHunkAdditionLineRange(hunk) {
  return [getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount) + 1, getHunkSideEndBoundary(hunk.additionStart, hunk.additionCount) + 1];
}
function getExpandedRegion({ isPartial, rangeSize, expandedHunks, hunkIndex, collapsedContextThreshold }) {
  const normalizedRangeSize = Math.max(rangeSize, 0);
  if (normalizedRangeSize === 0 || isPartial) return {
    fromStart: 0,
    fromEnd: 0,
    rangeSize: normalizedRangeSize,
    collapsedLines: normalizedRangeSize,
    renderAll: false
  };
  if (expandedHunks === true || normalizedRangeSize <= collapsedContextThreshold) return {
    fromStart: normalizedRangeSize,
    fromEnd: 0,
    rangeSize: normalizedRangeSize,
    collapsedLines: 0,
    renderAll: true
  };
  const region = expandedHunks == null ? void 0 : expandedHunks.get(hunkIndex);
  const fromStart = Math.min(Math.max((region == null ? void 0 : region.fromStart) ?? 0, 0), normalizedRangeSize);
  const fromEnd = Math.min(Math.max((region == null ? void 0 : region.fromEnd) ?? 0, 0), normalizedRangeSize);
  const expandedCount = fromStart + fromEnd;
  const renderAll = expandedCount >= normalizedRangeSize;
  return {
    fromStart: renderAll ? normalizedRangeSize : fromStart,
    fromEnd: renderAll ? 0 : fromEnd,
    rangeSize: normalizedRangeSize,
    collapsedLines: Math.max(normalizedRangeSize - expandedCount, 0),
    renderAll
  };
}
function hasTrailingContextMismatch(fileDiff) {
  const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
  if (lastHunk == null || fileDiff.isPartial || fileDiff.additionLines.length === 0 || fileDiff.deletionLines.length === 0) return false;
  const additionRemaining = fileDiff.additionLines.length - getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
  const deletionRemaining = fileDiff.deletionLines.length - getHunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount);
  if (additionRemaining <= 0 && deletionRemaining <= 0) return false;
  return additionRemaining !== deletionRemaining;
}
function getTrailingContextRangeSize({ fileDiff, errorPrefix }) {
  const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
  if (lastHunk == null || fileDiff.isPartial || fileDiff.additionLines.length === 0 || fileDiff.deletionLines.length === 0) return 0;
  const additionRemaining = fileDiff.additionLines.length - getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
  const deletionRemaining = fileDiff.deletionLines.length - getHunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount);
  if (additionRemaining <= 0 && deletionRemaining <= 0) return 0;
  if (additionRemaining !== deletionRemaining) throw new Error(`${errorPrefix}: trailing context mismatch (additions=${additionRemaining}, deletions=${deletionRemaining}) for ${fileDiff.name}`);
  return Math.min(additionRemaining, deletionRemaining);
}
function getTrailingExpandedRegion({ fileDiff, hunkIndex, expandedHunks, collapsedContextThreshold, errorPrefix }) {
  if (hunkIndex !== fileDiff.hunks.length - 1) return;
  const trailingRangeSize = getTrailingContextRangeSize({
    fileDiff,
    errorPrefix
  });
  if (trailingRangeSize <= 0) return;
  if (expandedHunks === true || trailingRangeSize <= collapsedContextThreshold) return {
    fromStart: trailingRangeSize,
    fromEnd: 0,
    rangeSize: trailingRangeSize,
    collapsedLines: 0,
    renderAll: true
  };
  const region = expandedHunks == null ? void 0 : expandedHunks.get(fileDiff.hunks.length);
  const fromStart = Math.min(Math.max((region == null ? void 0 : region.fromStart) ?? 0, 0), trailingRangeSize);
  return {
    fromStart,
    fromEnd: 0,
    rangeSize: trailingRangeSize,
    collapsedLines: trailingRangeSize - fromStart,
    renderAll: fromStart >= trailingRangeSize
  };
}
function isAdditionLineRenderable({ fileDiff, lineNumber, expandedHunks, collapsedContextThreshold }) {
  if (expandedHunks === true || fileDiff.isPartial) return true;
  for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
    const [hunkStart, hunkEnd] = getHunkAdditionLineRange(hunk);
    if (lineNumber < hunkStart) {
      const region = getExpandedRegion({
        isPartial: fileDiff.isPartial,
        rangeSize: hunk.collapsedBefore,
        expandedHunks,
        hunkIndex,
        collapsedContextThreshold
      });
      const gapStart = hunkStart - region.rangeSize;
      return region.renderAll || lineNumber < gapStart + region.fromStart || lineNumber >= hunkStart - region.fromEnd;
    }
    if (lineNumber < hunkEnd) return true;
  }
  const trailingRegion = getTrailingExpandedRegion({
    fileDiff,
    hunkIndex: fileDiff.hunks.length - 1,
    expandedHunks,
    collapsedContextThreshold,
    errorPrefix: "isAdditionLineRenderable"
  });
  if (trailingRegion == null || trailingRegion.renderAll) return true;
  const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
  const [, trailingStart] = getHunkAdditionLineRange(lastHunk);
  return lineNumber < trailingStart + trailingRegion.fromStart || lineNumber >= trailingStart + trailingRegion.rangeSize;
}
function getNearestRenderableAdditionLine({ fileDiff, lineNumber, direction, expandedHunks, collapsedContextThreshold }) {
  if (expandedHunks === true || fileDiff.isPartial) return lineNumber;
  const ranges = [];
  let modeledEnd = 1;
  for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
    const [hunkStart, hunkEnd] = getHunkAdditionLineRange(hunk);
    const region = getExpandedRegion({
      isPartial: fileDiff.isPartial,
      rangeSize: hunk.collapsedBefore,
      expandedHunks,
      hunkIndex,
      collapsedContextThreshold
    });
    const gapStart = hunkStart - region.rangeSize;
    if (region.renderAll) ranges.push([gapStart, hunkStart]);
    else {
      if (region.fromStart > 0) ranges.push([gapStart, gapStart + region.fromStart]);
      if (region.fromEnd > 0) ranges.push([hunkStart - region.fromEnd, hunkStart]);
    }
    ranges.push([hunkStart, hunkEnd]);
    modeledEnd = hunkEnd;
  }
  const trailingRegion = getTrailingExpandedRegion({
    fileDiff,
    hunkIndex: fileDiff.hunks.length - 1,
    expandedHunks,
    collapsedContextThreshold,
    errorPrefix: "getNearestRenderableAdditionLine"
  });
  if (trailingRegion != null) {
    const trailingStart = modeledEnd;
    modeledEnd = trailingStart + trailingRegion.rangeSize;
    if (trailingRegion.renderAll) ranges.push([trailingStart, modeledEnd]);
    else if (trailingRegion.fromStart > 0) ranges.push([trailingStart, trailingStart + trailingRegion.fromStart]);
  }
  if (lineNumber >= modeledEnd) return lineNumber;
  if (direction === "down") {
    for (const [start, end] of ranges) if (end > lineNumber) return Math.max(start, lineNumber);
    return;
  }
  for (let index = ranges.length - 1; index >= 0; index--) {
    const [start, end] = ranges[index];
    if (start <= lineNumber) return Math.min(end - 1, lineNumber);
  }
}
function iterateOverDiff({ diff, diffStyle, startingLine = 0, totalLines = Infinity, expandedHunks, collapsedContextThreshold = 1, callback }) {
  var _a2;
  const iterationStart = getIterationStartState({
    diff,
    diffStyle,
    startingLine,
    expandedHunks,
    collapsedContextThreshold
  });
  const state = {
    viewportStart: startingLine,
    viewportEnd: startingLine + totalLines,
    isWindowedHighlight: startingLine > 0 || totalLines < Infinity,
    splitCount: iterationStart.splitCount,
    unifiedCount: iterationStart.unifiedCount,
    finalHunkIndex: diff.hunks.length - 1,
    shouldBreak() {
      if (!state.isWindowedHighlight) return false;
      const breakUnified = state.unifiedCount >= startingLine + totalLines;
      const breakSplit = state.splitCount >= startingLine + totalLines;
      if (diffStyle === "unified") return breakUnified;
      else if (diffStyle === "split") return breakSplit;
      else return breakUnified && breakSplit;
    },
    shouldSkip(unifiedCount, splitCount) {
      if (!state.isWindowedHighlight) return false;
      const skipUnified = unifiedCount > 0 && state.unifiedCount + unifiedCount <= startingLine;
      const skipSplit = splitCount > 0 && state.splitCount + splitCount <= startingLine;
      if (diffStyle === "unified") return skipUnified;
      else if (diffStyle === "split") return skipSplit;
      else return skipUnified && skipSplit;
    },
    incrementCounts(unifiedValue, splitValue) {
      if (diffStyle === "unified" || diffStyle === "both") state.unifiedCount += unifiedValue;
      if (diffStyle === "split" || diffStyle === "both") state.splitCount += splitValue;
    },
    isInWindow(unifiedHeight, splitHeight) {
      if (!state.isWindowedHighlight) return true;
      const unifiedInWindow = state.isInUnifiedWindow(unifiedHeight);
      const splitInWindow = state.isInSplitWindow(splitHeight);
      if (diffStyle === "unified") return unifiedInWindow;
      else if (diffStyle === "split") return splitInWindow;
      else return unifiedInWindow || splitInWindow;
    },
    isInUnifiedWindow(unifiedHeight) {
      return !state.isWindowedHighlight || state.unifiedCount >= startingLine - unifiedHeight && state.unifiedCount < startingLine + totalLines;
    },
    isInSplitWindow(splitHeight) {
      return !state.isWindowedHighlight || state.splitCount >= startingLine - splitHeight && state.splitCount < startingLine + totalLines;
    },
    emit(props, silent = false) {
      if (!silent) {
        if (diffStyle === "unified") state.incrementCounts(1, 0);
        else if (diffStyle === "split") state.incrementCounts(0, 1);
        else state.incrementCounts(1, 1);
      }
      return callback(props) ?? false;
    }
  };
  hunkIterator: for (let hunkIndex = iterationStart.hunkIndex; hunkIndex < diff.hunks.length; hunkIndex++) {
    let getTrailingCollapsedAfter = function(unifiedLineIndex2, splitLineIndex2) {
      if (trailingRegion == null || trailingRegion.collapsedLines <= 0 || trailingRegion.fromStart + trailingRegion.fromEnd > 0) return 0;
      if (diffStyle === "unified") return unifiedLineIndex2 === hunk.unifiedLineStart + hunk.unifiedLineCount - 1 ? trailingRegion.collapsedLines : 0;
      return splitLineIndex2 === hunk.splitLineStart + hunk.splitLineCount - 1 ? trailingRegion.collapsedLines : 0;
    }, consumePendingCollapsed = function() {
      if (consumedCollapsed) return 0;
      consumedCollapsed = true;
      return leadingRegion.collapsedLines;
    };
    const hunk = diff.hunks[hunkIndex];
    if (hunk == null) throw new Error("iterateOverDiff: invalid hunk index");
    if (state.shouldBreak()) break;
    const deletionBoundary = getHunkSideStartBoundary(hunk.deletionStart, hunk.deletionCount);
    const additionBoundary = getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount);
    const deletionStartIndex = !diff.isPartial && hunk.deletionCount === 0 ? deletionBoundary : hunk.deletionLineIndex;
    const additionStartIndex = !diff.isPartial && hunk.additionCount === 0 ? additionBoundary : hunk.additionLineIndex;
    const leadingRegion = getExpandedRegion({
      isPartial: diff.isPartial,
      rangeSize: hunk.collapsedBefore,
      expandedHunks,
      hunkIndex,
      collapsedContextThreshold
    });
    const trailingRegion = hunkIndex === state.finalHunkIndex ? getTrailingExpandedRegion({
      fileDiff: diff,
      hunkIndex,
      expandedHunks,
      collapsedContextThreshold,
      errorPrefix: "iterateOverDiff"
    }) : void 0;
    const expandedLineCount = leadingRegion.fromStart + leadingRegion.fromEnd;
    let consumedCollapsed = leadingRegion.collapsedLines === 0;
    if (!state.shouldSkip(expandedLineCount, expandedLineCount)) {
      let unifiedLineIndex2 = hunk.unifiedLineStart - leadingRegion.rangeSize;
      let splitLineIndex2 = hunk.splitLineStart - leadingRegion.rangeSize;
      let deletionLineIndex2 = deletionStartIndex - leadingRegion.rangeSize;
      let additionLineIndex2 = additionStartIndex - leadingRegion.rangeSize;
      let deletionLineNumber2 = deletionBoundary + 1 - leadingRegion.rangeSize;
      let additionLineNumber2 = additionBoundary + 1 - leadingRegion.rangeSize;
      if (walkContextLines(state, leadingRegion.fromStart, diffStyle, (index) => {
        return state.emit({
          hunkIndex,
          hunk,
          collapsedBefore: 0,
          collapsedAfter: 0,
          type: "context-expanded",
          deletionLine: {
            lineNumber: deletionLineNumber2 + index,
            lineIndex: deletionLineIndex2 + index,
            noEOFCR: false,
            unifiedLineIndex: unifiedLineIndex2 + index,
            splitLineIndex: splitLineIndex2 + index
          },
          additionLine: {
            unifiedLineIndex: unifiedLineIndex2 + index,
            splitLineIndex: splitLineIndex2 + index,
            lineIndex: additionLineIndex2 + index,
            lineNumber: additionLineNumber2 + index,
            noEOFCR: false
          }
        });
      })) break hunkIterator;
      unifiedLineIndex2 = hunk.unifiedLineStart - leadingRegion.fromEnd;
      splitLineIndex2 = hunk.splitLineStart - leadingRegion.fromEnd;
      deletionLineIndex2 = deletionStartIndex - leadingRegion.fromEnd;
      additionLineIndex2 = additionStartIndex - leadingRegion.fromEnd;
      deletionLineNumber2 = deletionBoundary + 1 - leadingRegion.fromEnd;
      additionLineNumber2 = additionBoundary + 1 - leadingRegion.fromEnd;
      if (walkContextLines(state, leadingRegion.fromEnd, diffStyle, (index) => {
        return state.emit({
          hunkIndex,
          hunk,
          collapsedBefore: consumePendingCollapsed(),
          collapsedAfter: 0,
          type: "context-expanded",
          deletionLine: {
            lineNumber: deletionLineNumber2 + index,
            lineIndex: deletionLineIndex2 + index,
            noEOFCR: false,
            unifiedLineIndex: unifiedLineIndex2 + index,
            splitLineIndex: splitLineIndex2 + index
          },
          additionLine: {
            unifiedLineIndex: unifiedLineIndex2 + index,
            splitLineIndex: splitLineIndex2 + index,
            lineIndex: additionLineIndex2 + index,
            lineNumber: additionLineNumber2 + index,
            noEOFCR: false
          }
        });
      }, () => {
        consumePendingCollapsed();
      })) break hunkIterator;
    } else {
      state.incrementCounts(expandedLineCount, expandedLineCount);
      consumePendingCollapsed();
    }
    let unifiedLineIndex = hunk.unifiedLineStart;
    let splitLineIndex = hunk.splitLineStart;
    let deletionLineIndex = deletionStartIndex;
    let additionLineIndex = additionStartIndex;
    let deletionLineNumber = deletionBoundary + 1;
    let additionLineNumber = additionBoundary + 1;
    const lastContent = hunk.hunkContent.at(-1);
    for (const content of hunk.hunkContent) {
      if (state.shouldBreak()) break hunkIterator;
      const isLastContent = content === lastContent;
      if (content.type === "context") {
        if (!state.shouldSkip(content.lines, content.lines)) {
          if (walkContextLines(state, content.lines, diffStyle, (index) => {
            const isLastLine = isLastContent && index === content.lines - 1;
            const unifiedRowIndex = unifiedLineIndex + index;
            const splitRowIndex = splitLineIndex + index;
            return state.emit({
              hunkIndex,
              hunk,
              collapsedBefore: consumePendingCollapsed(),
              collapsedAfter: getTrailingCollapsedAfter(unifiedRowIndex, splitRowIndex),
              type: "context",
              deletionLine: {
                lineNumber: deletionLineNumber + index,
                lineIndex: deletionLineIndex + index,
                noEOFCR: isLastLine && hunk.noEOFCRDeletions,
                unifiedLineIndex: unifiedRowIndex,
                splitLineIndex: splitRowIndex
              },
              additionLine: {
                unifiedLineIndex: unifiedRowIndex,
                splitLineIndex: splitRowIndex,
                lineIndex: additionLineIndex + index,
                lineNumber: additionLineNumber + index,
                noEOFCR: isLastLine && hunk.noEOFCRAdditions
              }
            });
          }, () => {
            consumePendingCollapsed();
          })) break hunkIterator;
        } else {
          state.incrementCounts(content.lines, content.lines);
          consumePendingCollapsed();
        }
        unifiedLineIndex += content.lines;
        splitLineIndex += content.lines;
        deletionLineIndex += content.lines;
        additionLineIndex += content.lines;
        deletionLineNumber += content.lines;
        additionLineNumber += content.lines;
      } else {
        const splitCount = Math.max(content.deletions, content.additions);
        const unifiedCount = content.deletions + content.additions;
        if (!state.shouldSkip(unifiedCount, splitCount)) {
          const iterationRanges = getChangeIterationRanges(state, content, diffStyle);
          if ((((_a2 = iterationRanges[0]) == null ? void 0 : _a2[0]) ?? 0) > 0) consumePendingCollapsed();
          for (const [rangeStart, rangeEnd] of iterationRanges) for (let index = rangeStart; index < rangeEnd; index++) {
            const collapsedAfter = getTrailingCollapsedAfter(unifiedLineIndex + index, diffStyle === "unified" ? splitLineIndex + (index < content.deletions ? index : index - content.deletions) : splitLineIndex + index);
            if (state.emit(getChangeLineData({
              hunkIndex,
              hunk,
              collapsedBefore: consumePendingCollapsed(),
              collapsedAfter,
              diffStyle,
              index,
              unifiedLineIndex,
              splitLineIndex,
              additionLineIndex,
              deletionLineIndex,
              additionLineNumber,
              deletionLineNumber,
              content,
              isLastContent,
              unifiedCount,
              splitCount
            }), true)) break hunkIterator;
          }
        }
        consumePendingCollapsed();
        state.incrementCounts(unifiedCount, splitCount);
        unifiedLineIndex += unifiedCount;
        splitLineIndex += splitCount;
        deletionLineIndex += content.deletions;
        additionLineIndex += content.additions;
        deletionLineNumber += content.deletions;
        additionLineNumber += content.additions;
      }
    }
    if (trailingRegion != null) {
      const { collapsedLines, fromStart, fromEnd } = trailingRegion;
      const len = fromStart + fromEnd;
      if (walkContextLines(state, len, diffStyle, (index) => {
        const isLastLine = index === len - 1;
        return state.emit({
          hunkIndex: diff.hunks.length,
          hunk: void 0,
          collapsedBefore: 0,
          collapsedAfter: isLastLine ? collapsedLines : 0,
          type: "context-expanded",
          deletionLine: {
            lineNumber: deletionLineNumber + index,
            lineIndex: deletionLineIndex + index,
            noEOFCR: false,
            unifiedLineIndex: unifiedLineIndex + index,
            splitLineIndex: splitLineIndex + index
          },
          additionLine: {
            unifiedLineIndex: unifiedLineIndex + index,
            splitLineIndex: splitLineIndex + index,
            lineIndex: additionLineIndex + index,
            lineNumber: additionLineNumber + index,
            noEOFCR: false
          }
        });
      }, void 0, () => state.shouldBreak())) break hunkIterator;
    }
  }
}
function getIterationStartState({ diff, diffStyle, startingLine, expandedHunks, collapsedContextThreshold }) {
  if (startingLine <= 0 || diffStyle === "both") return {
    hunkIndex: 0,
    splitCount: 0,
    unifiedCount: 0
  };
  const prefixCounts = getHunkPrefixCounts({
    diff,
    expandedHunks,
    collapsedContextThreshold
  });
  let low = 0;
  let high = diff.hunks.length - 1;
  let result = diff.hunks.length;
  while (low <= high) {
    const mid = low + high >> 1;
    const counts2 = prefixCounts[mid + 1];
    if (counts2 == null) throw new Error("iterateOverDiff: invalid hunk prefix index");
    if ((diffStyle === "unified" ? counts2.unifiedCount : counts2.splitCount) > startingLine) {
      result = mid;
      high = mid - 1;
    } else low = mid + 1;
  }
  if (result >= diff.hunks.length) {
    const counts2 = prefixCounts[diff.hunks.length];
    if (counts2 == null) throw new Error("iterateOverDiff: invalid terminal hunk prefix index");
    return {
      hunkIndex: diff.hunks.length,
      splitCount: counts2.splitCount,
      unifiedCount: counts2.unifiedCount
    };
  }
  const counts = prefixCounts[result];
  if (counts == null) throw new Error("iterateOverDiff: invalid selected hunk prefix index");
  return {
    hunkIndex: result,
    splitCount: counts.splitCount,
    unifiedCount: counts.unifiedCount
  };
}
function getHunkPrefixCounts({ diff, expandedHunks, collapsedContextThreshold }) {
  let splitCount = 0;
  let unifiedCount = 0;
  const finalHunkIndex = diff.hunks.length - 1;
  const prefixCounts = [{
    splitCount: 0,
    unifiedCount: 0
  }];
  for (let index = 0; index < diff.hunks.length; index++) {
    const hunk = diff.hunks[index];
    if (hunk == null) throw new Error("iterateOverDiff: invalid hunk summary index");
    const leadingRegion = getExpandedRegion({
      isPartial: diff.isPartial,
      rangeSize: hunk.collapsedBefore,
      expandedHunks,
      hunkIndex: index,
      collapsedContextThreshold
    });
    const leadingCount = leadingRegion.fromStart + leadingRegion.fromEnd;
    splitCount += leadingCount + hunk.splitLineCount;
    unifiedCount += leadingCount + hunk.unifiedLineCount;
    const trailingRegion = index === finalHunkIndex ? getTrailingExpandedRegion({
      fileDiff: diff,
      hunkIndex: index,
      expandedHunks,
      collapsedContextThreshold,
      errorPrefix: "iterateOverDiff"
    }) : void 0;
    if (trailingRegion != null) {
      const trailingCount = trailingRegion.fromStart + trailingRegion.fromEnd;
      splitCount += trailingCount;
      unifiedCount += trailingCount;
    }
    prefixCounts.push({
      splitCount,
      unifiedCount
    });
  }
  return prefixCounts;
}
function getContextLineIterationBounds(state, count, diffStyle) {
  if (!state.isWindowedHighlight || count <= 0) return [0, count];
  const ranges = [];
  function pushRange(currentCount) {
    const start2 = Math.max(0, state.viewportStart - currentCount);
    const end2 = Math.min(count, state.viewportEnd - currentCount);
    if (end2 > start2) ranges.push([start2, end2]);
  }
  if (diffStyle !== "split") pushRange(state.unifiedCount);
  if (diffStyle !== "unified") pushRange(state.splitCount);
  if (ranges.length === 0) return [0, 0];
  let start = ranges[0][0];
  let end = ranges[0][1];
  for (let index = 1; index < ranges.length; index++) {
    const range = ranges[index];
    start = Math.min(start, range[0]);
    end = Math.max(end, range[1]);
  }
  return [start, end];
}
function walkContextLines(state, count, diffStyle, callback, onSkippedStart, shouldBreak) {
  const [startIndex, endIndex] = getContextLineIterationBounds(state, count, diffStyle);
  if (startIndex > 0) {
    state.incrementCounts(startIndex, startIndex);
    onSkippedStart == null ? void 0 : onSkippedStart();
  }
  let index = startIndex;
  while (index < count) {
    if ((shouldBreak == null ? void 0 : shouldBreak()) === true) return true;
    if (index >= endIndex) {
      state.incrementCounts(count - index, count - index);
      break;
    }
    if (state.isInWindow(0, 0)) {
      if (callback(index) === true) return true;
    } else state.incrementCounts(1, 1);
    index++;
  }
  return false;
}
function getChangeIterationRanges(state, content, diffStyle) {
  if (!state.isWindowedHighlight) return [[0, diffStyle === "unified" ? content.deletions + content.additions : Math.max(content.deletions, content.additions)]];
  const useUnified = diffStyle !== "split";
  const useSplit = diffStyle !== "unified";
  const iterationSpace = diffStyle === "unified" ? "unified" : "split";
  const iterationRanges = [];
  function getVisibleRange(start, count) {
    if (start + count <= state.viewportStart || start >= state.viewportEnd) return;
    const visibleStart = Math.max(0, state.viewportStart - start);
    const visibleEnd = Math.min(count, state.viewportEnd - start);
    return visibleEnd > visibleStart ? [visibleStart, visibleEnd] : void 0;
  }
  function mapRangeToIteration(range, kind) {
    if (iterationSpace === "split") return range;
    return kind === "additions" ? [range[0] + content.deletions, range[1] + content.deletions] : range;
  }
  function pushRange(range, kind) {
    if (range == null) return;
    const [start, end] = mapRangeToIteration(range, kind);
    if (end > start) iterationRanges.push([start, end]);
  }
  if (useUnified) {
    pushRange(getVisibleRange(state.unifiedCount, content.deletions), "deletions");
    pushRange(getVisibleRange(state.unifiedCount + content.deletions, content.additions), "additions");
  }
  if (useSplit) {
    pushRange(getVisibleRange(state.splitCount, content.deletions), "deletions");
    pushRange(getVisibleRange(state.splitCount, content.additions), "additions");
  }
  if (iterationRanges.length === 0) return iterationRanges;
  iterationRanges.sort((a, b) => a[0] - b[0]);
  const merged = [iterationRanges[0]];
  for (const [start, end] of iterationRanges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
function getChangeLineData({ hunkIndex, hunk, collapsedAfter, collapsedBefore, diffStyle, index, unifiedLineIndex, splitLineIndex, additionLineIndex, deletionLineIndex, additionLineNumber, deletionLineNumber, content, isLastContent, unifiedCount, splitCount }) {
  const unifiedDeletionLineIndex = index < content.deletions ? unifiedLineIndex + index : void 0;
  const unifiedAdditionLineIndex = diffStyle === "unified" ? index >= content.deletions ? unifiedLineIndex + index : void 0 : index < content.additions ? unifiedLineIndex + content.deletions + index : void 0;
  const resolvedSplitLineIndex = diffStyle === "unified" ? splitLineIndex + (index < content.deletions ? index : index - content.deletions) : splitLineIndex + index;
  const deletionLineIndexValue = index < content.deletions ? deletionLineIndex + index : void 0;
  const deletionLineNumberValue = index < content.deletions ? deletionLineNumber + index : void 0;
  const additionLineIndexValue = diffStyle === "unified" ? index >= content.deletions ? additionLineIndex + (index - content.deletions) : void 0 : index < content.additions ? additionLineIndex + index : void 0;
  const additionLineNumberValue = diffStyle === "unified" ? index >= content.deletions ? additionLineNumber + (index - content.deletions) : void 0 : index < content.additions ? additionLineNumber + index : void 0;
  const noEOFCRDeletion = diffStyle === "unified" ? isLastContent && index === content.deletions - 1 && hunk.noEOFCRDeletions : isLastContent && index === splitCount - 1 && hunk.noEOFCRDeletions;
  const noEOFCRAddition = diffStyle === "unified" ? isLastContent && index === unifiedCount - 1 && hunk.noEOFCRAdditions : isLastContent && index === splitCount - 1 && hunk.noEOFCRAdditions;
  const deletionLine = deletionLineIndexValue != null && deletionLineNumberValue != null && unifiedDeletionLineIndex != null ? {
    lineNumber: deletionLineNumberValue,
    lineIndex: deletionLineIndexValue,
    noEOFCR: noEOFCRDeletion,
    unifiedLineIndex: unifiedDeletionLineIndex,
    splitLineIndex: resolvedSplitLineIndex
  } : void 0;
  const additionLine = additionLineIndexValue != null && additionLineNumberValue != null && unifiedAdditionLineIndex != null ? {
    unifiedLineIndex: unifiedAdditionLineIndex,
    splitLineIndex: resolvedSplitLineIndex,
    lineIndex: additionLineIndexValue,
    lineNumber: additionLineNumberValue,
    noEOFCR: noEOFCRAddition
  } : void 0;
  if (deletionLine == null && additionLine != null) return {
    type: "change",
    hunkIndex,
    hunk,
    collapsedAfter,
    collapsedBefore,
    deletionLine: void 0,
    additionLine
  };
  else if (deletionLine != null && additionLine == null) return {
    type: "change",
    hunkIndex,
    hunk,
    collapsedAfter,
    collapsedBefore,
    deletionLine,
    additionLine: void 0
  };
  if (deletionLine == null || additionLine == null) throw new Error("iterateOverDiff: missing change line data");
  return {
    type: "change",
    hunkIndex,
    hunk,
    collapsedAfter,
    collapsedBefore,
    deletionLine,
    additionLine
  };
}
const DEFAULT_PLAIN_TEXT_OPTIONS = { forcePlainText: false };
function renderDiffWithHighlighter(diff, highlighter2, options, { forcePlainText, startingLine, totalLines, expandedHunks, collapsedContextThreshold = 1 } = DEFAULT_PLAIN_TEXT_OPTIONS) {
  if (forcePlainText) {
    startingLine ?? (startingLine = 0);
    totalLines ?? (totalLines = Infinity);
  } else {
    startingLine = 0;
    totalLines = Infinity;
  }
  const isWindowedHighlight = startingLine > 0 || totalLines < Infinity;
  const baseThemeType = typeof options.theme === "string" ? highlighter2.getTheme(options.theme).type : void 0;
  const themeStyles = getHighlighterThemeStyles({
    theme: options.theme,
    highlighter: highlighter2
  });
  const lineDiffType = forcePlainText && !isWindowedHighlight && (diff.unifiedLineCount > 1e3 || diff.splitLineCount > 1e3) ? "none" : options.lineDiffType;
  const code = {
    deletionLines: [],
    additionLines: []
  };
  const { maxLineDiffLength } = options;
  const shouldGroupAll = !forcePlainText && !diff.isPartial;
  const expandedHunksForIteration = forcePlainText ? expandedHunks : void 0;
  const buckets = /* @__PURE__ */ new Map();
  function getBucketForHunk(hunkIndex) {
    const index = shouldGroupAll ? 0 : hunkIndex;
    const bucket = buckets.get(index) ?? createBucket();
    buckets.set(index, bucket);
    return bucket;
  }
  function appendContent(lineContent, lineIndex, segments, contentWrapper) {
    if (isWindowedHighlight) {
      let segment = segments.at(-1);
      if (segment == null || segment.targetIndex + segment.count !== lineIndex) {
        segment = {
          targetIndex: lineIndex,
          originalOffset: contentWrapper.length,
          count: 0
        };
        segments.push(segment);
      }
      segment.count++;
    }
    contentWrapper.push(lineContent);
  }
  iterateOverDiff({
    diff,
    diffStyle: "both",
    startingLine,
    totalLines,
    expandedHunks: isWindowedHighlight ? expandedHunksForIteration : true,
    collapsedContextThreshold,
    callback: ({ hunkIndex, additionLine, deletionLine, type }) => {
      const bucket = getBucketForHunk(hunkIndex);
      const splitLineIndex = additionLine != null ? additionLine.splitLineIndex : deletionLine.splitLineIndex;
      if (type === "change" && additionLine != null && deletionLine != null) computeLineDiffDecorations({
        additionLine: diff.additionLines[additionLine.lineIndex],
        deletionLine: diff.deletionLines[deletionLine.lineIndex],
        deletionLineIndex: bucket.deletionContent.length,
        additionLineIndex: bucket.additionContent.length,
        deletionDecorations: bucket.deletionDecorations,
        additionDecorations: bucket.additionDecorations,
        lineDiffType,
        maxLineDiffLength
      });
      if (deletionLine != null) {
        appendContent(diff.deletionLines[deletionLine.lineIndex], deletionLine.lineIndex, bucket.deletionSegments, bucket.deletionContent);
        bucket.deletionInfo.push({
          type: type === "change" ? "change-deletion" : type,
          lineNumber: deletionLine.lineNumber,
          altLineNumber: type === "change" ? void 0 : additionLine.lineNumber ?? void 0,
          lineIndex: `${deletionLine.unifiedLineIndex},${splitLineIndex}`
        });
      }
      if (additionLine != null) {
        appendContent(diff.additionLines[additionLine.lineIndex], additionLine.lineIndex, bucket.additionSegments, bucket.additionContent);
        bucket.additionInfo.push({
          type: type === "change" ? "change-addition" : type,
          lineNumber: additionLine.lineNumber,
          altLineNumber: type === "change" ? void 0 : deletionLine.lineNumber ?? void 0,
          lineIndex: `${additionLine.unifiedLineIndex},${splitLineIndex}`
        });
      }
    }
  });
  for (const bucket of buckets.values()) {
    if (bucket.deletionContent.length === 0 && bucket.additionContent.length === 0) continue;
    const deletionFile = {
      name: diff.prevName ?? diff.name,
      contents: bucket.deletionContent.value
    };
    const additionFile = {
      name: diff.name,
      contents: bucket.additionContent.value
    };
    const { deletionLines, additionLines } = renderTwoFiles({
      deletionFile,
      deletionInfo: bucket.deletionInfo,
      deletionDecorations: bucket.deletionDecorations,
      additionFile,
      additionInfo: bucket.additionInfo,
      additionDecorations: bucket.additionDecorations,
      highlighter: highlighter2,
      options,
      languageOverride: forcePlainText ? "text" : diff.lang
    });
    if (shouldGroupAll) {
      code.deletionLines = deletionLines;
      code.additionLines = additionLines;
      continue;
    }
    if (bucket.deletionSegments.length > 0) for (const seg of bucket.deletionSegments) for (let i = 0; i < seg.count; i++) code.deletionLines[seg.targetIndex + i] = deletionLines[seg.originalOffset + i];
    else appendItems(code.deletionLines, deletionLines);
    if (bucket.additionSegments.length > 0) for (const seg of bucket.additionSegments) for (let i = 0; i < seg.count; i++) code.additionLines[seg.targetIndex + i] = additionLines[seg.originalOffset + i];
    else appendItems(code.additionLines, additionLines);
  }
  return {
    code,
    themeStyles,
    baseThemeType
  };
}
function computeLineDiffDecorations({ deletionLine, additionLine, deletionLineIndex, additionLineIndex, deletionDecorations, additionDecorations, lineDiffType, maxLineDiffLength }) {
  if (deletionLine == null || additionLine == null || lineDiffType === "none") return;
  deletionLine = cleanLastNewline(deletionLine);
  additionLine = cleanLastNewline(additionLine);
  if (deletionLine.length > maxLineDiffLength || additionLine.length > maxLineDiffLength) return;
  const lineDiff2 = lineDiffType === "char" ? diffChars(deletionLine, additionLine) : diffWordsWithSpace(deletionLine, additionLine);
  const deletionSpans = [];
  const additionSpans = [];
  const enableJoin = lineDiffType === "word-alt";
  const lastItem = lineDiff2.at(-1);
  for (const item of lineDiff2) {
    const isLastItem = item === lastItem;
    if (!item.added && !item.removed) {
      pushOrJoinSpan({
        item,
        arr: deletionSpans,
        enableJoin,
        isNeutral: true,
        isLastItem
      });
      pushOrJoinSpan({
        item,
        arr: additionSpans,
        enableJoin,
        isNeutral: true,
        isLastItem
      });
    } else if (item.removed) pushOrJoinSpan({
      item,
      arr: deletionSpans,
      enableJoin,
      isLastItem
    });
    else pushOrJoinSpan({
      item,
      arr: additionSpans,
      enableJoin,
      isLastItem
    });
  }
  let spanIndex = 0;
  for (const span of deletionSpans) {
    if (span[0] === 1) deletionDecorations.push(createDiffSpanDecoration({
      line: deletionLineIndex,
      spanStart: spanIndex,
      spanLength: span[1].length
    }));
    spanIndex += span[1].length;
  }
  spanIndex = 0;
  for (const span of additionSpans) {
    if (span[0] === 1) additionDecorations.push(createDiffSpanDecoration({
      line: additionLineIndex,
      spanStart: spanIndex,
      spanLength: span[1].length
    }));
    spanIndex += span[1].length;
  }
}
function createBucket() {
  return {
    deletionContent: {
      push(value) {
        this.value += value;
        this.length++;
      },
      value: "",
      length: 0
    },
    additionContent: {
      push(value) {
        this.value += value;
        this.length++;
      },
      value: "",
      length: 0
    },
    deletionInfo: [],
    additionInfo: [],
    deletionDecorations: [],
    additionDecorations: [],
    deletionSegments: [],
    additionSegments: []
  };
}
function renderTwoFiles({ deletionFile, additionFile, deletionInfo, additionInfo, highlighter: highlighter2, deletionDecorations, additionDecorations, languageOverride, options: { theme: themeOrThemes, ...options } }) {
  const deletionLang = languageOverride ?? getFiletypeFromFileName(deletionFile.name);
  const additionLang = languageOverride ?? getFiletypeFromFileName(additionFile.name);
  const { state, transformers } = createTransformerWithState(options.useTokenTransformer);
  const hastConfig = (() => {
    return typeof themeOrThemes === "string" ? {
      ...options,
      lang: "text",
      theme: themeOrThemes,
      transformers,
      decorations: void 0,
      defaultColor: false,
      cssVariablePrefix: formatCSSVariablePrefix("token"),
      tokenizeTimeLimit: 0
    } : {
      ...options,
      lang: "text",
      themes: themeOrThemes,
      transformers,
      decorations: void 0,
      defaultColor: false,
      cssVariablePrefix: formatCSSVariablePrefix("token"),
      tokenizeTimeLimit: 0
    };
  })();
  return {
    deletionLines: (() => {
      if (deletionFile.contents === "") return [];
      hastConfig.lang = deletionLang;
      state.lineInfo = deletionInfo;
      hastConfig.decorations = deletionDecorations;
      return getLineNodes(highlighter2.codeToHast(cleanLastNewline(deletionFile.contents), hastConfig));
    })(),
    additionLines: (() => {
      if (additionFile.contents === "") return [];
      hastConfig.lang = additionLang;
      hastConfig.decorations = additionDecorations;
      state.lineInfo = additionInfo;
      return getLineNodes(highlighter2.codeToHast(cleanLastNewline(additionFile.contents), hastConfig));
    })()
  };
}
function recomputeDiffHunks(diff, parseDiffOptions) {
  const recomputed = parseDiffFromFile({
    name: diff.prevName ?? diff.name,
    contents: diff.deletionLines.join("")
  }, {
    name: diff.name,
    contents: diff.additionLines.join(""),
    lang: diff.lang
  }, parseDiffOptions);
  return {
    hunks: recomputed.hunks,
    splitLineCount: recomputed.splitLineCount,
    unifiedLineCount: recomputed.unifiedLineCount,
    additionLines: recomputed.additionLines,
    deletionLines: recomputed.deletionLines,
    type: recomputed.type
  };
}
function buildTopAlignedAdditionSentinel(lineCount, deletionContents) {
  const count = Math.max(lineCount, 1);
  let sentinel = Array.from({ length: count }, (_, index) => `${" ".repeat(index + 1)}
`).join("");
  if (sentinel === deletionContents) sentinel = Array.from({ length: count }, (_, index) => `\0${" ".repeat(index)}
`).join("");
  return sentinel;
}
function hasOnlyBlankAdditionContents(additionLines) {
  for (const line of additionLines) if (line.trim().length > 0) return false;
  return true;
}
function shouldTopAlignAdditionRecompute(diff, additionLines) {
  return additionLines.length > 0 && additionLines.length < diff.deletionLines.length && hasOnlyBlankAdditionContents(additionLines);
}
function recomputeTopAlignedAdditionDiff(diff, additionLines, parseDiffOptions) {
  const deletionContents = diff.deletionLines.join("");
  const additionSentinel = buildTopAlignedAdditionSentinel(additionLines.length, deletionContents);
  const recomputed = parseDiffFromFile({
    name: diff.prevName ?? diff.name,
    contents: deletionContents
  }, {
    name: diff.name,
    contents: additionSentinel,
    lang: diff.lang
  }, parseDiffOptions);
  return {
    hunks: recomputed.hunks,
    splitLineCount: recomputed.splitLineCount,
    unifiedLineCount: recomputed.unifiedLineCount,
    additionLines,
    deletionLines: recomputed.deletionLines,
    type: recomputed.type
  };
}
function recomputeEmptyDocumentDiff(diff, parseDiffOptions) {
  return recomputeTopAlignedAdditionDiff(diff, [""], parseDiffOptions);
}
function recomputeDiffHunksForEdit(diff, parseDiffOptions) {
  if (diff.additionLines.length === 0) return recomputeEmptyDocumentDiff(diff, parseDiffOptions);
  if (shouldTopAlignAdditionRecompute(diff, diff.additionLines)) return recomputeTopAlignedAdditionDiff(diff, diff.additionLines, parseDiffOptions);
  const additionLines = diff.additionLines;
  const recomputed = recomputeDiffHunks(diff, parseDiffOptions);
  preserveTrailingEditorBlankLine(recomputed, additionLines);
  return recomputed;
}
function hasTrailingEditorBlankLine(additionLines) {
  return additionLines.length > 1 && additionLines.at(-1) === "";
}
function preserveTrailingEditorBlankLine(recomputed, additionLines) {
  if (!hasTrailingEditorBlankLine(additionLines)) return;
  const extraLineCount = additionLines.length - recomputed.additionLines.length;
  if (extraLineCount <= 0) return;
  const extraAdditionLineIndex = recomputed.additionLines.length;
  const lastHunk = recomputed.hunks.at(-1);
  if (lastHunk == null) return;
  if (getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount) !== extraAdditionLineIndex) return;
  for (const content of lastHunk.hunkContent) if (content.type === "change" && content.additions < content.deletions && content.additionLineIndex + content.additions === extraAdditionLineIndex) {
    recomputed.additionLines = additionLines;
    content.additions += extraLineCount;
    lastHunk.additionCount += extraLineCount;
    lastHunk.additionLines += extraLineCount;
    recomputeDiffRenderLineCounts(recomputed);
    return;
  }
}
function updateDiffHunks(diff, changedAdditionLineIndexes, parseDiffOptions) {
  if (diff.isPartial) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  if (diff.deletionLines.length !== diff.additionLines.length) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  const changedLines = Array.from(changedAdditionLineIndexes);
  if (changedLines.length === 0) return applyHunkUpdateResult(diff, {
    hunks: diff.hunks,
    splitLineCount: diff.splitLineCount,
    unifiedLineCount: diff.unifiedLineCount,
    type: diff.type
  });
  for (const line of changedLines) {
    const additionLine = diff.additionLines[line];
    const deletionLine = diff.deletionLines[line];
    if (additionLine == null || deletionLine == null) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
    if (cleanLastNewline(additionLine) === cleanLastNewline(deletionLine)) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  }
  const affectedHunkIndexes = getAffectedHunkIndexes(diff, changedLines);
  if (affectedHunkIndexes.size === 0) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  for (const hunkIndex of affectedHunkIndexes) if (!reparseHunkRegion(diff, hunkIndex, parseDiffOptions)) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  recomputeDiffRenderLineCounts(diff);
  if (hasTrailingContextMismatch(diff)) return applyHunkUpdateResult(diff, recomputeDiffHunks(diff, parseDiffOptions));
  return applyHunkUpdateResult(diff, {
    hunks: diff.hunks,
    splitLineCount: diff.splitLineCount,
    unifiedLineCount: diff.unifiedLineCount,
    type: diff.type
  });
}
function applyHunkUpdateResult(diff, result) {
  Object.assign(diff, result);
  return result;
}
function getAffectedHunkIndexes(diff, changedAdditionLineIndexes) {
  const indexes = /* @__PURE__ */ new Set();
  for (const line of changedAdditionLineIndexes) {
    const hunkIndex = findHunkIndexForAdditionLine(diff, line);
    if (hunkIndex == null) return /* @__PURE__ */ new Set();
    indexes.add(hunkIndex);
  }
  return indexes;
}
function findHunkIndexForAdditionLine(diff, line) {
  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    const end = hunk.additionLineIndex + hunk.additionCount;
    if (line >= hunk.additionLineIndex && line < end) return hunkIndex;
  }
}
function reparseHunkRegion(diff, hunkIndex, parseDiffOptions) {
  const hunk = diff.hunks[hunkIndex];
  if (hunk == null) return false;
  const deletionSlice = diff.deletionLines.slice(hunk.deletionLineIndex, hunk.deletionLineIndex + hunk.deletionCount);
  const additionSlice = diff.additionLines.slice(hunk.additionLineIndex, hunk.additionLineIndex + hunk.additionCount);
  const reparsed = parseDiffFromFile({
    name: diff.prevName ?? diff.name,
    contents: deletionSlice.join("")
  }, {
    name: diff.name,
    contents: additionSlice.join(""),
    lang: diff.lang
  }, {
    ...parseDiffOptions,
    context: 0
  });
  const reparsedHunk = reparsed.hunks[0];
  if (reparsedHunk == null || reparsed.hunks.length !== 1) return false;
  applyReparsedHunk(hunk, reparsedHunk);
  syncHunkNoEOFCRFromFullFile(diff, hunkIndex);
  return true;
}
function syncHunkNoEOFCRFromFullFile(diff, hunkIndex) {
  const hunk = diff.hunks[hunkIndex];
  if (hunk == null) return;
  if (!(hunkIndex === diff.hunks.length - 1)) {
    hunk.noEOFCRAdditions = false;
    hunk.noEOFCRDeletions = false;
    return;
  }
  const lastAdditionLine = diff.additionLines.at(-1);
  const lastDeletionLine = diff.deletionLines.at(-1);
  hunk.noEOFCRAdditions = lastAdditionLine != null && lastAdditionLine !== "" && !lastAdditionLine.endsWith("\n");
  hunk.noEOFCRDeletions = lastDeletionLine != null && lastDeletionLine !== "" && !lastDeletionLine.endsWith("\n");
}
function applyReparsedHunk(target, parsed) {
  const additionOffset = target.additionLineIndex;
  const deletionOffset = target.deletionLineIndex;
  target.hunkContent = parsed.hunkContent.map((content) => offsetHunkContent(content, additionOffset, deletionOffset));
  target.additionLineIndex = additionOffset + parsed.additionLineIndex;
  target.additionStart = target.additionStart + parsed.additionLineIndex;
  target.additionCount = parsed.additionCount;
  target.additionLines = parsed.additionLines;
  if (parsed.deletionLineIndex >= 0) {
    target.deletionLineIndex = deletionOffset + parsed.deletionLineIndex;
    target.deletionStart = target.deletionStart + parsed.deletionLineIndex;
  }
  target.deletionCount = parsed.deletionCount;
  target.deletionLines = parsed.deletionLines;
  target.noEOFCRAdditions = parsed.noEOFCRAdditions;
  target.noEOFCRDeletions = parsed.noEOFCRDeletions;
  recomputeHunkRenderLineCounts(target);
}
function offsetHunkContent(content, additionOffset, deletionOffset) {
  return {
    ...content,
    additionLineIndex: content.additionLineIndex + additionOffset,
    deletionLineIndex: content.deletionLineIndex + deletionOffset
  };
}
function recomputeHunkRenderLineCounts(hunk) {
  let splitLineCount = 0;
  let unifiedLineCount = 0;
  for (const content of hunk.hunkContent) if (content.type === "context") {
    splitLineCount += content.lines;
    unifiedLineCount += content.lines;
  } else {
    splitLineCount += Math.max(content.additions, content.deletions);
    unifiedLineCount += content.additions + content.deletions;
  }
  hunk.splitLineCount = splitLineCount;
  hunk.unifiedLineCount = unifiedLineCount;
}
function recomputeDiffRenderLineCounts(diff) {
  let splitTotal = 0;
  let unifiedTotal = 0;
  let lastHunkAdditionEnd = 0;
  for (const hunk of diff.hunks) {
    hunk.collapsedBefore = Math.max(getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount) - lastHunkAdditionEnd, 0);
    hunk.splitLineStart = splitTotal + hunk.collapsedBefore;
    hunk.unifiedLineStart = unifiedTotal + hunk.collapsedBefore;
    recomputeHunkRenderLineCounts(hunk);
    splitTotal += hunk.collapsedBefore + hunk.splitLineCount;
    unifiedTotal += hunk.collapsedBefore + hunk.unifiedLineCount;
    lastHunkAdditionEnd = getHunkSideEndBoundary(hunk.additionStart, hunk.additionCount);
  }
  if (diff.hunks.length > 0) {
    const lastHunk = diff.hunks[diff.hunks.length - 1];
    const collapsedAfter = Math.max(diff.additionLines.length - getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount), 0);
    splitTotal += collapsedAfter;
    unifiedTotal += collapsedAfter;
  }
  diff.splitLineCount = splitTotal;
  diff.unifiedLineCount = unifiedTotal;
}
const deletionLineSetCache = /* @__PURE__ */ new WeakMap();
function normalizeEditorLines(lines) {
  if (lines.length > 1 && lines[lines.length - 1] === "") return lines.slice(0, -1);
  return lines;
}
function findDivergenceCore(deletionLines, additionLines) {
  const maxStart = Math.min(deletionLines.length, additionLines.length);
  let start = 0;
  while (start < maxStart && deletionLines[start] === additionLines[start]) start++;
  let deletionEnd = deletionLines.length;
  let additionEnd = additionLines.length;
  while (deletionEnd > start && additionEnd > start && deletionLines[deletionEnd - 1] === additionLines[additionEnd - 1]) {
    deletionEnd--;
    additionEnd--;
  }
  if (start === deletionEnd && start === additionEnd) return;
  return {
    start,
    deletionEnd,
    additionEnd
  };
}
function rebuildSessionHunks(diff, parseDiffOptions) {
  const previousHunks = diff.hunks;
  const editorAdditionLines = diff.additionLines;
  const canonicalAdditionLines = normalizeEditorLines(editorAdditionLines);
  const canonicalDiff = canonicalAdditionLines === editorAdditionLines ? diff : {
    ...diff,
    additionLines: canonicalAdditionLines
  };
  const plans = buildRegionPlans(previousHunks, parseCanonicalChangeBlocks(canonicalDiff, parseDiffOptions), diff.deletionLines.length);
  const nextHunks = buildRegionHunks(canonicalDiff, plans);
  diff.additionLines = canonicalAdditionLines;
  diff.hunks = nextHunks;
  diff.editSessionDirty = true;
  finalizeSessionHunks(diff);
  preserveTrailingEditorBlankLine(diff, editorAdditionLines);
  if (!hasRegionOrSplitLayoutChanged(previousHunks, diff.hunks)) return;
  return { regions: plans.map((plan) => plan.previousSpan) };
}
function applySessionChangedLines(diff, changedAdditionLineIndexes, parseDiffOptions, previousAdditionLines) {
  const lines = Array.from(new Set(changedAdditionLineIndexes)).filter((line) => line >= 0 && line < diff.additionLines.length).sort((a, b) => a - b);
  if (lines.length === 0) return;
  const { hunks } = diff;
  let regionIndex;
  let hunkIndex = 0;
  for (const line of lines) {
    while (hunkIndex < hunks.length) {
      const hunk2 = hunks[hunkIndex];
      if (line < getHunkAdditionStart(hunk2) + hunk2.additionCount) break;
      hunkIndex++;
    }
    const hunk = hunks[hunkIndex];
    const start = hunk == null ? void 0 : getHunkAdditionStart(hunk);
    if (start == null || line < start || regionIndex != null && regionIndex !== hunkIndex) return rebuildSessionHunks(diff, parseDiffOptions);
    regionIndex = hunkIndex;
  }
  if (regionIndex == null) return;
  if (canRetainCanonicalBlocks(diff, lines, regionIndex, previousAdditionLines, parseDiffOptions)) {
    diff.editSessionDirty = true;
    return;
  }
  return rebuildSessionHunks(diff, parseDiffOptions);
}
function canRetainCanonicalBlocks(diff, changedLines, regionIndex, previousAdditionLines, parseDiffOptions) {
  if (previousAdditionLines == null || (parseDiffOptions == null ? void 0 : parseDiffOptions.ignoreWhitespace) === true || (parseDiffOptions == null ? void 0 : parseDiffOptions.stripTrailingCr) === true) return false;
  const deletionLineSet = getDeletionLineSet(diff);
  const hunk = diff.hunks[regionIndex];
  if (hunk.hunkContent.some(isPureChange)) return false;
  for (const line of changedLines) {
    const previousLine = previousAdditionLines.get(line);
    const additionLine = diff.additionLines[line];
    if (previousLine == null || additionLine == null || deletionLineSet.has(previousLine) || deletionLineSet.has(additionLine)) return false;
    let insideBalancedChange = false;
    for (const content of hunk.hunkContent) if (content.type === "change" && content.additions === content.deletions && line >= content.additionLineIndex && line < content.additionLineIndex + content.additions) {
      insideBalancedChange = true;
      break;
    }
    if (!insideBalancedChange) return false;
  }
  return true;
}
function getDeletionLineSet(diff) {
  const cached = deletionLineSetCache.get(diff);
  if ((cached == null ? void 0 : cached.lines) === diff.deletionLines) return cached.set;
  const set = new Set(diff.deletionLines);
  deletionLineSetCache.set(diff, {
    lines: diff.deletionLines,
    set
  });
  return set;
}
function isPureChange(content) {
  return (content == null ? void 0 : content.type) === "change" && (content.additions === 0 || content.deletions === 0);
}
function remapExpandedHunksForRegionChange(expandedHunks, change) {
  const remapped = /* @__PURE__ */ new Map();
  const { regions } = change;
  for (let key = 0; key <= regions.length; key++) {
    const previous = regions[key - 1];
    const next = regions[key];
    const fromStartSource = key === 0 ? expandedHunks.get(0) : previous == null ? void 0 : expandedHunks.get(previous.lastIndex + 1);
    const fromEndSource = next == null ? void 0 : expandedHunks.get(next.firstIndex);
    const fromStart = (fromStartSource == null ? void 0 : fromStartSource.fromStart) ?? 0;
    const fromEnd = (fromEndSource == null ? void 0 : fromEndSource.fromEnd) ?? 0;
    if (fromStart > 0 || fromEnd > 0) remapped.set(key, {
      fromStart,
      fromEnd
    });
  }
  return remapped;
}
function captureExpansionAnchors(diff, expandedHunks, collapsedContextThreshold) {
  const anchors = [];
  if (diff.isPartial) return anchors;
  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    const region = getExpandedRegion({
      isPartial: diff.isPartial,
      rangeSize: hunk.collapsedBefore,
      expandedHunks,
      hunkIndex,
      collapsedContextThreshold
    });
    if (region.rangeSize <= collapsedContextThreshold) continue;
    const gapEnd = getHunkDeletionStart(hunk);
    const gapStart = gapEnd - region.rangeSize;
    if (region.fromStart > 0) anchors.push([gapStart, gapStart + region.fromStart]);
    if (region.fromEnd > 0) anchors.push([gapEnd - region.fromEnd, gapEnd]);
  }
  const trailingRegion = getTrailingExpandedRegion({
    fileDiff: diff,
    hunkIndex: diff.hunks.length - 1,
    expandedHunks,
    collapsedContextThreshold,
    errorPrefix: "captureExpansionAnchors"
  });
  if (trailingRegion != null && trailingRegion.fromStart > 0 && trailingRegion.rangeSize > collapsedContextThreshold) {
    const lastHunk = diff.hunks[diff.hunks.length - 1];
    const gapStart = getHunkDeletionStart(lastHunk) + lastHunk.deletionCount;
    anchors.push([gapStart, gapStart + trailingRegion.fromStart]);
  }
  return anchors;
}
function rebuildExpansionFromAnchors(diff, anchors) {
  const rebuilt = /* @__PURE__ */ new Map();
  if (anchors.length === 0) return rebuilt;
  const applyGap = (key, gapStart, gapEnd) => {
    if (gapEnd <= gapStart) return;
    let fromStart = 0;
    let fromEnd = 0;
    for (const [start, end] of anchors) {
      if (end <= gapStart || start >= gapEnd) continue;
      if (start <= gapStart) fromStart = Math.max(fromStart, Math.min(end, gapEnd) - gapStart);
      if (end >= gapEnd) fromEnd = Math.max(fromEnd, gapEnd - Math.max(start, gapStart));
    }
    if (fromStart > 0 || fromEnd > 0) rebuilt.set(key, {
      fromStart,
      fromEnd
    });
  };
  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    const gapEnd = getHunkDeletionStart(hunk);
    applyGap(hunkIndex, gapEnd - Math.max(hunk.collapsedBefore, 0), gapEnd);
  }
  const lastHunk = diff.hunks[diff.hunks.length - 1];
  if (lastHunk != null && !diff.isPartial && diff.deletionLines.length > 0) applyGap(diff.hunks.length, getHunkDeletionStart(lastHunk) + lastHunk.deletionCount, diff.deletionLines.length);
  return rebuilt;
}
function finishEditSessionForDiff(diff, parseDiffOptions) {
  if (diff.editSessionDirty !== true) return false;
  delete diff.editSessionDirty;
  Object.assign(diff, diff.additionLines.length <= 1 && diff.additionLines.join("") === "" ? recomputeDiffHunks(diff, parseDiffOptions) : recomputeDiffHunksForEdit(diff, parseDiffOptions));
  return true;
}
function parseCanonicalChangeBlocks(diff, parseDiffOptions) {
  if (findDivergenceCore(diff.deletionLines, diff.additionLines) == null) return [];
  const parsed = parseDiffFromFile({
    name: diff.prevName ?? diff.name,
    contents: diff.deletionLines.join("")
  }, {
    name: diff.name,
    contents: diff.additionLines.join(""),
    lang: diff.lang
  }, parseDiffOptions);
  const blocks = [];
  let coveredAdditions = 0;
  let coveredDeletions = 0;
  for (const hunk of parsed.hunks) {
    const contextLines = hunk.additionCount > 0 ? hunk.additionLineIndex - coveredAdditions : hunk.deletionLineIndex - coveredDeletions;
    coveredAdditions += contextLines;
    coveredDeletions += contextLines;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        coveredAdditions += content.lines;
        coveredDeletions += content.lines;
        continue;
      }
      const block = offsetHunkContent(content, 0, 0);
      if (block.additions === 0) block.additionLineIndex = coveredAdditions;
      if (block.deletions === 0) block.deletionLineIndex = coveredDeletions;
      blocks.push(block);
      coveredAdditions += block.additions;
      coveredDeletions += block.deletions;
    }
  }
  return blocks;
}
function buildRegionPlans(previousHunks, blocks, deletionLineCount) {
  var _a2, _b2;
  const previousPlans = previousHunks.map((hunk, index) => {
    const deletionStart = getHunkDeletionStart(hunk);
    return {
      deletionStart,
      deletionEnd: deletionStart + hunk.deletionCount,
      blocks: [],
      previousSpan: {
        firstIndex: index,
        lastIndex: index
      }
    };
  });
  const plans = [];
  let previousIndex = 0;
  for (const block of blocks) {
    const blockStart = block.deletionLineIndex;
    const blockEnd = blockStart + block.deletions;
    while (previousIndex < previousPlans.length && previousPlans[previousIndex].deletionEnd < blockStart) {
      plans.push(previousPlans[previousIndex]);
      previousIndex++;
    }
    let plan = plans.length > 0 && blockTouchesRegion(blockStart, blockEnd, plans[plans.length - 1]) ? plans.pop() : void 0;
    while (previousIndex < previousPlans.length && previousPlans[previousIndex].deletionStart <= blockEnd) {
      plan = mergeRegionPlans(plan, previousPlans[previousIndex]);
      previousIndex++;
    }
    if (plan == null) {
      let deletionStart = blockStart;
      let deletionEnd = blockEnd;
      if ((block.deletions === 0 || block.additions === 0) && deletionLineCount > block.deletions) {
        const previousEnd = ((_a2 = plans[plans.length - 1]) == null ? void 0 : _a2.deletionEnd) ?? 0;
        const nextStart = ((_b2 = previousPlans[previousIndex]) == null ? void 0 : _b2.deletionStart) ?? deletionLineCount;
        if (blockStart > previousEnd) deletionStart--;
        else if (blockEnd < nextStart) deletionEnd++;
      }
      plan = {
        deletionStart,
        deletionEnd,
        blocks: [],
        previousSpan: void 0
      };
    }
    plan.deletionStart = Math.min(plan.deletionStart, blockStart);
    plan.deletionEnd = Math.max(plan.deletionEnd, blockEnd);
    plan.blocks.push(block);
    plans.push(plan);
  }
  while (previousIndex < previousPlans.length) {
    plans.push(previousPlans[previousIndex]);
    previousIndex++;
  }
  return plans;
}
function blockTouchesRegion(blockStart, blockEnd, region) {
  return blockStart <= region.deletionEnd && blockEnd >= region.deletionStart;
}
function mergeRegionPlans(target, source) {
  if (target == null) return source;
  target.deletionStart = Math.min(target.deletionStart, source.deletionStart);
  target.deletionEnd = Math.max(target.deletionEnd, source.deletionEnd);
  target.blocks.push(...source.blocks);
  if (source.previousSpan != null) {
    target.previousSpan ?? (target.previousSpan = { ...source.previousSpan });
    target.previousSpan.firstIndex = Math.min(target.previousSpan.firstIndex, source.previousSpan.firstIndex);
    target.previousSpan.lastIndex = Math.max(target.previousSpan.lastIndex, source.previousSpan.lastIndex);
  }
  return target;
}
function buildRegionHunks(diff, plans) {
  const hunks = [];
  let deletionCursor = 0;
  let additionCursor = 0;
  for (const plan of plans) {
    const contextBefore = plan.deletionStart - deletionCursor;
    if (contextBefore < 0) throw new Error("buildRegionHunks: overlapping old-side regions");
    deletionCursor += contextBefore;
    additionCursor += contextBefore;
    const additionStart = additionCursor;
    const hunkContent = [];
    for (const canonicalBlock of plan.blocks) {
      const deletionContext = canonicalBlock.deletionLineIndex - deletionCursor;
      const additionContext = canonicalBlock.additionLineIndex - additionCursor;
      if (deletionContext < 0 || deletionContext !== additionContext) throw new Error("buildRegionHunks: canonical block context mismatch");
      pushContext(hunkContent, deletionContext, additionCursor, deletionCursor);
      deletionCursor += deletionContext;
      additionCursor += additionContext;
      hunkContent.push({ ...canonicalBlock });
      deletionCursor += canonicalBlock.deletions;
      additionCursor += canonicalBlock.additions;
    }
    const trailingContext = plan.deletionEnd - deletionCursor;
    if (trailingContext < 0) throw new Error("buildRegionHunks: block exceeds its old-side region");
    pushContext(hunkContent, trailingContext, additionCursor, deletionCursor);
    deletionCursor += trailingContext;
    additionCursor += trailingContext;
    hunks.push(createRegionHunk(diff, {
      additionStart,
      additionEnd: additionCursor,
      deletionStart: plan.deletionStart,
      deletionEnd: plan.deletionEnd
    }, hunkContent));
  }
  if (diff.deletionLines.length - deletionCursor !== diff.additionLines.length - additionCursor) throw new Error("buildRegionHunks: trailing context mismatch");
  return hunks;
}
function createRegionHunk(diff, bounds, hunkContent) {
  const additionCount = bounds.additionEnd - bounds.additionStart;
  const deletionCount = bounds.deletionEnd - bounds.deletionStart;
  let additionLines = 0;
  let deletionLines = 0;
  for (const content of hunkContent) if (content.type === "change") {
    additionLines += content.additions;
    deletionLines += content.deletions;
  }
  const hunk = {
    collapsedBefore: 0,
    additionStart: getUnifiedStart(bounds.additionStart, additionCount),
    additionCount,
    additionLines,
    additionLineIndex: getUnifiedLineIndex(bounds.additionStart, additionCount),
    deletionStart: getUnifiedStart(bounds.deletionStart, deletionCount),
    deletionCount,
    deletionLines,
    deletionLineIndex: getUnifiedLineIndex(bounds.deletionStart, deletionCount),
    hunkContent,
    hunkSpecs: `@@ -${getUnifiedStart(bounds.deletionStart, deletionCount)},${deletionCount} +${getUnifiedStart(bounds.additionStart, additionCount)},${additionCount} @@`,
    splitLineStart: 0,
    splitLineCount: 0,
    unifiedLineStart: 0,
    unifiedLineCount: 0,
    noEOFCRAdditions: false,
    noEOFCRDeletions: false
  };
  recomputeHunkRenderLineCounts(hunk);
  return hunk;
}
function pushContext(hunkContent, lines, additionLineIndex, deletionLineIndex) {
  if (lines > 0) hunkContent.push({
    type: "context",
    lines,
    additionLineIndex,
    deletionLineIndex
  });
}
function hasRegionOrSplitLayoutChanged(previous, next) {
  if (previous.length !== next.length) return true;
  for (let index = 0; index < previous.length; index++) {
    const previousHunk = previous[index];
    const nextHunk = next[index];
    if (getHunkDeletionStart(previousHunk) !== getHunkDeletionStart(nextHunk) || previousHunk.deletionCount !== nextHunk.deletionCount || getHunkAdditionStart(previousHunk) !== getHunkAdditionStart(nextHunk) || previousHunk.additionCount !== nextHunk.additionCount || previousHunk.splitLineCount !== nextHunk.splitLineCount || !haveSameSplitRowMapping(previousHunk, nextHunk)) return true;
  }
  return false;
}
function haveSameSplitRowMapping(previous, next) {
  const previousRows = iterateSplitRowMapping(previous);
  const nextRows = iterateSplitRowMapping(next);
  while (true) {
    const previousRow = previousRows.next();
    const nextRow = nextRows.next();
    if (previousRow.done === true || nextRow.done === true) return previousRow.done === nextRow.done;
    if (previousRow.value[0] !== nextRow.value[0] || previousRow.value[1] !== nextRow.value[1]) return false;
  }
}
function* iterateSplitRowMapping(hunk) {
  for (const content of hunk.hunkContent) {
    if (content.type === "context") {
      for (let offset = 0; offset < content.lines; offset++) yield [content.deletionLineIndex + offset, content.additionLineIndex + offset];
      continue;
    }
    const rowCount = Math.max(content.deletions, content.additions);
    for (let offset = 0; offset < rowCount; offset++) yield [offset < content.deletions ? content.deletionLineIndex + offset : void 0, offset < content.additions ? content.additionLineIndex + offset : void 0];
  }
}
function getHunkAdditionStart(hunk) {
  return getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount);
}
function getHunkDeletionStart(hunk) {
  return getHunkSideStartBoundary(hunk.deletionStart, hunk.deletionCount);
}
function getUnifiedStart(lineIndex, count) {
  return count === 0 ? lineIndex : lineIndex + 1;
}
function getUnifiedLineIndex(lineIndex, count) {
  return count === 0 ? lineIndex - 1 : lineIndex;
}
function finalizeSessionHunks(diff) {
  recomputeDiffRenderLineCounts(diff);
  for (let index = 0; index < diff.hunks.length; index++) syncHunkNoEOFCRFromFullFile(diff, index);
}
function isDiffPlainText(diff) {
  const computedLang = diff.lang ?? getFiletypeFromFileName(diff.name);
  const computedPreviousLang = diff.lang ?? (diff.prevName != null ? getFiletypeFromFileName(diff.prevName) : "text");
  return computedLang === "text" && computedPreviousLang === "text";
}
let instanceId$1 = -1;
var DiffHunksRenderer = class {
  constructor(options = { theme: DEFAULT_THEMES }, annotationSlotName = getLineAnnotationName, onRenderUpdate, workerManager) {
    __publicField(this, "options");
    __publicField(this, "annotationSlotName");
    __publicField(this, "onRenderUpdate");
    __publicField(this, "workerManager");
    __publicField(this, "__id", `diff-hunks-renderer:${++instanceId$1}`);
    __publicField(this, "highlighter");
    __publicField(this, "diff");
    __publicField(this, "expandedHunks", /* @__PURE__ */ new Map());
    __publicField(this, "deletionAnnotations", {});
    __publicField(this, "additionAnnotations", {});
    __publicField(this, "computedLangs", ["text"]);
    __publicField(this, "renderCache");
    __publicField(this, "pendingHighlightResult");
    __publicField(this, "pendingStructuralRows");
    __publicField(this, "editSessionActive", false);
    __publicField(this, "createAnnotationElement", (span) => {
      return createAnnotationElement(span);
    });
    this.options = options;
    this.annotationSlotName = annotationSlotName;
    this.onRenderUpdate = onRenderUpdate;
    this.workerManager = workerManager;
    if ((workerManager == null ? void 0 : workerManager.isWorkingPool()) !== true) this.highlighter = areThemesAttached(options.theme ?? DEFAULT_THEMES) ? getHighlighterIfLoaded() : void 0;
  }
  cleanUp() {
    this.recycle();
    this.expandedHunks.clear();
    this.workerManager = void 0;
    this.onRenderUpdate = void 0;
  }
  recycle() {
    var _a2;
    this.highlighter = void 0;
    this.diff = void 0;
    this.clearRenderCache();
    this.additionAnnotations = {};
    this.deletionAnnotations = {};
    (_a2 = this.workerManager) == null ? void 0 : _a2.cleanUpTasks(this);
    this.endEditSession();
  }
  /**
  * Enter edit-session mode: hunk updates preserve the current region
  * skeleton instead of recomputing hunks, and rendering happens locally
  * with the token transformer forced on (worker-pool requests/results are
  * suspended for this renderer). When the session was freshly cloned from
  * `externalDiff`, compatible highlighted markup is detached from its external
  * cache owner so the editor can reuse it without mutating shared data. An
  * empty additions document gets one row for the editor's caret.
  */
  beginEditSession(diff, externalDiff) {
    const { editSessionActive: wasAlreadyActive, renderCache } = this;
    this.editSessionActive = true;
    if (!wasAlreadyActive) this.pendingHighlightResult = void 0;
    this.diff = diff;
    if (!diff.isPartial && diff.additionLines.length === 0) {
      Object.assign(diff, recomputeEmptyDocumentDiff(diff, this.options.parseDiffOptions));
      this.markEditSessionPass(diff);
      this.clearRenderCache();
      return;
    }
    if (renderCache == null) return;
    if (wasAlreadyActive && renderCache.diff === diff) return;
    const { options } = this.getRenderOptions(diff);
    const cacheBelongsToSession = renderCache.diff === diff;
    const cacheBelongsToExternal = externalDiff != null && areDiffTargetsEqual(renderCache.diff, externalDiff);
    const { result } = renderCache;
    if (!renderCache.highlighted || result == null || !areDiffRenderOptionsEqual(renderCache.options, options) || !cacheBelongsToSession && !cacheBelongsToExternal) {
      this.clearRenderCache();
      return;
    }
    if (cacheBelongsToSession) return;
    this.renderCache = {
      diff,
      options,
      highlighted: true,
      result: {
        ...result,
        code: {
          ...result.code,
          additionLines: [...result.code.additionLines]
        }
      },
      renderRange: renderCache.renderRange
    };
  }
  /** Leave edit-session mode. The exit recompute is the host's concern. */
  endEditSession() {
    this.editSessionActive = false;
    this.pendingHighlightResult = void 0;
  }
  /**
  * Ensures that the DOM is compatible with editor render updates
  */
  editorRenderReady() {
    var _a2;
    return ((_a2 = this.renderCache) == null ? void 0 : _a2.options.useTokenTransformer) === true && this.renderCache.highlighted && this.renderCache.result != null;
  }
  /**
  * Re-highlights the current diff in the background and stages the fresh
  * result for the next render. Needed after an edit session's exit recompute:
  * session passes plain-fill shifted lines in the cached result, and the
  * recompute mutates the keyless session diff in place, so object identity
  * alone would otherwise treat the stale highlight as current forever. The
  * current result — content-correct, mostly highlighted — keeps rendering
  * until the fresh one is promoted, so no interim paint drops highlighting.
  */
  refreshHighlightedResult() {
    const { diff, renderCache, workerManager } = this;
    if (diff == null || renderCache == null || !areDiffTargetsEqual(renderCache.diff, diff) || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength())) return Promise.resolve();
    if (!this.editSessionActive && (workerManager == null ? void 0 : workerManager.isWorkingPool()) === true && diff.cacheKey != null) {
      workerManager.evictDiffFromCache(diff.cacheKey);
      return workerManager.primeDiffHighlightCache(diff).then(() => {
        this.applyRefreshedResult(diff, workerManager.getDiffResultCache(diff));
      }).catch((error) => this.onHighlightError(error));
    }
    return this.asyncHighlight(diff).then((fresh) => this.applyRefreshedResult(diff, fresh)).catch((error) => this.onHighlightError(error));
  }
  applyRefreshedResult(diff, fresh) {
    var _a2;
    const { diff: currentDiff, renderCache } = this;
    if (fresh == null || currentDiff == null || renderCache == null || !areDiffTargetsEqual(currentDiff, diff) || !areDiffTargetsEqual(renderCache.diff, diff) || this.editSessionActive) return;
    const { options } = this.getRenderOptions(currentDiff);
    if (!areDiffRenderOptionsEqual(options, fresh.options)) return;
    this.pendingHighlightResult = {
      diff: currentDiff,
      options: fresh.options,
      highlighted: true,
      result: fresh.result
    };
    (_a2 = this.onRenderUpdate) == null ? void 0 : _a2.call(this);
  }
  get diffCache() {
    var _a2;
    return ((_a2 = this.renderCache) == null ? void 0 : _a2.diff) ?? this.diff;
  }
  clearRenderCache() {
    this.renderCache = void 0;
    this.pendingHighlightResult = void 0;
    this.pendingStructuralRows = void 0;
  }
  setOptions(options) {
    this.options = options;
  }
  mergeOptions(options) {
    this.options = {
      ...this.options,
      ...options
    };
  }
  expandHunk(index, direction, expansionLineCount = this.getOptionsWithDefaults().expansionLineCount) {
    var _a2;
    const region = { ...this.expandedHunks.get(index) ?? {
      fromStart: 0,
      fromEnd: 0
    } };
    if (direction === "up" || direction === "both") region.fromStart += expansionLineCount;
    if (direction === "down" || direction === "both") region.fromEnd += expansionLineCount;
    if (((_a2 = this.renderCache) == null ? void 0 : _a2.highlighted) !== true) this.clearRenderCache();
    this.expandedHunks.set(index, region);
  }
  getExpandedHunk(hunkIndex) {
    return this.expandedHunks.get(hunkIndex) ?? DEFAULT_EXPANDED_REGION;
  }
  getExpandedHunksMap() {
    return this.expandedHunks;
  }
  /** Replace the whole expansion map (session-exit expansion remapping). */
  setExpandedHunksMap(expandedHunks) {
    this.expandedHunks = expandedHunks;
  }
  setLineAnnotations(lineAnnotations) {
    this.additionAnnotations = {};
    this.deletionAnnotations = {};
    for (const annotation of lineAnnotations) {
      const map = (() => {
        switch (annotation.side) {
          case "deletions":
            return this.deletionAnnotations;
          case "additions":
            return this.additionAnnotations;
        }
      })();
      const arr = map[annotation.lineNumber] ?? [];
      map[annotation.lineNumber] = arr;
      arr.push(annotation);
    }
  }
  /**
  * Returns true when a session-mode pass changed the region skeleton itself
  * (a gap edit synthesized or merged regions), which changes the rendered
  * row set without a line-count change — the host must escalate to a full
  * re-render instead of its cheap refresh path.
  */
  updateRenderCache(dirtyLines, themeType, lineCountChangeInFlight = false) {
    var _a2;
    this.pendingStructuralRows = void 0;
    const { renderCache } = this;
    if (renderCache == null) return false;
    const { result, diff } = renderCache;
    if (result == null) return false;
    if (diff.isPartial) throw new Error("Could not update render cache for partial diff");
    const hastLines = result.code.additionLines;
    const pendingStructuralRows = this.pendingStructuralRows = lineCountChangeInFlight ? /* @__PURE__ */ new Map() : void 0;
    const changedAdditionLines = [];
    const previousAdditionLines = /* @__PURE__ */ new Map();
    for (const [line, tokens] of dirtyLines) {
      const prevProps = ((_a2 = hastLines[line]) == null ? void 0 : _a2.properties) ?? {};
      const lineText = tokens.map((a) => a[2]).join("");
      const canSyncDiffLine = line < diff.additionLines.length;
      const prevLine = canSyncDiffLine ? diff.additionLines[line] ?? "" : "";
      const prevText = cleanLastNewline(prevLine);
      if (pendingStructuralRows == null && canSyncDiffLine) {
        diff.additionLines[line] = applyLineTextWithNewline(prevLine, lineText);
        if (prevText !== lineText) {
          changedAdditionLines.push(line);
          previousAdditionLines.set(line, prevLine);
        }
      }
      const row = {
        type: "element",
        tagName: "div",
        properties: {
          "data-line": prevProps["data-line"] ?? line + 1,
          "data-line-index": prevProps["data-line-index"] ?? line,
          "data-line-type": prevProps["data-line-type"] ?? "context"
        },
        children: tokens.map(([char, fg, text]) => {
          if (char === 0 && fg === "") {
            if (text === "") return {
              type: "element",
              tagName: "br",
              properties: {},
              children: []
            };
            return {
              type: "text",
              value: text
            };
          }
          return {
            type: "element",
            tagName: "span",
            properties: {
              "data-char": char,
              style: `color:${fg};`
            },
            children: [{
              type: "text",
              value: text
            }]
          };
        })
      };
      if (pendingStructuralRows != null) pendingStructuralRows.set(line, row);
      else hastLines[line] = row;
    }
    let regionsChanged = false;
    if (changedAdditionLines.length > 0) {
      if (this.editSessionActive) {
        if (diff.additionLines.length <= 1 && diff.additionLines.join("") === "") {
          this.applyRecomputePreservingSessionType(diff, recomputeEmptyDocumentDiff(diff, this.options.parseDiffOptions));
          regionsChanged = true;
        } else if (shouldTopAlignAdditionRecompute(diff, diff.additionLines)) {
          this.applyRecomputePreservingSessionType(diff, recomputeTopAlignedAdditionDiff(diff, diff.additionLines, this.options.parseDiffOptions));
          regionsChanged = true;
        } else {
          const change = applySessionChangedLines(diff, changedAdditionLines, this.options.parseDiffOptions, previousAdditionLines);
          this.applyExpansionRemap(change);
          regionsChanged = change != null;
        }
      } else Object.assign(diff, updateDiffHunks(diff, changedAdditionLines, this.options.parseDiffOptions));
    }
    result.baseThemeType = themeType;
    renderCache.isDirty = true;
    return regionsChanged;
  }
  applyExpansionRemap(change) {
    if (change != null) this.expandedHunks = remapExpandedHunksForRegionChange(this.expandedHunks, change);
  }
  applyDocumentChange(textDocument) {
    const { pendingStructuralRows, renderCache } = this;
    this.pendingStructuralRows = void 0;
    if (renderCache == null) return;
    const { diff, result } = renderCache;
    if (result == null) return;
    if (diff.isPartial) throw new Error("Could not apply document change for partial diff");
    const { additionLines: previousAdditionLines } = diff;
    diff.additionLines = getEditorDocumentLines(textDocument);
    result.code.additionLines = realignAdditionHastLines(previousAdditionLines, diff.additionLines, result.code.additionLines, textDocument);
    if (diff.additionLines.length <= 1 && diff.additionLines.join("") === "") {
      this.applyRecomputePreservingSessionType(diff, recomputeEmptyDocumentDiff(diff, this.options.parseDiffOptions));
      result.code.additionLines[0] = createPlainAdditionLineElement(0, textDocument.getLineText(0));
    } else if (this.editSessionActive) this.applySessionDocumentChange(diff);
    else Object.assign(diff, recomputeDiffHunksForEdit(diff, this.options.parseDiffOptions));
    if (pendingStructuralRows != null) {
      for (const [line, row] of pendingStructuralRows) if (line < result.code.additionLines.length) result.code.additionLines[line] = row;
    }
    renderCache.isDirty = true;
  }
  applySessionDocumentChange(diff) {
    const { parseDiffOptions } = this.options;
    const rawLines = diff.additionLines;
    if (shouldTopAlignAdditionRecompute(diff, rawLines)) {
      this.applyRecomputePreservingSessionType(diff, recomputeTopAlignedAdditionDiff(diff, rawLines, parseDiffOptions));
      return;
    }
    this.applyExpansionRemap(rebuildSessionHunks(diff, parseDiffOptions));
  }
  applyRecomputePreservingSessionType(diff, update) {
    const sessionType = this.editSessionActive ? diff.type : void 0;
    Object.assign(diff, update);
    if (sessionType != null) diff.type = sessionType;
    this.markEditSessionPass(diff);
  }
  markEditSessionPass(diff) {
    if (!this.editSessionActive) return;
    diff.editSessionDirty = true;
  }
  getUnifiedLineDecoration({ lineType }) {
    return {
      gutterLineType: lineType,
      contentProperties: { "data-line-type": lineType }
    };
  }
  getSplitLineDecoration({ side, type }) {
    const lineType = type === "change" ? side === "deletions" ? "change-deletion" : "change-addition" : type;
    return {
      gutterLineType: lineType,
      contentProperties: { "data-line-type": lineType }
    };
  }
  getOptionsWithDefaults() {
    var _a2;
    const { diffIndicators = "bars", diffStyle = "split", disableBackground = false, disableFileHeader = false, disableLineNumbers = false, disableVirtualizationBuffers = false, collapsed = false, expandUnchanged = false, collapsedContextThreshold = 1, expansionLineCount = 100, hunkSeparators = "line-info", lineDiffType = "word-alt", maxLineDiffLength = 1e3, overflow = "scroll", stickyHeader = false, theme = DEFAULT_THEMES, headerRenderMode = "default", tokenizeMaxLineLength = 1e3, tokenizeMaxLength = DEFAULT_TOKENIZE_MAX_LENGTH, useTokenTransformer = false, useCSSClasses = false } = this.options;
    return {
      diffIndicators,
      diffStyle,
      disableBackground,
      disableFileHeader,
      disableLineNumbers,
      disableVirtualizationBuffers,
      collapsed,
      expandUnchanged,
      collapsedContextThreshold,
      expansionLineCount,
      hunkSeparators,
      lineDiffType,
      maxLineDiffLength,
      overflow,
      stickyHeader,
      theme: ((_a2 = this.workerManager) == null ? void 0 : _a2.getDiffRenderOptions().theme) ?? theme,
      headerRenderMode,
      tokenizeMaxLineLength,
      tokenizeMaxLength,
      useTokenTransformer,
      useCSSClasses
    };
  }
  async initializeHighlighter() {
    var _a2;
    this.highlighter = await getSharedHighlighter(getHighlighterOptions(this.computedLangs, {
      theme: this.getLocalHighlightTheme(),
      preferredHighlighter: ((_a2 = this.workerManager) == null ? void 0 : _a2.getPreferredHighlighter()) ?? this.options.preferredHighlighter
    }));
    return this.highlighter;
  }
  hydrate(diff) {
    var _a2, _b2;
    if (diff == null) return;
    this.diff = diff;
    const { options } = this.getRenderOptions(diff);
    const massiveDiff = isDiffMassive(diff, this.getTokenizeMaxLength());
    let cache2 = (_a2 = this.workerManager) == null ? void 0 : _a2.getDiffResultCache(diff);
    if (cache2 != null && !areDiffRenderOptionsEqual(options, cache2.options)) cache2 = void 0;
    this.renderCache ?? (this.renderCache = {
      diff,
      hydrated: true,
      highlighted: !massiveDiff && !isDiffPlainText(diff),
      options,
      result: massiveDiff ? void 0 : cache2 == null ? void 0 : cache2.result,
      renderRange: void 0
    });
    if (!this.editSessionActive && ((_b2 = this.workerManager) == null ? void 0 : _b2.isWorkingPool()) === true) {
      if (this.renderCache.result == null && !massiveDiff) this.workerManager.highlightDiffAST(this, this.diff);
    } else if (this.highlighter == null) {
      this.computedLangs = getDiffLanguages(diff);
      this.initializeHighlighter();
    }
  }
  getLocalHighlightTheme() {
    var _a2;
    return ((_a2 = this.workerManager) == null ? void 0 : _a2.getDiffRenderOptions().theme) ?? this.options.theme ?? DEFAULT_THEMES;
  }
  getEffectiveCodeOptions() {
    var _a2;
    const poolOptions = ((_a2 = this.workerManager) == null ? void 0 : _a2.isWorkingPool()) === true ? this.workerManager.getDiffRenderOptions() : void 0;
    return {
      theme: this.getLocalHighlightTheme(),
      tokenizeMaxLineLength: (poolOptions == null ? void 0 : poolOptions.tokenizeMaxLineLength) ?? this.options.tokenizeMaxLineLength
    };
  }
  getRenderOptions(diff) {
    const options = (() => {
      var _a2;
      if (((_a2 = this.workerManager) == null ? void 0 : _a2.isWorkingPool()) === true) {
        const poolOptions = this.workerManager.getDiffRenderOptions();
        if (this.editSessionActive && poolOptions.useTokenTransformer !== true) return {
          ...poolOptions,
          useTokenTransformer: true
        };
        return poolOptions;
      }
      const { theme, tokenizeMaxLineLength, lineDiffType, maxLineDiffLength } = this.getOptionsWithDefaults();
      return {
        theme,
        useTokenTransformer: this.editSessionActive || this.options.useTokenTransformer === true,
        tokenizeMaxLineLength,
        lineDiffType,
        maxLineDiffLength
      };
    })();
    this.getOptionsWithDefaults();
    const { renderCache } = this;
    if ((renderCache == null ? void 0 : renderCache.result) == null) return {
      options,
      forceHighlight: true
    };
    if (!areDiffTargetsEqual(diff, renderCache.diff) || !areDiffRenderOptionsEqual(options, renderCache.options)) return {
      options,
      forceHighlight: true
    };
    return {
      options,
      forceHighlight: false
    };
  }
  /**
  * Returns the diff that the next synchronous render can commit without
  * changing the renderer's current diff or render cache. Components use this
  * to prepare state that must match the following DOM render.
  */
  getDiffForNextRender(diff) {
    const { options } = this.getRenderOptions(diff);
    if (this.getReadyRenderResult(diff, options) != null) return diff;
    if (this.renderCache == null) return diff;
    if (areDiffTargetsEqual(this.renderCache.diff, diff)) return this.renderCache.diff;
    const forcePlainText = !(diff.additionLines.length > 0 || diff.deletionLines.length > 0) || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength());
    return this.canRenderDiff(diff, options, forcePlainText) ? diff : this.renderCache.diff;
  }
  canRenderDiff(diff, options, forcePlainText) {
    var _a2, _b2;
    const { renderCache } = this;
    if (renderCache == null || areDiffTargetsEqual(renderCache.diff, diff)) return true;
    if (forcePlainText) return renderCache.result == null && renderCache.hydrated !== true || ((_a2 = this.workerManager) == null ? void 0 : _a2.isWorkingPool()) === true || this.highlighter != null && areThemesAttached(options.theme);
    if (renderCache.result == null && renderCache.hydrated !== true) return true;
    if (!this.editSessionActive && ((_b2 = this.workerManager) == null ? void 0 : _b2.isWorkingPool()) === true) return !renderCache.highlighted;
    return this.highlighter != null && areThemesAttached(options.theme);
  }
  renderDiff(diff = this.diff, renderRange = DEFAULT_RENDER_RANGE) {
    var _a2;
    this.diff = diff;
    if (diff == null) {
      this.pendingHighlightResult = void 0;
      return;
    }
    const { expandUnchanged, collapsedContextThreshold } = this.getOptionsWithDefaults();
    let { options, forceHighlight } = this.getRenderOptions(diff);
    const readyResult = this.getReadyRenderResult(diff, options);
    this.pendingHighlightResult = void 0;
    if (readyResult != null) {
      this.renderCache = {
        ...readyResult,
        diff,
        renderRange: void 0
      };
      forceHighlight = false;
    }
    this.renderCache ?? (this.renderCache = {
      diff,
      highlighted: false,
      options,
      result: void 0,
      renderRange: void 0
    });
    const hasContent = diff.additionLines.length > 0 || diff.deletionLines.length > 0;
    const forcePlainText = !hasContent || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength());
    const canRenderDiff = this.canRenderDiff(diff, options, forcePlainText);
    const newContent = !areDiffTargetsEqual(diff, this.renderCache.diff);
    const newRenderRange = !areRenderRangesEqual(this.renderCache.renderRange, renderRange);
    if (!this.editSessionActive && ((_a2 = this.workerManager) == null ? void 0 : _a2.isWorkingPool()) === true) {
      const preserveHydratedContent = this.renderCache.result == null && this.renderCache.highlighted && !forcePlainText && !newContent && isDefaultRenderRange(renderRange);
      if (canRenderDiff && !preserveHydratedContent && (forcePlainText || this.renderCache.result == null || !this.renderCache.highlighted && (newContent || newRenderRange))) {
        this.renderCache.diff = diff;
        this.renderCache.options = options;
        this.renderCache.highlighted = false;
        if (this.renderCache.result == null || newContent || newRenderRange || forceHighlight) this.renderCache.result = this.workerManager.getPlainDiffAST(diff, renderRange.startingLine, renderRange.totalLines, isDefaultRenderRange(renderRange) ? true : expandUnchanged ? true : this.expandedHunks, collapsedContextThreshold);
        this.renderCache.renderRange = renderRange;
      }
      if (!forcePlainText && hasContent && (!this.renderCache.highlighted || forceHighlight)) this.workerManager.highlightDiffAST(this, diff);
    } else {
      this.computedLangs = getDiffLanguages(diff);
      this.highlighter ?? (this.highlighter = getHighlighterIfLoaded());
      const hasThemes = this.highlighter != null && areThemesAttached(options.theme);
      const hasLangs = this.highlighter != null && areLanguagesAttached(this.computedLangs);
      const canHighlight = !forcePlainText && hasLangs;
      if (canRenderDiff && this.highlighter != null && hasThemes && (forceHighlight || forcePlainText || !this.renderCache.highlighted && canHighlight || this.renderCache.result == null)) {
        const { result, options: options2 } = this.renderDiffWithHighlighter(diff, this.highlighter, forcePlainText || !hasLangs);
        this.renderCache = {
          diff,
          options: options2,
          highlighted: canHighlight,
          result,
          renderRange: void 0
        };
      }
      if (!hasThemes || !forcePlainText && !hasLangs) this.asyncHighlight(diff).then(({ result, options: options2 }) => {
        this.applyHighlightResult(diff, result, options2, !forcePlainText);
      });
    }
    return this.renderCache.result != null ? this.processDiffResult(this.renderCache.diff, renderRange, this.renderCache.result) : void 0;
  }
  async asyncRender(diff, renderRange = DEFAULT_RENDER_RANGE) {
    this.diff = diff;
    const { result } = await this.asyncHighlight(diff);
    return this.processDiffResult(diff, renderRange, result);
  }
  createPreElement(split, totalLines, customProperties) {
    const { diffIndicators, disableBackground, disableLineNumbers, overflow } = this.getOptionsWithDefaults();
    return createPreElement({
      type: "diff",
      diffIndicators,
      disableBackground,
      disableLineNumbers,
      overflow,
      split,
      totalLines,
      customProperties
    });
  }
  async asyncHighlight(diff) {
    const forcePlainText = isDiffMassive(diff, this.getTokenizeMaxLength());
    this.computedLangs = forcePlainText ? ["text"] : getDiffLanguages(diff);
    const hasThemes = this.highlighter != null && areThemesAttached(this.getLocalHighlightTheme());
    const hasLangs = forcePlainText || this.highlighter != null && areLanguagesAttached(this.computedLangs);
    if (this.highlighter == null || !hasThemes || !hasLangs) this.highlighter = await this.initializeHighlighter();
    return this.renderDiffWithHighlighter(diff, this.highlighter, forcePlainText);
  }
  renderDiffWithHighlighter(diff, highlighter2, forcePlainText = false) {
    const { options } = this.getRenderOptions(diff);
    const { collapsedContextThreshold } = this.getOptionsWithDefaults();
    const result = renderDiffWithHighlighter(diff, highlighter2, options, {
      forcePlainText,
      expandedHunks: forcePlainText ? true : void 0,
      collapsedContextThreshold
    });
    if (this.editSessionActive && diff.additionLines.length === 1 && diff.additionLines[0] === "" && result.code.additionLines[0] == null) {
      let fallbackLine;
      iterateOverDiff({
        diff,
        diffStyle: "both",
        expandedHunks: forcePlainText ? true : void 0,
        collapsedContextThreshold,
        callback: ({ additionLine }) => {
          if ((additionLine == null ? void 0 : additionLine.lineIndex) !== 0) return;
          fallbackLine = additionLine;
          return true;
        }
      });
      if (fallbackLine == null) throw new Error("DiffHunksRenderer: missing empty addition line");
      result.code.additionLines[0] = createPlainAdditionLineElement(0, "", fallbackLine.unifiedLineIndex, fallbackLine.splitLineIndex);
    }
    return {
      result,
      options
    };
  }
  onHighlightSuccess(diff, result, options, highlighted = true) {
    if (this.editSessionActive) return;
    this.applyHighlightResult(diff, result, options, highlighted);
  }
  applyHighlightResult(diff, result, options, highlighted = true) {
    var _a2;
    const { diff: currentDiff, renderCache } = this;
    if (currentDiff == null || renderCache == null || !areDiffTargetsEqual(currentDiff, diff) || !areDiffRenderOptionsEqual(options, this.getRenderOptions(currentDiff).options)) return;
    if (!(renderCache.result == null || !renderCache.highlighted || !areDiffRenderOptionsEqual(renderCache.options, options) || !areDiffTargetsEqual(renderCache.diff, currentDiff))) return;
    this.pendingHighlightResult = {
      diff: currentDiff,
      options,
      highlighted,
      result
    };
    (_a2 = this.onRenderUpdate) == null ? void 0 : _a2.call(this);
  }
  getMatchingWorkerResultCache(diff, options) {
    var _a2;
    if (this.editSessionActive) return;
    const cache2 = (_a2 = this.workerManager) == null ? void 0 : _a2.getDiffResultCache(diff);
    if (cache2 == null || !areDiffRenderOptionsEqual(options, cache2.options)) return;
    return cache2;
  }
  getReadyRenderResult(diff, options) {
    const { pendingHighlightResult } = this;
    if (pendingHighlightResult != null && areDiffTargetsEqual(pendingHighlightResult.diff, diff) && areDiffRenderOptionsEqual(pendingHighlightResult.options, options)) return pendingHighlightResult;
    const workerCache = this.getMatchingWorkerResultCache(diff, options);
    if (workerCache == null || this.hasHighlightedRenderCache(diff, options)) return;
    return {
      diff,
      highlighted: true,
      ...workerCache
    };
  }
  hasHighlightedRenderCache(diff, options) {
    const { renderCache } = this;
    return (renderCache == null ? void 0 : renderCache.result) != null && renderCache.highlighted && areDiffTargetsEqual(diff, renderCache.diff) && areDiffRenderOptionsEqual(options, renderCache.options);
  }
  onHighlightError(error) {
    console.error(error);
  }
  getTokenizeMaxLength() {
    return this.options.tokenizeMaxLength ?? 1e5;
  }
  processDiffResult(fileDiff, renderRange, { code, themeStyles, baseThemeType }) {
    var _a2;
    const { diffStyle, disableFileHeader, expandUnchanged, expansionLineCount, collapsedContextThreshold, hunkSeparators } = this.getOptionsWithDefaults();
    const isRenderCacheDirty = ((_a2 = this.renderCache) == null ? void 0 : _a2.isDirty) ?? false;
    const unified = diffStyle === "unified";
    const canHydrateContext = canHydrateCollapsedContext(fileDiff, this.options.loadDiffFiles != null);
    const isExpandableDiff = !fileDiff.isPartial || canHydrateContext;
    let additionsContentAST = [];
    let deletionsContentAST = [];
    let unifiedContentAST = [];
    const hunkData = [];
    const { additionLines, deletionLines } = code;
    const context = {
      rowCount: 0,
      hunkSeparators,
      additionsContentAST,
      deletionsContentAST,
      unifiedContentAST,
      unifiedGutterAST: createGutterWrapper(),
      deletionsGutterAST: createGutterWrapper(),
      additionsGutterAST: createGutterWrapper(),
      expansionLineCount,
      hunkData,
      incrementRowCount(count = 1) {
        context.rowCount += count;
      },
      pushToGutter(type, element) {
        switch (type) {
          case "unified":
            context.unifiedGutterAST.children.push(element);
            break;
          case "deletions":
            context.deletionsGutterAST.children.push(element);
            break;
          case "additions":
            context.additionsGutterAST.children.push(element);
        }
      }
    };
    const trailingRangeSize = getTrailingContextRangeSize({
      fileDiff,
      errorPrefix: "DiffHunksRenderer.processDiffResult"
    });
    const pendingSplitContext = {
      size: 0,
      side: void 0,
      increment() {
        this.size += 1;
      },
      flush() {
        if (diffStyle === "unified") return;
        if (this.size <= 0 || this.side == null) {
          this.side = void 0;
          this.size = 0;
          return;
        }
        if (this.side === "additions") {
          context.pushToGutter("additions", createGutterGap(void 0, "buffer", this.size));
          additionsContentAST == null ? void 0 : additionsContentAST.push(createEmptyRowBuffer(this.size));
        } else {
          context.pushToGutter("deletions", createGutterGap(void 0, "buffer", this.size));
          deletionsContentAST == null ? void 0 : deletionsContentAST.push(createEmptyRowBuffer(this.size));
        }
        this.size = 0;
        this.side = void 0;
      }
    };
    const pushGutterLineNumber = (type, lineType, lineNumber, lineIndex, gutterProperties) => {
      context.pushToGutter(type, createGutterItem(lineType, lineNumber, lineIndex, gutterProperties));
    };
    function pushSeparators(props) {
      pendingSplitContext.flush();
      if (diffStyle === "unified") pushSeparator("unified", props, context);
      else {
        pushSeparator("deletions", props, context);
        pushSeparator("additions", props, context);
      }
    }
    this.pushFileLevelAnnotations(fileDiff, diffStyle, renderRange, context);
    iterateOverDiff({
      diff: fileDiff,
      diffStyle,
      startingLine: renderRange.startingLine,
      totalLines: renderRange.totalLines,
      expandedHunks: expandUnchanged ? true : this.expandedHunks,
      collapsedContextThreshold,
      callback: ({ hunkIndex, hunk, collapsedBefore, collapsedAfter, additionLine, deletionLine, type }) => {
        var _a3, _b2;
        const splitLineIndex = deletionLine != null ? deletionLine.splitLineIndex : additionLine.splitLineIndex;
        const unifiedLineIndex = additionLine != null ? additionLine.unifiedLineIndex : deletionLine.unifiedLineIndex;
        if (diffStyle === "split" && type !== "change") pendingSplitContext.flush();
        if (collapsedBefore > 0) pushSeparators({
          hunkIndex,
          collapsedLines: collapsedBefore,
          rangeSize: Math.max((hunk == null ? void 0 : hunk.collapsedBefore) ?? 0, 0),
          hunkSpecs: hunk == null ? void 0 : hunk.hunkSpecs,
          isFirstHunk: hunkIndex === 0,
          isLastHunk: false,
          isExpandable: isExpandableDiff
        });
        const lineIndex = diffStyle === "unified" ? unifiedLineIndex : splitLineIndex;
        const renderedLineContext = {
          type,
          hunkIndex,
          lineIndex,
          unifiedLineIndex,
          splitLineIndex,
          deletionLine,
          additionLine
        };
        if (diffStyle === "unified") {
          const injectedRows = (_a3 = this.getUnifiedInjectedRowsForLine) == null ? void 0 : _a3.call(this, renderedLineContext);
          if ((injectedRows == null ? void 0 : injectedRows.before) != null) pushUnifiedInjectedRows(injectedRows.before, context);
          let deletionLineContent = deletionLine != null ? deletionLines[deletionLine.lineIndex] : void 0;
          let additionLineContent = additionLine != null ? additionLines[additionLine.lineIndex] : void 0;
          if (deletionLineContent == null && additionLineContent == null) {
            const errorMessage = "DiffHunksRenderer.processDiffResult: deletionLine and additionLine are null, something is wrong";
            console.error(errorMessage, { file: fileDiff.name });
            throw new Error(errorMessage);
          }
          const lineType = type === "change" ? additionLine != null ? "change-addition" : "change-deletion" : type;
          const lineDecoration = this.getUnifiedLineDecoration({
            type,
            lineType,
            additionLineIndex: additionLine == null ? void 0 : additionLine.lineIndex,
            deletionLineIndex: deletionLine == null ? void 0 : deletionLine.lineIndex
          });
          pushGutterLineNumber("unified", lineDecoration.gutterLineType, additionLine != null ? additionLine.lineNumber : deletionLine.lineNumber, `${unifiedLineIndex},${splitLineIndex}`, lineDecoration.gutterProperties);
          if (additionLineContent != null) additionLineContent = withContentProperties(additionLineContent, lineDecoration.contentProperties, isRenderCacheDirty && additionLine != null ? {
            "data-line": additionLine.lineNumber,
            "data-line-index": `${unifiedLineIndex},${splitLineIndex}`
          } : void 0);
          else if (deletionLineContent != null) deletionLineContent = withContentProperties(deletionLineContent, lineDecoration.contentProperties, isRenderCacheDirty && deletionLine != null ? {
            "data-line": deletionLine.lineNumber,
            "data-line-index": `${unifiedLineIndex},${splitLineIndex}`
          } : void 0);
          pushLineWithAnnotation({
            diffStyle: "unified",
            type,
            deletionLine: deletionLineContent,
            additionLine: additionLineContent,
            unifiedSpan: this.getAnnotations("unified", deletionLine == null ? void 0 : deletionLine.lineNumber, additionLine == null ? void 0 : additionLine.lineNumber, hunkIndex, lineIndex),
            createAnnotationElement: (span) => this.createAnnotationElement(span),
            context
          });
          if ((injectedRows == null ? void 0 : injectedRows.after) != null) pushUnifiedInjectedRows(injectedRows.after, context);
        } else {
          const injectedRows = (_b2 = this.getSplitInjectedRowsForLine) == null ? void 0 : _b2.call(this, renderedLineContext);
          if ((injectedRows == null ? void 0 : injectedRows.before) != null) pushSplitInjectedRows(injectedRows.before, context, pendingSplitContext);
          let deletionLineContent = deletionLine != null ? deletionLines[deletionLine.lineIndex] : void 0;
          let additionLineContent = additionLine != null ? additionLines[additionLine.lineIndex] : void 0;
          const deletionLineDecoration = this.getSplitLineDecoration({
            side: "deletions",
            type,
            lineIndex: deletionLine == null ? void 0 : deletionLine.lineIndex
          });
          const additionLineDecoration = this.getSplitLineDecoration({
            side: "additions",
            type,
            lineIndex: additionLine == null ? void 0 : additionLine.lineIndex
          });
          if (deletionLineContent == null && additionLineContent == null) {
            const errorMessage = "DiffHunksRenderer.processDiffResult: deletionLine and additionLine are null, something is wrong";
            console.error(errorMessage, { file: fileDiff.name });
            throw new Error(errorMessage);
          }
          const missingSide = (() => {
            if (type === "change") {
              if (additionLineContent == null) return "additions";
              else if (deletionLineContent == null) return "deletions";
            }
          })();
          if (missingSide != null) {
            if (pendingSplitContext.side != null && pendingSplitContext.side !== missingSide) pendingSplitContext.flush();
            pendingSplitContext.side = missingSide;
            pendingSplitContext.increment();
          } else if (type === "change") pendingSplitContext.flush();
          const annotationSpans = this.getAnnotations("split", deletionLine == null ? void 0 : deletionLine.lineNumber, additionLine == null ? void 0 : additionLine.lineNumber, hunkIndex, lineIndex);
          if (annotationSpans != null && pendingSplitContext.size > 0) pendingSplitContext.flush();
          if (deletionLine != null) {
            const deletionLineDecorated = withContentProperties(deletionLineContent, deletionLineDecoration.contentProperties, isRenderCacheDirty ? {
              "data-line": deletionLine.lineNumber,
              "data-line-index": `${deletionLine.unifiedLineIndex},${splitLineIndex}`
            } : void 0);
            pushGutterLineNumber("deletions", deletionLineDecoration.gutterLineType, deletionLine.lineNumber, `${deletionLine.unifiedLineIndex},${splitLineIndex}`, deletionLineDecoration.gutterProperties);
            if (deletionLineDecorated != null) deletionLineContent = deletionLineDecorated;
          }
          if (additionLine != null) {
            const additionLineDecorated = withContentProperties(additionLineContent, additionLineDecoration.contentProperties, isRenderCacheDirty ? {
              "data-line": additionLine.lineNumber,
              "data-line-index": `${additionLine.unifiedLineIndex},${splitLineIndex}`
            } : void 0);
            pushGutterLineNumber("additions", additionLineDecoration.gutterLineType, additionLine.lineNumber, `${additionLine.unifiedLineIndex},${splitLineIndex}`, additionLineDecoration.gutterProperties);
            if (additionLineDecorated != null) additionLineContent = additionLineDecorated;
          }
          pushLineWithAnnotation({
            diffStyle: "split",
            type,
            additionLine: additionLineContent,
            deletionLine: deletionLineContent,
            ...annotationSpans,
            createAnnotationElement: (span) => this.createAnnotationElement(span),
            context
          });
          if ((injectedRows == null ? void 0 : injectedRows.after) != null) pushSplitInjectedRows(injectedRows.after, context, pendingSplitContext);
        }
        const isFinalSplitHunkRow = diffStyle === "split" && hunk != null && splitLineIndex === hunk.splitLineStart + hunk.splitLineCount - 1;
        const isFinalHunkRow = hunkIndex === fileDiff.hunks.length - 1 && hunk != null && (diffStyle === "split" ? splitLineIndex === hunk.splitLineStart + hunk.splitLineCount - 1 : unifiedLineIndex === hunk.unifiedLineStart + hunk.unifiedLineCount - 1);
        const splitNoEOFCRDeletion = isFinalSplitHunkRow ? hunk.noEOFCRDeletions : false;
        const splitNoEOFCRAddition = isFinalSplitHunkRow ? hunk.noEOFCRAdditions : false;
        const noEOFCRDeletion = ((deletionLine == null ? void 0 : deletionLine.noEOFCR) ?? false) || splitNoEOFCRDeletion;
        const noEOFCRAddition = ((additionLine == null ? void 0 : additionLine.noEOFCR) ?? false) || splitNoEOFCRAddition;
        if (noEOFCRAddition || noEOFCRDeletion) {
          if (diffStyle === "split") pendingSplitContext.flush();
          if (noEOFCRDeletion) {
            const noEOFType = type === "context" || type === "context-expanded" ? type : "change-deletion";
            if (diffStyle === "unified") {
              context.unifiedContentAST.push(createNoNewlineElement(noEOFType));
              context.pushToGutter("unified", createGutterGap(noEOFType, "metadata", 1));
            } else {
              context.deletionsContentAST.push(createNoNewlineElement(noEOFType));
              context.pushToGutter("deletions", createGutterGap(noEOFType, "metadata", 1));
              if (!noEOFCRAddition) {
                context.pushToGutter("additions", createGutterGap(void 0, "buffer", 1));
                context.additionsContentAST.push(createEmptyRowBuffer(1));
              }
            }
          }
          if (noEOFCRAddition) {
            const noEOFType = type === "context" || type === "context-expanded" ? type : "change-addition";
            if (diffStyle === "unified") {
              context.unifiedContentAST.push(createNoNewlineElement(noEOFType));
              context.pushToGutter("unified", createGutterGap(noEOFType, "metadata", 1));
            } else {
              context.additionsContentAST.push(createNoNewlineElement(noEOFType));
              context.pushToGutter("additions", createGutterGap(noEOFType, "metadata", 1));
              if (!noEOFCRDeletion) {
                context.pushToGutter("deletions", createGutterGap(void 0, "buffer", 1));
                context.deletionsContentAST.push(createEmptyRowBuffer(1));
              }
            }
          }
          context.incrementRowCount(1);
        }
        if (hunkSeparators !== "simple" && hunkSeparators !== "metadata" && (collapsedAfter > 0 || isFinalHunkRow && canHydrateContext)) pushSeparators({
          hunkIndex: type === "context-expanded" ? hunkIndex : hunkIndex + 1,
          collapsedLines: isFinalHunkRow && canHydrateContext ? "unknown" : collapsedAfter,
          rangeSize: trailingRangeSize,
          hunkSpecs: void 0,
          isFirstHunk: false,
          isLastHunk: true,
          isExpandable: isExpandableDiff
        });
        context.incrementRowCount(1);
      }
    });
    if (diffStyle === "split") pendingSplitContext.flush();
    const totalLines = Math.max(getTotalLineCountFromHunks(fileDiff.hunks), fileDiff.additionLines.length ?? 0, fileDiff.deletionLines.length ?? 0);
    const hasBuffer = renderRange.bufferBefore > 0 || renderRange.bufferAfter > 0;
    const shouldIncludeAdditions = !unified && fileDiff.type !== "deleted";
    const shouldIncludeDeletions = !unified && fileDiff.type !== "new";
    const hasContent = context.rowCount > 0 || hasBuffer;
    additionsContentAST = shouldIncludeAdditions && hasContent ? additionsContentAST : void 0;
    deletionsContentAST = shouldIncludeDeletions && hasContent ? deletionsContentAST : void 0;
    unifiedContentAST = unified && hasContent ? unifiedContentAST : void 0;
    const preNode = this.createPreElement(deletionsContentAST != null && additionsContentAST != null, totalLines);
    return {
      fileDiff,
      unifiedGutterAST: unified && hasContent ? context.unifiedGutterAST.children : void 0,
      unifiedContentAST,
      deletionsGutterAST: shouldIncludeDeletions && hasContent ? context.deletionsGutterAST.children : void 0,
      deletionsContentAST,
      additionsGutterAST: shouldIncludeAdditions && hasContent ? context.additionsGutterAST.children : void 0,
      additionsContentAST,
      hunkData,
      preNode,
      themeStyles,
      baseThemeType,
      headerElement: !disableFileHeader ? this.renderHeader(fileDiff) : void 0,
      totalLines,
      rowCount: context.rowCount,
      bufferBefore: renderRange.bufferBefore,
      bufferAfter: renderRange.bufferAfter,
      css: ""
    };
  }
  renderCodeAST(type, result) {
    const gutterAST = type === "unified" ? result.unifiedGutterAST : type === "deletions" ? result.deletionsGutterAST : result.additionsGutterAST;
    const contentAST = type === "unified" ? result.unifiedContentAST : type === "deletions" ? result.deletionsContentAST : result.additionsContentAST;
    if (gutterAST == null || contentAST == null) return;
    const gutter = createGutterWrapper(gutterAST);
    gutter.properties.style = `grid-row: span ${result.rowCount}`;
    return [gutter, createContentColumn(contentAST, result.rowCount)];
  }
  renderFullAST(result, children = []) {
    const containerSize = this.getOptionsWithDefaults().hunkSeparators === "line-info";
    const unifiedAST = this.renderCodeAST("unified", result);
    if (unifiedAST != null) {
      children.push(createHastElement({
        tagName: "code",
        children: unifiedAST,
        properties: {
          "data-code": "",
          "data-container-size": containerSize ? "" : void 0,
          "data-unified": ""
        }
      }));
      return {
        ...result.preNode,
        children
      };
    }
    const deletionsAST = this.renderCodeAST("deletions", result);
    if (deletionsAST != null) children.push(createHastElement({
      tagName: "code",
      children: deletionsAST,
      properties: {
        "data-code": "",
        "data-container-size": containerSize ? "" : void 0,
        "data-deletions": ""
      }
    }));
    const additionsAST = this.renderCodeAST("additions", result);
    if (additionsAST != null) children.push(createHastElement({
      tagName: "code",
      children: additionsAST,
      properties: {
        "data-code": "",
        "data-container-size": containerSize ? "" : void 0,
        "data-additions": ""
      }
    }));
    return {
      ...result.preNode,
      children
    };
  }
  renderFullHTML(result, tempChildren = []) {
    return toHtml(this.renderFullAST(result, tempChildren));
  }
  renderPartialHTML(children, columnType) {
    if (columnType == null) return toHtml(children);
    return toHtml(createHastElement({
      tagName: "code",
      children,
      properties: {
        "data-code": "",
        "data-container-size": this.getOptionsWithDefaults().hunkSeparators === "line-info" ? "" : void 0,
        [`data-${columnType}`]: ""
      }
    }));
  }
  pushFileLevelAnnotations(fileDiff, diffStyle, renderRange, context) {
    if (!shouldRenderFileAnnotations(renderRange)) return;
    const deletionAnnotationNames = fileDiff.type !== "new" ? this.getAnnotationNames(getFileAnnotations(this.deletionAnnotations)) : [];
    const additionAnnotationNames = fileDiff.type !== "deleted" ? this.getAnnotationNames(getFileAnnotations(this.additionAnnotations)) : [];
    if (deletionAnnotationNames.length === 0 && additionAnnotationNames.length === 0) return;
    const hunkIndex = -1;
    const lineIndex = -1;
    const { createAnnotationElement: createAnnotationElement2 } = this;
    if (diffStyle === "unified") {
      pushLineWithAnnotation({
        diffStyle,
        type: "context",
        unifiedSpan: {
          type: "annotation",
          hunkIndex,
          lineIndex,
          annotations: deletionAnnotationNames.concat(additionAnnotationNames)
        },
        createAnnotationElement: createAnnotationElement2,
        context
      });
      return;
    }
    pushLineWithAnnotation({
      diffStyle,
      type: "context",
      deletionSpan: {
        type: "annotation",
        hunkIndex,
        lineIndex,
        annotations: deletionAnnotationNames
      },
      additionSpan: {
        type: "annotation",
        hunkIndex,
        lineIndex,
        annotations: additionAnnotationNames
      },
      createAnnotationElement: createAnnotationElement2,
      context
    });
  }
  getAnnotations(type, deletionLineNumber, additionLineNumber, hunkIndex, lineIndex) {
    const deletionSpan = {
      type: "annotation",
      hunkIndex,
      lineIndex,
      annotations: []
    };
    if (deletionLineNumber != null) for (const anno of this.deletionAnnotations[deletionLineNumber] ?? []) deletionSpan.annotations.push(this.annotationSlotName(anno));
    const additionSpan = {
      type: "annotation",
      hunkIndex,
      lineIndex,
      annotations: []
    };
    if (additionLineNumber != null) for (const anno of this.additionAnnotations[additionLineNumber] ?? []) (type === "unified" ? deletionSpan : additionSpan).annotations.push(this.annotationSlotName(anno));
    if (type === "unified") {
      if (deletionSpan.annotations.length > 0) return deletionSpan;
      return;
    }
    if (additionSpan.annotations.length === 0 && deletionSpan.annotations.length === 0) return;
    return {
      deletionSpan,
      additionSpan
    };
  }
  getAnnotationNames(annotations) {
    return (annotations == null ? void 0 : annotations.map((annotation) => this.annotationSlotName(annotation))) ?? [];
  }
  renderHeader(diff) {
    const { headerRenderMode, stickyHeader } = this.getOptionsWithDefaults();
    return createFileHeaderElement({
      fileOrDiff: diff,
      mode: headerRenderMode,
      stickyHeader
    });
  }
};
const EN_PLURAL_RULES = new Intl.PluralRules("en-US");
function getModifiedLinesString(lines) {
  return `${lines} unmodified line${EN_PLURAL_RULES.select(lines) === "one" ? "" : "s"}`;
}
function pushUnifiedInjectedRows(rows, context) {
  for (const row of rows) {
    context.unifiedContentAST.push(row.content);
    context.pushToGutter("unified", row.gutter);
    context.incrementRowCount(1);
  }
}
function pushSplitInjectedRows(rows, context, pendingSplitContext) {
  for (const { deletion, addition } of rows) {
    if (deletion == null && addition == null) continue;
    const missingSide = deletion != null && addition != null ? void 0 : deletion == null ? "deletions" : "additions";
    if (missingSide == null || pendingSplitContext.side !== missingSide) pendingSplitContext.flush();
    if (deletion != null) {
      context.deletionsContentAST.push(deletion.content);
      context.pushToGutter("deletions", deletion.gutter);
    }
    if (addition != null) {
      context.additionsContentAST.push(addition.content);
      context.pushToGutter("additions", addition.gutter);
    }
    if (missingSide != null) {
      pendingSplitContext.side = missingSide;
      pendingSplitContext.increment();
    }
    context.incrementRowCount(1);
  }
}
function pushLineWithAnnotation({ diffStyle, type, deletionLine, additionLine, unifiedSpan, deletionSpan, additionSpan, createAnnotationElement: createAnnotationElement2, context }) {
  let hasAnnotationRow = false;
  if (diffStyle === "unified") {
    if (additionLine != null) context.unifiedContentAST.push(additionLine);
    else if (deletionLine != null) context.unifiedContentAST.push(deletionLine);
    if (unifiedSpan != null) {
      const lineType = type === "change" ? deletionLine != null ? "change-deletion" : "change-addition" : type;
      context.unifiedContentAST.push(createAnnotationElement2(unifiedSpan));
      context.pushToGutter("unified", createGutterGap(lineType, "annotation", 1));
      hasAnnotationRow = true;
    }
  } else if (diffStyle === "split") {
    if (deletionLine != null) context.deletionsContentAST.push(deletionLine);
    if (additionLine != null) context.additionsContentAST.push(additionLine);
    if (deletionSpan != null) {
      const lineType = type === "change" ? deletionLine != null ? "change-deletion" : "context" : type;
      context.deletionsContentAST.push(createAnnotationElement2(deletionSpan));
      context.pushToGutter("deletions", createGutterGap(lineType, "annotation", 1));
      hasAnnotationRow = true;
    }
    if (additionSpan != null) {
      const lineType = type === "change" ? additionLine != null ? "change-addition" : "context" : type;
      context.additionsContentAST.push(createAnnotationElement2(additionSpan));
      context.pushToGutter("additions", createGutterGap(lineType, "annotation", 1));
      hasAnnotationRow = true;
    }
  }
  if (hasAnnotationRow) context.incrementRowCount(1);
}
function pushSeparator(type, { hunkIndex, collapsedLines, rangeSize, hunkSpecs, isFirstHunk, isLastHunk, isExpandable }, context) {
  if (typeof collapsedLines === "number" && collapsedLines <= 0) return;
  const linesAST = type === "unified" ? context.unifiedContentAST : type === "deletions" ? context.deletionsContentAST : context.additionsContentAST;
  if (context.hunkSeparators === "metadata") {
    if (hunkSpecs != null) {
      context.pushToGutter(type, createSeparator({
        type: "metadata",
        content: hunkSpecs,
        isFirstHunk,
        isLastHunk
      }));
      linesAST.push(createSeparator({
        type: "metadata",
        content: hunkSpecs,
        isFirstHunk,
        isLastHunk
      }));
      if (type !== "additions") context.incrementRowCount(1);
    }
    return;
  }
  if (context.hunkSeparators === "simple") {
    if (hunkIndex > 0) {
      context.pushToGutter(type, createSeparator({
        type: "simple",
        isFirstHunk,
        isLastHunk: false
      }));
      linesAST.push(createSeparator({
        type: "simple",
        isFirstHunk,
        isLastHunk: false
      }));
      if (type !== "additions") context.incrementRowCount(1);
    }
    return;
  }
  const slotName = getHunkSeparatorSlotName(type, hunkIndex);
  const chunked = rangeSize > context.expansionLineCount;
  const expandIndex = isExpandable ? hunkIndex : void 0;
  const content = typeof collapsedLines === "number" ? getModifiedLinesString(collapsedLines) : "More unchanged context may be available";
  context.pushToGutter(type, createSeparator({
    type: context.hunkSeparators,
    content,
    expandIndex,
    chunked,
    slotName,
    isFirstHunk,
    isLastHunk
  }));
  linesAST.push(createSeparator({
    type: context.hunkSeparators,
    content,
    expandIndex,
    chunked,
    slotName,
    isFirstHunk,
    isLastHunk
  }));
  if (type !== "additions") context.incrementRowCount(1);
  context.hunkData.push({
    slotName,
    hunkIndex,
    lines: typeof collapsedLines === "number" ? collapsedLines : 0,
    lineCountKnown: typeof collapsedLines === "number",
    type,
    expandable: isExpandable ? {
      up: !isFirstHunk,
      down: !isLastHunk,
      chunked
    } : void 0
  });
}
function withContentProperties(lineNode, contentProperties, extendProperties) {
  if (lineNode == null || lineNode.type !== "element" || contentProperties == null && extendProperties == null) return lineNode;
  return {
    ...lineNode,
    properties: {
      ...lineNode.properties,
      ...contentProperties,
      ...extendProperties
    }
  };
}
function contentLineCount(lines) {
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}
function realignAdditionHastLines(previousLines, nextLines, hastLines, textDocument) {
  const previousContentLength = contentLineCount(previousLines);
  const nextContentLength = contentLineCount(nextLines);
  const maxShared = Math.min(previousContentLength, nextContentLength);
  let prefix = 0;
  while (prefix < maxShared && previousLines[prefix] === nextLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < maxShared - prefix && previousLines[previousContentLength - 1 - suffix] === nextLines[nextContentLength - 1 - suffix]) suffix++;
  const realigned = new Array(nextLines.length);
  for (let index = 0; index < prefix; index++) realigned[index] = hastLines[index];
  for (let offset = 0; offset < suffix; offset++) realigned[nextContentLength - 1 - offset] = hastLines[previousContentLength - 1 - offset];
  if (previousContentLength < previousLines.length && nextContentLength < nextLines.length) realigned[nextLines.length - 1] = hastLines[previousLines.length - 1];
  for (let index = prefix; index < nextLines.length; index++) realigned[index] ?? (realigned[index] = createPlainAdditionLineElement(index, textDocument.getLineText(index)));
  return realigned;
}
function createPlainAdditionLineElement(lineIndex, lineText, unifiedLineIndex = lineIndex, splitLineIndex = lineIndex) {
  return {
    type: "element",
    tagName: "div",
    properties: {
      "data-line": lineIndex + 1,
      "data-line-index": `${unifiedLineIndex},${splitLineIndex}`,
      "data-line-type": "context"
    },
    children: [{
      type: "element",
      tagName: "span",
      properties: { "data-char": 0 },
      children: [{
        type: "text",
        value: lineText
      }]
    }]
  };
}
function getEditorDocumentLines(textDocument) {
  const lines = [];
  for (let line = 0; line < textDocument.lineCount; line++) lines.push(textDocument.getLineText(line, true));
  return lines;
}
function getDiffLanguages(diff) {
  if (diff.lang != null) return [diff.lang];
  const deletionLang = getFiletypeFromFileName(diff.prevName ?? diff.name);
  const additionLang = getFiletypeFromFileName(diff.name);
  return deletionLang === additionLang ? [additionLang] : [deletionLang, additionLang];
}
function isDiffMassive(diff, tokenizeMaxLength) {
  return Math.max(diff.additionLines.length, diff.deletionLines.length) > tokenizeMaxLength;
}
function canHydrateCollapsedContext(fileDiff, hasFileLoader) {
  return fileDiff.isPartial && hasFileLoader && (fileDiff.type === "change" || fileDiff.type === "rename-changed");
}
function areDiffLineAnnotationsEqual(annotationA, annotationB) {
  return annotationA.lineNumber === annotationB.lineNumber && annotationA.side === annotationB.side && annotationA.metadata === annotationB.metadata;
}
function areHunkDataEqual(hunkA, hunkB) {
  var _a2, _b2, _c, _d, _e, _f;
  return hunkA.slotName === hunkB.slotName && hunkA.hunkIndex === hunkB.hunkIndex && hunkA.lines === hunkB.lines && hunkA.lineCountKnown === hunkB.lineCountKnown && hunkA.type === hunkB.type && ((_a2 = hunkA.expandable) == null ? void 0 : _a2.chunked) === ((_b2 = hunkB.expandable) == null ? void 0 : _b2.chunked) && ((_c = hunkA.expandable) == null ? void 0 : _c.up) === ((_d = hunkB.expandable) == null ? void 0 : _d.up) && ((_e = hunkA.expandable) == null ? void 0 : _e.down) === ((_f = hunkB.expandable) == null ? void 0 : _f.down);
}
async function awaitWithTimeout(callback, timeout = 300) {
  let timeoutId;
  try {
    await Promise.race([callback(), new Promise((resolve) => {
      timeoutId = setTimeout(resolve, timeout);
    })]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}
function getDiffFileInput({ oldFile, newFile }, context) {
  if (oldFile === void 0 && newFile === void 0) return;
  if (oldFile === void 0 || newFile === void 0) throw new Error(`${context}: Pass null for an intentionally missing oldFile or newFile side`);
  if (oldFile === null) {
    if (newFile === null) throw new Error(`${context}: You must pass oldFile, newFile, or both`);
    return {
      oldFile,
      newFile
    };
  }
  if (newFile === null) return {
    oldFile,
    newFile
  };
  return {
    oldFile,
    newFile
  };
}
function getDiffHunksRendererOptions(options) {
  return {
    theme: options == null ? void 0 : options.theme,
    disableLineNumbers: options == null ? void 0 : options.disableLineNumbers,
    overflow: options == null ? void 0 : options.overflow,
    collapsed: options == null ? void 0 : options.collapsed,
    disableFileHeader: options == null ? void 0 : options.disableFileHeader,
    disableVirtualizationBuffers: options == null ? void 0 : options.disableVirtualizationBuffers,
    stickyHeader: options == null ? void 0 : options.stickyHeader,
    preferredHighlighter: options == null ? void 0 : options.preferredHighlighter,
    useCSSClasses: options == null ? void 0 : options.useCSSClasses,
    useTokenTransformer: shouldUseTokenTransformer(options),
    tokenizeMaxLineLength: options == null ? void 0 : options.tokenizeMaxLineLength,
    tokenizeMaxLength: options == null ? void 0 : options.tokenizeMaxLength,
    diffStyle: options == null ? void 0 : options.diffStyle,
    diffIndicators: options == null ? void 0 : options.diffIndicators,
    disableBackground: options == null ? void 0 : options.disableBackground,
    hunkSeparators: typeof (options == null ? void 0 : options.hunkSeparators) === "function" ? "custom" : options == null ? void 0 : options.hunkSeparators,
    expandUnchanged: options == null ? void 0 : options.expandUnchanged,
    loadDiffFiles: options == null ? void 0 : options.loadDiffFiles,
    collapsedContextThreshold: options == null ? void 0 : options.collapsedContextThreshold,
    lineDiffType: options == null ? void 0 : options.lineDiffType,
    maxLineDiffLength: options == null ? void 0 : options.maxLineDiffLength,
    expansionLineCount: options == null ? void 0 : options.expansionLineCount,
    headerRenderMode: (options == null ? void 0 : options.renderCustomHeader) != null ? "custom" : "default"
  };
}
function canHydrateDiff(fileDiff) {
  return fileDiff.isPartial && (fileDiff.type === "change" || fileDiff.type === "rename-changed" || fileDiff.type === "rename-pure");
}
function createEditSessionDiff(fileDiff) {
  const editSessionDiff = { ...fileDiff };
  delete editSessionDiff.cacheKey;
  return editSessionDiff;
}
function shouldResetUndoState(prevDiff, nextDiff) {
  if (prevDiff.isPartial || nextDiff.isPartial) throw new Error("FileDiff.shouldResetEditorForExternalDiff: diffs must be fully hydrated");
  const prevLanguage = prevDiff.lang ?? getFiletypeFromFileName(prevDiff.name);
  const nextLanguage = nextDiff.lang ?? getFiletypeFromFileName(nextDiff.name);
  const prevHasOldFile = prevDiff.type !== "new";
  const nextHasOldFile = nextDiff.type !== "new";
  if (prevDiff.name !== nextDiff.name || prevLanguage !== nextLanguage || prevHasOldFile !== nextHasOldFile || prevDiff.deletionLines.length !== nextDiff.deletionLines.length) return true;
  return prevDiff.deletionLines.some((line, index) => line !== nextDiff.deletionLines[index]);
}
function areLinesEqual(first, second) {
  return first.length === second.length && first.every((line, index) => line === second[index]);
}
function canRestoreDiffSession(snapshot, externalDiff) {
  const { oldFile } = snapshot;
  if (oldFile == null) return externalDiff.type === "new";
  return externalDiff.type !== "new" && oldFile.name === (externalDiff.prevName ?? externalDiff.name) && areLinesEqual(oldFile.lines, externalDiff.deletionLines);
}
let instanceId = -1;
var FileDiff = (_b = class {
  constructor(options = { theme: DEFAULT_THEMES }, workerManager, isContainerManaged = false) {
    __publicField(this, "options");
    __publicField(this, "workerManager");
    __publicField(this, "isContainerManaged");
    __publicField(this, "__id", `file-diff:${++instanceId}`);
    __publicField(this, "type", "file-diff");
    __publicField(this, "fileContainer");
    __publicField(this, "spriteSVG");
    __publicField(this, "pre");
    __publicField(this, "codeUnified");
    __publicField(this, "codeDeletions");
    __publicField(this, "codeAdditions");
    __publicField(this, "bufferBefore");
    __publicField(this, "bufferAfter");
    __publicField(this, "themeCSSStyle");
    __publicField(this, "appliedThemeCSS");
    __publicField(this, "hasAdoptedThemeCSS", false);
    __publicField(this, "unsafeCSSStyle");
    __publicField(this, "appliedUnsafeCSS");
    __publicField(this, "gutterUtilityContent");
    __publicField(this, "headerElement");
    __publicField(this, "headerPrefix");
    __publicField(this, "headerFilenameSuffix");
    __publicField(this, "headerMetadata");
    __publicField(this, "headerCustom");
    __publicField(this, "separatorCache", /* @__PURE__ */ new Map());
    __publicField(this, "errorWrapper");
    __publicField(this, "placeHolder");
    __publicField(this, "hunksRenderer");
    __publicField(this, "resizeManager");
    __publicField(this, "scrollSyncManager");
    __publicField(this, "interactionManager");
    __publicField(this, "annotationCache", /* @__PURE__ */ new Map());
    __publicField(this, "lineAnnotations", []);
    __publicField(this, "managersDirty", false);
    __publicField(this, "deletionFile");
    __publicField(this, "additionFile");
    __publicField(this, "fileDiff");
    __publicField(this, "editSession");
    __publicField(this, "renderedDiff");
    __publicField(this, "renderRange");
    __publicField(this, "pendingFiles");
    __publicField(this, "appliedPreAttributes");
    __publicField(this, "headerCache", {
      lastRenderedHTML: void 0,
      html: void 0,
      fileDiff: void 0
    });
    __publicField(this, "lastRowCount");
    __publicField(this, "mounted", false);
    __publicField(this, "enabled", true);
    __publicField(this, "editor");
    __publicField(this, "refreshViewTimeout");
    __publicField(this, "lineStateRefreshPending", false);
    __publicField(this, "deferredSelectedLines");
    __publicField(this, "deferredEditorActiveLine");
    __publicField(this, "handleHighlightRender", () => {
      this.rerender();
    });
    __publicField(this, "getLineIndex", (lineNumber, side = "additions") => {
      return this.getLineIndexForDiff(this.getDiffForLineIndex(), lineNumber, side);
    });
    __publicField(this, "getHoveredLine", () => {
      return this.interactionManager.getHoveredLine();
    });
    __publicField(this, "getAnnotationSlotName", (annotation) => {
      var _a2;
      return resolveEditSessionSlotName((_a2 = this.editSession) == null ? void 0 : _a2.annotations, annotation, getLineAnnotationName);
    });
    __publicField(this, "handleExpandHunk", (hunkIndex, direction, expansionLineCountOverride) => {
      this.expandHunk(hunkIndex, direction, expansionLineCountOverride);
    });
    __publicField(this, "expandHunk", (hunkIndex, direction, expansionLineCountOverride) => {
      this.hunksRenderer.expandHunk(hunkIndex, direction, expansionLineCountOverride);
      this.loadFilesIfNecessary();
      this.rerender();
    });
    __publicField(this, "handleEditSessionRender", () => {
      this.rerender();
      this.flushDeferredLineState();
    });
    var _a2;
    this.options = options;
    this.workerManager = workerManager;
    this.isContainerManaged = isContainerManaged;
    this.hunksRenderer = this.createHunksRenderer(options);
    this.resizeManager = new ResizeManager();
    this.scrollSyncManager = new ScrollSyncManager();
    this.interactionManager = new InteractionManager("diff", pluckInteractionOptions(options, typeof options.hunkSeparators === "function" || (options.hunkSeparators ?? "line-info") === "line-info" || options.hunkSeparators === "line-info-basic" ? this.handleExpandHunk : void 0, this.getLineIndex));
    (_a2 = this.workerManager) == null ? void 0 : _a2.subscribeToThemeChanges(this);
    this.enabled = true;
  }
  getTheme() {
    var _a2;
    return ((_a2 = this.workerManager) == null ? void 0 : _a2.getDiffRenderOptions().theme) ?? this.options.theme ?? DEFAULT_THEMES;
  }
  getHunksRendererOptions(options) {
    return getDiffHunksRendererOptions(options);
  }
  createHunksRenderer(options) {
    return new DiffHunksRenderer(this.getHunksRendererOptions(options), this.getAnnotationSlotName, this.handleHighlightRender, this.workerManager);
  }
  getDiffForLineIndex() {
    return this.getRenderedDiff();
  }
  getLineIndexForDiff(fileDiff, lineNumber, side) {
    if (fileDiff == null) return;
    const lastHunk = fileDiff.hunks.at(-1);
    let targetUnifiedIndex;
    let targetSplitIndex;
    hunkIterator: for (const hunk of fileDiff.hunks) {
      const hunkStart = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
      const hunkCount = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
      let currentLineNumber = getHunkSideStartBoundary(hunkStart, hunkCount) + 1;
      let splitIndex = hunk.splitLineStart;
      let unifiedIndex = hunk.unifiedLineStart;
      if (lineNumber < currentLineNumber) {
        const difference = currentLineNumber - lineNumber;
        targetUnifiedIndex = Math.max(unifiedIndex - difference, 0);
        targetSplitIndex = Math.max(splitIndex - difference, 0);
        break hunkIterator;
      }
      if (lineNumber >= currentLineNumber + hunkCount) {
        if (hunk === lastHunk) {
          const difference = lineNumber - (currentLineNumber + hunkCount);
          targetUnifiedIndex = unifiedIndex + hunk.unifiedLineCount + difference;
          targetSplitIndex = splitIndex + hunk.splitLineCount + difference;
          break hunkIterator;
        }
        continue;
      }
      for (const content of hunk.hunkContent) if (content.type === "context") {
        if (lineNumber < currentLineNumber + content.lines) {
          const difference = lineNumber - currentLineNumber;
          targetSplitIndex = splitIndex + difference;
          targetUnifiedIndex = unifiedIndex + difference;
          break hunkIterator;
        } else {
          currentLineNumber += content.lines;
          splitIndex += content.lines;
          unifiedIndex += content.lines;
        }
      } else {
        const sideCount = side === "deletions" ? content.deletions : content.additions;
        if (lineNumber < currentLineNumber + sideCount) {
          const indexDifference = lineNumber - currentLineNumber;
          targetUnifiedIndex = unifiedIndex + (side === "additions" ? content.deletions : 0) + indexDifference;
          targetSplitIndex = splitIndex + indexDifference;
          break hunkIterator;
        } else {
          currentLineNumber += sideCount;
          splitIndex += Math.max(content.deletions, content.additions);
          unifiedIndex += content.deletions + content.additions;
        }
      }
      break hunkIterator;
    }
    if (targetUnifiedIndex == null || targetSplitIndex == null) return;
    return [targetUnifiedIndex, targetSplitIndex];
  }
  setOptions(options) {
    if (options == null) return;
    this.options = options;
    this.clearReusableHeader();
    this.hunksRenderer.setOptions(this.getHunksRendererOptions(options));
    this.syncInteractionOptions();
  }
  syncInteractionOptions() {
    this.interactionManager.setOptions(pluckInteractionOptions(this.options, typeof this.options.hunkSeparators === "function" || (this.options.hunkSeparators ?? "line-info") === "line-info" || this.options.hunkSeparators === "line-info-basic" ? this.handleExpandHunk : void 0, this.getLineIndex));
  }
  mergeOptions(options) {
    this.options = {
      ...this.options,
      ...options
    };
  }
  setThemeType(themeType) {
    if ((this.options.themeType ?? "system") === themeType) return;
    this.mergeOptions({ themeType });
    this.applyCachedThemeState(themeType);
  }
  applyCachedThemeState(themeType) {
    if (typeof this.options.theme === "string" || this.fileContainer == null || this.appliedThemeCSS == null) return false;
    const effectiveThemeType = this.appliedThemeCSS.baseThemeType ?? themeType;
    if (this.appliedThemeCSS.themeType === effectiveThemeType) return false;
    this.applyThemeState(this.fileContainer, this.appliedThemeCSS.themeStyles, themeType, this.appliedThemeCSS.baseThemeType);
    return true;
  }
  hasThemeChanged() {
    return this.appliedThemeCSS != null && !areThemesEqual(this.appliedThemeCSS.theme, this.getTheme());
  }
  getLatestAnnotations() {
    var _a2, _b2;
    return ((_b2 = (_a2 = this.editSession) == null ? void 0 : _a2.annotations) == null ? void 0 : _b2.current) ?? this.lineAnnotations;
  }
  isNewAnnotations(lineAnnotations) {
    var _a2;
    const session = (_a2 = this.editSession) == null ? void 0 : _a2.annotations;
    if (lineAnnotations === this.lineAnnotations) return false;
    return session == null || lineAnnotations !== session.provided && lineAnnotations !== session.current;
  }
  setLineAnnotations(lineAnnotations) {
    var _a2;
    const sessionAnnotations = (_a2 = this.editSession) == null ? void 0 : _a2.annotations;
    if (sessionAnnotations == null) {
      this.lineAnnotations = lineAnnotations;
      return;
    }
    if (!this.isNewAnnotations(lineAnnotations)) return;
    this.lineAnnotations = lineAnnotations;
    writeEditSessionAnnotations(sessionAnnotations, lineAnnotations, getLineAnnotationName);
  }
  syncEditSessionAnnotationsFromEditor(lineAnnotations) {
    var _a2;
    const session = (_a2 = this.editSession) == null ? void 0 : _a2.annotations;
    if (session == null || lineAnnotations === session.current) return false;
    session.current = lineAnnotations;
    this.hunksRenderer.setLineAnnotations(lineAnnotations);
    this.renderAnnotations();
    return true;
  }
  canPartiallyRender(forceRender, annotationsChanged, didContentChange) {
    if (forceRender || annotationsChanged || didContentChange || typeof this.options.hunkSeparators === "function") return false;
    return true;
  }
  setSelectedLines(range, options) {
    if (this.lineStateRefreshPending) this.deferredSelectedLines = [range, options];
    else this.interactionManager.setSelection(range, options);
  }
  setEditorActiveLine(lineNumber, options) {
    if (this.lineStateRefreshPending) this.deferredEditorActiveLine = [lineNumber, options];
    else this.interactionManager.setEditorActiveLine(lineNumber, {
      lineNumberOnly: options == null ? void 0 : options.lineNumberOnly,
      side: (options == null ? void 0 : options.side) ?? "additions"
    });
  }
  flushDeferredLineState() {
    const { deferredEditorActiveLine: editorActiveLine, deferredSelectedLines: selectedLines } = this;
    this.lineStateRefreshPending = false;
    this.deferredEditorActiveLine = void 0;
    this.deferredSelectedLines = void 0;
    if (editorActiveLine != null) this.setEditorActiveLine(...editorActiveLine);
    if (selectedLines != null) this.interactionManager.setSelection(...selectedLines);
  }
  flushManagers() {
    if (!this.managersDirty || this.pre == null) {
      this.managersDirty = false;
      return;
    }
    const { diffStyle = "split", overflow = "scroll" } = this.options;
    this.interactionManager.setup(this.pre);
    this.resizeManager.setup(this.pre, {
      disableAnnotations: overflow === "wrap",
      columnVariables: this.shouldApplyColumnVariables(overflow) ? "apply" : "measure"
    });
    if (overflow === "scroll" && diffStyle === "split") this.scrollSyncManager.setup(this.pre, this.codeDeletions, this.codeAdditions);
    else this.scrollSyncManager.cleanUp();
    this.managersDirty = false;
  }
  shouldApplyColumnVariables(overflow) {
    var _a2;
    if (typeof this.options.hunkSeparators === "function") return true;
    return overflow === "scroll" && (this.getLatestAnnotations().length > 0 || ((_a2 = this.pre) == null ? void 0 : _a2.hasAttribute("data-has-merge-conflict")) === true);
  }
  getCodeScrollLeft() {
    var _a2, _b2, _c;
    return Math.max(((_a2 = this.codeUnified) == null ? void 0 : _a2.scrollLeft) ?? 0, ((_b2 = this.codeDeletions) == null ? void 0 : _b2.scrollLeft) ?? 0, ((_c = this.codeAdditions) == null ? void 0 : _c.scrollLeft) ?? 0);
  }
  setCodeScrollLeft(position) {
    if (this.codeUnified != null) this.codeUnified.scrollLeft = position;
    if (this.codeAdditions != null) this.codeAdditions.scrollLeft = position;
    if (this.codeDeletions != null) this.codeDeletions.scrollLeft = position;
  }
  __getEffectiveCodeOptions() {
    return {
      ...this.options,
      ...this.hunksRenderer.getEffectiveCodeOptions()
    };
  }
  cleanUp(recycle = false) {
    var _a2, _b2, _c, _d, _e, _f;
    const { editor } = this;
    dequeueRender(this.handleEditSessionRender);
    this.emitPostRender(true);
    editor == null ? void 0 : editor.cleanUp(recycle ? "recycle" : "discard");
    if (!recycle) this.editor = void 0;
    this.resizeManager.cleanUp();
    this.interactionManager.cleanUp();
    this.scrollSyncManager.cleanUp();
    this.managersDirty = false;
    (_a2 = this.workerManager) == null ? void 0 : _a2.unsubscribeToThemeChanges(this);
    this.renderRange = void 0;
    if (!recycle) this.pendingFiles = void 0;
    if (!this.isContainerManaged) (_b2 = this.fileContainer) == null ? void 0 : _b2.remove();
    this.fileContainer = void 0;
    this.mounted = false;
    if (!recycle) this.lineAnnotations = [];
    this.clearAuxiliaryNodes();
    this.annotationCache.clear();
    this.pre = void 0;
    this.codeUnified = void 0;
    this.codeDeletions = void 0;
    this.codeAdditions = void 0;
    (_c = this.bufferBefore) == null ? void 0 : _c.remove();
    this.bufferBefore = void 0;
    (_d = this.bufferAfter) == null ? void 0 : _d.remove();
    this.bufferAfter = void 0;
    this.appliedPreAttributes = void 0;
    this.headerElement = void 0;
    this.headerPrefix = void 0;
    this.headerFilenameSuffix = void 0;
    this.headerMetadata = void 0;
    this.headerCustom = void 0;
    (_e = this.placeHolder) == null ? void 0 : _e.remove();
    this.placeHolder = void 0;
    this.headerCache.lastRenderedHTML = void 0;
    if (!recycle) this.clearReusableHeader();
    (_f = this.errorWrapper) == null ? void 0 : _f.remove();
    this.errorWrapper = void 0;
    this.spriteSVG = void 0;
    this.lastRowCount = void 0;
    this.themeCSSStyle = void 0;
    this.appliedThemeCSS = void 0;
    this.hasAdoptedThemeCSS = false;
    this.unsafeCSSStyle = void 0;
    this.appliedUnsafeCSS = void 0;
    if (recycle) this.hunksRenderer.recycle();
    else {
      this.hunksRenderer.cleanUp();
      this.workerManager = void 0;
      this.fileDiff = void 0;
      this.editSession = void 0;
      this.renderedDiff = void 0;
      this.deletionFile = void 0;
      this.additionFile = void 0;
    }
    if (this.refreshViewTimeout != null) {
      clearTimeout(this.refreshViewTimeout);
      this.refreshViewTimeout = void 0;
    }
    this.lineStateRefreshPending = false;
    this.deferredEditorActiveLine = void 0;
    this.deferredSelectedLines = void 0;
    this.enabled = false;
  }
  virtualizedSetup() {
    var _a2;
    this.enabled = true;
    (_a2 = this.workerManager) == null ? void 0 : _a2.subscribeToThemeChanges(this);
  }
  hydrate({ fileContainer, prerenderedHTML, preventEmit = false, lineAnnotations, fileDiff, ...fileInputProps }) {
    if (!this.enabled) throw new Error("FileDiff.hydrate: attempting to call hydrate after cleaned up");
    if (this.fileContainer != null) throw new Error("FileDiff.hydrate: hydrate can only be called before the instance has rendered or hydrated");
    const fileInput = getDiffFileInput(fileInputProps, "FileDiff.hydrate");
    const oldFile = fileInput == null ? void 0 : fileInput.oldFile;
    const newFile = fileInput == null ? void 0 : fileInput.newFile;
    this.hydrateElements(fileContainer, prerenderedHTML);
    const forceEditorRender = this.editor != null;
    if (forceEditorRender || shouldRenderCode(this.pre, hasDiffContent({
      fileDiff,
      oldFile,
      newFile
    }), this.options.collapsed) || shouldRenderHeader(this.headerElement, hasDiffHeaderContent({
      fileDiff,
      oldFile,
      newFile
    }), this.options.disableFileHeader)) this.render({
      ...fileInputProps,
      fileContainer,
      lineAnnotations,
      fileDiff,
      forceRender: forceEditorRender || fileInputProps.forceRender,
      preventEmit: true
    });
    else this.hydrationSetup({
      fileDiff,
      lineAnnotations,
      ...fileInput
    });
    if (!preventEmit) this.emitPostRender();
  }
  hydrateElements(fileContainer, prerenderedHTML) {
    var _a2;
    if (this.fileContainer !== fileContainer) this.emitPostRender(true);
    prerenderHTMLIfNecessary(fileContainer, prerenderedHTML);
    for (const element of ((_a2 = fileContainer.shadowRoot) == null ? void 0 : _a2.children) ?? []) {
      if (element instanceof SVGElement) {
        this.spriteSVG = element;
        continue;
      }
      if (!(element instanceof HTMLElement)) continue;
      if (element instanceof HTMLPreElement) {
        this.pre = element;
        for (const code of element.children) {
          if (!(code instanceof HTMLElement) || code.tagName.toLowerCase() !== "code") continue;
          if ("deletions" in code.dataset) this.codeDeletions = code;
          if ("additions" in code.dataset) this.codeAdditions = code;
          if ("unified" in code.dataset) this.codeUnified = code;
        }
        continue;
      }
      if ("diffsHeader" in element.dataset) {
        this.headerElement = element;
        continue;
      }
      if (element instanceof HTMLStyleElement && element.hasAttribute("data-theme-css")) {
        this.themeCSSStyle = element;
        continue;
      }
      if (element instanceof HTMLStyleElement && element.hasAttribute("data-unsafe-css")) {
        this.unsafeCSSStyle = element;
        this.appliedUnsafeCSS = element.textContent;
        continue;
      }
    }
    if (this.pre != null) {
      this.syncCodeNodesFromPre(this.pre);
      this.pre.removeAttribute("data-dehydrated");
    }
    this.fileContainer = fileContainer;
    this.hydrateMeasuredScrollbar();
  }
  hydrationSetup({ fileDiff, oldFile, newFile, lineAnnotations }) {
    this.lineAnnotations = lineAnnotations ?? this.lineAnnotations;
    this.additionFile = newFile;
    this.deletionFile = oldFile;
    this.fileDiff = fileDiff ?? (oldFile !== void 0 && newFile !== void 0 ? parseDiffFromFile(oldFile, newFile, this.options.parseDiffOptions) : void 0);
    if (this.pre == null) return;
    this.syncInteractionOptions();
    this.hunksRenderer.hydrate(this.fileDiff);
    this.renderedDiff = this.fileDiff;
    this.renderAnnotations();
    this.renderGutterUtility();
    this.injectUnsafeCSS();
    this.managersDirty = true;
    this.flushManagers();
  }
  rerender() {
    if (!this.enabled || this.fileDiff == null && this.additionFile == null && this.deletionFile == null) return;
    this.render({
      forceRender: true,
      renderRange: this.renderRange
    });
  }
  onThemeChange() {
    this.hunksRenderer.clearRenderCache();
    this.rerender();
  }
  loadFilesIfNecessary() {
    var _a2;
    const { fileDiff, options: { loadDiffFiles } } = this;
    if (fileDiff == null || loadDiffFiles == null || !canHydrateDiff(fileDiff) || ((_a2 = this.pendingFiles) == null ? void 0 : _a2.fileDiff) === fileDiff) return;
    const promise = this.loadFilesForDiff(fileDiff, loadDiffFiles);
    const pendingFiles = this.pendingFiles = {
      fileDiff,
      promise
    };
    const clearPendingFiles = () => {
      if (this.pendingFiles === pendingFiles) this.pendingFiles = void 0;
    };
    pendingFiles.promise = promise.finally(clearPendingFiles);
  }
  async loadFilesForDiff(fileDiff, loadDiffFiles) {
    try {
      const files = await loadDiffFiles(fileDiff);
      if (!this.enabled || this.fileDiff !== fileDiff) return;
      await this.handleFilesLoaded(fileDiff, files);
    } catch (error) {
      if (this.options.disableErrorHandling === true) throw error;
      console.error(error);
    }
  }
  async handleFilesLoaded(expectedDiff, files) {
    if (this.fileDiff !== expectedDiff || !expectedDiff.isPartial) return;
    hydratePartialDiff("merge", expectedDiff, files);
    this.setHydratedState(files);
    if (this.startHydratedEditSession(expectedDiff)) {
      this.rerender();
      return;
    }
    await awaitWithTimeout(() => this.primeHighlightCache(expectedDiff));
    if (!this.enabled || this.fileDiff !== expectedDiff) return;
    this.rerender();
  }
  startHydratedEditSession(expectedDiff) {
    var _a2;
    if (expectedDiff.isPartial) throw new Error("FileDiff.startHydratedEditSession: diffs cannot be partial for editing");
    if (this.fileDiff !== expectedDiff) return false;
    const { editor } = this;
    if (((_a2 = this.editSession) == null ? void 0 : _a2.outgoingDiff) != null) {
      this.installEditSession(expectedDiff);
      return true;
    }
    if (editor == null || this.editSession != null) return false;
    this.installEditSession(expectedDiff, editor.__getDocumentContents(getAdditionFile(expectedDiff)), editor.__getDocumentSessionState());
    return true;
  }
  updateExternalDiff(incomingExternalDiff, lineAnnotations) {
    var _a2, _b2, _c;
    if (areDiffTargetsEqual(this.fileDiff, incomingExternalDiff)) return false;
    const outgoingDiff = ((_a2 = this.editSession) == null ? void 0 : _a2.outgoingDiff) ?? ((_b2 = this.editSession) == null ? void 0 : _b2.diff);
    this.fileDiff = incomingExternalDiff;
    if (outgoingDiff != null) {
      if (incomingExternalDiff.isPartial) this.loadFilesIfNecessary();
      else this.installEditSession(incomingExternalDiff);
      if (this.editSession != null) this.editSession.outgoingDiff = outgoingDiff;
    } else if (this.editor != null) {
      if (incomingExternalDiff.isPartial) this.loadFilesIfNecessary();
      else this.installEditSession(incomingExternalDiff, this.editor.__getDocumentContents(getAdditionFile(incomingExternalDiff)), this.editor.__getDocumentSessionState());
    }
    if (((_c = this.editSession) == null ? void 0 : _c.annotations) != null && lineAnnotations != null) {
      this.lineAnnotations = lineAnnotations;
      this.editSession.annotations = adoptEditSessionAnnotations(lineAnnotations, getLineAnnotationName, this.editSession.annotations);
    }
    return true;
  }
  installEditSession(externalDiff, retainedDocument, retainedSession) {
    var _a2, _b2;
    const externalContents = externalDiff.additionLines.join("");
    const retainedLines = retainedDocument != null ? splitFileContents$1(retainedDocument.contents) : void 0;
    const restoreRetainedSession = retainedSession != null && canRestoreDiffSession(retainedSession, externalDiff);
    if (retainedSession != null && !restoreRetainedSession) throw new Error("FileDiff: retained session cannot resume against a different old file");
    if (retainedDocument != null && retainedDocument.contents !== externalContents && !restoreRetainedSession) throw new Error("FileDiff: retained edits are missing their diff session state");
    const usesExternalDocument = retainedDocument == null || retainedDocument.name === externalDiff.name && retainedDocument.lang === externalDiff.lang && retainedDocument.contents === externalContents;
    const sessionDiff = createEditSessionDiff(externalDiff);
    if (retainedDocument != null && retainedLines != null && !usesExternalDocument) {
      sessionDiff.name = retainedDocument.name;
      sessionDiff.lang = retainedDocument.lang;
    }
    if (restoreRetainedSession && retainedSession != null && retainedLines != null) {
      sessionDiff.additionLines = retainedLines;
      sessionDiff.type = retainedSession.type;
      sessionDiff.hunks = retainedSession.hunks;
      sessionDiff.editSessionDirty = true;
      recomputeDiffRenderLineCounts(sessionDiff);
    }
    this.editSession = {
      diff: sessionDiff,
      annotations: ((_a2 = this.editSession) == null ? void 0 : _a2.annotations) ?? adoptEditSessionAnnotations(this.lineAnnotations, getLineAnnotationName),
      outgoingDiff: (_b2 = this.editSession) == null ? void 0 : _b2.outgoingDiff
    };
    this.hunksRenderer.beginEditSession(sessionDiff, usesExternalDocument && !restoreRetainedSession ? externalDiff : void 0);
  }
  setHydratedState(files) {
    var _a2;
    this.deletionFile = files.oldFile;
    this.additionFile = files.newFile;
    (_a2 = this.workerManager) == null ? void 0 : _a2.cleanUpTasks(this.hunksRenderer);
    this.hunksRenderer.clearRenderCache();
  }
  render({ fileDiff, deferManagers = false, forceRender = false, preventEmit = false, lineAnnotations, fileContainer, containerWrapper, renderRange, ...fileInputProps }) {
    var _a2, _b2;
    if (!this.enabled) throw new Error("FileDiff.render: attempting to call render after cleaned up");
    const fileInput = getDiffFileInput(fileInputProps, "FileDiff.render");
    const oldFile = fileInput == null ? void 0 : fileInput.oldFile;
    const newFile = fileInput == null ? void 0 : fileInput.newFile;
    (_a2 = this.editor) == null ? void 0 : _a2.__postponeBgTokenizeToNextFrame();
    const { collapsed = false, themeType = "system", expandUnchanged = false } = this.options;
    const nextRenderRange = collapsed ? void 0 : renderRange;
    const themeChanged = this.hasThemeChanged();
    const hasFileInput = fileInput != null;
    const filesDidChange = hasFileInput && (!areOptionalFilesEqual(oldFile, this.deletionFile) || !areOptionalFilesEqual(newFile, this.additionFile));
    let diffDidChange = fileDiff != null && !areDiffTargetsEqual(fileDiff, this.fileDiff);
    const annotationsChanged = lineAnnotations != null && (lineAnnotations.length > 0 || this.getLatestAnnotations().length > 0) ? this.isNewAnnotations(lineAnnotations) : false;
    if (!collapsed && areRenderRangesEqual(nextRenderRange, this.renderRange) && !forceRender && !annotationsChanged && !themeChanged && (fileDiff != null && !diffDidChange || fileDiff == null && !filesDidChange)) {
      const rendered = this.applyCachedThemeState(themeType);
      if (rendered) this.finalizeRender();
      return rendered;
    }
    let nextParsedFileDiff;
    if (fileDiff == null && hasFileInput && (filesDidChange || this.fileDiff == null)) nextParsedFileDiff = parseDiffFromFile(fileInput.oldFile, fileInput.newFile, this.options.parseDiffOptions);
    const { renderRange: previousRenderRange } = this;
    this.renderRange = nextRenderRange;
    if (hasFileInput) {
      this.deletionFile = oldFile;
      this.additionFile = newFile;
    } else if (fileDiff != null) {
      this.deletionFile = void 0;
      this.additionFile = void 0;
    }
    if (fileDiff != null && diffDidChange) this.updateExternalDiff(fileDiff, lineAnnotations);
    else if (nextParsedFileDiff != null) {
      diffDidChange = true;
      this.updateExternalDiff(nextParsedFileDiff, lineAnnotations);
    }
    if (diffDidChange) this.clearReusableHeader();
    if (lineAnnotations != null) this.setLineAnnotations(lineAnnotations);
    const latestDiff = this.getLatestDiff();
    if (latestDiff == null) return false;
    if (latestDiff.editSessionDirty === true && this.shouldSelfHealEditSession()) {
      finishEditSessionForDiff(latestDiff, this.options.parseDiffOptions);
      this.hunksRenderer.refreshHighlightedResult();
    }
    if (expandUnchanged) this.loadFilesIfNecessary();
    this.hunksRenderer.setOptions(this.getHunksRendererOptions(this.options));
    this.syncInteractionOptions();
    this.hunksRenderer.setLineAnnotations(this.getLatestAnnotations());
    const { disableErrorHandling = false, disableFileHeader = false } = this.options;
    if (disableFileHeader) {
      if (this.headerElement != null) {
        this.headerElement.remove();
        this.headerElement = void 0;
        this.headerCache.lastRenderedHTML = void 0;
      }
      this.clearHeaderSlots();
    }
    fileContainer = this.getOrCreateFileContainer(fileContainer, containerWrapper);
    this.applyCachedThemeState(themeType);
    if (collapsed) {
      this.removeRenderedCode();
      this.clearAuxiliaryNodes();
      try {
        const hunksResult = this.hunksRenderer.renderDiff(latestDiff, EMPTY_RENDER_RANGE);
        if (hunksResult != null) this.applyThemeState(fileContainer, hunksResult.themeStyles, themeType, hunksResult.baseThemeType);
        if ((hunksResult == null ? void 0 : hunksResult.headerElement) != null) this.applyHeaderToDOM(hunksResult.headerElement, fileContainer, hunksResult.fileDiff);
        this.renderSeparators([]);
        this.renderedDiff = (hunksResult == null ? void 0 : hunksResult.fileDiff) ?? latestDiff;
        this.injectUnsafeCSS();
      } catch (error) {
        if (disableErrorHandling) throw error;
        console.error(error);
        if (error instanceof Error) this.applyErrorToDOM(error, fileContainer);
      }
      this.finalizeRender();
      if (!preventEmit) this.emitPostRender();
      return true;
    }
    try {
      const pre = this.getOrCreatePreNode(fileContainer);
      if (!(this.canPartiallyRender(forceRender, annotationsChanged, filesDidChange || diffDidChange || themeChanged || !areDiffTargetsEqual(this.renderedDiff, latestDiff)) && this.applyPartialRender({
        fileDiff: latestDiff,
        previousRenderRange,
        renderRange: nextRenderRange
      }))) {
        const hunksResult = this.hunksRenderer.renderDiff(latestDiff, nextRenderRange);
        if (hunksResult == null) {
          if (((_b2 = this.workerManager) == null ? void 0 : _b2.isInitialized()) === false && this.workerManager.isWorkingPool()) this.workerManager.initialize().catch(() => {
          }).then(() => this.rerender());
          return false;
        }
        this.applyThemeState(fileContainer, hunksResult.themeStyles, themeType, hunksResult.baseThemeType);
        if (hunksResult.headerElement != null) this.applyHeaderToDOM(hunksResult.headerElement, fileContainer, hunksResult.fileDiff);
        if (hunksResult.additionsContentAST != null || hunksResult.deletionsContentAST != null || hunksResult.unifiedContentAST != null) this.applyHunksToDOM(pre, hunksResult);
        else if (this.pre != null) {
          this.pre.remove();
          this.pre = void 0;
        }
        this.renderSeparators(hunksResult.hunkData);
        this.renderedDiff = hunksResult.fileDiff;
      }
      this.applyBuffers(pre, nextRenderRange);
      this.injectUnsafeCSS();
      this.renderAnnotations();
      this.renderGutterUtility();
      this.managersDirty = true;
      if (!deferManagers) this.flushManagers();
      this.finalizeRender();
      if (this.editor != null) this.syncRenderViewToEditor();
    } catch (error) {
      if (disableErrorHandling) throw error;
      console.error(error);
      if (error instanceof Error) this.applyErrorToDOM(error, fileContainer);
    }
    if (!preventEmit) this.emitPostRender();
    return true;
  }
  finalizeRender() {
  }
  emitPostRender(unmount = false) {
    var _a2, _b2;
    const { fileContainer, options: { onPostRender } } = this;
    if (unmount) {
      if (!this.mounted) return;
      this.mounted = false;
      if (fileContainer == null) return;
      (_b2 = (_a2 = this.options).onPostRender) == null ? void 0 : _b2.call(_a2, fileContainer, this, "unmount");
      return;
    }
    if (fileContainer == null) return;
    const phase = this.mounted ? "update" : "mount";
    this.mounted = true;
    onPostRender == null ? void 0 : onPostRender(fileContainer, this, phase);
  }
  getLatestDiff(fileDiff = this.fileDiff) {
    var _a2;
    return ((_a2 = this.editSession) == null ? void 0 : _a2.diff) ?? fileDiff;
  }
  getRenderedDiff() {
    return this.renderedDiff;
  }
  syncRenderViewToEditor() {
    var _a2;
    const { editor, fileContainer } = this;
    const lineAnnotations = this.getLatestAnnotations();
    const renderRange = this.computeEditorRenderRange(this.renderRange);
    const fileDiff = this.getLatestDiff();
    if (editor == null || fileContainer == null || fileDiff == null || fileDiff.isPartial) return;
    const sync = (highlighter3) => {
      var _a3;
      if (!this.enabled || this.editor !== editor || this.fileContainer !== fileContainer || this.getLatestDiff() !== fileDiff) return;
      const replacement = (_a3 = this.editSession) == null ? void 0 : _a3.outgoingDiff;
      const externalDiff = this.fileDiff;
      const externalDocument = replacement != null && externalDiff != null && replacement !== fileDiff;
      const resetHistory = externalDocument ? shouldResetUndoState(replacement, externalDiff) : false;
      editor.__syncRenderView({
        highlighter: highlighter3,
        fileContainer,
        fileDiff,
        lineAnnotations,
        renderRange,
        externalDocument,
        resetHistory
      });
    };
    const theme = this.getTheme();
    const lang = fileDiff.lang ?? getFiletypeFromFileName(fileDiff.name);
    const highlighter2 = getHighlighterIfLoaded({
      theme,
      lang
    });
    if (highlighter2 != null) sync(highlighter2);
    else getSharedHighlighter({
      themes: getThemes(theme),
      langs: ["text", lang],
      preferredHighlighter: ((_a2 = this.workerManager) == null ? void 0 : _a2.getPreferredHighlighter()) ?? this.options.preferredHighlighter
    }).then(sync);
  }
  computeEditorRenderRange(renderRange) {
    const fileDiff = this.getLatestDiff();
    if (renderRange == null || fileDiff == null || isDefaultRenderRange(renderRange)) return renderRange;
    const { diffStyle = "split", expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
    let firstLineNumber;
    let lastLineNumber;
    iterateOverDiff({
      diff: fileDiff,
      diffStyle,
      startingLine: renderRange.startingLine,
      totalLines: renderRange.totalLines,
      expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
      collapsedContextThreshold,
      callback: ({ additionLine }) => {
        if (additionLine != null) {
          firstLineNumber ?? (firstLineNumber = additionLine.lineNumber);
          lastLineNumber = additionLine.lineNumber;
        }
      }
    });
    if (firstLineNumber == null || lastLineNumber == null) return {
      ...renderRange,
      startingLine: 0,
      totalLines: 0
    };
    return {
      ...renderRange,
      startingLine: firstLineNumber - 1,
      totalLines: lastLineNumber - firstLineNumber + 1
    };
  }
  /** @internal The editor applied or edited past the pending external replacement. */
  __acknowledgeDocumentUpdate() {
    if (this.editSession != null) this.editSession.outgoingDiff = void 0;
  }
  /** @internal Settle annotations locally. */
  __acceptEditorChange(event) {
    const { lineAnnotations } = event;
    if (lineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(lineAnnotations);
  }
  emitEditChange(event) {
    const { onEditChange } = this.options;
    onEditChange == null ? void 0 : onEditChange(event);
  }
  /**
  * @internal Capture the current diff session, or return `undefined` when no
  * complete compatible session exists.
  *
  * When `clone` is true, the returned lines and hunks are copied.
  */
  __captureDocumentSessionState(clone = true) {
    let { fileDiff, editSession: { diff: sessionDiff, outgoingDiff } = {} } = this;
    if (outgoingDiff != null && fileDiff != null) {
      if (!fileDiff.isPartial && shouldResetUndoState(outgoingDiff, fileDiff)) return;
      sessionDiff = outgoingDiff;
    }
    if (sessionDiff == null || sessionDiff.isPartial) return;
    return {
      diffSession: {
        oldFile: sessionDiff.type !== "new" ? {
          name: sessionDiff.prevName ?? sessionDiff.name,
          lines: clone ? [...sessionDiff.deletionLines] : sessionDiff.deletionLines
        } : null,
        type: sessionDiff.type,
        hunks: clone ? cloneHunks(sessionDiff.hunks) : sessionDiff.hunks
      },
      hasChanges: sessionDiff.editSessionDirty === true
    };
  }
  /** @internal Associate this component with its editor for a render lifecycle. */
  __attachEditor(editor) {
    if (this.type !== "file-diff") throw new Error(`FileDiff.__attachEditor: cannot attach an editor to a "${this.type}" diff`);
    if (this.editor != null) throw new Error("FileDiff.__attachEditor: an editor is already attached");
    const detach = () => {
      this.editor = void 0;
      this.finishEditSession();
    };
    try {
      this.resumeEditorRendering(editor);
      return detach;
    } catch (error) {
      detach();
      throw error;
    }
  }
  /** @internal Resume rendering for the editor already associated with this component. */
  __resumeEditor(editor) {
    if (this.editor !== editor) throw new Error("FileDiff.__resumeEditor: editor association changed");
    this.resumeEditorRendering(editor);
  }
  resumeEditorRendering(editor) {
    var _a2, _b2, _c, _d;
    const { fileDiff: externalDiff } = this;
    const pendingReplacement = (_a2 = this.editSession) == null ? void 0 : _a2.outgoingDiff;
    if (pendingReplacement != null && externalDiff != null && !externalDiff.isPartial && ((_b2 = this.editSession) == null ? void 0 : _b2.diff) === pendingReplacement) this.installEditSession(externalDiff);
    const initialExternalDiff = this.editSession == null && externalDiff != null && !externalDiff.isPartial ? externalDiff : void 0;
    if (initialExternalDiff != null) this.installEditSession(initialExternalDiff, editor.__getDocumentContents(getAdditionFile(initialExternalDiff)), editor.__getDocumentSessionState());
    else if (this.editSession != null) this.hunksRenderer.beginEditSession(this.editSession.diff);
    this.editor = editor;
    if (((_c = this.fileDiff) == null ? void 0 : _c.isPartial) === true) this.loadFilesIfNecessary();
    const editSessionDiff = (_d = this.editSession) == null ? void 0 : _d.diff;
    if (this.hunksRenderer.editorRenderReady()) {
      if (editSessionDiff != null && this.hunksRenderer.diffCache === editSessionDiff) this.renderedDiff = editSessionDiff;
      this.syncRenderViewToEditor();
    } else this.rerender();
  }
  finishEditSession() {
    this.hunksRenderer.endEditSession();
    this.finalizeEditSessionHunks();
  }
  /**
  * @internal
  *
  * Ends the edit session and settles which diff this component renders.
  * Requires the editor to be detached first. Does nothing when no session
  * exists, so callers can invoke it again safely after it has settled.
  *
  * `onEditComplete` receives the completed diff, current external diff,
  * complete file pair, and both annotation collections even when the final
  * text is unchanged. In `install` mode, accepting installs the completed diff
  * and its annotations; rejecting or having no handler restores the external
  * values. `discard` mode always restores the external values. An accepted
  * diff cannot reuse the replaced diff's `cacheKey`.
  */
  __completeEditSession(editor, mode) {
    this.settleEditSession(mode === "install", editor);
  }
  settleEditSession(installResult, editor) {
    var _a2, _b2;
    const { editSession, fileDiff: externalDiff, lineAnnotations: externalAnnotations } = this;
    if (editSession == null || externalDiff == null) return;
    const { diff: editSessionDiff, annotations: editSessionAnnotations } = editSession;
    if (this.editor != null) throw new Error("FileDiff.__completeEditSession: detach the editor before completing the session");
    this.hunksRenderer.endEditSession();
    this.finalizeEditSessionHunks();
    const sessionAnnotationsCurrent = editSessionAnnotations == null ? void 0 : editSessionAnnotations.current;
    let acceptedDiff;
    let acceptedOldFile = null;
    let acceptedNewFile = null;
    let failed = false;
    let failure;
    if (editor == null) throw new Error("FileDiff.__completeEditSession: editor is required for completion");
    const completedDiff = cloneFileDiffMetadata(editSessionDiff);
    const newFile = {
      name: completedDiff.name,
      contents: completedDiff.additionLines.join("")
    };
    if (completedDiff.lang != null) newFile.lang = completedDiff.lang;
    const event = {
      fileDiff: completedDiff,
      editor,
      originalFileDiff: externalDiff,
      oldFile: completedDiff.type === "new" ? null : {
        name: completedDiff.prevName ?? completedDiff.name,
        contents: completedDiff.deletionLines.join("")
      },
      newFile,
      lineAnnotations: sessionAnnotationsCurrent,
      originalLineAnnotations: externalAnnotations
    };
    Object.freeze(event);
    try {
      editor.__emitEditComplete(event);
      if (((_b2 = (_a2 = this.options).onEditComplete) == null ? void 0 : _b2.call(_a2, event)) === "accept") {
        if (completedDiff.cacheKey != null && completedDiff.cacheKey === externalDiff.cacheKey) throw new Error("FileDiff.__completeEditSession: an accepted diff must not reuse the replaced diff cacheKey");
        acceptedDiff = completedDiff;
        acceptedOldFile = event.oldFile;
        acceptedNewFile = event.newFile;
      }
    } catch (error) {
      failed = true;
      failure = error;
    }
    if (installResult && acceptedDiff != null) {
      this.fileDiff = acceptedDiff;
      if (this.additionFile != null) {
        this.deletionFile = acceptedOldFile;
        this.additionFile = acceptedNewFile;
      }
      if (sessionAnnotationsCurrent != null) this.lineAnnotations = sessionAnnotationsCurrent;
    }
    this.editSession = void 0;
    if (installResult && this.fileContainer != null) this.rerender();
    if (failed) throw failure;
  }
  /**
  * Run the session-end recompute: restore recompute-shaped hunks (a
  * context-only region collapses away, boundaries re-derive), preserve
  * expansion state best-effort via old-side anchors, and repaint through
  * the session render path — which also invalidates virtualized layout,
  * since nothing else does at exit now that editing does not flip
  * expandUnchanged. Marker-guarded and idempotent; CodeView also calls this
  * when ending a session whose detach closure was consumed by a recycle.
  * Safe on a cleaned-up instance: the recompute is pure metadata work and
  * the deferred rerender is enabled-guarded. Returns true when a recompute
  * ran.
  */
  finalizeEditSessionHunks() {
    const fileDiff = this.getLatestDiff();
    if (fileDiff == null || fileDiff.editSessionDirty !== true) return false;
    const { collapsedContextThreshold = 1 } = this.options;
    const anchors = captureExpansionAnchors(fileDiff, this.hunksRenderer.getExpandedHunksMap(), collapsedContextThreshold);
    finishEditSessionForDiff(fileDiff, this.options.parseDiffOptions);
    this.hunksRenderer.setExpandedHunksMap(rebuildExpansionFromAnchors(fileDiff, anchors));
    this.hunksRenderer.refreshHighlightedResult();
    this.escalateEditSessionRender();
    return true;
  }
  applyDocumentChange(textDocument, newLineAnnotations) {
    var _a2;
    const editSessionDiff = (_a2 = this.editSession) == null ? void 0 : _a2.diff;
    if (editSessionDiff == null) throw new Error("FileDiff.applyDocumentChange: requires an active edit session");
    this.detachAdditionLines();
    this.hunksRenderer.beginEditSession(editSessionDiff);
    this.hunksRenderer.applyDocumentChange(textDocument);
    if (newLineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(newLineAnnotations);
    this.rerender();
    this.interactionManager.setSelectionDirty();
  }
  updateRenderCache(dirtyLines, themeType, options = {}) {
    var _a2;
    const editSessionDiff = (_a2 = this.editSession) == null ? void 0 : _a2.diff;
    if (editSessionDiff == null) throw new Error("FileDiff.updateRenderCache: requires an active edit session");
    this.detachAdditionLines();
    this.hunksRenderer.beginEditSession(editSessionDiff);
    const { shouldRefreshDiffsView, lineCountChangeInFlight } = options;
    if (this.hunksRenderer.updateRenderCache(dirtyLines, themeType, lineCountChangeInFlight)) {
      if (this.refreshViewTimeout != null) {
        clearTimeout(this.refreshViewTimeout);
        this.refreshViewTimeout = void 0;
      }
      this.lineStateRefreshPending = true;
      this.escalateEditSessionRender();
      return;
    }
    if (shouldRefreshDiffsView === true) {
      if (this.refreshViewTimeout != null) clearTimeout(this.refreshViewTimeout);
      this.lineStateRefreshPending = true;
      this.refreshViewTimeout = setTimeout(() => {
        this.refreshViewTimeout = void 0;
        if (this.options.diffStyle === "split") this.refreshSplitDiffView();
        else this.refreshUnifiedDiffView();
        this.flushDeferredLineState();
      }, 150);
    }
  }
  detachAdditionLines() {
    var _a2;
    const editSessionDiff = (_a2 = this.editSession) == null ? void 0 : _a2.diff;
    const { fileDiff } = this;
    if (editSessionDiff != null && (editSessionDiff.additionLines === (fileDiff == null ? void 0 : fileDiff.additionLines) || editSessionDiff.additionLines === editSessionDiff.deletionLines)) editSessionDiff.additionLines = [...editSessionDiff.additionLines];
  }
  isLineRenderable(lineNumber) {
    const fileDiff = this.getRenderedDiff();
    if (fileDiff == null) return true;
    const { expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
    return isAdditionLineRenderable({
      fileDiff,
      lineNumber,
      expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
      collapsedContextThreshold
    });
  }
  getNearestRenderableLine(lineNumber, direction) {
    const fileDiff = this.getRenderedDiff();
    if (fileDiff == null) return lineNumber;
    const { expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
    return getNearestRenderableAdditionLine({
      fileDiff,
      lineNumber,
      direction,
      expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
      collapsedContextThreshold
    });
  }
  revealLine(lineNumber) {
    const fileDiff = this.getRenderedDiff();
    const { expandUnchanged = false, collapsedContextThreshold = 1, expansionLineCount = 100 } = this.options;
    if (fileDiff == null || fileDiff.isPartial || expandUnchanged) return false;
    const expandedHunks = this.hunksRenderer.getExpandedHunksMap();
    for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
      const [hunkStart, hunkEnd] = getHunkAdditionLineRange(hunk);
      if (lineNumber < hunkStart) {
        const region = getExpandedRegion({
          isPartial: fileDiff.isPartial,
          rangeSize: hunk.collapsedBefore,
          expandedHunks,
          hunkIndex,
          collapsedContextThreshold
        });
        const gapStart = hunkStart - region.rangeSize;
        if (region.renderAll || lineNumber < gapStart + region.fromStart || lineNumber >= hunkStart - region.fromEnd) return false;
        const fromStartDistance = lineNumber - (gapStart + region.fromStart) + 1;
        const fromEndDistance = hunkStart - region.fromEnd - lineNumber;
        if (fromStartDistance <= fromEndDistance) this.expandHunk(hunkIndex, "up", fromStartDistance + expansionLineCount);
        else this.expandHunk(hunkIndex, "down", fromEndDistance + expansionLineCount);
        return true;
      }
      if (lineNumber < hunkEnd) return false;
    }
    const trailingRegion = getTrailingExpandedRegion({
      fileDiff,
      hunkIndex: fileDiff.hunks.length - 1,
      expandedHunks,
      collapsedContextThreshold,
      errorPrefix: "FileDiff.revealLine"
    });
    if (trailingRegion == null || trailingRegion.renderAll) return false;
    const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
    const [, trailingStart] = getHunkAdditionLineRange(lastHunk);
    if (lineNumber < trailingStart + trailingRegion.fromStart || lineNumber >= trailingStart + trailingRegion.rangeSize) return false;
    this.expandHunk(fileDiff.hunks.length, "up", lineNumber - (trailingStart + trailingRegion.fromStart) + 1 + expansionLineCount);
    return true;
  }
  shouldSelfHealEditSession() {
    return this.editor == null;
  }
  escalateEditSessionRender() {
    queueRender(this.handleEditSessionRender);
  }
  removeRenderedCode() {
    var _a2, _b2, _c, _d, _e, _f;
    this.resizeManager.cleanUp();
    this.scrollSyncManager.cleanUp();
    this.interactionManager.cleanUp();
    (_a2 = this.bufferBefore) == null ? void 0 : _a2.remove();
    this.bufferBefore = void 0;
    (_b2 = this.bufferAfter) == null ? void 0 : _b2.remove();
    this.bufferAfter = void 0;
    (_c = this.codeUnified) == null ? void 0 : _c.remove();
    this.codeUnified = void 0;
    (_d = this.codeDeletions) == null ? void 0 : _d.remove();
    this.codeDeletions = void 0;
    (_e = this.codeAdditions) == null ? void 0 : _e.remove();
    this.codeAdditions = void 0;
    (_f = this.pre) == null ? void 0 : _f.remove();
    this.pre = void 0;
    this.appliedPreAttributes = void 0;
    this.lastRowCount = void 0;
  }
  clearAuxiliaryNodes() {
    var _a2;
    for (const { element } of this.separatorCache.values()) element.remove();
    this.separatorCache.clear();
    for (const { element } of this.annotationCache.values()) element.remove();
    this.annotationCache.clear();
    (_a2 = this.gutterUtilityContent) == null ? void 0 : _a2.remove();
    this.gutterUtilityContent = void 0;
  }
  renderPlaceholder(height) {
    if (this.fileContainer == null) return false;
    this.emitPostRender(true);
    this.cleanChildNodes();
    if (this.placeHolder == null) {
      const shadowRoot = this.fileContainer.shadowRoot ?? this.fileContainer.attachShadow({ mode: "open" });
      this.placeHolder = document.createElement("div");
      this.placeHolder.dataset.placeholder = "";
      shadowRoot.appendChild(this.placeHolder);
    }
    return this.setPlaceholderHeight(height);
  }
  setPlaceholderHeight(height) {
    if (this.placeHolder == null) return false;
    this.placeHolder.style.setProperty("height", `${height}px`);
    return true;
  }
  async primeHighlightCache(fileDiff = this.fileDiff) {
    const { workerManager } = this;
    if (fileDiff == null || workerManager == null || !workerManager.isWorkingPool() || fileDiff.cacheKey == null || isDiffPlainText(fileDiff)) return;
    const tokenizeMaxLength = this.options.tokenizeMaxLength ?? 1e5;
    if (Math.max(fileDiff.additionLines.length, fileDiff.deletionLines.length) > tokenizeMaxLength) return;
    await workerManager.primeDiffHighlightCache(fileDiff).catch((error) => {
      console.error(error);
    });
  }
  cleanChildNodes() {
    var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    this.resizeManager.cleanUp();
    this.scrollSyncManager.cleanUp();
    this.interactionManager.cleanUp();
    this.clearAuxiliaryNodes();
    (_a2 = this.bufferAfter) == null ? void 0 : _a2.remove();
    (_b2 = this.bufferBefore) == null ? void 0 : _b2.remove();
    (_c = this.codeAdditions) == null ? void 0 : _c.remove();
    (_d = this.codeDeletions) == null ? void 0 : _d.remove();
    (_e = this.codeUnified) == null ? void 0 : _e.remove();
    (_f = this.errorWrapper) == null ? void 0 : _f.remove();
    (_g = this.headerElement) == null ? void 0 : _g.remove();
    (_h = this.headerPrefix) == null ? void 0 : _h.remove();
    (_i = this.headerFilenameSuffix) == null ? void 0 : _i.remove();
    (_j = this.headerMetadata) == null ? void 0 : _j.remove();
    (_k = this.headerCustom) == null ? void 0 : _k.remove();
    (_l = this.pre) == null ? void 0 : _l.remove();
    (_m = this.spriteSVG) == null ? void 0 : _m.remove();
    (_n = this.themeCSSStyle) == null ? void 0 : _n.remove();
    (_o = this.unsafeCSSStyle) == null ? void 0 : _o.remove();
    this.bufferAfter = void 0;
    this.bufferBefore = void 0;
    this.codeAdditions = void 0;
    this.codeDeletions = void 0;
    this.codeUnified = void 0;
    this.errorWrapper = void 0;
    this.headerElement = void 0;
    this.headerPrefix = void 0;
    this.headerFilenameSuffix = void 0;
    this.headerMetadata = void 0;
    this.headerCustom = void 0;
    this.pre = void 0;
    this.spriteSVG = void 0;
    this.themeCSSStyle = void 0;
    this.appliedThemeCSS = void 0;
    this.hasAdoptedThemeCSS = false;
    this.unsafeCSSStyle = void 0;
    this.appliedUnsafeCSS = void 0;
    this.headerCache.lastRenderedHTML = void 0;
    this.lastRowCount = void 0;
    this.mounted = false;
  }
  renderSeparators(hunkData) {
    const { hunkSeparators } = this.options;
    if (this.isContainerManaged || this.fileContainer == null || typeof hunkSeparators !== "function") {
      for (const { element } of this.separatorCache.values()) element.remove();
      this.separatorCache.clear();
      return;
    }
    const staleSeparators = new Map(this.separatorCache);
    for (const hunk of hunkData) {
      const id = hunk.slotName;
      let cache2 = this.separatorCache.get(id);
      if (cache2 == null || !areHunkDataEqual(hunk, cache2.hunkData)) {
        cache2 == null ? void 0 : cache2.element.remove();
        const element = document.createElement("div");
        element.style.display = "contents";
        element.slot = hunk.slotName;
        const child = hunkSeparators(hunk, this);
        if (child != null) element.appendChild(child);
        this.fileContainer.appendChild(element);
        cache2 = {
          element,
          hunkData: hunk
        };
        this.separatorCache.set(id, cache2);
      }
      staleSeparators.delete(id);
    }
    for (const [id, { element }] of staleSeparators.entries()) {
      this.separatorCache.delete(id);
      element.remove();
    }
  }
  renderAnnotations() {
    if (this.isContainerManaged || this.fileContainer == null) {
      for (const { element } of this.annotationCache.values()) element.remove();
      this.annotationCache.clear();
      return;
    }
    const staleAnnotations = new Map(this.annotationCache);
    const { renderAnnotation } = this.options;
    const lineAnnotations = this.getLatestAnnotations();
    if (renderAnnotation != null && lineAnnotations.length > 0) for (const [index, annotation] of lineAnnotations.entries()) {
      const name = this.getAnnotationSlotName(annotation);
      const id = `${index}-${name}`;
      let cache2 = this.annotationCache.get(id);
      if (cache2 == null || !areDiffLineAnnotationsEqual(annotation, cache2.annotation)) {
        cache2 == null ? void 0 : cache2.element.remove();
        const content = renderAnnotation(annotation);
        if (content == null) continue;
        cache2 = {
          element: createAnnotationWrapperNode(name),
          annotation
        };
        cache2.element.appendChild(content);
        this.fileContainer.appendChild(cache2.element);
        this.annotationCache.set(id, cache2);
      }
      staleAnnotations.delete(id);
    }
    for (const [id, { element }] of staleAnnotations.entries()) {
      this.annotationCache.delete(id);
      element.remove();
    }
  }
  renderGutterUtility() {
    var _a2, _b2;
    const { renderGutterUtility } = this.options;
    if (this.fileContainer == null || renderGutterUtility == null) {
      (_a2 = this.gutterUtilityContent) == null ? void 0 : _a2.remove();
      this.gutterUtilityContent = void 0;
      return;
    }
    const element = renderGutterUtility(this.interactionManager.getHoveredLine);
    if (element != null && this.gutterUtilityContent != null) return;
    else if (element == null) {
      (_b2 = this.gutterUtilityContent) == null ? void 0 : _b2.remove();
      this.gutterUtilityContent = void 0;
      return;
    }
    const gutterUtilityContent = createGutterUtilityContentNode();
    gutterUtilityContent.appendChild(element);
    this.fileContainer.appendChild(gutterUtilityContent);
    this.gutterUtilityContent = gutterUtilityContent;
  }
  getOrCreateFileContainer(fileContainer, parentNode) {
    var _a2;
    const { fileContainer: previousContainer } = this;
    const nextContainer = fileContainer ?? previousContainer ?? document.createElement("diffs-container");
    const containerChanged = previousContainer !== nextContainer;
    if (previousContainer != null && containerChanged) (_a2 = this.editor) == null ? void 0 : _a2.__captureFocusForDOMReplacement();
    if (containerChanged) this.emitPostRender(true);
    this.fileContainer = nextContainer;
    if (previousContainer != null && containerChanged) {
      this.headerCache.lastRenderedHTML = void 0;
      this.headerElement = void 0;
    }
    if (parentNode != null && this.fileContainer.parentNode !== parentNode) parentNode.appendChild(this.fileContainer);
    if (containerChanged) this.adoptReusableShellElements(this.fileContainer);
    this.ensureSpriteSVG(this.fileContainer);
    return this.fileContainer;
  }
  adoptReusableShellElements(fileContainer) {
    const { shadowRoot } = fileContainer;
    if (shadowRoot == null) return;
    for (const element of shadowRoot.children) if (element instanceof SVGElement) this.spriteSVG ?? (this.spriteSVG = element);
    else if (isStyleNode(element) && element.hasAttribute("data-theme-css")) {
      this.themeCSSStyle ?? (this.themeCSSStyle = element);
      this.hasAdoptedThemeCSS = true;
    } else if (isStyleNode(element) && element.hasAttribute("data-unsafe-css")) {
      this.unsafeCSSStyle ?? (this.unsafeCSSStyle = element);
      this.appliedUnsafeCSS ?? (this.appliedUnsafeCSS = this.options.unsafeCSS ?? void 0);
    }
  }
  ensureSpriteSVG(fileContainer) {
    const shadowRoot = fileContainer.shadowRoot ?? fileContainer.attachShadow({ mode: "open" });
    if (this.spriteSVG == null) {
      const fragment = document.createElement("div");
      fragment.innerHTML = SVGSpriteSheet;
      const firstChild = fragment.firstChild;
      if (firstChild instanceof SVGElement) this.spriteSVG = firstChild;
    }
    if (this.spriteSVG != null && this.spriteSVG.parentNode !== shadowRoot) shadowRoot.appendChild(this.spriteSVG);
  }
  getOrCreatePreNode(container) {
    var _a2, _b2;
    const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
    if (this.pre == null) {
      this.pre = document.createElement("pre");
      this.appliedPreAttributes = void 0;
      this.codeUnified = void 0;
      this.codeDeletions = void 0;
      this.codeAdditions = void 0;
      shadowRoot.appendChild(this.pre);
    } else if (this.pre.parentNode !== shadowRoot) {
      (_a2 = this.editor) == null ? void 0 : _a2.__captureFocusForDOMReplacement();
      shadowRoot.appendChild(this.pre);
      this.appliedPreAttributes = void 0;
    }
    (_b2 = this.placeHolder) == null ? void 0 : _b2.remove();
    this.placeHolder = void 0;
    return this.pre;
  }
  syncCodeNodesFromPre(pre) {
    this.codeUnified = void 0;
    this.codeDeletions = void 0;
    this.codeAdditions = void 0;
    for (const child of Array.from(pre.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasAttribute("data-unified")) this.codeUnified = child;
      else if (child.hasAttribute("data-deletions")) this.codeDeletions = child;
      else if (child.hasAttribute("data-additions")) this.codeAdditions = child;
    }
  }
  applyHeaderToDOM(headerAST, container, fileDiff) {
    var _a2, _b2, _c, _d, _e, _f, _g, _h;
    this.cleanupErrorWrapper();
    (_a2 = this.placeHolder) == null ? void 0 : _a2.remove();
    this.placeHolder = void 0;
    const { headerCache: { fileDiff: cachedHeaderDiff, html: cachedHeaderHTML, lastRenderedHTML } } = this;
    const headerHTML = (fileDiff !== ((_b2 = this.editSession) == null ? void 0 : _b2.diff) && areDiffTargetsEqual(cachedHeaderDiff, fileDiff) ? cachedHeaderHTML : void 0) ?? toHtml(headerAST);
    this.headerCache.html = headerHTML;
    this.headerCache.fileDiff = fileDiff;
    if (headerHTML !== lastRenderedHTML) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = headerHTML;
      const newHeader = tempDiv.firstElementChild;
      if (!(newHeader instanceof HTMLElement)) return;
      if (this.headerElement != null) (_c = container.shadowRoot) == null ? void 0 : _c.replaceChild(newHeader, this.headerElement);
      else (_d = container.shadowRoot) == null ? void 0 : _d.prepend(newHeader);
      this.headerElement = newHeader;
      this.headerCache.lastRenderedHTML = headerHTML;
    }
    if (this.isContainerManaged) return;
    const { renderCustomHeader, renderHeaderPrefix, renderHeaderFilenameSuffix, renderHeaderMetadata } = this.options;
    if (renderCustomHeader != null) {
      const content2 = renderCustomHeader(fileDiff) ?? void 0;
      this.headerCustom = this.upsertHeaderSlotElement(container, this.headerCustom, CUSTOM_HEADER_SLOT_ID, content2);
      (_e = this.headerPrefix) == null ? void 0 : _e.remove();
      (_f = this.headerFilenameSuffix) == null ? void 0 : _f.remove();
      (_g = this.headerMetadata) == null ? void 0 : _g.remove();
      this.headerPrefix = void 0;
      this.headerFilenameSuffix = void 0;
      this.headerMetadata = void 0;
      return;
    }
    const prefix = (renderHeaderPrefix == null ? void 0 : renderHeaderPrefix(fileDiff)) ?? void 0;
    const suffix = (renderHeaderFilenameSuffix == null ? void 0 : renderHeaderFilenameSuffix(fileDiff)) ?? void 0;
    const content = (renderHeaderMetadata == null ? void 0 : renderHeaderMetadata(fileDiff)) ?? void 0;
    this.headerPrefix = this.upsertHeaderSlotElement(container, this.headerPrefix, HEADER_PREFIX_SLOT_ID, prefix);
    this.headerFilenameSuffix = this.upsertHeaderSlotElement(container, this.headerFilenameSuffix, HEADER_FILENAME_SUFFIX_SLOT_ID, suffix);
    this.headerMetadata = this.upsertHeaderSlotElement(container, this.headerMetadata, HEADER_METADATA_SLOT_ID, content);
    (_h = this.headerCustom) == null ? void 0 : _h.remove();
    this.headerCustom = void 0;
  }
  clearReusableHeader() {
    this.headerCache.html = void 0;
    this.headerCache.fileDiff = void 0;
  }
  clearHeaderSlots() {
    var _a2, _b2, _c, _d;
    (_a2 = this.headerPrefix) == null ? void 0 : _a2.remove();
    (_b2 = this.headerFilenameSuffix) == null ? void 0 : _b2.remove();
    (_c = this.headerMetadata) == null ? void 0 : _c.remove();
    (_d = this.headerCustom) == null ? void 0 : _d.remove();
    this.headerPrefix = void 0;
    this.headerFilenameSuffix = void 0;
    this.headerMetadata = void 0;
    this.headerCustom = void 0;
  }
  upsertHeaderSlotElement(container, current, slot, content) {
    if (content == null) {
      current == null ? void 0 : current.remove();
      return;
    }
    const element = current ?? this.createHeaderSlotElement(slot);
    if (current == null) container.appendChild(element);
    this.replaceHeaderSlotContent(element, content);
    return element;
  }
  replaceHeaderSlotContent(element, content) {
    element.replaceChildren();
    if (content instanceof Element) element.appendChild(content);
    else element.innerText = `${content}`;
  }
  createHeaderSlotElement(slot) {
    const element = document.createElement("div");
    element.slot = slot;
    return element;
  }
  injectUnsafeCSS() {
    var _a2, _b2;
    const { unsafeCSS } = this.options;
    const shadowRoot = (_a2 = this.fileContainer) == null ? void 0 : _a2.shadowRoot;
    if (shadowRoot == null) return;
    if (unsafeCSS == null || unsafeCSS === "") {
      if (this.unsafeCSSStyle != null) {
        this.unsafeCSSStyle.remove();
        this.unsafeCSSStyle = void 0;
      }
      this.appliedUnsafeCSS = void 0;
      return;
    }
    if (((_b2 = this.unsafeCSSStyle) == null ? void 0 : _b2.parentNode) === shadowRoot && this.appliedUnsafeCSS === unsafeCSS) return;
    this.unsafeCSSStyle ?? (this.unsafeCSSStyle = createUnsafeCSSStyleNode());
    if (this.unsafeCSSStyle.parentNode !== shadowRoot) shadowRoot.appendChild(this.unsafeCSSStyle);
    this.unsafeCSSStyle.textContent = wrapUnsafeCSS(unsafeCSS);
    this.appliedUnsafeCSS = unsafeCSS;
  }
  applyThemeState(container, themeStyles, themeType, baseThemeType) {
    var _a2, _b2, _c;
    const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
    const effectiveThemeType = baseThemeType ?? themeType;
    const currentTheme = this.getTheme();
    const theme = typeof currentTheme === "string" ? currentTheme : { ...currentTheme };
    const scrollbarGutter = getMeasuredScrollbarGutter(shadowRoot);
    if (((_a2 = this.themeCSSStyle) == null ? void 0 : _a2.parentNode) === shadowRoot && ((_b2 = this.appliedThemeCSS) == null ? void 0 : _b2.themeStyles) === themeStyles && this.appliedThemeCSS.themeType === effectiveThemeType && this.appliedThemeCSS.scrollbarGutter === scrollbarGutter) {
      this.appliedThemeCSS.theme = theme;
      return;
    }
    if (this.hasAdoptedThemeCSS && ((_c = this.themeCSSStyle) == null ? void 0 : _c.parentNode) === shadowRoot) {
      this.hasAdoptedThemeCSS = false;
      this.appliedThemeCSS = {
        theme,
        themeStyles,
        themeType: effectiveThemeType,
        baseThemeType,
        scrollbarGutter
      };
      return;
    }
    this.themeCSSStyle = upsertHostThemeStyle({
      shadowRoot,
      currentNode: this.themeCSSStyle,
      themeCSS: wrapThemeCSS(themeStyles, effectiveThemeType, scrollbarGutter)
    });
    this.appliedThemeCSS = this.themeCSSStyle != null ? {
      theme,
      themeStyles,
      themeType: effectiveThemeType,
      baseThemeType,
      scrollbarGutter
    } : void 0;
  }
  hydrateMeasuredScrollbar() {
    var _a2;
    const shadowRoot = (_a2 = this.fileContainer) == null ? void 0 : _a2.shadowRoot;
    if (shadowRoot == null || this.themeCSSStyle == null) return;
    this.themeCSSStyle.textContent = patchScrollbarGutterSize(this.themeCSSStyle.textContent ?? "", getMeasuredScrollbarGutter(shadowRoot));
  }
  shouldGuardRebuildScroll() {
    return this.editor != null && isSafari();
  }
  applyHunksToDOM(pre, result) {
    if (this.shouldGuardRebuildScroll()) guardWebKitScrollDuringRebuild(pre, () => this.replaceCodeColumns(pre, result));
    else this.replaceCodeColumns(pre, result);
  }
  applyCodeColumnsInPlace(code, ast, rowCount) {
    const columns = this.getColumnPair(code);
    if (columns == null) return false;
    const gutterChildren = getElementChildren(ast[0]);
    const contentChildren = getElementChildren(ast[1]);
    if (gutterChildren == null || contentChildren == null) return false;
    columns.gutter.innerHTML = toHtml(gutterChildren);
    columns.content.innerHTML = toHtml(contentChildren);
    if (rowCount !== this.lastRowCount) {
      columns.gutter.style.setProperty("grid-row", `span ${rowCount}`);
      columns.content.style.setProperty("grid-row", `span ${rowCount}`);
    }
    return true;
  }
  replaceCodeColumns(pre, result) {
    var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j;
    const { overflow = "scroll" } = this.options;
    const containerSize = (this.options.hunkSeparators ?? "line-info") === "line-info";
    const rowSpan = overflow === "wrap" ? result.rowCount : void 0;
    this.cleanupErrorWrapper();
    this.applyPreNodeAttributes(pre, result);
    let shouldReplace = false;
    const codeElements = [];
    const unifiedAST = this.hunksRenderer.renderCodeAST("unified", result);
    const deletionsAST = this.hunksRenderer.renderCodeAST("deletions", result);
    const additionsAST = this.hunksRenderer.renderCodeAST("additions", result);
    (_a2 = this.editor) == null ? void 0 : _a2.__captureFocusForDOMReplacement();
    if (unifiedAST != null) {
      shouldReplace = this.codeUnified == null || this.codeAdditions != null || this.codeDeletions != null;
      (_b2 = this.codeDeletions) == null ? void 0 : _b2.remove();
      this.codeDeletions = void 0;
      (_c = this.codeAdditions) == null ? void 0 : _c.remove();
      this.codeAdditions = void 0;
      this.codeUnified = getOrCreateCodeNode({
        code: this.codeUnified,
        columnType: "unified",
        rowSpan,
        containerSize
      });
      if (!this.applyCodeColumnsInPlace(this.codeUnified, unifiedAST, result.rowCount)) this.codeUnified.innerHTML = this.hunksRenderer.renderPartialHTML(unifiedAST);
      codeElements.push(this.codeUnified);
    } else if (deletionsAST != null || additionsAST != null) {
      if (deletionsAST != null) {
        shouldReplace = this.codeDeletions == null || this.codeUnified != null;
        (_d = this.codeUnified) == null ? void 0 : _d.remove();
        this.codeUnified = void 0;
        this.codeDeletions = getOrCreateCodeNode({
          code: this.codeDeletions,
          columnType: "deletions",
          rowSpan,
          containerSize
        });
        if (!this.applyCodeColumnsInPlace(this.codeDeletions, deletionsAST, result.rowCount)) this.codeDeletions.innerHTML = this.hunksRenderer.renderPartialHTML(deletionsAST);
        codeElements.push(this.codeDeletions);
      } else {
        (_e = this.codeDeletions) == null ? void 0 : _e.remove();
        this.codeDeletions = void 0;
      }
      if (additionsAST != null) {
        shouldReplace = shouldReplace || this.codeAdditions == null || this.codeUnified != null;
        (_f = this.codeUnified) == null ? void 0 : _f.remove();
        this.codeUnified = void 0;
        this.codeAdditions = getOrCreateCodeNode({
          code: this.codeAdditions,
          columnType: "additions",
          rowSpan,
          containerSize
        });
        if (!this.applyCodeColumnsInPlace(this.codeAdditions, additionsAST, result.rowCount)) this.codeAdditions.innerHTML = this.hunksRenderer.renderPartialHTML(additionsAST);
        codeElements.push(this.codeAdditions);
      } else {
        (_g = this.codeAdditions) == null ? void 0 : _g.remove();
        this.codeAdditions = void 0;
      }
    } else {
      (_h = this.codeUnified) == null ? void 0 : _h.remove();
      this.codeUnified = void 0;
      (_i = this.codeDeletions) == null ? void 0 : _i.remove();
      this.codeDeletions = void 0;
      (_j = this.codeAdditions) == null ? void 0 : _j.remove();
      this.codeAdditions = void 0;
    }
    if (codeElements.length === 0) pre.textContent = "";
    else if (shouldReplace) pre.replaceChildren(...codeElements);
    this.lastRowCount = result.rowCount;
  }
  applyPartialRender({ fileDiff, previousRenderRange, renderRange }) {
    const { pre, codeUnified, codeAdditions, codeDeletions, options: { diffStyle = "split" } } = this;
    if (pre == null || previousRenderRange == null || renderRange == null || !Number.isFinite(previousRenderRange.totalLines) || !Number.isFinite(renderRange.totalLines) || this.lastRowCount == null) return false;
    const codeElements = this.getCodeColumns(diffStyle, codeUnified, codeDeletions, codeAdditions);
    if (codeElements == null) return false;
    const previousStart = previousRenderRange.startingLine;
    const nextStart = renderRange.startingLine;
    const previousEnd = previousStart + previousRenderRange.totalLines;
    const nextEnd = nextStart + renderRange.totalLines;
    const overlapStart = Math.max(previousStart, nextStart);
    const overlapEnd = Math.min(previousEnd, nextEnd);
    if (overlapEnd <= overlapStart) return false;
    const trimStart = Math.max(0, overlapStart - previousStart);
    const trimEnd = Math.max(0, previousEnd - overlapEnd);
    const trimResult = this.trimColumns({
      columns: codeElements,
      trimStart,
      trimEnd,
      previousStart,
      overlapStart,
      overlapEnd,
      diffStyle
    });
    if (trimResult < 0) throw new Error("FileDiff.applyPartialRender: failed to trim to overlap");
    if (this.lastRowCount < trimResult) throw new Error("FileDiff.applyPartialRender: trimmed beyond DOM row count");
    let rowCount = this.lastRowCount - trimResult;
    const renderChunk = (startingLine, totalLines) => {
      if (totalLines <= 0) return;
      return this.hunksRenderer.renderDiff(fileDiff, {
        startingLine,
        totalLines,
        bufferBefore: 0,
        bufferAfter: 0
      });
    };
    const prependResult = renderChunk(nextStart, Math.max(overlapStart - nextStart, 0));
    if (prependResult == null && nextStart < overlapStart) return false;
    const appendResult = renderChunk(overlapEnd, Math.max(nextEnd - overlapEnd, 0));
    if (appendResult == null && nextEnd > overlapEnd) return false;
    const applyChunk = (result, insertPosition) => {
      if (result == null) return;
      if (diffStyle === "unified" && !Array.isArray(codeElements)) this.insertPartialHTML(diffStyle, codeElements, result, insertPosition);
      else if (diffStyle === "split" && Array.isArray(codeElements)) this.insertPartialHTML(diffStyle, codeElements, result, insertPosition);
      else throw new Error("FileDiff.applyPartialRender.applyChunk: invalid chunk application");
      rowCount += result.rowCount;
      this.renderedDiff = result.fileDiff;
    };
    this.cleanupErrorWrapper();
    applyChunk(prependResult, "afterbegin");
    applyChunk(appendResult, "beforeend");
    if (this.lastRowCount !== rowCount) {
      this.applyRowSpan(diffStyle, codeElements, rowCount);
      this.lastRowCount = rowCount;
    }
    return true;
  }
  insertPartialHTML(diffStyle, columns, result, insertPosition) {
    if (diffStyle === "unified" && !Array.isArray(columns)) {
      const unifiedAST = this.hunksRenderer.renderCodeAST("unified", result);
      this.renderPartialColumn(columns, unifiedAST, insertPosition);
    } else if (diffStyle === "split" && Array.isArray(columns)) {
      const deletionsAST = this.hunksRenderer.renderCodeAST("deletions", result);
      const additionsAST = this.hunksRenderer.renderCodeAST("additions", result);
      this.renderPartialColumn(columns[0], deletionsAST, insertPosition);
      this.renderPartialColumn(columns[1], additionsAST, insertPosition);
    } else throw new Error("FileDiff.insertPartialHTML: Invalid argument composition");
  }
  refreshSplitDiffView() {
    const fileDiff = this.getLatestDiff();
    if (this.options.diffStyle !== "split" || fileDiff == null) return;
    const hunksResult = this.hunksRenderer.renderDiff(fileDiff, this.renderRange);
    if (hunksResult == null) return;
    const columns = this.getCodeColumns("split", this.codeUnified, this.codeDeletions, this.codeAdditions);
    if (!Array.isArray(columns)) return;
    const applyLineType = (type, column) => {
      if (column == null) return;
      const ast = this.hunksRenderer.renderCodeAST(type, hunksResult);
      const gutterChildren = getElementChildren(ast == null ? void 0 : ast[0]);
      const contentChildren = getElementChildren(ast == null ? void 0 : ast[1]);
      for (const [el, astChildren] of [[column.gutter, gutterChildren], [column.content, contentChildren]]) if (astChildren != null && el.childElementCount === astChildren.length) for (let i = 0; i < astChildren.length; i++) {
        const gutterElement = el.children[i];
        const lineType = astChildren[i].properties["data-line-type"];
        if (lineType != null && gutterElement.dataset.lineType !== lineType) gutterElement.dataset.lineType = lineType;
      }
    };
    applyLineType("deletions", columns[0]);
    applyLineType("additions", columns[1]);
    this.renderedDiff = hunksResult.fileDiff;
  }
  refreshUnifiedDiffView() {
    const fileDiff = this.getLatestDiff();
    if (this.options.diffStyle !== "unified" || fileDiff == null) return;
    const hunksResult = this.hunksRenderer.renderDiff(fileDiff, this.renderRange);
    if (hunksResult == null) return;
    const columns = this.getCodeColumns("unified", this.codeUnified, this.codeDeletions, this.codeAdditions);
    if (columns == null || Array.isArray(columns)) return;
    const ast = this.hunksRenderer.renderCodeAST("unified", hunksResult);
    const gutterChildren = getElementChildren(ast == null ? void 0 : ast[0]);
    const contentChildren = getElementChildren(ast == null ? void 0 : ast[1]);
    const applyColumns = () => {
      for (const [el, astChildren] of [[columns.gutter, gutterChildren], [columns.content, contentChildren]]) if (astChildren != null) el.innerHTML = toHtml(astChildren);
      if (hunksResult.rowCount !== this.lastRowCount) {
        this.applyRowSpan("unified", columns, hunksResult.rowCount);
        this.lastRowCount = hunksResult.rowCount;
      }
      this.renderedDiff = hunksResult.fileDiff;
    };
    if (this.shouldGuardRebuildScroll()) guardWebKitScrollDuringRebuild(this.pre, applyColumns);
    else applyColumns();
    this.renderSeparators(hunksResult.hunkData);
    this.managersDirty = true;
    this.flushManagers();
    this.syncRenderViewToEditor();
  }
  renderPartialColumn(column, ast, insertPosition) {
    if (column == null || ast == null) return;
    const gutterChildren = getElementChildren(ast[0]);
    const contentChildren = getElementChildren(ast[1]);
    if (gutterChildren == null || contentChildren == null) throw new Error("FileDiff.insertPartialHTML: Unexpected AST structure");
    const firstHASTElement = contentChildren.at(0);
    if (insertPosition === "beforeend" && (firstHASTElement == null ? void 0 : firstHASTElement.type) === "element" && typeof firstHASTElement.properties["data-buffer-size"] === "number") this.mergeBuffersIfNecessary(firstHASTElement.properties["data-buffer-size"], column.content.children[column.content.children.length - 1], column.gutter.children[column.gutter.children.length - 1], gutterChildren, contentChildren, true);
    const lastHASTElement = contentChildren.at(-1);
    if (insertPosition === "afterbegin" && (lastHASTElement == null ? void 0 : lastHASTElement.type) === "element" && typeof lastHASTElement.properties["data-buffer-size"] === "number") this.mergeBuffersIfNecessary(lastHASTElement.properties["data-buffer-size"], column.content.children[0], column.gutter.children[0], gutterChildren, contentChildren, false);
    column.gutter.insertAdjacentHTML(insertPosition, this.hunksRenderer.renderPartialHTML(gutterChildren));
    column.content.insertAdjacentHTML(insertPosition, this.hunksRenderer.renderPartialHTML(contentChildren));
  }
  mergeBuffersIfNecessary(adjustmentSize, contentElement, gutterElement, gutterChildren, contentChildren, fromStart) {
    if (!(contentElement instanceof HTMLElement) || !(gutterElement instanceof HTMLElement)) return;
    const currentSize = this.getBufferSize(contentElement.dataset);
    if (currentSize == null) return;
    if (fromStart) {
      gutterChildren.shift();
      contentChildren.shift();
    } else {
      gutterChildren.pop();
      contentChildren.pop();
    }
    this.updateBufferSize(contentElement, currentSize + adjustmentSize);
    this.updateBufferSize(gutterElement, currentSize + adjustmentSize);
  }
  applyRowSpan(diffStyle, columns, rowCount) {
    const applySpan = (column) => {
      if (column == null) return;
      column.gutter.style.setProperty("grid-row", `span ${rowCount}`);
      column.content.style.setProperty("grid-row", `span ${rowCount}`);
    };
    if (diffStyle === "unified" && !Array.isArray(columns)) applySpan(columns);
    else if (diffStyle === "split" && Array.isArray(columns)) {
      applySpan(columns[0]);
      applySpan(columns[1]);
    } else throw new Error("dun fuuuuked up");
  }
  trimColumnRows(columns, preTrimCount, postTrimStart) {
    let visibleLineIndex = 0;
    let rowCount = 0;
    let rowIndex = 0;
    let pendingMetadataTrim = false;
    const hasPostTrim = postTrimStart >= 0;
    if (columns == null) return 0;
    const contentChildren = Array.from(columns.content.children);
    const gutterChildren = Array.from(columns.gutter.children);
    if (contentChildren.length !== gutterChildren.length) throw new Error("FileDiff.trimColumnRows: columns do not match");
    while (rowIndex < contentChildren.length) {
      if (preTrimCount <= 0 && !hasPostTrim && !pendingMetadataTrim) break;
      const gutterElement = gutterChildren[rowIndex];
      const contentElement = contentChildren[rowIndex];
      rowIndex++;
      if (!(gutterElement instanceof HTMLElement) || !(contentElement instanceof HTMLElement)) {
        console.error({
          gutterElement,
          contentElement
        });
        throw new Error("FileDiff.trimColumnRows: invalid row elements");
      }
      if (pendingMetadataTrim) {
        pendingMetadataTrim = false;
        if (gutterElement.dataset.gutterBuffer === "annotation" && "lineAnnotation" in contentElement.dataset || gutterElement.dataset.gutterBuffer === "metadata" && "noNewline" in contentElement.dataset) {
          gutterElement.remove();
          contentElement.remove();
          rowCount++;
          continue;
        }
      }
      if ("lineIndex" in gutterElement.dataset && "lineIndex" in contentElement.dataset) {
        if (preTrimCount > 0 || hasPostTrim && visibleLineIndex >= postTrimStart) {
          gutterElement.remove();
          contentElement.remove();
          if (preTrimCount > 0) {
            preTrimCount--;
            if (preTrimCount === 0) pendingMetadataTrim = true;
          }
          rowCount++;
        }
        visibleLineIndex++;
        continue;
      }
      if ("separator" in gutterElement.dataset && "separator" in contentElement.dataset) {
        if (preTrimCount > 0 || hasPostTrim && visibleLineIndex >= postTrimStart) {
          gutterElement.remove();
          contentElement.remove();
          rowCount++;
        }
        continue;
      }
      if (gutterElement.dataset.gutterBuffer === "annotation" && "lineAnnotation" in contentElement.dataset) {
        if (preTrimCount > 0 || hasPostTrim && visibleLineIndex >= postTrimStart) {
          gutterElement.remove();
          contentElement.remove();
          rowCount++;
        }
        continue;
      }
      if (gutterElement.dataset.gutterBuffer === "metadata" && "noNewline" in contentElement.dataset) {
        if (preTrimCount > 0 || hasPostTrim && visibleLineIndex >= postTrimStart) {
          gutterElement.remove();
          contentElement.remove();
          rowCount++;
        }
        continue;
      }
      if (gutterElement.dataset.gutterBuffer === "buffer" && "contentBuffer" in contentElement.dataset) {
        const totalRows = this.getBufferSize(contentElement.dataset);
        if (totalRows == null) throw new Error("FileDiff.trimColumnRows: invalid element");
        if (preTrimCount > 0) {
          const rowsToRemove = Math.min(preTrimCount, totalRows);
          const newSize = totalRows - rowsToRemove;
          if (newSize > 0) {
            this.updateBufferSize(gutterElement, newSize);
            this.updateBufferSize(contentElement, newSize);
            rowCount += rowsToRemove;
          } else {
            gutterElement.remove();
            contentElement.remove();
            rowCount += totalRows;
          }
          preTrimCount -= rowsToRemove;
          if (preTrimCount === 0 && newSize === 0) pendingMetadataTrim = true;
        } else if (hasPostTrim) {
          const bufferStart = visibleLineIndex;
          const bufferEnd = visibleLineIndex + totalRows - 1;
          if (postTrimStart <= bufferStart) {
            gutterElement.remove();
            contentElement.remove();
            rowCount += totalRows;
          } else if (postTrimStart <= bufferEnd) {
            const rowsToRemove = bufferEnd - postTrimStart + 1;
            const newSize = totalRows - rowsToRemove;
            this.updateBufferSize(gutterElement, newSize);
            this.updateBufferSize(contentElement, newSize);
            rowCount += rowsToRemove;
          }
        }
        visibleLineIndex += totalRows;
        continue;
      }
      console.error({
        gutterElement,
        contentElement
      });
      throw new Error("FileDiff.trimColumnRows: unknown row elements");
    }
    return rowCount;
  }
  trimColumns({ columns, diffStyle, overlapEnd, overlapStart, previousStart, trimEnd, trimStart }) {
    const preTrimCount = Math.max(0, overlapStart - previousStart);
    const postTrimStart = overlapEnd - previousStart;
    if (postTrimStart < 0) throw new Error("FileDiff.trimColumns: overlap ends before previous");
    const shouldTrimStart = trimStart > 0;
    const shouldTrimEnd = trimEnd > 0;
    if (!shouldTrimStart && !shouldTrimEnd) return 0;
    const effectivePreTrimCount = shouldTrimStart ? preTrimCount : 0;
    const effectivePostTrimStart = shouldTrimEnd ? postTrimStart : -1;
    if (diffStyle === "unified" && !Array.isArray(columns)) return this.trimColumnRows(columns, effectivePreTrimCount, effectivePostTrimStart);
    else if (diffStyle === "split" && Array.isArray(columns)) {
      const deletionsTrim = this.trimColumnRows(columns[0], effectivePreTrimCount, effectivePostTrimStart);
      const additionsTrim = this.trimColumnRows(columns[1], effectivePreTrimCount, effectivePostTrimStart);
      if (columns[0] != null && columns[1] != null && deletionsTrim !== additionsTrim) throw new Error("FileDiff.trimColumns: split columns out of sync");
      return columns[0] != null ? deletionsTrim : additionsTrim;
    } else {
      console.error({
        diffStyle,
        columns
      });
      throw new Error("FileDiff.trimColumns: Invalid columns for diffType");
    }
  }
  getBufferSize(properties) {
    const parsed = Number.parseInt((properties == null ? void 0 : properties.bufferSize) ?? "", 10);
    return Number.isNaN(parsed) ? void 0 : parsed;
  }
  updateBufferSize(element, size) {
    element.dataset.bufferSize = `${size}`;
    element.style.setProperty("grid-row", `span ${size}`);
    element.style.setProperty("min-height", `calc(${size} * 1lh)`);
  }
  getColumnPair(code) {
    if (code == null) return;
    const gutter = code.children[0];
    const content = code.children[1];
    if (!(gutter instanceof HTMLElement) || !(content instanceof HTMLElement) || gutter.dataset.gutter == null || content.dataset.content == null) return;
    return {
      gutter,
      content
    };
  }
  getCodeColumns(diffStyle, codeUnified, codeDeletions, codeAdditions) {
    if (diffStyle === "unified") return this.getColumnPair(codeUnified);
    else {
      const deletions = this.getColumnPair(codeDeletions);
      const additions = this.getColumnPair(codeAdditions);
      return deletions != null || additions != null ? [deletions, additions] : void 0;
    }
  }
  updateBuffers(renderRange) {
    if (this.pre != null) this.applyBuffers(this.pre, renderRange);
  }
  applyBuffers(pre, renderRange) {
    if (renderRange == null || this.shouldDisableVirtualizationBuffers()) {
      if (this.bufferBefore != null) {
        this.bufferBefore.remove();
        this.bufferBefore = void 0;
      }
      if (this.bufferAfter != null) {
        this.bufferAfter.remove();
        this.bufferAfter = void 0;
      }
      return;
    }
    if (renderRange.bufferBefore > 0) {
      if (this.bufferBefore == null) {
        this.bufferBefore = document.createElement("div");
        this.bufferBefore.dataset.virtualizerBuffer = "before";
        pre.before(this.bufferBefore);
      }
      this.bufferBefore.style.setProperty("height", `${renderRange.bufferBefore}px`);
      this.bufferBefore.style.setProperty("contain", "strict");
    } else if (this.bufferBefore != null) {
      this.bufferBefore.remove();
      this.bufferBefore = void 0;
    }
    if (renderRange.bufferAfter > 0) {
      if (this.bufferAfter == null) {
        this.bufferAfter = document.createElement("div");
        this.bufferAfter.dataset.virtualizerBuffer = "after";
        pre.after(this.bufferAfter);
      }
      this.bufferAfter.style.setProperty("height", `${renderRange.bufferAfter}px`);
      this.bufferAfter.style.setProperty("contain", "strict");
    } else if (this.bufferAfter != null) {
      this.bufferAfter.remove();
      this.bufferAfter = void 0;
    }
  }
  shouldDisableVirtualizationBuffers() {
    return this.options.disableVirtualizationBuffers ?? false;
  }
  applyPreNodeAttributes(pre, { additionsContentAST, deletionsContentAST, totalLines }, customProperties) {
    const { diffIndicators = "bars", disableBackground = false, disableLineNumbers = false, overflow = "scroll", diffStyle = "split" } = this.options;
    const preProperties = {
      type: "diff",
      diffIndicators,
      disableBackground,
      disableLineNumbers,
      overflow,
      split: diffStyle === "unified" ? false : additionsContentAST != null && deletionsContentAST != null,
      totalLines,
      customProperties
    };
    if (arePrePropertiesEqual(preProperties, this.appliedPreAttributes)) return;
    setPreNodeProperties(pre, preProperties);
    this.appliedPreAttributes = preProperties;
  }
  applyErrorToDOM(error, container) {
    var _a2;
    this.cleanupErrorWrapper();
    (_a2 = this.pre) == null ? void 0 : _a2.remove();
    this.pre = void 0;
    this.appliedPreAttributes = void 0;
    const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
    this.errorWrapper ?? (this.errorWrapper = document.createElement("div"));
    this.errorWrapper.dataset.errorWrapper = "";
    this.errorWrapper.textContent = "";
    shadowRoot.appendChild(this.errorWrapper);
    const errorMessage = document.createElement("div");
    errorMessage.dataset.errorMessage = "";
    errorMessage.innerText = error.message;
    this.errorWrapper.appendChild(errorMessage);
    const errorStack = document.createElement("pre");
    errorStack.dataset.errorStack = "";
    errorStack.innerText = error.stack ?? "No Error Stack";
    this.errorWrapper.appendChild(errorStack);
  }
  cleanupErrorWrapper() {
    var _a2;
    (_a2 = this.errorWrapper) == null ? void 0 : _a2.remove();
    this.errorWrapper = void 0;
  }
}, __publicField(_b, "LoadedCustomComponent", true), _b);
function getAdditionFile(fileDiff) {
  return {
    name: fileDiff.name,
    lang: fileDiff.lang,
    contents: fileDiff.additionLines.join("")
  };
}
function areOptionalFilesEqual(fileA, fileB) {
  if (fileA == null || fileB == null) return fileA == null && fileB == null;
  return areFilesEqual(fileA, fileB);
}
function hasDiffContent({ fileDiff, oldFile, newFile }) {
  return fileDiff != null && fileDiff.hunks.length > 0 || oldFile != null || newFile != null;
}
function hasDiffHeaderContent({ fileDiff, oldFile, newFile }) {
  return fileDiff != null || oldFile != null || newFile != null;
}
function shouldRenderCode(pre, hasContent, collapsed = false) {
  return !collapsed && pre == null && hasContent;
}
function shouldRenderHeader(headerElement, hasContent, disableFileHeader = false) {
  return headerElement == null && hasContent && !disableFileHeader;
}
function getElementChildren(node) {
  if (node == null || node.type !== "element") return;
  return node.children ?? [];
}
function compareVersions(path, before, after, languageId) {
  if (before === after) return { additions: 0, deletions: 0, metadata: null };
  const lang = languageId ?? "text";
  const metadata = parseDiffFromFile({ name: path, contents: before, lang }, { name: path, contents: after, lang });
  return {
    additions: metadata.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
    deletions: metadata.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    metadata
  };
}
class DiffView {
  constructor(onDrawn) {
    __publicField(this, "element", h("div", { className: "cv-diff-view" }));
    __publicField(this, "renderer", null);
    this.onDrawn = onDrawn;
  }
  /** Draw a change; equal versions show `No differences`. */
  show(change) {
    if (!change.metadata) {
      this.destroy();
      this.element.replaceChildren(h("p", { className: "cv-diff-equal", role: "status", text: "No differences" }));
      this.onDrawn();
      return;
    }
    if (this.renderer) {
      this.renderer.render({ fileDiff: change.metadata });
      return;
    }
    const target = h("div");
    this.element.replaceChildren(target);
    this.renderer = new FileDiff({
      diffStyle: "unified",
      theme: { light: "github-light", dark: "github-dark" },
      hunkSeparators: "line-info",
      overflow: "wrap",
      // The diff sizes to its lines and the pane scrolls it, so the library's
      // containment, which assumes a scroll box of its own, is removed.
      unsafeCSS: "[data-code] { contain: none; }",
      disableFileHeader: true,
      disableErrorHandling: true,
      onPostRender: (_node, _instance, phase) => {
        if (phase !== "unmount") this.onDrawn();
      }
    });
    this.renderer.render({ fileDiff: change.metadata, containerWrapper: target });
  }
  /** Release the renderer. */
  destroy() {
    var _a2;
    (_a2 = this.renderer) == null ? void 0 : _a2.cleanUp();
    this.renderer = null;
  }
}
export {
  DiffView,
  compareVersions
};
