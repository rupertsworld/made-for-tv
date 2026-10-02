/** Parse Markdown, sanitize its HTML, then add only the metadata we generate. */
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

const allowedTags = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 's', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input',
];

const viewerAttributes = new Set(['href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan']);
const checkboxAttributes = new Set(['type', 'checked', 'disabled']);

interface WikilinkToken extends Tokens.Generic {
  type: 'wikilink';
  target: string;
  label: string;
}

/** Remove blank surrounding lines and indentation common to all content lines. */
export function normalizeInlineMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  if (!lines.length) return '';

  const indents = lines.filter(line => line.trim()).map(line => /^[ \t]*/.exec(line)?.[0] ?? '');
  let commonIndent = indents[0];
  for (const indent of indents.slice(1)) {
    while (!indent.startsWith(commonIndent)) commonIndent = commonIndent.slice(0, -1);
  }
  return lines.map(line => line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line).join('\n');
}

/** Return safe rendered nodes, with heading ids and generated wikilink metadata. */
export function renderMarkdown(source: string): DocumentFragment {
  const wikilinks: string[] = [];
  // A fresh unpredictable prefix prevents authored HTML from posing as a generated wikilink.
  const nonce = [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16)).join('-');
  const prefix = `tv-wikilink-${nonce}-`;
  const parser = new Marked({
    gfm: true,
    async: false,
    // Marked encodes spaces in destinations. The element contract keeps the
    // authored attribute value, while DOMPurify still decides whether it is safe.
    renderer: {
      link(token): string {
        const title = token.title == null ? '' : ` title="${escapeHtml(token.title)}"`;
        return `<a href="${escapeHtml(token.href)}"${title}>${this.parser.parseInline(token.tokens)}</a>`;
      },
      image(token): string {
        const title = token.title == null ? '' : ` title="${escapeHtml(token.title)}"`;
        return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}"${title}>`;
      },
    },
    extensions: [{
      name: 'wikilink',
      level: 'inline',
      start: text => text.indexOf('[['),
      tokenizer(text): WikilinkToken | undefined {
        const match = /^\[\[([^\]\r\n]+)\]\]/.exec(text);
        if (!match) return undefined;
        const separator = match[1].indexOf('|');
        return {
          type: 'wikilink', raw: match[0],
          target: separator < 0 ? match[1] : match[1].slice(0, separator),
          label: separator < 0 ? match[1] : match[1].slice(separator + 1),
        };
      },
      renderer(token): string {
        const wikilink = token as WikilinkToken;
        const index = wikilinks.push(wikilink.target) - 1;
        return `<a href="#${prefix}${index}">${escapeHtml(wikilink.label)}</a>`;
      },
    }],
  });

  // Keep the allowlist from the docs viewer, extended only for task checkboxes.
  const html = parser.parse(source) as string;
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan',
      'id', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  // Keep the docs viewer's global attribute allowlist. The new attributes in
  // this skill are narrower: checkbox state belongs only on task inputs, and
  // generated heading ids and wikilink data are assigned below.
  for (const element of fragment.querySelectorAll('*')) {
    if (element.localName === 'input' &&
        (element.getAttribute('type') !== 'checkbox' || !element.closest('li'))) {
      element.remove();
      continue;
    }
    const allowed = element.localName === 'input' ? checkboxAttributes : viewerAttributes;
    for (const attribute of [...element.attributes]) {
      if (!allowed.has(attribute.name)) element.removeAttribute(attribute.name);
    }
    if (element.localName === 'input') element.setAttribute('disabled', '');
  }

  const usedIds = new Set<string>();
  for (const heading of fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const base = (heading.textContent ?? '').toLowerCase()
      .replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');
    let id = base;
    let duplicate = 0;
    while (usedIds.has(id)) id = `${base}-${++duplicate}`;
    usedIds.add(id);
    heading.id = id;
  }

  wikilinks.forEach((target, index) => {
    const placeholder = fragment.querySelector<HTMLAnchorElement>(`a[href="#${prefix}${index}"]`);
    if (!placeholder) return;
    placeholder.removeAttribute('href');
    placeholder.setAttribute('data-wikilink', target);
    placeholder.setAttribute('tabindex', '0');
    placeholder.setAttribute('role', 'link');
  });
  return fragment;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}
