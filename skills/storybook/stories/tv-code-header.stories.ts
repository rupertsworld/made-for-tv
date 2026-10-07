/** File pane header as an independent specification part. */
import type { StoryObj } from '@storybook/html-vite';
import header from '../../spec/tv-code/templates/header';
import { story } from '../helpers';

const headerStory = story(header, {
  options: { scheme: ['light', 'dark'] } as const,
  style: ['body { margin: 0; } .page { min-height: 100vh; padding: 24px; box-sizing: border-box; color-scheme: light; background: Canvas; } .page[data-scheme="dark"] { color-scheme: dark; } .page tv-code { display: block; width: min(740px, 100%); height: 120px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }'],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-code><section class="cv-pane">${element}</section></tv-code></div>`,
});
const meta = {
  title: 'Specifications/Code/Parts/Header',
  ...headerStory,
  args: { ...headerStory.args, path: 'src/main.ts', view: 'code' } satisfies Parameters<typeof headerStory.render>[0],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

export const Code: Story = {};
export const Markdown: Story = { args: { path: 'README.md', view: 'markdown' } };
export const Image: Story = { args: { path: 'assets/cover.svg', view: 'image' } };
