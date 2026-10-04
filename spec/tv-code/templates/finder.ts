/** File finder panel and option rows. */
import type { Template } from '../../types';
import { style as baseStyle } from './base';
import icons from './icons';

type Result = { path: string; icon?: Parameters<typeof icons.render>[0]['name']; dimmed?: boolean };
type Args = { open?: boolean; query?: string; results?: readonly Result[] };
const options = {} as const;
const rules = `/* Finder: quick-open panel above the file tree and code pane. */
tv-code .cv-finder {
  position: absolute;
  inset: 0;
  z-index: 20;
}

tv-code .cv-finder[hidden],
tv-code .cv-finder-progress[hidden] {
  display: none;
}

tv-code .cv-finder-backdrop {
  position: absolute;
  inset: 0;
}

tv-code .cv-finder-panel {
  position: absolute;
  top: 24px;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100% - 32px));
  max-height: calc(100% - 48px);
  box-sizing: border-box;
  transform: translateX(-50%);
  overflow: hidden;
  border: 1px solid var(--_border);
  border-radius: 10px;
  background: var(--_background);
  box-shadow: var(--_shadow);
}

tv-code .cv-finder-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  box-sizing: border-box;
  padding: 0 12px;
  border-bottom: 1px solid var(--_border);
  color: var(--_text-muted);
}

tv-code .cv-finder-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0;
  border: 0;
  outline: 0;
  background: var(--_background);
  color: var(--_text);
  font: inherit;
  font-size: 14px;
}

tv-code .cv-finder-input::placeholder {
  color: var(--_text-muted);
}

tv-code .cv-finder .cv-icon {
  flex: none;
  width: 16px;
  height: 16px;
}

tv-code .cv-finder-list {
  min-height: 0;
  max-height: min(50vh, 480px);
  overflow: auto;
  padding: 4px 0;
}

tv-code .cv-finder-list:empty { padding: 0; }

tv-code .cv-finder-row {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
}

tv-code .cv-finder-row[aria-selected="true"] {
  background: var(--_selection);
}

tv-code .cv-finder-row.cv-finder-dimmed {
  opacity: 0.6;
}

tv-code .cv-finder-empty {
  min-height: 32px;
  box-sizing: border-box;
  padding: 7px 12px;
  color: var(--_text-muted);
  font-size: 12px;
}

tv-code .cv-finder-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--_text);
  text-overflow: ellipsis;
}

tv-code .cv-finder-folder {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: var(--_text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
}

tv-code .cv-finder-match {
  color: var(--_accent);
  font-weight: 600;
}

tv-code .cv-finder-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  box-sizing: border-box;
  padding: 0 12px;
  border-top: 1px solid var(--_border);
  color: var(--_text-muted);
  font-size: 12px;
}

tv-code .cv-finder-spinner {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid var(--_border);
  border-top-color: var(--_accent);
  border-radius: 50%;
  animation: cv-finder-spin 700ms linear infinite;
}

@keyframes cv-finder-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  tv-code .cv-finder-spinner { animation: none; }
}

`;
const style = [...baseStyle, ...icons.style, rules];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function render({ open = false, query = '', results = [] }: Args): string {
  const rows = results.map((result, index) => {
    const slash = result.path.lastIndexOf('/');
    const name = result.path.slice(slash + 1);
    const folder = slash < 0 ? '' : result.path.slice(0, slash + 1);
    const icon = result.icon ?? 'file';
    return `<div class="cv-finder-row${result.dimmed ? ' cv-finder-dimmed' : ''}" id="cv-finder-list-1-row-${index}" role="option" aria-selected="${index === 0}">${icons.render({ name: icon }).replace('focusable="false">', `focusable="false" data-icon="${icon}">`)}<span class="cv-finder-name">${escapeHtml(name)}</span><span class="cv-finder-folder">${escapeHtml(folder)}</span></div>`;
  }).join('');
  return `<div class="cv-finder"${open ? '' : ' hidden=""'}><div class="cv-finder-backdrop" aria-hidden="true"></div><div class="cv-finder-panel"><div class="cv-finder-field">${icons.render({ name: 'search' })}<input class="cv-finder-input" type="text" role="combobox" placeholder="Go to file" aria-label="Go to file" aria-autocomplete="list" aria-expanded="${open}" aria-controls="cv-finder-list-1" autocomplete="off" spellcheck="false"${query ? ` value="${escapeHtml(query)}"` : ''}${rows ? ' aria-activedescendant="cv-finder-list-1-row-0"' : ''}></div><div class="cv-finder-list" id="cv-finder-list-1" role="listbox" aria-label="Files">${rows}</div><div class="cv-finder-empty" role="status"${rows || !open ? ' hidden=""' : ''}>No matching files</div><div class="cv-finder-progress" role="status" aria-live="polite" hidden=""><span class="cv-finder-spinner" aria-hidden="true"></span><span class="cv-finder-progress-text"></span></div></div></div>`;
}

export default { options, style, render } satisfies Template<Args>;
