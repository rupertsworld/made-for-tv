/** Show each sample card on its own, using the card specification CSS. */
import type { StoryObj } from '@storybook/html-vite';
import card from '../../spec/tv-book-catalog/templates/card';
import { sampleBooks } from '../sample-books';
import { story } from '../helpers';

const pageStyle = `body { margin: 0; }
.page { min-height: 100vh; box-sizing: border-box; padding: 24px; color-scheme: light; background: light-dark(white, #202020); color: light-dark(#222, #eee); font-family: system-ui, sans-serif; }
.page[data-scheme="dark"] { color-scheme: dark; }
.single-card { max-width: 180px; margin: 0; padding: 0; list-style: none; }`;

const cardStory = story(card, {
  options: { scheme: ['light', 'dark'] } as const,
  style: [pageStyle],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-book-catalog><ul class="single-card">${element}</ul></tv-book-catalog></div>`,
});
const meta = {
  title: 'Specifications/Books/Card',
  ...cardStory,
  args: { ...cardStory.args, book: sampleBooks[0] } satisfies Parameters<typeof cardStory.render>[0],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

/** The first sample book and the default card data. */
export const CollectedEssays: Story = {};
/** A card with no named author. */
export const UnknownAuthor: Story = { args: { book: sampleBooks[1] } };
/** A card with a title and author that wrap. */
export const LongTitle: Story = { args: { book: sampleBooks[2] } };
