/** Shared viewer rules, included once by the composed stylesheet. */
export const style = [`/*
 * tv-code — element stylesheet.
 *
 * The composed templates specify the element stylesheet. The build ships
 * their styles, followed by the tv-markdown stylesheet, as tv-code.css.
 *
 * Selectors are scoped to the element and use one class or attribute per part,
 * so they take precedence over the zero-specificity rules of the Television
 * canonical stylesheet whatever order the two load in.
 */

/* Each variable resolves once: the element variable, then the Television
   variable, then a built-in default. Colour defaults use light-dark(), so they
   follow the color-scheme in effect for the element. */
tv-code {
  --_background: var(--tv-code-background, var(--color-surface, light-dark(oklch(100% 0 0), oklch(20.5% 0 0))));
  --_sidebar-background: var(--tv-code-sidebar-background, var(--color-surface-muted, light-dark(oklch(97% 0 0), oklch(26.9% 0 0))));
  --_text: var(--tv-code-text, var(--color-text, light-dark(oklch(20.5% 0 0), oklch(92.2% 0 0))));
  --_text-muted: var(--tv-code-text-muted, var(--color-text-muted, light-dark(oklch(55.6% 0 0), oklch(70.8% 0 0))));
  --_border: var(--tv-code-border, var(--color-border, light-dark(oklch(20.5% 0 0 / 12%), oklch(92.2% 0 0 / 18%))));
  --_hover: var(--tv-code-hover, var(--tint-hover, light-dark(oklch(20.5% 0 0 / 5%), oklch(92.2% 0 0 / 7%))));
  --_selection: var(--tv-code-selection, var(--tint-primary, light-dark(oklch(62.3% 0.214 259.8 / 12%), oklch(70.7% 0.165 254.6 / 18%))));
  --_accent: var(--tv-code-accent, var(--color-primary, light-dark(oklch(56.4% 0.221 259.8), oklch(76.1% 0.133 254.6))));
  --_added: var(--tv-code-added, var(--color-success, light-dark(oklch(65.5% 0.226 149.6), oklch(83% 0.168 151.7))));
  --_removed: var(--tv-code-removed, var(--color-danger, light-dark(oklch(57.7% 0.245 25.3), oklch(75.9% 0.154 22.2))));
  --_focus: var(--tv-code-focus, var(--outline-focus, 2px solid light-dark(oklch(55% 0.2 255), oklch(72% 0.15 255))));
  --_font: var(--tv-code-font, var(--font-sans, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif));
  --_font-mono: var(--tv-code-font-mono, var(--font-mono, ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace));
  --_shadow: var(--tv-code-shadow, var(--popover-shadow, 0 4px 14px oklch(0% 0 0 / 14%), 0 1px 3px oklch(0% 0 0 / 8%)));
  --_text-size: max(13px, var(--text-sm, 13px));
  --_code-size: 12px;
  --_code-line-height: 18px;

  /* Syntax roles: the page value, then a step of the Television palette (a
     lighter step under a dark colour scheme), then the default value of that
     step. */
  --_syntax-keyword: var(--tv-code-syntax-keyword, light-dark(var(--purple-600, oklch(0.568 0.274 303.9)), var(--purple-400, oklch(0.767 0.164 305.5))));
  --_syntax-string: var(--tv-code-syntax-string, light-dark(var(--green-700, oklch(0.573 0.197 149.6)), var(--green-400, oklch(0.830 0.168 151.7))));
  --_syntax-number: var(--tv-code-syntax-number, light-dark(var(--orange-700, oklch(0.559 0.191 47.6)), var(--orange-400, oklch(0.796 0.147 55.9))));
  --_syntax-comment: var(--tv-code-syntax-comment, light-dark(var(--neutral-500, oklch(0.556 0 0)), var(--neutral-400, oklch(0.708 0 0))));
  --_syntax-function: var(--tv-code-syntax-function, light-dark(var(--blue-600, oklch(0.564 0.221 259.8)), var(--blue-400, oklch(0.761 0.133 254.6))));
  --_syntax-type: var(--tv-code-syntax-type, light-dark(var(--cyan-700, oklch(0.567 0.129 215.2)), var(--cyan-400, oklch(0.828 0.124 211.5))));
  --_syntax-property: var(--tv-code-syntax-property, light-dark(var(--red-700, oklch(0.505 0.213 25.3)), var(--red-400, oklch(0.759 0.154 22.2))));
  --_syntax-parameter: var(--tv-code-syntax-parameter, light-dark(var(--pink-700, oklch(0.520 0.217 354.3)), var(--pink-400, oklch(0.770 0.163 349.8))));
  --_syntax-tag: var(--tv-code-syntax-tag, light-dark(var(--red-600, oklch(0.577 0.245 25.3)), var(--red-400, oklch(0.759 0.154 22.2))));
  --_syntax-attribute: var(--tv-code-syntax-attribute, light-dark(var(--orange-700, oklch(0.559 0.191 47.6)), var(--orange-400, oklch(0.796 0.147 55.9))));
  --_syntax-operator: var(--tv-code-syntax-operator, light-dark(var(--purple-600, oklch(0.568 0.274 303.9)), var(--purple-400, oklch(0.767 0.164 305.5))));
  --_syntax-punctuation: var(--tv-code-syntax-punctuation, var(--_text-muted));
  --_syntax-regexp: var(--tv-code-syntax-regexp, light-dark(var(--cyan-700, oklch(0.567 0.129 215.2)), var(--cyan-400, oklch(0.828 0.124 211.5))));
  --_syntax-escape: var(--tv-code-syntax-escape, light-dark(var(--cyan-600, oklch(0.648 0.148 215.2)), var(--cyan-400, oklch(0.828 0.124 211.5))));
  --_syntax-heading: var(--tv-code-syntax-heading, light-dark(var(--blue-700, oklch(0.494 0.192 259.8)), var(--blue-400, oklch(0.761 0.133 254.6))));
  --_syntax-link: var(--tv-code-syntax-link, light-dark(var(--blue-600, oklch(0.564 0.221 259.8)), var(--blue-400, oklch(0.761 0.133 254.6))));
  --_syntax-inserted: var(--tv-code-syntax-inserted, light-dark(var(--green-700, oklch(0.573 0.197 149.6)), var(--green-400, oklch(0.830 0.168 151.7))));
  --_syntax-deleted: var(--tv-code-syntax-deleted, light-dark(var(--red-700, oklch(0.505 0.213 25.3)), var(--red-400, oklch(0.759 0.154 22.2))));
}

/* The element. It fills the space it is given; by default the viewport. */
tv-code {
  display: block;
  position: relative;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  color: var(--_text);
  background: var(--_background);
  font-family: var(--_font);
  font-size: var(--_text-size);
  -webkit-font-smoothing: antialiased;
}

/* Child tags describe files; they are input, never shown. */
tv-code tv-code-file,
tv-code tv-code-folder {
  display: none;
}

`];
