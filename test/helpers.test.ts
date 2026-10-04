/** Check the shared Storybook wiring for template and demo page settings. */
import type { StoryObj } from '@storybook/html-vite';
import { expect, test, vi } from 'vitest';
import { story } from '../storybook/helpers';

const templateOptions = { view: ['grid', 'detail'] } as const;
type TemplateArgs = { [K in keyof typeof templateOptions]: (typeof templateOptions)[K][number] };
const pageOptions = { scheme: ['light', 'dark'], overrides: [false, true] } as const;
type PageArgs = { [K in keyof typeof pageOptions]: (typeof pageOptions)[K][number] };

const templateRender = vi.fn(({ view, book }: TemplateArgs & { book?: string }) =>
  `<x-${view}>${book ?? ''}</x-${view}>`);
const pageRender = vi.fn(({ scheme, overrides }: PageArgs, element: string) =>
  `<main data-scheme="${scheme}" data-overrides="${overrides}">${element}</main>`);
const meta = {
  title: 'Helper example',
  ...story(
    { options: templateOptions, style: ['x-grid {}', 'shared {}'], render: templateRender },
    { options: pageOptions, style: ['shared {}', 'main {}'], render: pageRender },
  ),
};

test('uses first options as defaults, builds controls and passes data to the template', () => {
  const oldSheets = document.adoptedStyleSheets;
  const originalSheet = globalThis.CSSStyleSheet;
  class TestSheet {
    css = '';
    replaceSync(css: string): void { this.css = css; }
  }
  vi.stubGlobal('CSSStyleSheet', TestSheet);
  Object.defineProperty(document, 'adoptedStyleSheets', { configurable: true, writable: true, value: [] });
  try {
    expect(meta.args).toEqual({ view: 'grid', scheme: 'light', overrides: false });
    expect(meta.argTypes).toEqual({
      view: { control: 'select', options: templateOptions.view },
      scheme: { control: 'select', options: pageOptions.scheme },
      overrides: { control: 'boolean' },
    });
    expect(meta.render({ view: 'detail', book: 'Long title', scheme: 'dark', overrides: true }))
      .toBe('<main data-scheme="dark" data-overrides="true"><x-detail>Long title</x-detail></main>');
    expect(document.adoptedStyleSheets.map(sheet => (sheet as unknown as TestSheet).css))
      .toEqual(['x-grid {}', 'shared {}', 'main {}']);
    const sheets = [...document.adoptedStyleSheets];
    meta.render({ view: 'grid', scheme: 'light', overrides: false });
    expect(document.adoptedStyleSheets).toEqual(sheets);
    expect(templateRender).toHaveBeenCalledWith({ view: 'detail', book: 'Long title' });
    expect(pageRender).toHaveBeenCalledWith({ scheme: 'dark', overrides: true }, '<x-detail>Long title</x-detail>');
  } finally {
    Object.defineProperty(document, 'adoptedStyleSheets', { configurable: true, value: oldSheets });
    vi.stubGlobal('CSSStyleSheet', originalSheet);
  }
});

// These assignments are compiled by the root typecheck but never run.
if (false) {
  type ExampleStory = StoryObj<Parameters<typeof meta.render>[0]>;
  const valid: ExampleStory = { args: { view: 'detail', book: 'Long title', scheme: 'dark' } };
  // @ts-expect-error Invalid option values must fail the typecheck.
  const invalidValue: ExampleStory = { args: { view: 'list' } };
  // @ts-expect-error Unknown settings must fail the typecheck.
  const unknownSetting: ExampleStory = { args: { density: 'compact' } };
  void [valid, invalidValue, unknownSetting];
}
