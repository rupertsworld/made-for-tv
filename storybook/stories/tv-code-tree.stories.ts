/** File tree as an independent specification part. */
import type { StoryObj } from '@storybook/html-vite';
import sidebar from '../../spec/tv-code/templates/sidebar';
import { story } from '../helpers';
import { sampleRows } from '../sample-code';

const treeStory = story(sidebar, {
  options: { scheme: ['light', 'dark'] } as const,
  style: ['body { margin: 0; } .page { min-height: 100vh; padding: 24px; box-sizing: border-box; color-scheme: light; background: Canvas; } .page[data-scheme="dark"] { color-scheme: dark; } .page tv-code { display: block; width: 300px; height: 560px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); } .page .cv-app { --cv-sidebar-width: 300px; }'],
  render: ({ scheme }, element) =>
    `<div class="page" data-scheme="${scheme}"><tv-code><div class="cv-app">${element}</div></tv-code></div>`,
});
const meta = {
  title: 'Specifications/Code/Parts/Tree',
  ...treeStory,
  args: { ...treeStory.args, label: 'daybook', rows: sampleRows.code, selected: 'src/main.ts' } satisfies Parameters<typeof treeStory.render>[0],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

export const SelectedFile: Story = {};
export const Dark: Story = { args: { scheme: 'dark' } };
