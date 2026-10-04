/** Show the shared book cover independently of card and detail views. */
import type { StoryObj } from '@storybook/html-vite';
import cover from '../../spec/tv-book-catalog/templates/cover';
import { sampleBooks } from '../sample-books';
import { story } from '../helpers';

const pageStyle = `body { margin: 0; }
.page { min-height: 100vh; box-sizing: border-box; padding: 24px; color-scheme: light; background: light-dark(white, #202020); color: light-dark(#222, #eee); font-family: system-ui, sans-serif; }
.page[data-scheme="dark"] { color-scheme: dark; }
.single-cover { width: 180px; }`;

const coverStory = story(cover, {
  options: { scheme: ['light', 'dark'] } as const,
  style: [pageStyle],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-book-catalog><div class="single-cover">${element}</div></tv-book-catalog></div>`,
});
const meta = {
  title: 'Specifications/Books/Cover',
  ...coverStory,
  args: { ...coverStory.args, book: sampleBooks[0] } satisfies Parameters<typeof coverStory.render>[0],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

/** The first sample cover. */
export const CollectedEssays: Story = {};
/** A cover with an unknown author. */
export const UnknownAuthor: Story = { args: { book: sampleBooks[1] } };
