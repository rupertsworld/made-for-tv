/** One book card, with the shared element and card CSS. */
import type { Template } from '../../types';
import cover from './cover';

type Book = Parameters<typeof cover.render>[0]['book'];

const options = {} as const;
const style = [...cover.style, `:where(tv-book-catalog) :where(.bc-activate) {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: none;
  text-align: left;
  border-radius: var(--_radius);
  overflow-wrap: anywhere;
}

:where(tv-book-catalog) :where(.bc-title, .bc-authors, .bc-description, .bc-caption) { display: block; }
:where(tv-book-catalog) :where(.bc-title) { margin-top: var(--_space); font-weight: var(--_heading-weight); }

:where(tv-book-catalog) :where(.bc-description) { margin-top: var(--_control-padding); font-size: var(--_small); }
@media (hover: hover) {
  :where(tv-book-catalog) :where(.bc-activate:hover .bc-cover) { transform: translateY(-3px); }
}
`];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Render one card from supplied book data. */
function render({ book }: { book: Book }): string {
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
  return `<li class="bc-card"><button type="button" class="bc-activate" data-book-id="${escapeHtml(book.id)}" aria-label="${escapeHtml(book.title)} — ${escapeHtml(authors)}">${cover.render({ book })}<span class="bc-title">${escapeHtml(book.title)}</span><span class="bc-authors">${escapeHtml(authors)}</span><span class="bc-description">${escapeHtml(book.description)}</span>${book.genre === undefined ? '' : `<span class="bc-caption">Genre: ${escapeHtml(book.genre)}</span>`}${book.rating === undefined ? '' : `<span class="bc-caption">Rating: ${escapeHtml(book.rating)}</span>`}</button></li>`;
}

export default { options, style, render } satisfies Template<Parameters<typeof render>[0]>;
