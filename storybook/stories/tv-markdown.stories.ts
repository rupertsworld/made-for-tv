/** Show the specified Markdown stylesheet on representative rendered HTML. */
import type { StoryObj } from '@storybook/html-vite';
import css from '../../spec/tv-markdown/style.css?raw';
import { frontmatterPanel, sampleBody } from '../sample-markdown';
import { story } from '../helpers';

const pageStyle = `body { margin: 0; }
.page { box-sizing: border-box; min-height: 100vh; padding: 32px; color-scheme: light; background: light-dark(white, oklch(20.5% 0 0)); }
.page[data-scheme="dark"] { color-scheme: dark; }
.page[data-width="wide"] tv-markdown { max-width: 720px; }
.page[data-width="narrow"] tv-markdown { max-width: 340px; }
.page[data-overrides="true"] tv-markdown {
  --tv-markdown-font: Georgia, "Times New Roman", serif;
  --tv-markdown-link: oklch(55% 0.18 30);
  --tv-markdown-heading-weight: 700;
  --tv-markdown-block-space: 16px;
}`;

const frontmatterOptions = { frontmatter: ['shown', 'hidden'] } as const;
const markdownStory = story({
  options: frontmatterOptions,
  style: [css],
  render: ({ frontmatter }: { frontmatter: (typeof frontmatterOptions.frontmatter)[number] }) =>
    `<tv-markdown${frontmatter === 'shown' ? ' show-frontmatter' : ''}>\n${frontmatter === 'shown' ? frontmatterPanel : ''}\n${sampleBody}\n</tv-markdown>`,
}, {
  options: {
    scheme: ['light', 'dark'],
    width: ['wide', 'narrow'],
    overrides: [false, true],
  } as const,
  style: [pageStyle],
  render: ({ scheme, width, overrides }, element) =>
    `<div class="page" data-scheme="${scheme}" data-width="${width}" data-overrides="${overrides}">\n${element}\n</div>`,
});
const meta = {
  title: 'Specifications/tv-markdown',
  ...markdownStory,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: 'The sample HTML shows the specified stylesheet. Package tests cover Markdown rendering.' } },
  },
};

export default meta;
type Story = StoryObj<Parameters<typeof meta.render>[0]>;

export const Default: Story = {};
export const Dark: Story = { args: { scheme: 'dark' } };
export const Narrow: Story = { args: { width: 'narrow' } };
export const OverriddenVariables: Story = { args: { overrides: true } };
export const FrontmatterHidden: Story = { args: { frontmatter: 'hidden' } };
