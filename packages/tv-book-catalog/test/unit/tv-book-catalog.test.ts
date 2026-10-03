/** Light-DOM contract tests for record data, state transitions and safe destinations. */
// @vitest-environment jsdom
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { TvBookCatalogElement, TvBookDetailElement, type Book } from '../../src/tv-book-catalog';
import { skillNotices } from '../../../../scripts/skill-notices.mjs';

const book: Book = Object.freeze({ id: 'odd " ] # <id>', title: '<img src=x onerror=alert(1)>',
  authors: Object.freeze(['First', 'Second']), description: '<b>Not HTML</b>\nSecond line',
  publicationDate: '2024-05', pageCount: 0, genre: 'Essay', rating: '4.2 / 5',
  sourceUrl: '/source', cover: 'javascript:alert(1)' });

beforeEach(() => document.body.replaceChildren());

it('renders synchronously with exact input identity, order and identifiers, without mutating data', () => {
  const catalog = new TvBookCatalogElement();
  document.body.append(catalog);
  const books = Object.freeze([book, { id: 'second', title: 'Second', authors: [], description: 'Another book.' }]);
  catalog.books = books;
  expect(catalog.books).toBe(books);
  expect([...catalog.querySelectorAll<HTMLButtonElement>('button')].map(button => button.dataset.bookId))
    .toEqual([book.id, 'second']);
  expect(catalog.textContent).toContain('Unknown author');
  expect(catalog.querySelector('img, a, script')).toBeNull();
  expect(catalog.querySelector('button')?.textContent).toContain(book.title);
  expect(catalog.querySelector('.bc-authors')?.nextElementSibling?.textContent).toBe(book.description);
  expect(catalog.querySelector('b')).toBeNull();
  expect(catalog.shadowRoot).toBeNull();
});

it('shows the complete detail contract, literal text and labelled zero, but no uncontracted data', () => {
  const detail = new TvBookDetailElement();
  detail.book = { ...book, extra: 'secret' } as Book;
  expect(detail.querySelector('h2')?.textContent).toBe(book.title);
  expect(detail.querySelector('h2')?.tabIndex).toBe(-1);
  expect(detail.textContent).toContain(book.description);
  expect([...detail.querySelectorAll('dt')].map(node => node.textContent)).toEqual([
    'ID', 'Publication date', 'Page count', 'Genre', 'Rating', 'URL',
  ]);
  expect([...detail.querySelectorAll('dd')].map(node => node.textContent)).toEqual([
    book.id, '2024-05', '0', 'Essay', '4.2 / 5', new URL(document.baseURI).host,
  ]);
  expect(detail.querySelector('a')?.href).toBe(new URL('/source', document.baseURI).href);
  expect(detail.querySelector('b, script')).toBeNull();
  expect(detail.textContent).not.toContain('secret');
});

it('omits nullish and blank optional fields rather than generating empty labels', () => {
  const detail = new TvBookDetailElement();
  detail.book = { id: 'empty', title: 'Empty', authors: [], description: 'Brief description.', genre: '',
    rating: null, publicationDate: '  ', pageCount: null } as unknown as Book;
  expect(detail.querySelectorAll('dt')).toHaveLength(1);
  expect(detail.querySelector('a')).toBeNull();
  expect(detail.querySelector('.bc-authors')?.nextElementSibling?.textContent).toBe('Brief description.');
  expect(detail.textContent).toContain('Unknown author');
  expect(detail.textContent).not.toMatch(/undefined|null/);
});

for (const destination of ['javascript:alert(1)', 'data:image/png;base64,AA', 'blob:https://example.org/x',
  'file:///tmp/a', 'http://[', '', '   ']) {
  it(`rejects cover and source destination ${JSON.stringify(destination)}`, () => {
    const detail = new TvBookDetailElement();
    detail.book = { ...book, cover: destination, sourceUrl: destination };
    expect(detail.querySelector('img, a')).toBeNull();
    expect([...detail.querySelectorAll('dt')].map(node => node.textContent)).not.toContain('URL');
    expect(detail.querySelector('.bc-cover')?.getAttribute('aria-hidden')).toBe('true');
  });
}
for (const destination of ['/cover.png', 'covers/a.png', 'https://example.org/cover.png', 'http://example.org/cover.png']) {
  it(`accepts and resolves HTTP destination ${destination}`, () => {
    const detail = new TvBookDetailElement();
    detail.book = { ...book, cover: destination, sourceUrl: destination };
    const expected = new URL(destination, document.baseURI).href;
    expect(detail.querySelector('img')?.src).toBe(expected);
    expect(detail.querySelector('img')?.alt).toBe('');
    expect(detail.querySelector('a')?.href).toBe(expected);
    expect(detail.querySelector('a')?.textContent).toBe(new URL(expected).host);
    expect(detail.querySelector('a')?.closest('dd')?.previousElementSibling?.textContent).toBe('URL');
    detail.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(detail.querySelector('img')).toBeNull();
    expect(detail.querySelector('.bc-cover')?.textContent).toContain(book.title);
    expect(detail.status).toBe('ready');
  });
}

it('dispatches plain nonbubbling render after every assignment, even repeated and detached assignments', () => {
  const catalog = new TvBookCatalogElement();
  const snapshots: string[] = [];
  catalog.addEventListener('render', event => {
    expect(event.constructor).toBe(Event);
    expect(event.bubbles).toBe(false);
    snapshots.push(catalog.textContent!);
  });
  catalog.books = [book];
  catalog.status = 'loading';
  catalog.status = 'loading';
  catalog.message = '<b>Please wait</b>';
  catalog.books = null;
  catalog.status = 'ready';
  catalog.message = undefined;
  expect(snapshots).toHaveLength(7);
  expect(snapshots[0]).toContain(book.title);
  expect(snapshots.slice(1)).toEqual(['Loading books…', 'Loading books…', '<b>Please wait</b>',
    '<b>Please wait</b>', '<b>Please wait</b>', 'No books to show.']);
  expect(catalog.books).toBeNull();
});

it('retains data through loading/error, preserves unchanged announcement nodes, and clears with nullish input', () => {
  for (const element of [new TvBookCatalogElement(), new TvBookDetailElement()]) {
    document.body.append(element);
    if (element instanceof TvBookCatalogElement) element.books = [book];
    else element.book = book;
    element.status = 'loading';
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('h2, li')).toBeNull();
    const announcement = element.querySelector('[role="status"]');
    element.status = 'loading';
    element.message = '';
    expect(element.querySelector('[role="status"]')).toBe(announcement);
    element.status = 'error';
    expect(element.querySelector('[aria-busy="true"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    element.status = 'ready';
    expect(element.textContent).toContain(book.title);
    element.message = 'Ignored when populated';
    expect(element.textContent).not.toContain('Ignored when populated');
    if (element instanceof TvBookCatalogElement) element.books = undefined;
    else element.book = undefined;
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Ignored when populated');
  }
});

it('reports the displayed record reference and exact button in noncancelable composed request events', () => {
  const catalog = new TvBookCatalogElement();
  document.body.append(catalog);
  catalog.books = [book];
  let count = 0;
  document.body.addEventListener('bookactivate', event => {
    const request = event as CustomEvent;
    expect(request.detail).toEqual({ id: book.id, book, trigger: catalog.querySelector('button') });
    expect(request.detail.book).toBe(book);
    expect(request.composed).toBe(true);
    expect(request.cancelable).toBe(false);
    request.preventDefault();
    expect(request.defaultPrevented).toBe(false);
    count++;
  }, { once: true });
  catalog.querySelector('button')!.click();
  expect(count).toBe(1);
});

it('detail supplies no navigation control in populated, loading, error or empty states', () => {
  const detail = new TvBookDetailElement();
  document.body.append(detail);
  detail.book = book;
  for (const status of ['ready', 'loading', 'error'] as const) {
    detail.status = status;
    expect(detail.querySelector('button')).toBeNull();
  }
  detail.book = null;
  detail.status = 'ready';
  expect(detail.querySelector('button, a')).toBeNull();
  expect(detail.textContent).toBe('No book selected.');
});

it('ignores child input, replaces it on assignment and retains detached assignments when connected', () => {
  for (const element of [new TvBookCatalogElement(), new TvBookDetailElement()]) {
    element.textContent = 'This is not a book';
    document.body.append(element);
    expect(element.textContent).not.toContain('This is not a book');
    element.remove();
    if (element instanceof TvBookCatalogElement) element.books = [book];
    else element.book = book;
    const content = element.firstElementChild;
    document.body.append(element);
    expect(element.firstElementChild).toBe(content);
    expect(element.textContent).toContain(book.title);
    element.append(document.createElement('aside'));
    element.message = undefined;
    expect(element.querySelector('aside')).toBeNull();
  }
});

it('detail renders and clears synchronously after each data and state assignment', () => {
  const detail = new TvBookDetailElement();
  const snapshots: string[] = [];
  detail.addEventListener('render', () => snapshots.push(detail.textContent!));
  detail.book = book;
  expect(detail.book).toBe(book);
  detail.book = null;
  detail.book = undefined;
  detail.status = 'loading';
  detail.message = '<script>Plain message</script>';
  expect(snapshots).toHaveLength(5);
  expect(snapshots[0]).toContain(book.title);
  expect(snapshots.slice(1)).toEqual(['No book selected.', 'No book selected.',
    'Loading book…', '<script>Plain message</script>']);
  expect(detail.querySelector('script')).toBeNull();
});

it('emits the required notice for an empty module graph and preserves bundled dependency licenses', () => {
  const outputs: { fileName: string; source: string }[] = [];
  const plugin = skillNotices();
  const context = { emitFile: (asset: { fileName: string; source: string }) => outputs.push(asset) };
  plugin.generateBundle.call(context, {}, {});
  expect(outputs[0]).toMatchObject({ fileName: 'THIRD-PARTY-NOTICES.txt' });
  expect(outputs[0].source).toContain('No third-party code is bundled');
  plugin.generateBundle.call(context, {}, { entry: { type: 'chunk', modules: {
    [path.resolve('node_modules/marked/lib/marked.esm.js')]: {},
  } } });
  expect(outputs[1].source).toContain('marked@');
  expect(outputs[1].source).toContain('MIT');
  expect(outputs[1].source).not.toContain('No third-party code is bundled');
});
