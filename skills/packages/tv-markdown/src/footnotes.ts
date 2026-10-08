/** Add GFM-style footnotes to one Marked parser instance. */
import type { MarkedExtension, Token, Tokens } from 'marked';

const definitionPattern = /^ {0,3}\[\^([^\s\[\]]+)\]:[ \t]*([^\n]*)(?:\n|$)/;
const referencePattern = /^\[\^([^\s\[\]]+)\]/;
const definitionSearchPattern = /(?:^|\n) {0,3}\[\^[^\s\[\]]+\]:/;
const maximumLabelBytes = 1000;

interface FootnoteDefinition {
  label: string;
  tokens: Token[];
  references: FootnoteReferenceToken[];
}

interface FootnoteDefinitionToken extends Tokens.Generic {
  type: 'footnoteDefinition';
}

interface FootnoteReferenceToken extends Tokens.Generic {
  type: 'footnoteReference';
  definition: FootnoteDefinition;
  number: number;
  occurrence: number;
  adjacent: boolean;
}

interface FootnotesToken extends Tokens.Generic {
  type: 'footnotes';
  definitions: FootnoteDefinition[];
}

/** Return a stateful extension; create a fresh one for every Markdown render. */
export function footnotes(prefix: string): MarkedExtension {
  const definitions = new Map<string, FootnoteDefinition>();
  const cited: FootnoteDefinition[] = [];
  const collection: FootnotesToken = {
    type: 'footnotes', raw: '', definitions: cited,
  };
  let hasCollection = false;

  return {
    extensions: [
      {
        name: 'footnoteDefinition',
        level: 'block',
        start(source): number | undefined {
          const match = definitionSearchPattern.exec(source);
          if (!match) return undefined;
          return match.index + (match[0].startsWith('\n') ? 1 : 0);
        },
        tokenizer(source): FootnoteDefinitionToken | undefined {
          const match = definitionPattern.exec(source);
          if (!match || !validLabel(match[1])) return undefined;

          if (!hasCollection) {
            this.lexer.tokens.push(collection);
            hasCollection = true;
          }
          const label = match[1];
          const identifier = normalizeLabel(label);
          const body = definitionBody(source, match);
          if (!definitions.has(identifier)) {
            const definition: FootnoteDefinition = { label, tokens: [], references: [] };
            definitions.set(identifier, definition);
            definition.tokens = this.lexer.blockTokens(body.source, []);
          }
          return { type: 'footnoteDefinition', raw: body.raw };
        },
        renderer(): string { return ''; },
      },
      {
        name: 'footnoteReference',
        level: 'inline',
        start: source => source.indexOf('[^'),
        tokenizer(source, tokens): FootnoteReferenceToken | undefined {
          const match = referencePattern.exec(source);
          if (!match || !validLabel(match[1])) return undefined;
          const definition = definitions.get(normalizeLabel(match[1]));
          if (!definition) return undefined;

          if (!definition.references.length) cited.push(definition);
          const reference: FootnoteReferenceToken = {
            type: 'footnoteReference',
            raw: match[0],
            definition,
            number: cited.indexOf(definition) + 1,
            occurrence: definition.references.length + 1,
            adjacent: tokens.at(-1)?.type === 'footnoteReference',
          };
          definition.references.push(reference);
          return reference;
        },
        renderer(token): string {
          const reference = token as FootnoteReferenceToken;
          const separator = reference.adjacent ? ',' : '';
          return `<sup>${separator}<a id="${referenceId(prefix, reference)}" ` +
            `href="#${definitionId(prefix, reference.definition)}">${reference.number}</a></sup>`;
        },
      },
      {
        name: 'footnotes',
        renderer(token): string {
          const footnoteToken = token as FootnotesToken;
          if (!footnoteToken.definitions.length) return '';
          const items = footnoteToken.definitions.map(definition => {
            const content = this.parser.parse(definition.tokens).trimEnd();
            const backlinks = definition.references.map((reference, referenceIndex) => {
              const suffix = referenceIndex === 0 ? '' : `<sup>${referenceIndex + 1}</sup>`;
              return `<a href="#${referenceId(prefix, reference)}">↩${suffix}</a>`;
            }).join(' ');
            const body = content.endsWith('</p>')
              ? `${content.slice(0, -4)} ${backlinks}</p>`
              : `${content}\n${backlinks}`;
            return `<li id="${definitionId(prefix, definition)}">${body}</li>`;
          }).join('\n');
          return `<section><h2 id="${prefix}heading">Footnotes</h2><ol>\n${items}\n</ol></section>\n`;
        },
      },
    ],
    hooks: {
      processAllTokens(tokens) {
        const index = tokens.indexOf(collection);
        if (index >= 0) {
          tokens.splice(index, 1);
          tokens.push(collection);
        }
        return tokens;
      },
    },
  };
}

function definitionBody(source: string, match: RegExpExecArray): { raw: string; source: string } {
  let raw = match[0];
  const lines = [match[2]];
  let remaining = source.slice(raw.length);
  let blankLines: string[] = [];
  let blankRaw = '';

  while (remaining) {
    const next = /^([^\n]*)(?:\n|$)/.exec(remaining);
    if (!next || !next[0]) break;
    const [lineWithEnding, line] = next;
    if (!line.trim()) {
      blankLines.push('');
      blankRaw += lineWithEnding;
      remaining = remaining.slice(lineWithEnding.length);
      continue;
    }

    const indented = stripContainerIndent(line);
    if (blankLines.length && indented === null) break;
    if (indented === null && startsOuterBlock(line)) break;

    lines.push(...blankLines, indented ?? line);
    blankLines = [];
    raw += blankRaw + lineWithEnding;
    blankRaw = '';
    remaining = remaining.slice(lineWithEnding.length);
  }

  return { raw, source: `${lines.join('\n')}\n` };
}

function stripContainerIndent(line: string): string | null {
  if (line.startsWith('\t')) return line.slice(1);
  return line.startsWith('    ') ? line.slice(4) : null;
}

function startsOuterBlock(line: string): boolean {
  const definition = definitionPattern.exec(`${line}\n`);
  if (definition && validLabel(definition[1])) return true;
  return [
    /^ {0,3}#{1,6}(?:[ \t]+|$)/,
    /^ {0,3}(?:`{3,}|~{3,})/,
    /^ {0,3}>/,
    /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]+|$)/,
    /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/,
    /^ {0,3}<(?:!--|\?|!\[CDATA\[|!DOCTYPE\b|\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|pre|script|search|section|style|summary|table|tbody|td|textarea|tfoot|th|thead|title|tr|track|ul)(?:[ \t/>]|$))/i,
  ].some(pattern => pattern.test(line));
}

function validLabel(label: string): boolean {
  return isWellFormed(label) && new TextEncoder().encode(label).length <= maximumLabelBytes;
}

function isWellFormed(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizeLabel(label: string): string {
  return label.toLowerCase();
}

function definitionId(prefix: string, definition: FootnoteDefinition): string {
  return `${prefix}note-${encodeURIComponent(definition.label)}`;
}

function referenceId(prefix: string, reference: FootnoteReferenceToken): string {
  return `${prefix}ref-${reference.occurrence}-${encodeURIComponent(reference.definition.label)}`;
}
