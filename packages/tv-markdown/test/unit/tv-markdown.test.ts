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
});
