/** Connect an element specification and a demo page to Storybook. */
import type { Meta } from '@storybook/html-vite';
import type { Options, Template } from '../spec/types';

type Args<O extends Options> = { [K in keyof O]: O[K][number] };
const sheetCache = new Map<string, CSSStyleSheet>();

/** Reuse one constructable stylesheet per distinct CSS string. */
function sheetFor(css: string): CSSStyleSheet {
  let sheet = sheetCache.get(css);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheetCache.set(css, sheet);
  }
  return sheet;
}

/** Build defaults, controls and rendering from two independent option lists. */
export function story<const T extends Options, const P extends Options, TArgs extends Args<T>>(
  template: Template<TArgs> & { options: T },
  page: { options: P; style: readonly string[]; render(args: NoInfer<Args<P>>, element: string): string },
) {
  type StoryArgs = TArgs & Args<P>;
  const entries = Object.entries({ ...template.options, ...page.options });
  const args = Object.fromEntries(entries.map(([name, values]) => [name, values[0]])) as Args<T> & Args<P>;
  const argTypes = Object.fromEntries(entries.map(([name, values]) => [name,
    values.length === 2 && values[0] === false && values[1] === true
      ? { control: 'boolean' }
      : { control: 'select', options: values },
  ])) as Meta<StoryArgs>['argTypes'];

  const pageNames = new Set(Object.keys(page.options));

  return {
    args,
    argTypes,
    render: (allArgs: StoryArgs): string => {
      document.adoptedStyleSheets = [...new Set([...template.style, ...page.style])].map(sheetFor);
      const entries = Object.entries(allArgs);
      const pageArgs = Object.fromEntries(entries.filter(([name]) => pageNames.has(name))) as Args<P>;
      const templateArgs = Object.fromEntries(entries.filter(([name]) => !pageNames.has(name))) as TArgs;
      return page.render(pageArgs, template.render(templateArgs));
    },
  };
}
