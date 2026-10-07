/** Demo pages for the independent tv-code element specification. */
import type { StoryObj } from '@storybook/html-vite';
import markdownStyle from '../../spec/tv-markdown/style.css?raw';
import template from '../../spec/tv-code/templates/tv-code';
import { story } from '../helpers';
import { sampleBodies, sampleInputHtml, sampleRows } from '../sample-code';

const pageStyle = `body { margin: 0; }
.page { box-sizing: border-box; min-height: 100vh; padding: 24px; color-scheme: light; background: Canvas; }
.page[data-scheme="dark"] { color-scheme: dark; }
.page tv-code { box-sizing: border-box; height: min(720px, calc(100dvh - 48px)); min-height: 400px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: 8px; }
.page[data-width="wide"] tv-code { max-width: 1080px; }
.page[data-width="narrow"] tv-code { max-width: 390px; }`;

const codeStory = story(template, {
  options: { scheme: ['light', 'dark'], width: ['wide', 'narrow'] } as const,
  style: [markdownStyle, pageStyle],
  render: ({ scheme, width }, element) =>
    `<div class="page" data-scheme="${scheme}" data-width="${width}">${element}</div>`,
});
const meta = {
  title: 'Specifications/Code/Viewer',
  ...codeStory,
  args: {
    ...codeStory.args,
    label: 'daybook',
    inputHtml: sampleInputHtml,
    rows: sampleRows,
    bodies: sampleBodies,
  } satisfies Parameters<typeof codeStory.render>[0],
  // The demo page controls the element's width. Reflect that viewport state
  // in the static specification markup, as the live element does on resize.
  render: (args: Parameters<typeof codeStory.render>[0]) =>
    codeStory.render({ ...args, narrow: args.width === 'narrow' }),
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

/** Highlighted source in the file pane. */
export const Code: Story = {};
/** Rendered Markdown in the file pane. */
export const Markdown: Story = { args: { open: 'markdown' } };
/** An image in the file pane. */
export const Image: Story = { args: { open: 'image' } };
/** Dark system colours. */
export const Dark: Story = { args: { scheme: 'dark' } };
/** The sidebar closes when the element is narrow. */
export const Narrow: Story = { args: { width: 'narrow' } };
