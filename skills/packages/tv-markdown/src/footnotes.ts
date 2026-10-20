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

          return {
            type: 'footnoteReference',
            raw: match[0],
            definition,
            number: 0,
            occurrence: 0,
            adjacent: tokens.at(-1)?.type === 'footnoteReference',
          };
        },
        renderer(token): string {
          const reference = token as FootnoteReferenceToken;
          // Marked also tokenizes definitions that are never shown and image
          // alt text. Assign numbers only when a citation reaches the output.
          if (!reference.definition.references.length) cited.push(reference.definition);
          reference.number = cited.indexOf(reference.definition) + 1;
          reference.occurrence = reference.definition.references.push(reference);
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
          const contents: string[] = [];
          // Rendering a note may cite another note, including one already in
          // this list. Gather every reachable citation before adding links back.
          for (let index = 0; index < footnoteToken.definitions.length; index++) {
            contents.push(this.parser.parse(footnoteToken.definitions[index].tokens).trimEnd());
          }
          const items: string[] = [];
          for (let index = 0; index < footnoteToken.definitions.length; index++) {
            const definition = footnoteToken.definitions[index];
            const content = contents[index];
            const backlinks = definition.references.map((reference, referenceIndex) => {
              const suffix = referenceIndex === 0 ? '' : `<sup>${referenceIndex + 1}</sup>`;
              return `<a href="#${referenceId(prefix, reference)}">↩${suffix}</a>`;
            }).join(' ');
            const body = content.endsWith('</p>')
              ? `${content.slice(0, -4)} ${backlinks}</p>`
              : `${content}\n${backlinks}`;
            items.push(`<li id="${definitionId(prefix, definition)}">${body}</li>`);
          }
          return `<section><h2 id="${prefix}heading">Footnotes</h2><ol>\n${items.join('\n')}\n</ol></section>\n`;
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
  return `${prefix}note-${encodedLabel(definition.label)}`;
}

function referenceId(prefix: string, reference: FootnoteReferenceToken): string {
  return `${prefix}ref-${reference.occurrence}-${encodedLabel(reference.definition.label)}`;
}

/** Hex UTF-8 is unique for each label and cannot be decoded inside a fragment. */
function encodedLabel(label: string): string {
  return Array.from(new TextEncoder().encode(label), byte => byte.toString(16).padStart(2, '0')).join('');
}
