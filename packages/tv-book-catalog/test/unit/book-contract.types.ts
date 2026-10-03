/** Compile-time checks for the page-adapted record contract. */
import type { Book } from '../../src/tv-book-catalog';

// @ts-expect-error A description is required, even when optional metadata is absent.
const missingDescription: Book = { id: 'book', title: 'Book', authors: [] };
const removedField: Book = {
  id: 'book', title: 'Book', authors: [], description: 'A brief description.',
  // @ts-expect-error Collection labels are not book metadata.
  listName: 'Reading',
};
void missingDescription;
void removedField;
