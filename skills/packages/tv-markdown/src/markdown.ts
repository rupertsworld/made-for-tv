/** Parse Markdown, sanitize its HTML, then add only the metadata we generate. */
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';
import { footnotes } from './footnotes';

const allowedTags = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 's', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code',
  'a', 'sup', 'section', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input',
];

const viewerAttributes = new Set(['href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan']);
const checkboxAttributes = new Set(['type', 'checked', 'disabled']);
const urlAttributes = new Set(['href', 'src']);
const dangerousSchemes = new Set(['javascript', 'vbscript', 'data']);
const footnoteIdTags = new Set(['a', 'h2', 'li']);

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

/** Return safe rendered nodes with generated heading, footnote, and wikilink metadata. */
export function renderMarkdown(source: string): DocumentFragment {
  const wikilinks: string[] = [];
  // A fresh unpredictable prefix prevents authored HTML from posing as generated markup.
  const nonce = [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16)).join('-');
  const wikilinkPrefix = `tv-wikilink-${nonce}-`;
  const footnotePrefix = `tv-footnote-${nonce}-`;
  const parser = new Marked({
    gfm: true,
    async: false,
    // Marked encodes spaces in destinations. The element contract keeps the
    // authored attribute value, while DOMPurify still decides whether it is safe.
    renderer: {
      link(token): string {
        const title = token.title == null ? '' : ` title="${escapeHtml(token.title)}"`;
        const open = `<a href="${escapeHtml(token.href)}"${title}>`;
        return linkAroundCitations(this.parser.parseInline(token.tokens), open, footnotePrefix);
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
        return `<a href="#${wikilinkPrefix}${index}">${escapeHtml(wikilink.label)}</a>`;
      },
    }],
  });
  parser.use(footnotes(footnotePrefix));

  // Keep the docs viewer's tag allowlist, extended for footnotes and task checkboxes.
  const html = parser.parse(source) as string;
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan',
      'id', 'type', 'checked', 'disabled'],
    // Apply the exact scheme policy below to every URL attribute that survives
    // the element's allowlist. DOMPurify's broader default also rejects benign
    // custom schemes and permits data: on some elements.
    ALLOWED_URI_REGEXP: /^[\s\S]*$/,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  // Keep the docs viewer's global attribute allowlist. The new attributes in
  // this skill are narrower: checkbox state belongs only on task inputs, and
  // generated metadata is assigned below.
  for (const element of fragment.querySelectorAll('*')) {
    if (element.localName === 'input' &&
        (element.getAttribute('type') !== 'checkbox' || !element.closest('li'))) {
      element.remove();
      continue;
    }
    const allowed = element.localName === 'input' ? checkboxAttributes : viewerAttributes;
    for (const attribute of [...element.attributes]) {
      if (urlAttributes.has(attribute.name) && hasDangerousScheme(attribute.value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      const generatedFootnoteId = attribute.name === 'id' &&
        attribute.value.startsWith(footnotePrefix) &&
        footnoteIdTags.has(element.localName);
      if (!allowed.has(attribute.name) && !generatedFootnoteId) element.removeAttribute(attribute.name);
    }
    if (element.localName === 'input') element.setAttribute('disabled', '');
  }

  const footnoteLabel = fragment.querySelector<HTMLHeadingElement>(
    `section > h2#${footnotePrefix}heading`,
  );
  const footnoteSection = footnoteLabel?.parentElement;
  if (footnoteLabel && footnoteSection) {
    footnoteSection.setAttribute('data-footnotes', '');
    for (const reference of fragment.querySelectorAll<HTMLAnchorElement>(
      `sup > a[id^="${footnotePrefix}ref-"]`,
    )) {
      reference.setAttribute('data-footnote-ref', '');
      reference.setAttribute('aria-describedby', footnoteLabel.id);
    }
    for (const [footnoteIndex, item] of
      [...footnoteSection.querySelectorAll<HTMLLIElement>(':scope > ol > li')].entries()) {
      const backlinks = item.querySelectorAll<HTMLAnchorElement>(
        `a[href^="#${footnotePrefix}ref-"]`,
      );
      backlinks.forEach((backlink, referenceIndex) => {
        backlink.setAttribute('data-footnote-backref', '');
        const occurrence = referenceIndex === 0 ? '' : ` (${referenceIndex + 1})`;
        backlink.setAttribute('aria-label', `Back to citation ${footnoteIndex + 1}${occurrence}`);
      });
    }
  }

  const usedIds = new Set([...fragment.querySelectorAll<HTMLElement>('[id]')].map(element => element.id));
  for (const heading of fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.id.startsWith(footnotePrefix)) continue;
    const base = (heading.textContent ?? '').toLowerCase()
      .replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');
    let id = base;
    let duplicate = 0;
    while (usedIds.has(id)) id = `${base}-${++duplicate}`;
    usedIds.add(id);
    heading.id = id;
  }

  wikilinks.forEach((target, index) => {
    const placeholder = fragment.querySelector<HTMLAnchorElement>(`a[href="#${wikilinkPrefix}${index}"]`);
    if (!placeholder) return;
    placeholder.removeAttribute('href');
    placeholder.setAttribute('data-wikilink', target);
    placeholder.setAttribute('tabindex', '0');
    placeholder.setAttribute('role', 'link');
  });
  return fragment;
}

/** Split a Markdown link around generated citation links, including those inside emphasis. */
function linkAroundCitations(content: string, open: string, prefix: string): string {
  if (!content.includes(`${prefix}ref-`)) return `${open}${content}</a>`;
  const template = document.createElement('template');
  template.innerHTML = content;
  const citations = [...template.content.querySelectorAll<HTMLAnchorElement>(`sup > a[id^="${prefix}ref-"]`)]
    .map(anchor => anchor.parentElement!);
  if (!citations.length) return `${open}${content}</a>`;
  const range = document.createRange();
  range.setStart(template.content, 0);
  const linked = (fragment: DocumentFragment): string => {
    if (!fragment.textContent && !fragment.querySelector('img, br, hr, input, svg')) return '';
    const holder = document.createElement('div');
    holder.append(fragment);
    return holder.innerHTML ? `${open}${holder.innerHTML}</a>` : '';
  };
  let output = '';
  for (const citation of citations) {
    range.setEndBefore(citation);
    output += linked(range.cloneContents()) + citation.outerHTML;
    range.setStartAfter(citation);
  }
  range.setEnd(template.content, template.content.childNodes.length);
  return output + linked(range.cloneContents());
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function hasDangerousScheme(address: string): boolean {
  let normalized = address;
  while (true) {
    const decoded = decodeSchemeEscapes(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }
  normalized = normalized.replace(/[\u0000-\u0020\u007f-\u009f\s]/gu, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1].toLowerCase();
  return scheme !== undefined && dangerousSchemes.has(scheme);
}

function decodeSchemeEscapes(value: string): string {
  return value
    .replace(/&#(?:x([\da-f]+)|(\d+));?/gi, (_entity, hexadecimal, decimal) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal, hexadecimal ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return '\uFFFD';
      return String.fromCodePoint(codePoint || 0xfffd);
    })
    .replace(/&(amp|colon|tab|newline|percnt);/gi, entity => ({
      '&amp;': '&', '&colon;': ':', '&tab;': '\t', '&newline;': '\n', '&percnt;': '%',
    })[entity.toLowerCase()] ?? entity)
    .replace(/%([\da-f]{2})/gi, (_escape, byte) => String.fromCharCode(Number.parseInt(byte, 16)));
}
