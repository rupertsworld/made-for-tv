/** Storybook presentation states for the independent book template. */
import type { StoryObj } from '@storybook/html-vite';
import template from '../../spec/tv-book-catalog/templates/tv-book-catalog';
import { sampleBooks } from '../sample-books';
import { story } from '../helpers';

const pageStyle = `body { margin: 0; }
.page { min-height: 100vh; box-sizing: border-box; padding: 24px; color-scheme: light; background: light-dark(white, #202020); color: light-dark(#222, #eee); font-family: system-ui, sans-serif; }
.page[data-scheme="dark"] { color-scheme: dark; }
.page[data-width="wide"] .content { max-width: 900px; }
.page[data-width="narrow"] .content { max-width: 240px; }
.page[data-overrides="true"] { --tv-book-catalog-font: Georgia, serif; --tv-book-catalog-gap: 18px; --tv-book-catalog-link: light-dark(#8a2244, #ffb3cd); }`;

const catalogStory = story(template, {
  options: {
    scheme: ['light', 'dark'],
    width: ['wide', 'narrow'],
    overrides: [false, true],
  } as const,
  style: [pageStyle],
  render: ({ scheme, width, overrides }, element) =>
    `<div class="page" data-scheme="${scheme}" data-width="${width}" data-overrides="${overrides}">
<div class="content">
<h1 tabindex="-1">Books</h1>
${element}
</div>
</div>`,
});
const meta = {
  title: 'Specifications/Books/Catalog',
  ...catalogStory,
  args: { ...catalogStory.args, books: sampleBooks, book: sampleBooks[0] } satisfies Parameters<typeof catalogStory.render>[0],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'Book cards and a full inline record, styled by the template. Press Tab to inspect focus.' } },
  },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

/** Catalog with all sample books. */
export const CatalogReady: Story = {};
/** Catalog without books. */
export const CatalogEmpty: Story = { args: { status: 'empty' } };
/** Catalog while loading. */
export const CatalogLoading: Story = { args: { status: 'loading' } };
/** Catalog after an error. */
export const CatalogError: Story = { args: { status: 'error' } };
/** Full sample book record. */
export const DetailReady: Story = { args: { view: 'detail' } };
/** Detail without a selected book. */
export const DetailEmpty: Story = { args: { view: 'detail', status: 'empty' } };
/** Detail while loading. */
export const DetailLoading: Story = { args: { view: 'detail', status: 'loading' } };
/** Detail after an error. */
export const DetailError: Story = { args: { view: 'detail', status: 'error' } };
/** Dark catalog colours. */
export const Dark: Story = { args: { scheme: 'dark' } };
/** Catalog in a narrow page column. */
export const Narrow: Story = {
  args: { width: 'narrow' },
  parameters: {
    viewport: {
      options: {
        catalogNarrow: {
          name: 'Catalog narrow',
          styles: { width: '320px', height: '400px' },
          type: 'other',
        },
      },
    },
  },
  globals: { viewport: { value: 'catalogNarrow', isRotated: false } },
};
/** Catalog with page-supplied variables. */
export const OverriddenVariables: Story = { args: { overrides: true } };
