/** Compare the authored frame markup and specification CSS with the shipped elements. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Book, TvBookCatalogElement, TvBookDetailElement } from '../../src/tv-book-catalog';

const frame = readFileSync('frames/tv-book-catalog.frame', 'utf8');
const frameStyle = frame.match(/^style: \|\n((?:  .*\n)+)/m)?.[1]
  .split('\n').map(line => line.replace(/^  /, '')).join('\n');
if (!frameStyle) throw new Error('Missing frame page styles');
const books: Book[] = [
  { id: 'essays', title: 'Collected Essays', authors: ['A. Writer', 'B. Writer'],
    description: 'A complete description with line breaks.\n<b>Markup stays plain text.</b>',
    publicationDate: '2024-05', pageCount: 0, genre: 'Essays', rating: '4.2 / 5',
    sourceUrl: 'https://example.org/books/essays' },
  { id: 'unknown', title: 'An Unknown Author', authors: [], description: 'A book with unknown authors.' },
  { id: 'long', title: 'A Complete Title That Wraps Across Several Lines', authors: ['An Author With a Long Name'], description: 'A brief description that wraps across several lines.' },
];

for (const view of ['catalog', 'detail'] as const) {
  test(`built ${view} matches the frame in light, dark, narrow and overridden layouts`, async ({ page }) => {
    await page.goto('/packages/tv-book-catalog/test/browser/fixture.html');
    await page.waitForFunction(() => Boolean(window.fixture));
    const markup = frame.match(new RegExp(`<!-- ${view}-ready -->([\\s\\S]*?)<!-- /${view}-ready -->`))?.[1];
    if (!markup) throw new Error(`Missing ${view} reference markup`);
    for (const variant of [
      { scheme: 'light', width: 'wide', overrides: 'false' },
      { scheme: 'dark', width: 'narrow', overrides: 'false' },
      { scheme: 'dark', width: 'wide', overrides: 'true' },
    ]) {
      const comparison = await page.evaluate(({ markup, frameStyle, books, view, variant }) => {
        const style = document.createElement('style');
        style.textContent = frameStyle;
        document.head.append(style);
        const actualPage = document.createElement('div');
        actualPage.className = 'page';
        Object.assign(actualPage.dataset, variant);
        const content = document.createElement('div');
        content.className = 'content';
        const actual = document.createElement(`tv-book-${view}`) as TvBookCatalogElement | TvBookDetailElement;
        content.append(actual);
        actualPage.append(content);
        document.body.replaceChildren(actualPage);
        if (view === 'catalog') (actual as TvBookCatalogElement).books = books;
        else (actual as TvBookDetailElement).book = books[0];
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 1000px; height: 1200px; border: 0';
        return new Promise(resolve => {
          iframe.addEventListener('load', () => {
            const reference = iframe.contentDocument!.querySelector(`tv-book-${view}`)!;
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
            resolve({ actualShape: shape(actual), frameShape: shape(reference),
              actualStyles: styles(actual), frameStyles: styles(reference) });
          }, { once: true });
          iframe.srcdoc = `<!doctype html><html><head><link rel="stylesheet" href="/spec/tv-book-catalog/style.css"><style>${frameStyle}</style></head><body><div class="page" data-scheme="${variant.scheme}" data-width="${variant.width}" data-overrides="${variant.overrides}"><div class="content"><tv-book-${view}><div class="bc-content">${markup}</div><p class="bc-message" role="status"></p><p class="bc-message" role="alert"></p></tv-book-${view}></div></div></body></html>`;
          document.body.append(iframe);
        });
      }, { markup, frameStyle, books, view, variant }) as {
        actualShape: unknown; frameShape: unknown; actualStyles: unknown; frameStyles: unknown;
      };
      expect(comparison.actualShape, JSON.stringify(variant)).toEqual(comparison.frameShape);
      expect(comparison.actualStyles, JSON.stringify(variant)).toEqual(comparison.frameStyles);
    }
  });
}
