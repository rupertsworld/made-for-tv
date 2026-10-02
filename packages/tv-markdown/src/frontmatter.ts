/** Split leading YAML from Markdown and build the optional properties panel. */
import { isAlias, isMap, isNode, isScalar, isSeq, parseDocument, type Document, type Node } from 'yaml';

interface ParsedFrontmatter {
  markdown: string;
  data: Record<string, unknown> | null;
  raw: string | null;
  document: Document | null;
}

/** Parse a first-line YAML block while preserving the rest as Markdown. */
export function parseFrontmatter(source: string): ParsedFrontmatter {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') return { markdown: source, data: null, raw: null, document: null };

  const closing = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
  if (closing < 0) return { markdown: source, data: null, raw: null, document: null };

  const raw = lines.slice(1, closing).join('\n');
  const markdown = lines.slice(closing + 1).join('\n');
  const document = parseDocument(raw);
  if (document.errors.length || !isMap(document.contents)) {
    return { markdown, data: null, raw, document: null };
  }

  try {
    const data = document.toJS() as Record<string, unknown>;
    return { markdown, data, raw, document };
  } catch {
    return { markdown, data: null, raw, document: null };
  }
}

/** Construct the panel from parsed YAML nodes, never from HTML markup. */
export function createFrontmatterPanel(frontmatter: ParsedFrontmatter): HTMLDListElement | null {
  if (frontmatter.raw === null) return null;
  const panel = document.createElement('dl');
  panel.setAttribute('data-frontmatter', '');
  panel.setAttribute('aria-label', 'Properties');

  if (!frontmatter.document || !isMap(frontmatter.document.contents)) {
    const row = appendRow(panel, 'frontmatter');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = frontmatter.raw;
    pre.append(code);
    row.append(pre);
    return panel;
  }

  for (const pair of frontmatter.document.contents.items) {
    const value = parsedNode(pair.value);
    const row = appendRow(panel, keyText(pair.key));
    appendValue(row, value, frontmatter.document, new Set());
  }
  return panel;
}

function appendRow(panel: HTMLDListElement, key: string): HTMLElement {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = key;
  wrapper.append(term, description);
  panel.append(wrapper);
  return description;
}

function appendValue(container: HTMLElement, value: Node | null | undefined, yaml: Document,
    visited: Set<Node>): void {
  if (value && isAlias(value)) {
    const resolved = value.resolve(yaml);
    if (!resolved || visited.has(resolved)) { appendEmpty(container); return; }
    visited.add(resolved);
    appendValue(container, resolved, yaml, visited);
    visited.delete(resolved);
    return;
  }
  if (value && isSeq(value)) {
    if (!value.items.length) { appendEmpty(container); return; }
    const list = document.createElement('ul');
    for (const item of value.items) {
      const tag = document.createElement('li');
      appendValue(tag, parsedNode(item), yaml, visited);
      list.append(tag);
    }
    container.append(list);
    return;
  }
  if (value && isMap(value)) {
    if (!value.items.length) { appendEmpty(container); return; }
    const code = document.createElement('code');
    code.textContent = value.items.map(pair =>
      `${keyText(pair.key)}: ${summarizeValue(parsedNode(pair.value), yaml, visited)}`).join(', ');
    container.append(code);
    return;
  }
  if (!value || !isScalar(value) || value.value === null || value.value === '') {
    appendEmpty(container);
    return;
  }
  if (typeof value.value === 'boolean') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = true;
    if (value.value) checkbox.setAttribute('checked', '');
    container.append(checkbox);
    return;
  }
  const text = scalarText(value);
  if (typeof value.value === 'string') {
    const wikilink = /^\[\[([^\]\r\n]+)\]\]$/.exec(text);
    if (wikilink) {
      const separator = wikilink[1].indexOf('|');
      const target = separator < 0 ? wikilink[1] : wikilink[1].slice(0, separator);
      const label = separator < 0 ? target : wikilink[1].slice(separator + 1);
      const anchor = document.createElement('a');
      anchor.textContent = label;
      anchor.setAttribute('data-wikilink', target);
      anchor.setAttribute('tabindex', '0');
      anchor.setAttribute('role', 'link');
      container.append(anchor);
      return;
    }
    if (text.startsWith('http://') || text.startsWith('https://')) {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', text);
      anchor.textContent = text;
      container.append(anchor);
      return;
    }
  }
  container.textContent = text;
}

function scalarText(value: Node & { value: unknown; source?: string }): string {
  if (typeof value.value === 'number' || value.value instanceof Date) {
    return value.source ?? String(value.value);
  }
  return String(value.value);
}

function summarizeValue(value: Node | null | undefined, yaml: Document, visited: Set<Node>): string {
  if (value && isAlias(value)) {
    const resolved = value.resolve(yaml);
    if (!resolved || visited.has(resolved)) return '—';
    visited.add(resolved);
    const summary = summarizeValue(resolved, yaml, visited);
    visited.delete(resolved);
    return summary;
  }
  if (value && isMap(value)) {
    if (!value.items.length) return '—';
    return value.items.map(pair =>
      `${keyText(pair.key)}: ${summarizeValue(parsedNode(pair.value), yaml, visited)}`).join(', ');
  }
  if (value && isSeq(value)) return value.items.map(item => summarizeValue(parsedNode(item), yaml, visited)).join(', ');
  if (!value || !isScalar(value) || value.value === null || value.value === '') return '—';
  return scalarText(value);
}

function appendEmpty(container: HTMLElement): void {
  container.setAttribute('data-empty', '');
  container.textContent = '—';
}

function parsedNode(value: unknown): Node | null {
  return isNode(value) ? value : null;
}

function keyText(key: unknown): string {
  return isScalar(key) ? String(key.value) : String(key);
}
