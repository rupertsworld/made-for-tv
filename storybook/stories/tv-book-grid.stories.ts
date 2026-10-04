/** Show the composed grid with its card styling. */
import type { StoryObj } from '@storybook/html-vite';
import grid from '../../spec/tv-book-catalog/templates/grid';
import { sampleBooks } from '../sample-books';
import { story } from '../helpers';

const pageStyle = `body { margin: 0; }
.page { min-height: 100vh; box-sizing: border-box; padding: 24px; color-scheme: light; background: light-dark(white, #202020); color: light-dark(#222, #eee); font-family: system-ui, sans-serif; }
.page[data-scheme="dark"] { color-scheme: dark; }
.page tv-book-catalog { max-width: 900px; }`;

const gridStory = story(grid, {
  options: { scheme: ['light', 'dark'] } as const,
  style: [pageStyle],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-book-catalog>${element}</tv-book-catalog></div>`,
});
const meta = {
  title: 'Specifications/Books/Grid',
  ...gridStory,
  args: { ...gridStory.args, books: sampleBooks } satisfies Parameters<typeof gridStory.render>[0],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

/** All three sample books. */
export const AllBooks: Story = {};
/** The grid accepts a different list of books. */
export const LongTitleOnly: Story = { args: { books: [sampleBooks[2]] } };
