/** Compare the independent template markup and CSS with the shipped elements. */
import { expect, test } from '@playwright/test';
import template from '../../../../spec/tv-book-catalog/templates/tv-book-catalog';
import type { Book, TvBookCatalogElement, TvBookDetailElement } from '../../src/tv-book-catalog';

const testPageStyle = `body { margin: 0; }
.page { min-height: 100vh; box-sizing: border-box; padding: 24px; color-scheme: light; background: light-dark(white, #202020); color: light-dark(#222, #eee); font-family: system-ui, sans-serif; }
.page[data-scheme="dark"] { color-scheme: dark; }
.page[data-width="wide"] .content { max-width: 900px; }
.page[data-width="narrow"] .content { max-width: 240px; }
.page[data-overrides="true"] { --tv-book-catalog-font: Georgia, serif; --tv-book-catalog-gap: 18px; --tv-book-catalog-link: light-dark(#8a2244, #ffb3cd); }`;

const books = [
  { id: 'essays', title: 'Collected Essays', authors: ['A. Writer', 'B. Writer'],
    description: 'A complete description with line breaks.\n<b>Markup stays plain text.</b>',
    publicationDate: '2024-05', pageCount: 0, genre: 'Essays', rating: '4.2 / 5',
    sourceUrl: 'https://example.org/books/essays', sourceLabel: 'example.org', coverHue: 290 },
  { id: 'unknown', title: 'An Unknown Author', authors: [], description: 'A book with unknown authors.', coverHue: 330 },
  { id: 'long', title: 'A Complete Title That Wraps Across Several Lines', authors: ['An Author With a Long Name'], description: 'A brief description that wraps across several lines.', coverHue: 330 },
] satisfies (Book & { coverHue: number; sourceLabel?: string })[];

type PageVariant = { scheme: 'light' | 'dark'; width: 'wide' | 'narrow'; overrides: boolean };

for (const view of ['catalog', 'detail'] as const) {
  test(`built ${view} matches the template in light, dark, narrow and overridden layouts`, async ({ page }) => {
    await page.goto('/packages/tv-book-catalog/test/browser/fixture.html');
    await page.waitForFunction(() => Boolean(window.fixture));
    const variants: PageVariant[] = [
      { scheme: 'light', width: 'wide', overrides: false },
      { scheme: 'dark', width: 'narrow', overrides: false },
      { scheme: 'dark', width: 'wide', overrides: true },
    ];
    for (const variant of variants) {
      const referenceBody = `<div class="page" data-scheme="${variant.scheme}" data-width="${variant.width}" data-overrides="${variant.overrides}">
<div class="content">
<h1 tabindex="-1">Books</h1>
${template.render({ view, status: 'ready', books, book: books[0] })}
</div>
</div>`;
      const comparison = await page.evaluate(({ referenceBody, templateStyle, pageStyle, books, view, variant }) => {
        const style = document.createElement('style');
        style.textContent = pageStyle;
        document.head.append(style);
        const actualPage = document.createElement('div');
        actualPage.className = 'page';
        Object.assign(actualPage.dataset, variant);
        const content = document.createElement('div');
        content.className = 'content';
        const heading = document.createElement('h1');
        heading.tabIndex = -1;
        heading.textContent = 'Books';
        const actual = document.createElement(`tv-book-${view}`) as TvBookCatalogElement | TvBookDetailElement;
        content.append(heading, actual);
        actualPage.append(content);
        document.body.replaceChildren(actualPage);
        if (view === 'catalog') (actual as TvBookCatalogElement).books = books;
        else (actual as TvBookDetailElement).book = books[0];
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 1000px; height: 1200px; border: 0';
        return new Promise(resolve => {
          iframe.addEventListener('load', () => {
            const reference = iframe.contentDocument!.querySelector(`tv-book-${view}`)!;
            const readyPartSelector = view === 'catalog' ? '.bc-grid' : '.bc-record';
            const shape = (element: Element): unknown => ({
              tag: element.localName,
              attributes: [...element.attributes].filter(attribute => attribute.name !== 'style')
                .map(attribute => [attribute.name, attribute.value]).sort(),
              hue: (element as HTMLElement).style.getPropertyValue('--_cover-hue'),
              text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
              children: [...element.children].map(shape),
            });
            const styles = (element: Element): unknown => [...element.querySelectorAll('*')].map(child => {
              const style = getComputedStyle(child);
              return [child.localName, style.display, style.color, style.fontFamily, style.fontSize,
                style.padding, style.gap, style.gridTemplateColumns, style.aspectRatio,
                Math.round(child.getBoundingClientRect().width)];
            });
            resolve({ actualShape: shape(actual), referenceShape: shape(reference),
              actualReadyPart: shape(actual.querySelector(readyPartSelector)!),
              referenceReadyPart: shape(reference.querySelector(readyPartSelector)!),
              actualStyles: styles(actual), referenceStyles: styles(reference) });
          }, { once: true });
          iframe.srcdoc = `<!doctype html><html><head><style>${templateStyle}</style><style>${pageStyle}</style></head><body>${referenceBody}</body></html>`;
          document.body.append(iframe);
        });
      }, { referenceBody, templateStyle: [...new Set(template.style)].join('\n'), pageStyle: testPageStyle, books, view, variant }) as {
        actualShape: unknown; referenceShape: unknown; actualReadyPart: unknown; referenceReadyPart: unknown;
        actualStyles: unknown; referenceStyles: unknown;
      };
      expect(comparison.actualShape, JSON.stringify(variant)).toEqual(comparison.referenceShape);
      expect(comparison.actualReadyPart, JSON.stringify(variant)).toEqual(comparison.referenceReadyPart);
      expect(comparison.actualStyles, JSON.stringify(variant)).toEqual(comparison.referenceStyles);
    }
  });
}
