/** Fixed records for the book stories. */
import type card from '../spec/tv-book-catalog/templates/card';

type Book = Parameters<typeof card.render>[0]['book'];

export const sampleBooks: readonly Book[] = [
  {
    id: 'essays', title: 'Collected Essays', authors: ['A. Writer', 'B. Writer'],
    description: 'A complete description with line breaks.\n<b>Markup stays plain text.</b>',
    coverHue: 290, publicationDate: '2024-05', pageCount: 0,
    genre: 'Essays', rating: '4.2 / 5',
    sourceUrl: 'https://example.org/books/essays', sourceLabel: 'example.org',
  },
  {
    id: 'unknown', title: 'An Unknown Author', authors: [],
    description: 'A book with unknown authors.', coverHue: 330,
  },
  {
    id: 'long', title: 'A Complete Title That Wraps Across Several Lines',
    authors: ['An Author With a Long Name'],
    description: 'A brief description that wraps across several lines.', coverHue: 330,
  },
];
