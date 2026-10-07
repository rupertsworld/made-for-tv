/** Independent catalog and detail specimens for the book elements. */
import type { Template } from '../../types';
import cover from './cover';
import grid from './grid';

type Book = Parameters<typeof grid.render>[0]['books'][number];

const options = {
  view: ['catalog', 'detail'],
  status: ['ready', 'empty', 'loading', 'error'],
} as const;

const messageRules = `:where(tv-book-catalog, tv-book-detail) :where(.bc-message) { padding-block: var(--_space); }
:where(tv-book-catalog, tv-book-detail) :where(.bc-message:empty) { padding-block: 0; }
`;

/** Detail rules follow the CSS composed by the grid, card and cover templates. */
const detailRules = `:where(tv-book-detail) :where(.bc-record) { display: grid; gap: var(--_gap); }
:where(tv-book-detail) :where(.bc-cover) { max-width: 240px; }
:where(tv-book-detail) :where(.bc-record-text) { display: flex; flex-direction: column; gap: var(--_space); align-items: flex-start; }
:where(tv-book-detail) :where(.bc-detail-title) { font-size: var(--_heading); font-weight: var(--_heading-weight); line-height: 1.25; }
:where(tv-book-detail) :where(.bc-metadata) { width: 100%; }
:where(tv-book-detail) :where(.bc-metadata > div) { padding-block: var(--_control-padding); border-bottom: 1px solid var(--_border); }
:where(tv-book-detail) :where(dt) { color: var(--_muted); font-size: var(--_small); }
:where(tv-book-detail) :where(.bc-source) { color: var(--_link); text-decoration: underline; }
@container (min-width: 560px) {
  :where(tv-book-detail) :where(.bc-record) { grid-template-columns: minmax(0, 200px) minmax(0, 1fr); align-items: start; }
  :where(tv-book-detail) :where(.bc-metadata > div) { display: grid; grid-template-columns: minmax(0, 140px) minmax(0, 1fr); gap: var(--_space); }
}
`;
const style = [...grid.style, ...cover.style, messageRules, detailRules];


function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Render the populated book record. */
function renderReadyDetail(book: Book): string {
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
  return `<article class="bc-record">
${cover.render({ book })}
<div class="bc-record-text">
<h2 class="bc-detail-title" tabindex="-1">${escapeHtml(book.title)}</h2>
<p class="bc-authors">${escapeHtml(authors)}</p>
<p class="bc-description">${escapeHtml(book.description)}</p>
<dl class="bc-metadata">
<div><dt>ID</dt><dd>${escapeHtml(book.id)}</dd></div>
${book.publicationDate === undefined ? '' : `<div><dt>Publication date</dt><dd>${escapeHtml(book.publicationDate)}</dd></div>`}
${book.pageCount === undefined ? '' : `<div><dt>Page count</dt><dd>${book.pageCount}</dd></div>`}
${book.genre === undefined ? '' : `<div><dt>Genre</dt><dd>${escapeHtml(book.genre)}</dd></div>`}
${book.rating === undefined ? '' : `<div><dt>Rating</dt><dd>${escapeHtml(book.rating)}</dd></div>`}
${book.sourceUrl === undefined ? '' : `<div><dt>URL</dt><dd><a class="bc-source" href="${escapeHtml(book.sourceUrl)}">${escapeHtml(book.sourceLabel ?? book.sourceUrl)}</a></dd></div>`}
</dl>
</div>
</article>`;
}

type Args = { [K in keyof typeof options]: (typeof options)[K][number] } & {
  books: readonly Book[];
  book: Book;
};

/** Render one catalog or detail element as an HTML fragment. */
function render({ view, status, books, book }: Args): string {
  return view === 'catalog' ? `<tv-book-catalog>
<div class="bc-content"${status === 'loading' ? ' aria-busy="true"' : ''}>
${status === 'ready' ? grid.render({ books }) : ''}
</div>
<p class="bc-message" role="status">${status === 'loading' ? 'Loading books…' : status === 'empty' ? 'No books to show.' : ''}</p>
<p class="bc-message" role="alert">${status === 'error' ? 'Could not load books.' : ''}</p>
</tv-book-catalog>` : `<tv-book-detail>
<div class="bc-content"${status === 'loading' ? ' aria-busy="true"' : ''}>
${status === 'ready' ? renderReadyDetail(book) : ''}
</div>
<p class="bc-message" role="status">${status === 'loading' ? 'Loading book…' : status === 'empty' ? 'No book selected.' : ''}</p>
<p class="bc-message" role="alert">${status === 'error' ? 'Could not load book.' : ''}</p>
</tv-book-detail>`;
}

export default { options, style, render } satisfies Template<Args>;
