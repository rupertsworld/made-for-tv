/** Contract tests for the Markdown the public element renders in light DOM. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/tv-markdown';

function render(markdown: string): HTMLElement {
  const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
  document.body.append(element);
  element.markdown = markdown;
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('inline Markdown', () => {
  it('ignores text directly inside the element when there is no Markdown script', () => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
    element.textContent = '# Not Markdown';
    document.body.append(element);

    expect(element.markdown).toBe('');
    expect(element.querySelector('h1')).toBeNull();
  });

  it('removes surrounding blank lines and only the indentation shared by nonblank lines', () => {
    const element = document.createElement('tv-markdown');
    const script = document.createElement('script');
    script.type = 'text/markdown';
    script.textContent = '\n\n      # Title\n\n          A paragraph with four extra spaces.\n      Another line.\n\n';
    element.append(script);
    document.body.append(element);

    expect(element.querySelector('h1')?.textContent).toBe('Title');
    expect(element.querySelector('pre code')?.textContent).toContain('A paragraph with four extra spaces.');
    expect(element.querySelector('p')?.textContent).toBe('Another line.');
    expect(element.querySelector('script')).toBeNull();
  });
});

describe('frontmatter', () => {
  it('separates first-line YAML with either closing fence and hides it by default', () => {
    const element = render('---\r\ntitle: Reading notes\r\ncount: 4\r\nupdated: 2026-09-24\r\n...\r\n# Content');
    expect((element as HTMLElement & { frontmatter: unknown }).frontmatter).toEqual({
      title: 'Reading notes', count: 4, updated: '2026-09-24',
    });
    expect(element.querySelector('[data-frontmatter]')).toBeNull();
    expect(element.querySelector('h1')?.textContent).toBe('Content');
    expect(element.textContent).not.toContain('title: Reading notes');

    const notFirstLine = render('Before\n---\ntitle: A title\n---');
    expect((notFirstLine as HTMLElement & { frontmatter: unknown }).frontmatter).toBeNull();
    expect(notFirstLine.textContent).toContain('title: A title');

    const unclosed = render('---\ntitle: A title\n# Content');
    expect((unclosed as HTMLElement & { frontmatter: unknown }).frontmatter).toBeNull();
    expect(unclosed.textContent).toContain('title: A title');
  });

  it('renders typed values in a properties panel without interpreting authored HTML', () => {
    const element = render(`---
"<img src=x onerror=alert(1)>": "<b>literal</b>"
source: https://example.org/article
related: "[[topics/goal-pressure|Goal pressure]]"
tags: [agents, "[[jane]]"]
count: 1.50
updated: 2026-09-24
reviewed: true
rejected: false
owner: null
blank: ""
details: {pages: 12, format: pdf}
---
# Content`);
    element.setAttribute('show-frontmatter', '');
    const rows = [...element.querySelectorAll('dl[data-frontmatter] > div')];
    expect(rows.map(row => row.querySelector('dt')?.textContent)).toEqual([
      '<img src=x onerror=alert(1)>', 'source', 'related', 'tags', 'count',
      'updated', 'reviewed', 'rejected', 'owner', 'blank', 'details',
    ]);
    expect(element.querySelector('dl[data-frontmatter]')?.getAttribute('aria-label')).toBe('Properties');
    expect(element.querySelector('dl img, dl b')).toBeNull();
    expect(rows[0].querySelector('dd')?.textContent).toBe('<b>literal</b>');
    expect(rows[1].querySelector('dd a')?.getAttribute('href')).toBe('https://example.org/article');
    expect(rows[2].querySelector('dd a')?.getAttribute('data-wikilink')).toBe('topics/goal-pressure');
    expect(rows[2].querySelector('dd a')?.textContent).toBe('Goal pressure');
    expect([...rows[3].querySelectorAll('li')].map(item => item.textContent)).toEqual(['agents', 'jane']);
    expect(rows[3].querySelector('li a')?.getAttribute('data-wikilink')).toBe('jane');
    expect(rows[4].querySelector('dd')?.textContent).toBe('1.50');
    expect(rows[5].querySelector('dd')?.textContent).toBe('2026-09-24');
    expect([...element.querySelectorAll('dl input')].map(input => [
      (input as HTMLInputElement).checked, (input as HTMLInputElement).disabled,
    ])).toEqual([[true, true], [false, true]]);
    expect(rows[8].querySelector('dd')?.hasAttribute('data-empty')).toBe(true);
    expect(rows[8].querySelector('dd')?.textContent).toBe('—');
    expect(rows[9].querySelector('dd')?.hasAttribute('data-empty')).toBe(true);
    expect(rows[10].querySelector('code')?.textContent).toBe('pages: 12, format: pdf');
    expect(element.querySelector('h1')?.textContent).toBe('Content');
  });

  it('shows invalid YAML as raw code only when requested, and resets the property on later renders', () => {
    const element = render('---\ntags: [one, <script>alert(1)</script>\n---\n# Content');
    expect((element as HTMLElement & { frontmatter: unknown }).frontmatter).toBeNull();
    expect(element.querySelector('[data-frontmatter]')).toBeNull();
    element.setAttribute('show-frontmatter', '');
    expect(element.querySelector('dl[data-frontmatter] pre code')?.textContent)
      .toBe('tags: [one, <script>alert(1)</script>');
    expect(element.querySelector('script')).toBeNull();
    (element as HTMLElement & { markdown: string }).markdown = '# Replacement';
    expect((element as HTMLElement & { frontmatter: unknown }).frontmatter).toBeNull();
    expect(element.querySelector('[data-frontmatter]')).toBeNull();
  });
});

describe('heading ids', () => {
  it('uses GitHub-style slugs and numbers repeated ids in document order', () => {
    const element = render('# Hello, World!\n\n## Hello *World*!\n\n### Hello, World!\n\n## A + B & C?');
    expect([...element.querySelectorAll('h1, h2, h3')].map(heading => heading.id)).toEqual([
      'hello-world', 'hello-world-1', 'hello-world-2', 'a--b--c',
    ]);
  });
});

describe('footnotes', () => {
  it('numbers only rendered citations when an unused definition cites another note', () => {
    const element = render(`Visible.[^shown]

[^unused]: Hidden citation.[^other]
[^other]: Other note.
[^shown]: Shown note.`);
    const markers = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')];
    expect(markers.map(marker => marker.textContent)).toEqual(['1']);
    expect([...element.querySelectorAll('section[data-footnotes] > ol > li')]).toHaveLength(1);
    expect(element.querySelector('section[data-footnotes]')?.textContent).toContain('Shown note.');
    expect(element.querySelector('section[data-footnotes]')?.textContent).not.toContain('Other note.');
    const backlinks = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-backref]')];
    expect(backlinks.map(link => link.getAttribute('href'))).toEqual([`#${markers[0].id}`]);
  });

  it('does not number a reference used only as image alt text', () => {
    const element = render(`![Hidden [^other]](cover.png) Visible.[^shown]

[^other]: Other note.
[^shown]: Shown note.`);
    const markers = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')];
    expect(markers.map(marker => marker.textContent)).toEqual(['1']);
    expect(element.querySelector('img')?.getAttribute('alt')).toContain('[^other]');
    expect([...element.querySelectorAll('section[data-footnotes] > ol > li')]).toHaveLength(1);
    expect(element.querySelector('section[data-footnotes]')?.textContent).not.toContain('Other note.');
    expect(element.querySelector('a[data-footnote-backref]')?.getAttribute('href')).toBe(`#${markers[0].id}`);
  });

  it('numbers citations in first-use order and links every repeated citation both ways', () => {
    const element = render(`# Footnote shared

First claim.[^shared] Another source.[^other] Repeated claim.[^shared]

[^other]: The other definition.
[^shared]: **Shared evidence** from [the source](https://example.org/source).
[^unused]: This definition is never cited.`);
    const markers = [...element.querySelectorAll<HTMLAnchorElement>('sup > a[data-footnote-ref]')];
    expect(markers.map(marker => marker.textContent)).toEqual(['1', '2', '1']);
    expect(markers.map(marker => marker.getAttribute('href'))).toEqual([
      markers[0].getAttribute('href'), markers[1].getAttribute('href'), markers[0].getAttribute('href'),
    ]);
    expect(new Set(markers.map(marker => marker.id)).size).toBe(3);

    const footnotes = element.querySelector('section[data-footnotes]');
    const items = [...footnotes!.querySelectorAll<HTMLLIElement>(':scope > ol > li')];
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Shared evidence from the source.'),
      expect.stringContaining('The other definition.'),
    ]);
    expect(footnotes?.textContent).not.toContain('never cited');
    expect(items[0].querySelector('strong')?.textContent).toBe('Shared evidence');
    expect(items[0].querySelector('a[href="https://example.org/source"]')?.textContent).toBe('the source');

    const sharedBacklinks = [...items[0].querySelectorAll<HTMLAnchorElement>('a[data-footnote-backref]')];
    expect(sharedBacklinks.map(link => link.getAttribute('href'))).toEqual([
      `#${markers[0].id}`, `#${markers[2].id}`,
    ]);
    expect(items[1].querySelector('a[data-footnote-backref]')?.getAttribute('href'))
      .toBe(`#${markers[1].id}`);

    const ids = [...element.querySelectorAll<HTMLElement>('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(markers.every(marker => marker.id !== element.querySelector('h1')?.id)).toBe(true);
  });

  it('includes citations in later notes in an earlier note’s backlinks', () => {
    const element = render(`First.[^a] Second.[^b]

[^a]: First note.
[^b]: Second note cites first.[^a]`);
    const notes = [...element.querySelectorAll<HTMLLIElement>('section[data-footnotes] > ol > li')];
    const references = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')];
    const backlinks = [...notes[0].querySelectorAll<HTMLAnchorElement>('a[data-footnote-backref]')];
    expect(references.map(link => link.textContent)).toEqual(['1', '2', '1']);
    expect(backlinks.map(link => link.getAttribute('href'))).toEqual([`#${references[0].id}`, `#${references[2].id}`]);
  });

  it('uses fragment-safe ids for labels with punctuation', () => {
    const element = render(`Claim.[^a:b]

[^a:b]: Punctuated note.`);
    const reference = element.querySelector<HTMLAnchorElement>('a[data-footnote-ref]')!;
    const note = element.querySelector<HTMLLIElement>('section[data-footnotes] > ol > li')!;
    expect(note.id).not.toContain('%');
    expect(decodeURIComponent(reference.getAttribute('href')!.slice(1))).toBe(note.id);
  });

  it('renders inline Markdown inside cited definitions and omits definitions without citations', () => {
    const element = render(`A sourced claim.[^source]

[^source]: [Source record][record] and [[related|Related note]] bear on *this claim*.\u0020\u0020
The note continues here.
[^unused]: [Unused](https://example.org/unused).

[record]: https://example.org/source`);
    const footnotes = element.querySelector('section[data-footnotes]');
    expect(footnotes?.querySelector('a[href="https://example.org/source"]')?.textContent)
      .toBe('Source record');
    expect(footnotes?.querySelector('em')?.textContent).toBe('this claim');
    expect(footnotes?.querySelector('br')?.nextSibling?.textContent).toContain('The note continues here.');
    expect(footnotes?.querySelector('a[data-wikilink="related"]')?.textContent).toBe('Related note');
    expect(footnotes?.textContent).not.toContain('Unused');
  });

  it('keeps generated ids unique for reserved-looking labels and across elements', () => {
    const source = `One.[^label] Two.[^ref-x] Three.[^x] Again.[^x] Four.[^x-2]

[^label]: Label note.
[^ref-x]: Reference-looking note.
[^x]: Short note.
[^x-2]: Suffix-looking note.`;
    const first = render(source);
    const second = render(source);
    const ids = [...document.querySelectorAll<HTMLElement>('tv-markdown [id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const element of [first, second]) {
      for (const marker of element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')) {
        const destination = marker.getAttribute('href')?.slice(1);
        expect(destination && element.querySelector(`[id="${destination}"]`)).not.toBeNull();
      }
      for (const backlink of element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-backref]')) {
        const destination = backlink.getAttribute('href')?.slice(1);
        expect(destination && element.querySelector(`[id="${destination}"]`)).not.toBeNull();
      }
    }
  });

  it('does not consume the next definition after a hard-break line', () => {
    const element = render(`First.[^first] Second.[^second]

[^first]: First note.\u0020\u0020
[^second]: Second note.`);
    expect([...element.querySelectorAll('a[data-footnote-ref]')].map(link => link.textContent))
      .toEqual(['1', '2']);
    expect([...element.querySelectorAll('section[data-footnotes] > ol > li')]
      .map(item => item.textContent)).toEqual([
      expect.stringContaining('First note.'),
      expect.stringContaining('Second note.'),
    ]);
  });

  it('renders continuation lines and indented blocks, then puts back-links after the body', () => {
    const element = render(`Claim.[^note]

[^note]: First line
plain continuation
    indented continuation

    Second *block*.`);
    const item = element.querySelector<HTMLLIElement>('section[data-footnotes] > ol > li');
    const paragraphs = [...item!.querySelectorAll(':scope > p')];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent?.replace(/\s+/g, ' '))
      .toBe('First line plain continuation indented continuation');
    expect(paragraphs[1].firstChild?.textContent).toBe('Second ');
    expect(paragraphs[1].childNodes[1]?.textContent).toBe('block');
    expect(paragraphs[1].querySelector('em')?.textContent).toBe('block');
    expect(paragraphs[1].lastElementChild?.matches('a[data-footnote-backref]')).toBe(true);
  });

  it('renders an indented list as a body block and puts the back-link after it', () => {
    const element = render(`Claim.[^note]

[^note]: Short note.

    - One
    - Two`);
    const item = element.querySelector<HTMLLIElement>('section[data-footnotes] > ol > li');
    expect([...item!.querySelectorAll(':scope > ul > li')].map(listItem => listItem.textContent))
      .toEqual(['One', 'Two']);
    expect(item?.lastElementChild?.matches('a[data-footnote-backref]')).toBe(true);
  });

  it('ends a definition before unindented text after a blank line', () => {
    const element = render('Claim.[^note]\n\n[^note]: Short note.\n\nOutside paragraph.');
    expect(element.querySelector(':scope > p:last-of-type')?.textContent).toBe('Outside paragraph.');
    expect(element.querySelector('section[data-footnotes] > ol > li')?.textContent)
      .not.toContain('Outside paragraph.');
  });

  it.each([
    ['heading', '# Outside heading', ':scope > h1', 'Outside heading'],
    ['list', '- Outside item', ':scope > ul > li', 'Outside item'],
    ['fence', '```txt\nOutside fence\n```', ':scope > pre code', 'Outside fence'],
    ['blockquote', '>Outside quote', ':scope > blockquote', 'Outside quote'],
  ])('does not consume a %s block after a hard-break line', (_name, block, selector, text) => {
    const element = render(`Claim.[^note]\n\n[^note]: Short note.  \n${block}`);
    expect(element.querySelector(selector)?.textContent).toContain(text);
    expect(element.querySelector('section[data-footnotes] > ol > li')?.textContent).not.toContain(text);
  });

  it.each(['pre', 'script', 'style', 'textarea'])
  ('does not consume an HTML <%s> block or the prose after it', tag => {
    const element = render(`Claim.[^note]\n\n[^note]: Short note.  \n<${tag}>Outside block</${tag}>\n\nOutside prose.`);
    expect(element.querySelector(':scope > p:last-of-type')?.textContent).toBe('Outside prose.');
    expect(element.querySelector('section[data-footnotes] > ol > li')?.textContent)
      .not.toContain('Outside');
  });

  it('keeps adjacent definitions separate after a hard-break line', () => {
    const element = render(`First.[^first] Second.[^second]

[^first]: First note.\u0020\u0020
[^second]: Second note.`);
    const items = [...element.querySelectorAll('section[data-footnotes] > ol > li')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('First note.');
    expect(items[0].textContent).not.toContain('Second note.');
    expect(items[1].textContent).toContain('Second note.');
  });

  it('recognizes definitions directly after a paragraph with zero to three leading spaces', () => {
    for (let indentation = 0; indentation <= 3; indentation++) {
      const element = render(`Claim.[^note]\n${' '.repeat(indentation)}[^note]: Note.`);
      expect(element.querySelector('a[data-footnote-ref]')?.textContent).toBe('1');
      expect(element.querySelector('section[data-footnotes] > ol > li')?.textContent).toContain('Note.');
    }
  });

  it('treats a four-space definition-shaped line as code', () => {
    const element = render('Claim.[^note]\n\n    [^note]: Note.');
    expect(element.querySelector('a[data-footnote-ref]')).toBeNull();
    expect(element.querySelector('section[data-footnotes]')).toBeNull();
    expect(element.querySelector('pre code')?.textContent.trimEnd()).toBe('[^note]: Note.');
    expect(element.querySelector('p')?.textContent).toContain('[^note]');
  });

  it('matches labels without regard to case and accepts GitHub label punctuation', () => {
    const element = render(`One.[^MiXeD.Label:1_+] Two.[^É@#$%/\\]

[^mixed.label:1_+]: Mixed case.
[^é@#$%/\\]: Unicode and punctuation.`);
    expect([...element.querySelectorAll('a[data-footnote-ref]')].map(link => link.textContent))
      .toEqual(['1', '2']);
    expect([...element.querySelectorAll('section[data-footnotes] > ol > li')].map(item => item.textContent))
      .toEqual([expect.stringContaining('Mixed case.'), expect.stringContaining('Unicode and punctuation.')]);
  });

  it('accepts a label of exactly 1,000 UTF-8 bytes', () => {
    const label = 'x'.repeat(1000);
    const element = render(`Claim.[^${label}]\n\n[^${label}]: Boundary note.`);
    expect(element.querySelector('a[data-footnote-ref]')?.textContent).toBe('1');
    expect(element.querySelector('section[data-footnotes]')?.textContent).toContain('Boundary note.');
  });

  it.each(['\uD800', '\uDC00'])('leaves a malformed UTF-16 label literal without aborting render', label => {
    const element = render(`Claim.[^${label}]\n\n[^${label}]: Invalid label.`);
    expect(element.querySelector('a[data-footnote-ref]')).toBeNull();
    expect(element.querySelector('section[data-footnotes]')).toBeNull();
    expect(element.querySelector('p')?.textContent).toContain('[^');
  });

  it('rejects invalid labels and leaves citations without definitions as literal text', () => {
    const tooLong = 'x'.repeat(1001);
    const element = render(`Missing[^missing] empty[^] spaced[^two words] bracket[^bad[label] escaped[^bad\\]] long[^${tooLong}].

[^two words]: Invalid whitespace.
[^bad[label]: Invalid bracket.
[^bad\\]]: Escaped bracket.
[^${tooLong}]: Too long.`);
    expect(element.querySelector('a[data-footnote-ref]')).toBeNull();
    expect(element.querySelector('section[data-footnotes]')).toBeNull();
    expect(element.querySelector('p')?.textContent).toContain('[^missing]');
    expect(element.querySelector('p')?.textContent).toContain('[^two words]');
  });

  it('leaves footnote syntax inside inline and fenced code untouched', () => {
    const element = render('`inline[^code]`\n\n```md\nblock[^code]\n[^code]: Not a definition.\n```\n\n' +
      '[^code]: An uncited definition outside code.');
    expect(element.querySelector('a[data-footnote-ref]')).toBeNull();
    expect(element.querySelector('section[data-footnotes]')).toBeNull();
    expect(element.querySelector('p code')?.textContent).toBe('inline[^code]');
    expect(element.querySelector('pre code')?.textContent).toContain('[^code]: Not a definition.');
  });

  it('renders citations inside headings and list items', () => {
    const element = render(`## Heading[^heading]

- Item[^item]

[^heading]: Heading note.
[^item]: Item note.`);
    expect(element.querySelector('h2 > sup > a[data-footnote-ref]')?.textContent).toBe('1');
    expect(element.querySelector(':scope > ul > li > sup > a[data-footnote-ref]')?.textContent).toBe('2');
  });

  it('separates adjacent citations with a superscript comma outside both links', () => {
    const element = render(`Claim[^first][^second].

[^first]: First note.
[^second]: Second note.`);
    const markers = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')];
    expect(markers.map(marker => marker.textContent)).toEqual(['1', '2']);
    expect(element.querySelector(':scope > p')?.textContent).toBe('Claim1,2.');
    expect(markers[1].parentElement?.textContent).toBe(',2');
    expect(markers[1].previousSibling?.textContent).toBe(',');
    expect(markers[1].textContent).not.toContain(',');
  });

  it('starts with fresh definitions and numbering when one element rerenders', () => {
    const element = render('Old[^old].\n[^old]: Old note.');
    const oldId = element.querySelector<HTMLAnchorElement>('a[data-footnote-ref]')?.id;
    (element as HTMLElement & { markdown: string }).markdown =
      'New[^new] and missing[^old].\n[^new]: New note.';

    const markers = [...element.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]')];
    expect(markers.map(marker => marker.textContent)).toEqual(['1']);
    expect(element.querySelector(':scope > p')?.textContent).toContain('missing[^old]');
    expect(element.textContent).toContain('New note.');
    expect(element.textContent).not.toContain('Old note.');
    expect(oldId && element.querySelector(`[id="${oldId}"]`)).toBeNull();
  });
});

describe('wikilinks', () => {
  it('renders targets and labels as focusable addressless anchors', () => {
    const element = render('See [[topics/goal-pressure#history]] and [[jane|Jane]].');
    const links = [...element.querySelectorAll<HTMLAnchorElement>('a[data-wikilink]')];
    expect(links.map(link => [link.getAttribute('data-wikilink'), link.textContent])).toEqual([
      ['topics/goal-pressure#history', 'topics/goal-pressure#history'],
      ['jane', 'Jane'],
    ]);
    for (const link of links) {
      expect(link.hasAttribute('href')).toBe(false);
      expect(link.getAttribute('tabindex')).toBe('0');
      expect(link.getAttribute('role')).toBe('link');
    }
  });

  it('recognizes an escaped label separator inside a Markdown table', () => {
    const element = render('| Person |\n| --- |\n| [[jane\\|Jane Doe]] |');
    const link = element.querySelector<HTMLAnchorElement>('td a[data-wikilink]');
    expect(link?.getAttribute('data-wikilink')).toBe('jane');
    expect(link?.textContent).toBe('Jane Doe');
  });

  it('leaves wikilink syntax inside code spans and code blocks as code', () => {
    const element = render('`[[inline|label]]`\n\n~~~\n[[block|label]]\n~~~');
    expect(element.querySelector('a')).toBeNull();
    expect(element.querySelector('p code')?.textContent).toBe('[[inline|label]]');
    expect(element.querySelector('pre code')?.textContent).toContain('[[block|label]]');
  });
});

describe('sanitizing', () => {
  it('keeps permitted headings, emphasis, lists, quotes, rules, and line breaks', () => {
    const element = render('#### Four\n\n##### Five\n\n###### Six\n\n*Emphasis* and <s>old</s>  \nnext\n\n> Quoted\n\n- Item\n\n---');
    expect([...element.querySelectorAll('h4, h5, h6')].map(heading => heading.textContent))
      .toEqual(['Four', 'Five', 'Six']);
    expect(element.querySelector('em')?.textContent).toBe('Emphasis');
    expect(element.querySelector('s')?.textContent).toBe('old');
    expect(element.querySelector('br')).not.toBeNull();
    expect(element.querySelector('blockquote p')?.textContent).toBe('Quoted');
    expect(element.querySelector('ul li')?.textContent).toBe('Item');
    expect(element.querySelector('hr')).not.toBeNull();
  });

  it('renders GitHub-flavoured strikethrough, tables, and an ordered list start', () => {
    const element = render('~~Removed~~\n\n3. Third\n4. Fourth\n\n| Key | Value |\n| --- | --- |\n| A | B |');
    expect(element.querySelector('del')?.textContent).toBe('Removed');
    expect(element.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect([...element.querySelectorAll('ol li')].map(item => item.textContent)).toEqual(['Third', 'Fourth']);
    expect(element.querySelector('table thead tr th')?.textContent).toBe('Key');
    expect(element.querySelector('table tbody tr td')?.textContent).toBe('A');
    expect([...element.querySelectorAll('table th, table td')].map(cell => cell.textContent))
      .toEqual(['Key', 'Value', 'A', 'B']);
  });

  it('keeps allowed table spans but removes authored ids outside generated headings', () => {
    const element = render('<table><tbody><tr><td colspan="2" rowspan="3" id="forged">Cell</td></tr></tbody></table>\n\n<p id="forged">Text</p>\n\n<h2 id="forged">Heading</h2>');
    const cell = element.querySelector('td');
    expect(cell?.getAttribute('colspan')).toBe('2');
    expect(cell?.getAttribute('rowspan')).toBe('3');
    expect(cell?.hasAttribute('id')).toBe(false);
    expect(element.querySelector('p')?.hasAttribute('id')).toBe(false);
    expect(element.querySelector('h2')?.id).toBe('heading');
  });

  it('resolves a relative image address against the page base URL', () => {
    const base = document.createElement('base');
    base.href = 'https://example.org/notes/';
    document.head.append(base);
    try {
      const element = render('![Cover](images/cover.png)');
      expect(element.querySelector('img')?.getAttribute('src')).toBe('images/cover.png');
      expect(element.querySelector('img')?.src).toBe('https://example.org/notes/images/cover.png');
    } finally {
      base.remove();
    }
  });

  it('keeps image src and ordinary href exactly as written in Markdown', () => {
    const element = render('![A picture](<images/a b.png>) and [a note](<notes/a b>)');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('images/a b.png');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('notes/a b');
  });

  it('keeps non-dangerous schemes in prose, footnotes, and image sources', () => {
    const element = render(`[Body record](autofile:///reference/body) and a claim.[^source]

[^source]: [Footnote record](autofile:///reference/footnote).

    [Script notes](coffeescript:compile) and [Local file](file:///notes/example).

<img src="custom+asset://covers/example" alt="Custom cover">`);
    expect(element.querySelector('a[href="autofile:///reference/body"]')?.textContent).toBe('Body record');
    expect(element.querySelector('section[data-footnotes] a[href="autofile:///reference/footnote"]')
      ?.textContent).toBe('Footnote record');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('custom+asset://covers/example');
    expect(element.querySelector('a[href="coffeescript:compile"]')?.textContent).toBe('Script notes');
    expect(element.querySelector('a[href="file:///notes/example"]')?.textContent).toBe('Local file');
  });

  it('strips every disguised dangerous URL scheme from href and src', () => {
    const schemes = [
      ['javascript', 'JaVaScRiPt', 'j&#x61;vascript', 'j%61vascript'],
      ['vbscript', 'VbScRiPt', 'v&#x62;script', 'v%62script'],
      ['data', 'DaTa', 'd&#x61;ta', 'd%61ta'],
    ];
    const addresses = schemes.flatMap(([plain, mixed, entity, percent]) => [
      `${plain}:payload`,
      `${mixed}:payload`,
      `&#x09;&#x0A;&#x0D; ${plain}:payload`,
      `${entity}:payload`,
      `${percent}:payload`,
      `${plain}&#x3A;payload`,
      `${plain}%3Apayload`,
      `${percent.replace('%', '%25')}%253Apayload`,
    ]);
    let nestedPercent = 'j%61vascript:payload';
    let nestedEntity = 'j&#x61;vascript:payload';
    for (let depth = 0; depth < 12; depth++) {
      nestedPercent = nestedPercent.replaceAll('%', '%25');
      nestedEntity = nestedEntity.replaceAll('&', '&amp;');
    }
    addresses.push(nestedPercent, nestedEntity);
    const source = addresses.map((address, index) =>
      `<a href="${address}" title="link-${index}">link</a>` +
      `<img src="${address}" alt="image-${index}">`).join('\n');
    const element = render(`${source}\n<p href="java%73cript:payload" title="prose-url">Text</p>\n` +
      '[Markdown entity](java&amp;#x73;cript:payload)');

    addresses.forEach((_address, index) => {
      expect(element.querySelector(`a[title="link-${index}"]`)?.hasAttribute('href')).toBe(false);
      expect(element.querySelector(`img[alt="image-${index}"]`)?.hasAttribute('src')).toBe(false);
    });
    expect(element.querySelector('p[title="prose-url"]')?.hasAttribute('href')).toBe(false);
    expect([...element.querySelectorAll('a')].at(-1)?.hasAttribute('href')).toBe(false);
  });

  it('keeps the docs viewer allowed attributes on ordinary prose elements', () => {
    const element = render('<p href="/notes" title="A note">Text</p>');
    expect(element.querySelector('p')?.getAttribute('title')).toBe('A note');
    expect(element.querySelector('p')?.getAttribute('href')).toBe('/notes');
  });

  it('removes unsafe elements and attributes while keeping allowed formatting', () => {
    const element = render(
      '<script>alert(1)</script><style>p{color:red}</style><iframe src="/bad"></iframe>\n\n' +
      '<p class="bad" style="color:red" onclick="alert(1)" data-secret="x" aria-label="bad">' +
      '<strong>Safe</strong> <a href="https://example.org" title="Good" target="_blank">Link</a>' +
      '</p>\n\n<img src="images/example.png" alt="Example" onerror="alert(1)">',
    );
    expect(element.querySelector('script, style, iframe')).toBeNull();
    expect(element.querySelector('strong')?.textContent).toBe('Safe');
    expect(element.querySelector('p')?.attributes.length).toBe(0);
    expect(element.querySelector('a')?.getAttributeNames().sort()).toEqual(['href', 'title']);
    expect(element.querySelector('img')?.getAttributeNames().sort()).toEqual(['alt', 'src']);
    expect(element.querySelector('img')?.getAttribute('src')).toBe('images/example.png');
  });

  it('keeps disabled checked and unchecked task-list checkboxes, and rejects other inputs', () => {
    const element = render('- [x] Done\n- [ ] Pending\n\n<input type="text" value="unsafe">');
    const boxes = [...element.querySelectorAll<HTMLInputElement>('input')];
    expect(boxes).toHaveLength(2);
    expect(boxes.map(box => [box.type, box.checked, box.disabled])).toEqual([
      ['checkbox', true, true], ['checkbox', false, true],
    ]);
    expect(boxes.every(box => box.closest('li') !== null)).toBe(true);
  });

  it('never accepts data-wikilink from raw Markdown HTML', () => {
    const element = render('<a href="/ordinary" data-wikilink="forged">ordinary</a> and [[real|Real]]');
    expect(element.querySelector('a[href]')?.hasAttribute('data-wikilink')).toBe(false);
    expect(element.querySelectorAll('a[data-wikilink]')).toHaveLength(1);
    expect(element.querySelector('a[data-wikilink]')?.getAttribute('data-wikilink')).toBe('real');
  });

  it('keeps footnote elements but removes footnote metadata forged in raw HTML', () => {
    const element = render(
      '<section id="forged" data-footnotes aria-label="forged"><h2 id="forged">Fake footnotes</h2>' +
      '<ol><li id="forged"><sup><a id="forged" href="#fake" data-footnote-ref ' +
      'aria-describedby="forged">1</a></sup></li></ol></section>',
    );
    expect(element.querySelector('section')).not.toBeNull();
    expect(element.querySelector('sup')).not.toBeNull();
    expect(element.querySelector('section')?.hasAttribute('id')).toBe(false);
    expect(element.querySelector('section')?.hasAttribute('data-footnotes')).toBe(false);
    expect(element.querySelector('section')?.hasAttribute('aria-label')).toBe(false);
    expect(element.querySelector('li')?.hasAttribute('id')).toBe(false);
    expect(element.querySelector('a')?.hasAttribute('id')).toBe(false);
    expect(element.querySelector('a')?.hasAttribute('data-footnote-ref')).toBe(false);
    expect(element.querySelector('a')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('sanitizes footnote content while keeping generated footnote metadata', () => {
    const element = render(
      'Claim.[^safe]\n\n[^safe]: <strong onclick="alert(1)">Safe</strong><script>alert(1)</script>',
    );
    const section = element.querySelector('section[data-footnotes]');
    expect(section).not.toBeNull();
    expect(section?.querySelector('script')).toBeNull();
    expect(section?.querySelector('strong')?.textContent).toBe('Safe');
    expect(section?.querySelector('strong')?.hasAttribute('onclick')).toBe(false);
    expect(element.querySelector('a[data-footnote-ref]')?.hasAttribute('aria-describedby')).toBe(true);
    expect(section?.querySelector('a[data-footnote-backref]')?.hasAttribute('aria-label')).toBe(true);
  });
});
