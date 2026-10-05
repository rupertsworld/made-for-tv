/** File pane shell; its body is supplied as sample HTML. */
import type { Template } from '../../types';
import header from './header';

type Args = Parameters<typeof header.render>[0] & { bodyHtml: string };
const options = {} as const;
const rules = `/* Code view and syntax. */
tv-code .cv-code-view {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: var(--_background);
  color: var(--_text);
  font-family: var(--_font-mono);
  font-size: var(--_code-size);
  line-height: var(--_code-line-height);
  tab-size: 4;
  /* Wrapped indentation is capped against the width of the code view. */
  container-type: inline-size;
}

tv-code .cv-code-view:focus-visible,
tv-code .cv-line-number:focus-visible {
  outline: var(--_focus);
  outline-offset: -2px;
}

tv-code .cv-code-block {
  min-width: 100%;
  width: max-content;
  content-visibility: auto;
  contain-intrinsic-size: auto calc(var(--cv-block-lines) * var(--_code-line-height));
}

/* The first screen must paint in the same frame as a show or update. */
tv-code .cv-code-block:first-child {
  content-visibility: visible;
}

tv-code .cv-line {
  display: flex;
  min-width: 100%;
  width: max-content;
  min-height: var(--_code-line-height);
  position: relative;
}

tv-code .cv-line-number {
  position: sticky;
  left: 0;
  z-index: 1;
  /* Line numbers are buttons; reset the Television button shape so the
     divider stays straight. Browsers centre button content vertically, so
     a flex box keeps the number on the first row of a wrapped line. */
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex: 0 0 calc(var(--cv-gutter-digits, 2) * 1ch + 20px);
  align-self: stretch;
  box-sizing: border-box;
  min-height: 0;
  border: 0;
  border-radius: 0;
  border-right: 1px solid var(--_border);
  padding: 0 10px 0 10px;
  background: var(--_background);
  color: var(--_text-muted);
  font: inherit;
  line-height: var(--_code-line-height);
  cursor: pointer;
  user-select: none;
}

tv-code .cv-line-number::before {
  content: attr(data-line);
}

tv-code .cv-line-number:hover {
  background: var(--_hover);
}

tv-code .cv-line-selected .cv-line-number {
  background: var(--_selection);
  color: var(--_accent);
  font-weight: 600;
}

tv-code .cv-code-text {
  display: block;
  padding: 0 20px 0 12px;
  white-space: pre;
  min-height: var(--_code-line-height);
  box-sizing: border-box;
}

tv-code .cv-line-break {
  font-size: 0;
  line-height: 0;
}

tv-code .cv-wrap .cv-code-block,
tv-code .cv-wrap .cv-line {
  width: 100%;
}

tv-code .cv-wrap .cv-code-text {
  /* Continuation rows keep the indentation of their line, as in VS Code.
     The padding moves every row in by the indentation and the negative
     text-indent brings the first row back. The cap keeps room for the text
     of deeply nested lines. */
  --_wrap-indent: min(calc(var(--cv-indent, 0) * 1ch), 40cqi);
  min-width: 0;
  padding-left: calc(12px + var(--_wrap-indent));
  text-indent: calc(-1 * var(--_wrap-indent));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

tv-code .cv-line-added {
  background: color-mix(in srgb, var(--_added) 14%, var(--_background));
  animation: cv-added-fade 2.5s ease-out forwards;
}

tv-code .cv-line-selected {
  background: var(--_selection);
  animation: none;
}

tv-code .cv-line-added .cv-line-number::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--_added);
  animation: cv-change-fade 2.5s ease-out forwards;
}

tv-code .cv-line-removed-before::before,
tv-code .cv-line-removed-end::after {
  content: "";
  position: absolute;
  z-index: 2;
  left: 0;
  top: -2px;
  width: 58px;
  height: 3px;
  background: var(--_removed);
  animation: cv-change-fade 2.5s ease-out forwards;
}

tv-code .cv-line-removed-end {
  position: relative;
}

tv-code .cv-line-removed-end::after {
  top: auto;
  bottom: -2px;
}

@keyframes cv-change-fade {
  0%, 60% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes cv-added-fade {
  0%, 60% { background: color-mix(in srgb, var(--_added) 14%, var(--_background)); }
  100% { background: var(--_background); }
}

@media (prefers-reduced-motion: reduce) {
  tv-code .cv-line-added,
  tv-code .cv-line-added .cv-line-number::after,
  tv-code .cv-line-removed-before::before,
  tv-code .cv-line-removed-end::after {
    animation: none;
  }
}

tv-code .cv-t-keyword { color: var(--_syntax-keyword); }
tv-code .cv-t-string { color: var(--_syntax-string); }
tv-code .cv-t-number { color: var(--_syntax-number); }
tv-code .cv-t-comment { color: var(--_syntax-comment); font-style: italic; }
tv-code .cv-t-function { color: var(--_syntax-function); }
tv-code .cv-t-type { color: var(--_syntax-type); }
tv-code .cv-t-property { color: var(--_syntax-property); }
tv-code .cv-t-parameter { color: var(--_syntax-parameter); }
tv-code .cv-t-tag { color: var(--_syntax-tag); }
tv-code .cv-t-attribute { color: var(--_syntax-attribute); }
tv-code .cv-t-operator { color: var(--_syntax-operator); }
tv-code .cv-t-punctuation { color: var(--_syntax-punctuation); }
tv-code .cv-t-regexp { color: var(--_syntax-regexp); }
tv-code .cv-t-escape { color: var(--_syntax-escape); }
tv-code .cv-t-heading { color: var(--_syntax-heading); }
tv-code .cv-t-link { color: var(--_syntax-link); }
tv-code .cv-t-inserted { color: var(--_syntax-inserted); }
tv-code .cv-t-deleted { color: var(--_syntax-deleted); }

`;
const style = [...header.style, rules];

function render({ bodyHtml, ...headerArgs }: Args): string {
  return `<section class="cv-pane">${header.render(headerArgs)}<div class="cv-pane-progress"></div><div class="cv-pane-notice"></div><div class="cv-pane-content">${bodyHtml}</div></section>`;
}

export default { options, style, render } satisfies Template<Args>;
