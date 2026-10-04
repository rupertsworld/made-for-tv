/** One book cover, with the shared base and cover CSS. */
import type { Template } from '../../types';
import { style as baseStyle } from './base';

type Book = {
  id: string;
  title: string;
  authors: readonly string[];
  description: string;
  coverHue: number;
  publicationDate?: string;
  pageCount?: number;
  genre?: string;
  rating?: string;
  sourceUrl?: string;
  sourceLabel?: string;
};

const options = {} as const;
const coverRules = `:where(tv-book-catalog, tv-book-detail) :where(.bc-cover) {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  aspect-ratio: 2 / 3;
  padding: var(--_cover-padding);
  overflow: hidden;
  border-radius: 4px 7px 7px 4px;
  background: var(--tv-book-catalog-cover-background, linear-gradient(160deg, hsl(var(--_cover-hue) 42% 40%), hsl(calc(var(--_cover-hue) + 20) 48% 24%)));
  color: var(--_cover-text);
  box-shadow: inset 4px 0 0 rgb(0 0 0 / 16%), 0 1px 2px rgb(0 0 0 / 12%), 0 8px 18px -8px rgb(0 0 0 / 35%);
  transition: transform .2s ease;
}
:where(tv-book-catalog, tv-book-detail) :where(.bc-cover-title) { font: var(--_heading-weight) var(--_cover-title-size)/1.25 var(--_cover-font); }
:where(tv-book-catalog, tv-book-detail) :where(.bc-cover-authors) { font-size: var(--_cover-author-size); line-height: 1.4; }
:where(tv-book-catalog, tv-book-detail) :where(.bc-cover img) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--_surface);
}
@media (prefers-reduced-motion: reduce) {
  :where(tv-book-catalog, tv-book-detail) :where(.bc-cover) { transition: none; }
}
`;
const style = [...baseStyle, coverRules];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Render the generated cover fallback for one book. */
function render({ book }: { book: Book }): string {
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
  return `<div class="bc-cover" aria-hidden="true" style="--_cover-hue: ${book.coverHue}"><span class="bc-cover-title">${escapeHtml(book.title)}</span><span class="bc-cover-authors">${escapeHtml(authors)}</span></div>`;
}

export default { options, style, render } satisfies Template<Parameters<typeof render>[0]>;
