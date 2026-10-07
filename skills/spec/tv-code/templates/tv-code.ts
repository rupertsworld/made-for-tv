/** A composed, inert specimen of the tv-code element. */
import type { Template } from '../../types';
import finder from './finder';
import pane from './pane';
import sidebar from './sidebar';

const options = { open: ['code', 'markdown', 'image'] } as const;
type Open = (typeof options.open)[number];
type Row = Parameters<typeof sidebar.render>[0]['rows'][number];
type Args = {
  open: Open;
  label: string;
  inputHtml: string;
  rows: Record<Open, readonly Row[]>;
  bodies: Record<Open, string>;
  narrow?: boolean;
  sidebarClosed?: boolean;
  finderOpen?: boolean;
};
const rules = `/* Pane bodies, metadata, actions and file-kind colour. */
tv-code .cv-empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}
tv-code .cv-empty-icon { display: inline-flex; color: var(--_text-muted); opacity: .7; }
tv-code .cv-empty-icon .cv-icon { width: 30px; height: 30px; }
tv-code .cv-empty-state strong { color: var(--_text); font-weight: 600; font-size: 14px; }
tv-code .cv-empty-hint { display: inline-flex; align-items: center; gap: 4px; }
tv-code .cv-empty-hint kbd {
  min-width: 20px;
  padding: 3px 5px;
  border: 1px solid var(--_border);
  border-radius: 4px;
  background: var(--_sidebar-background);
  color: var(--_text-muted);
  font: 11px/1 var(--_font);
}
tv-code .cv-pane-content > .cv-failure {
  box-sizing: border-box;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
tv-code .cv-pane-content > .cv-failure > span { color: var(--_text); font-size: 14px; }
tv-code .cv-pane-content > .cv-failure .cv-retry {
  width: auto;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--_border);
  background: var(--_sidebar-background);
}
tv-code .cv-pane-header { gap: 8px; }
tv-code .cv-pane-action { color: var(--_text-muted); }
tv-code .cv-pane-action:hover,
tv-code .cv-pane-action[aria-pressed="true"] { color: var(--_accent); }
tv-code .cv-view-toggle { display: inline-flex; align-items: center; border: 1px solid var(--_border); border-radius: 7px; padding: 1px; }
tv-code .cv-view-toggle .cv-pane-action { min-width: 24px; height: 23px; }
tv-code .cv-view-toggle .cv-pane-action[aria-pressed="true"] { background: var(--_selection); }
tv-code .cv-markdown-view {
  box-sizing: border-box;
  max-width: 808px;
  padding: 28px 24px 64px;
  margin: 0 auto;
  background: none;
  color: var(--_text);
}
tv-code .cv-markdown-view pre code .cv-t-keyword,
tv-code .cv-markdown-view pre code .cv-t-string,
tv-code .cv-markdown-view pre code .cv-t-number { font: inherit; }
tv-code .cv-media-image {
  box-sizing: border-box;
  height: 100%;
  min-height: 100%;
  padding: 24px;
  display: grid;
  place-items: center;
  background-color: var(--_background);
  background-image: conic-gradient(var(--_hover) 25%, var(--_background) 0 50%, var(--_hover) 0 75%, var(--_background) 0);
  background-size: 20px 20px;
}
tv-code .cv-media-image img { display: block; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; object-fit: contain; }
tv-code .cv-binary-body,
tv-code .cv-large-body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  color: var(--_text-muted);
}
tv-code .cv-binary-body strong,
tv-code .cv-large-body strong { color: var(--_text); font-weight: 600; }
tv-code .cv-large-action { width: auto; padding: 0 12px; border: 1px solid var(--_border); color: var(--_accent); }
tv-code .cv-row-icon[data-icon="fileText"],
tv-code .cv-finder-row [data-icon="fileText"] { color: var(--_syntax-link); }
tv-code .cv-row-icon[data-icon="fileImage"],
tv-code .cv-finder-row [data-icon="fileImage"] { color: var(--_syntax-keyword); }
tv-code .cv-row-icon[data-icon="fileData"],
tv-code .cv-finder-row [data-icon="fileData"] { color: var(--_syntax-number); }
tv-code .cv-row-icon[data-icon="fileConfig"],
tv-code .cv-finder-row [data-icon="fileConfig"] { color: var(--_syntax-type); }
tv-code .cv-row-icon[data-icon="fileLock"],
tv-code .cv-finder-row [data-icon="fileLock"] { color: var(--_syntax-comment); }
`;
const style = [...sidebar.style, ...pane.style, ...finder.style, rules];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function render({ open, label, inputHtml, rows, bodies, narrow = false, sidebarClosed, finderOpen = false }: Args): string {
  const path = open === 'code' ? 'src/main.ts' : open === 'markdown' ? 'README.md' : 'assets/cover.svg';
  const closed = sidebarClosed ?? narrow;
  const appClass = `cv-app${narrow ? ' cv-app-narrow' : ''}${closed ? ' cv-sidebar-closed' : ''}`;
  return `<tv-code label="${escapeHtml(label)}" selected="${path}">\n${inputHtml}\n<div class="${appClass}" style="--cv-sidebar-width: 260px;"><div class="cv-sidebar-backdrop"></div>${sidebar.render({ label, rows: rows[open], selected: path, closed })}${pane.render({ path, view: open, closed, bodyHtml: bodies[open] })}${finder.render({ open: finderOpen })}</div></tv-code>`;
}

export default { options, style, render } satisfies Template<Args>;
