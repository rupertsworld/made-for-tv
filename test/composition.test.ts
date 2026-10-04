/** Verify that book templates compose markup and styles using supplied data. */
import { expect, test } from 'vitest';
import card from '../spec/tv-book-catalog/templates/card';
import cover from '../spec/tv-book-catalog/templates/cover';
import grid from '../spec/tv-book-catalog/templates/grid';
import catalog from '../spec/tv-book-catalog/templates/tv-book-catalog';
import { sampleBooks } from '../storybook/sample-books';

test('the grid renders each sample book through the card template', () => {
  const markup = grid.render({ books: sampleBooks });
  expect(markup).toContain(card.render({ book: sampleBooks[0] }));
  expect(card.render({ book: sampleBooks[0] })).toContain(cover.render({ book: sampleBooks[0] }));
  expect(markup).toContain(card.render({ book: sampleBooks[1] }));
  expect(markup).toContain(card.render({ book: sampleBooks[2] }));
  expect(markup.match(/class="bc-card"/g)).toHaveLength(3);
});

test('the catalog renders the grid and includes the styles of both parts', () => {
  expect(catalog.render({ view: 'catalog', status: 'ready', books: sampleBooks, book: sampleBooks[0] }))
    .toContain(grid.render({ books: sampleBooks }));
  expect(catalog.render({ view: 'detail', status: 'ready', books: sampleBooks, book: sampleBooks[0] }))
    .toContain(cover.render({ book: sampleBooks[0] }));
  expect(grid.style.slice(0, card.style.length)).toEqual(card.style);
  expect(catalog.style.slice(0, grid.style.length)).toEqual(grid.style);
  expect(catalog.style.filter(css => css === cover.style.at(-1))).toHaveLength(2);
});
