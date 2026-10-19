/** Path and actions at the top of the file pane. */
import type { Template } from '../../types';
import { style as baseStyle } from './base';
import icons from './icons';

/** `diff` is set for a changed file: the view mode shown, and the line counts when known. */
type Diff = { mode: 'preview' | 'source' | 'diff'; additions?: number; deletions?: number };
type Args = { path: string; view: 'code' | 'markdown' | 'image'; closed?: boolean; diff?: Diff };
const options = {} as const;
const rules = `tv-code .cv-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--_background);
  position: relative;
}
tv-code .cv-pane-header {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--_border);
  background: var(--_background);
}
tv-code .cv-open-sidebar { display: none; flex: 0 0 26px; }
tv-code .cv-sidebar-closed .cv-open-sidebar { display: inline-flex; }
tv-code .cv-pane-path { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; }
tv-code .cv-crumb { display: inline; color: var(--_text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: auto; height: 26px; padding: 0 3px; }
tv-code .cv-path-separator { color: var(--_text-muted); opacity: .6; }
tv-code .cv-path-file { overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
tv-code .cv-deleted { color: var(--_text-muted); border: 1px solid var(--_border); border-radius: 4px; padding: 2px 5px; }
tv-code .cv-pane-actions { display: flex; align-items: center; gap: 2px; flex: none; color: var(--_text-muted); }
tv-code .cv-pane-progress { height: 2px; flex: none; display: none; overflow: hidden; background: var(--_hover); }
tv-code .cv-pane-progress-active { display: block; }
tv-code .cv-pane-progress-active::before { content: ""; display: block; width: 35%; height: 100%; background: var(--_accent); animation: cv-progress 1.4s ease-in-out infinite; }
tv-code .cv-pane-notice:empty { display: none; }
tv-code .cv-pane-notice { padding: 8px 12px; border-bottom: 1px solid var(--_border); }
tv-code .cv-pane-content { flex: 1; min-height: 0; overflow: auto; }
/* A changed file's diff fills the content area; its counts follow the file name. */
tv-code .cv-pane-diff { display: flex; height: 100%; }
tv-code .cv-pane-diff > * { flex: 1; min-width: 0; border: 0; }
/* A diff still loading sits unseen over the content it will replace. */
tv-code .cv-pane-content:has(> .cv-pane-diff-pending) { position: relative; }
tv-code .cv-pane-diff-pending { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
tv-code .cv-diff-counts { display: inline-flex; gap: 6px; margin-left: 4px; font-family: var(--_font-mono); font-size: var(--_code-size); }
tv-code .cv-diff-additions { color: var(--_added); }
tv-code .cv-diff-deletions { color: var(--_removed); }
tv-code .cv-pane-faded { opacity: .65; }
tv-code .cv-pane-empty { display: grid; place-items: center; height: 100%; color: var(--_text-muted); }
tv-code .cv-failure { display: flex; align-items: center; gap: 8px; color: var(--_text-muted); padding: 12px; }
@keyframes cv-spin { to { transform: rotate(360deg); } }
@keyframes cv-progress { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
@media (prefers-reduced-motion: reduce) {
  tv-code .cv-sidebar,
  tv-code .cv-caret-spinning .cv-icon,
  tv-code .cv-pane-progress-active::before { animation: none; transition: none; }
}

`;
const style = [...baseStyle, ...icons.style, rules];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function action(name: 'Wrap lines' | 'Preview' | 'Source' | 'Diff', icon: 'wrap' | 'preview' | 'source' | 'diff', pressed: boolean): string {
  return `<button class="cv-button cv-pane-action" type="button" title="${name}" aria-label="${name}" aria-pressed="${pressed}">${icons.render({ name: icon })}</button>`;
}

/** Preview, Source and Diff for a changed Markdown or SVG file; Source and Diff for code. */
function diffActions(view: Args['view'], { mode }: Diff): string {
  const views = view === 'code' ? (['source', 'diff'] as const) : (['preview', 'source', 'diff'] as const);
  const names = { preview: 'Preview', source: 'Source', diff: 'Diff' } as const;
  const toggle = views.map(name => action(names[name], name, mode === name)).join('');
  const wrap = mode !== 'diff' && (view === 'code' || mode === 'source') ? action('Wrap lines', 'wrap', false) : '';
  return `<div class="cv-view-toggle" role="group" aria-label="View mode">${toggle}</div>${wrap}`;
}

function render({ path, view, closed = false, diff }: Args): string {
  const segments = path.split('/');
  const crumbs = segments.slice(0, -1).map(name => `<button class="cv-crumb cv-button" type="button">${escapeHtml(name)}</button>`);
  crumbs.push(`<strong class="cv-path-file">${escapeHtml(segments.at(-1) ?? '')}</strong>`);
  const counts = diff?.additions !== undefined && diff.deletions !== undefined
    ? `<span class="cv-diff-counts"><span class="cv-diff-additions">+${diff.additions}</span><span class="cv-diff-deletions">\u2212${diff.deletions}</span></span>` : '';
  const actions = diff ? diffActions(view, diff) : view === 'code'
    ? action('Wrap lines', 'wrap', false)
    : `<div class="cv-view-toggle" role="group" aria-label="View mode">${action('Preview', 'preview', true)}${action('Source', 'source', false)}</div>`;
  return `<header class="cv-pane-header"><button class="cv-button cv-open-sidebar" type="button" aria-label="Open sidebar" title="Open sidebar"${closed ? ' tabindex="0" aria-hidden="false"' : ''}>${icons.render({ name: 'sidebar' })}</button><div class="cv-pane-path">${crumbs.join('<span class="cv-path-separator">/</span>')}${counts}</div><div class="cv-pane-actions">${actions}</div><button class="cv-button cv-pane-action cv-find" type="button" title="Find file" aria-label="Find file">${icons.render({ name: 'search' })}</button></header>`;
}

export default { options, style, render } satisfies Template<Args>;
