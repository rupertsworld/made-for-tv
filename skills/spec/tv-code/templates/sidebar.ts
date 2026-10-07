/** Sidebar and file-tree rows specified independently of the viewer. */
import type { Template } from '../../types';
import { style as baseStyle } from './base';
import icons from './icons';

type Row = {
  path: string;
  name: string;
  kind: 'folder' | 'file';
  level: number;
  expanded?: boolean;
  dimmed?: boolean;
  icon?: Parameters<typeof icons.render>[0]['name'];
};

type Args = { label: string; rows: readonly Row[]; selected: string; closed?: boolean };
const options = {} as const;
const rules = `/* Layout, sidebar, tree and pane. */
tv-code .cv-app {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
tv-code .cv-sidebar {
  position: relative;
  z-index: 2;
  flex: 0 0 var(--cv-sidebar-width, 260px);
  width: var(--cv-sidebar-width, 260px);
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--_sidebar-background);
  border-right: 1px solid var(--_border);
  transition: flex-basis 200ms ease, width 200ms ease;
}
tv-code .cv-sidebar-closed .cv-sidebar {
  flex-basis: 0;
  width: 0;
  border-right: 0;
  overflow: hidden;
}
tv-code .cv-app-dragging .cv-sidebar { transition: none; }
tv-code .cv-sidebar-backdrop { display: none; }
tv-code .cv-app-narrow .cv-sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--cv-sidebar-width, 260px);
  box-shadow: var(--_shadow);
}
tv-code .cv-app-narrow.cv-sidebar-closed .cv-sidebar { width: 0; box-shadow: none; }
tv-code .cv-app-narrow:not(.cv-sidebar-closed) .cv-sidebar-backdrop {
  display: block;
  position: absolute;
  z-index: 1;
  inset: 0;
  background: var(--_text);
  opacity: .2;
}
tv-code .cv-sidebar-header,
tv-code .cv-pane-header {
  box-sizing: border-box;
  height: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-bottom: 1px solid var(--_border);
}
tv-code .cv-sidebar-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
}
tv-code .cv-button {
  appearance: none;
  background: none;
  border: 0;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  line-height: 1;
  padding: 0;
  margin: 0;
  min-width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}
tv-code .cv-button:hover { background: var(--_hover); }
tv-code .cv-button:focus-visible,
tv-code .cv-row:focus-visible,
tv-code .cv-resize-handle:focus-visible { outline: var(--_focus); outline-offset: -2px; }
tv-code .cv-icon { flex: none; width: 16px; height: 16px; }
tv-code .cv-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px 12px;
  scrollbar-gutter: stable;
}
tv-code .cv-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 26px;
  border-radius: 6px;
  padding-right: 4px;
  color: var(--_text);
  cursor: pointer;
  white-space: nowrap;
}
tv-code .cv-row:hover { background: var(--_hover); }
tv-code .cv-row-selected,
tv-code .cv-row-selected:hover { background: var(--_selection); }
tv-code .cv-row-dimmed { opacity: .5; }
tv-code .cv-row-guides {
  flex: 0 0 calc(var(--cv-depth) * 12px);
  height: 100%;
  background: repeating-linear-gradient(to right, var(--_sidebar-background) 0 11px, var(--_border) 11px 12px);
}
tv-code .cv-caret { display: flex; flex: 0 0 12px; align-items: center; justify-content: center; }
tv-code .cv-caret .cv-icon { width: 12px; height: 12px; }
tv-code .cv-caret-open .cv-icon { transform: rotate(90deg); }
tv-code .cv-caret-spinning .cv-icon { animation: cv-spin 900ms linear infinite; }
tv-code .cv-row-icon { display: flex; flex: 0 0 16px; color: var(--_text-muted); }
tv-code .cv-row-name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
tv-code .cv-tree-empty,
tv-code .cv-tree-failure { padding: 8px; color: var(--_text-muted); }
tv-code .cv-tree-failure { padding-left: calc(8px + var(--cv-depth) * 12px); display: flex; gap: 6px; align-items: center; }
tv-code .cv-retry { padding: 0 6px; color: var(--_accent); }
tv-code .cv-tree-placeholder { height: 18px; margin: 8px 12px; width: 60%; border-radius: 4px; background: var(--_hover); }
tv-code .cv-tree-placeholder:nth-child(even) { width: 75%; }
tv-code .cv-resize-handle {
  position: absolute;
  z-index: 4;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}
tv-code .cv-resize-handle::after {
  content: "";
  display: block;
  height: 100%;
  width: 2px;
  margin: auto;
  /* The sidebar border is the resting divider; the handle shows only while
     hovered or dragged, so the edge matches the header divider. */
  background: transparent;
}
tv-code .cv-resize-handle:hover::after,
tv-code .cv-app-dragging .cv-resize-handle::after { background: var(--_accent); }
`;
const style = [...baseStyle, ...icons.style, rules];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderRow(row: Row, selected: string, tabPath: string): string {
  const folder = row.kind === 'folder';
  const icon = row.icon ?? (folder ? row.expanded ? 'folderOpen' : 'folder' : 'file');
  const path = escapeHtml(row.path);
  return `<div class="cv-row${folder ? ' cv-row-folder' : row.path === selected ? ' cv-row-selected' : ''}${row.dimmed ? ' cv-row-dimmed' : ''}" role="treeitem" tabindex="${row.path === tabPath ? 0 : -1}" data-path="${path}" data-level="${row.level}" title="${path}" aria-level="${row.level}" ${folder ? `aria-expanded="${!!row.expanded}"` : `aria-selected="${row.path === selected}"`} style="--cv-depth: ${row.level - 1};"><span class="cv-row-guides" aria-hidden="true"></span><span class="cv-caret${folder && row.expanded ? ' cv-caret-open' : ''}">${folder ? icons.render({ name: 'caret' }) : ''}</span><span class="cv-row-icon" data-icon="${icon}">${icons.render({ name: icon })}</span><span class="cv-row-name">${escapeHtml(row.name)}</span></div>`;
}

function render({ label, rows, selected, closed = false }: Args): string {
  const tabPath = rows.some(row => row.path === selected) ? selected : rows[0]?.path ?? '';
  return `<aside class="cv-sidebar"${closed ? ' inert="" aria-hidden="true"' : ''}><header class="cv-sidebar-header"><span class="cv-sidebar-label">${escapeHtml(label)}</span><button class="cv-button cv-close-sidebar" type="button" title="Close sidebar" aria-label="Close sidebar">${icons.render({ name: 'sidebar' })}</button></header><div class="cv-tree" role="tree" aria-label="${escapeHtml(label)}" tabindex="${rows.length ? -1 : 0}">${rows.map(row => renderRow(row, selected, tabPath)).join('')}</div><div class="cv-resize-handle" role="separator" tabindex="0" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin="160" aria-valuemax="480" aria-valuenow="260"></div></aside>`;
}

export default { options, style, render } satisfies Template<Args>;
