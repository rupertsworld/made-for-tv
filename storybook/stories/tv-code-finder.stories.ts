/** File finder panel as an independent specification part. */
import type { StoryObj } from '@storybook/html-vite';
import finder from '../../spec/tv-code/templates/finder';
import { story } from '../helpers';

const finderStory = story(finder, {
  options: { scheme: ['light', 'dark'] } as const,
  style: ['body { margin: 0; } .page { min-height: 100vh; padding: 24px; box-sizing: border-box; color-scheme: light; background: Canvas; } .page[data-scheme="dark"] { color-scheme: dark; } .page tv-code { display: block; width: min(740px, 100%); height: 360px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); } .page .cv-app { position: relative; height: 100%; }'],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-code><div class="cv-app">${element}</div></tv-code></div>`,
});
const meta = {
  title: 'Specifications/Code/Parts/Finder',
  ...finderStory,
  args: { ...finderStory.args, open: true, query: 'main', results: [
    { path: 'src/main.ts', icon: 'fileCode' },
    { path: 'README.md', icon: 'fileText' },
  ] } satisfies Parameters<typeof finderStory.render>[0],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

export const MatchingFiles: Story = {};
export const Dark: Story = { args: { scheme: 'dark' } };
