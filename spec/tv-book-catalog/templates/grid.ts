/** The book grid composes cards and their CSS. */
import type { Template } from '../../types';
import card from './card';

type Book = Parameters<typeof card.render>[0]['book'];

const options = {} as const;
const gridRules = `:where(tv-book-catalog) :where(.bc-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 132px), 1fr));
  gap: var(--_gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
`;
const style = [...card.style, gridRules];

/** Render each supplied book as one card. */
function render({ books }: { books: readonly Book[] }): string {
  return `<ul class="bc-grid">
${books.map(book => card.render({ book })).join('\n')}
</ul>`;
}

export default { options, style, render } satisfies Template<Parameters<typeof render>[0]>;
