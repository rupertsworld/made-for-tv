/** Compare the spec's own interface markup and CSS with the built viewer. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import template from '../../../../spec/tv-code/templates/tv-code';
import { sampleBodies, sampleInputHtml, sampleRows } from '../../../../storybook/sample-code';

const markdownStyle = readFileSync(new URL('../../../../spec/tv-markdown/style.css', import.meta.url), 'utf8');
const elementStyle = [...new Set(template.style)].join('\n');
const pageStyle = `body { margin: 0; }
.page { box-sizing: border-box; min-height: 100vh; padding: 24px; color-scheme: light; background: Canvas; }
.page[data-scheme="dark"] { color-scheme: dark; }
.page tv-code { box-sizing: border-box; height: min(720px, calc(100dvh - 48px)); min-height: 400px; border: 1px solid color-mix(in srgb, CanvasText 15%, transparent); border-radius: 8px; }
.page[data-width="wide"] tv-code { max-width: 1080px; }
.page[data-width="narrow"] tv-code { max-width: 390px; }`;
const selectedPath = { code: 'src/main.ts', markdown: 'README.md', image: 'assets/cover.svg' } as const;

for (const open of ['code', 'markdown', 'image'] as const) {
  for (const variant of [{ scheme: 'light', width: 'wide' }, { scheme: 'dark', width: 'narrow' }] as const) {
    test(`${open} view matches its template in ${variant.scheme} ${variant.width}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/packages/tv-code/test/browser/fixture.html');
      const referenceMarkup = `<div class="page" data-scheme="${variant.scheme}" data-width="${variant.width}">${template.render({
        open, label: 'daybook', inputHtml: sampleInputHtml, rows: sampleRows,
        bodies: sampleBodies, narrow: variant.width === 'narrow',
      })}</div>`;
      await page.evaluate(({ inputHtml, pageStyle, open, variant }) => {
        const style = document.createElement('style');
        style.textContent = pageStyle;
        document.head.append(style);
        document.querySelector('#host')!.innerHTML = `<div class="page" data-scheme="${variant.scheme}" data-width="${variant.width}"><tv-code label="daybook" selected="${open === 'code' ? 'src/main.ts' : open === 'markdown' ? 'README.md' : 'assets/cover.svg'}">${inputHtml}</tv-code></div>`;
      }, { inputHtml: sampleInputHtml, pageStyle, open, variant });
      await expect(page.locator('tv-code .cv-app')).toBeVisible();
      await expect(page.locator('tv-code')).toHaveAttribute('selected', selectedPath[open]);
      await expect(page.locator(open === 'code' ? '.cv-t-keyword' : open === 'markdown' ? 'tv-markdown h1' : '.cv-media-image img').first()).toBeVisible();
      if (variant.width === 'narrow') await expect(page.locator('.cv-app')).toHaveClass(/cv-app-narrow/);
      const result = await page.evaluate(async ({ referenceMarkup, elementStyle, markdownStyle, pageStyle }) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 1280px; height: 900px; border: 0';
        const loaded = new Promise<void>(resolve => iframe.addEventListener('load', () => resolve(), { once: true }));
        iframe.srcdoc = `<!doctype html><html><head><style>${elementStyle}</style><style>${markdownStyle}</style><style>${pageStyle}</style></head><body>${referenceMarkup}</body></html>`;
        document.body.append(iframe);
        await loaded;
        const actual = document.querySelector('.page tv-code .cv-app')!;
        const reference = iframe.contentDocument!.querySelector('.page tv-code .cv-app')!;
        const shape = (root: Element): unknown => {
          const walk = (element: Element): unknown => ({
            tag: element.localName,
            attributes: [...element.attributes].map(attribute => [attribute.name,
              attribute.name === 'src' && element.localName === 'img' ? '[image]' :
              attribute.name === 'id' && attribute.value.startsWith('cv-finder-list-') ? '[finder-list]' :
              attribute.name === 'aria-controls' && attribute.value.startsWith('cv-finder-list-') ? '[finder-list]' :
              attribute.value]).sort(),
            text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
            children: [...element.children].map(walk),
          });
          return walk(root);
        };
        const styles = (root: Element): unknown => [
          '.cv-app', '.cv-sidebar', '.cv-row-selected', '.cv-pane-header', '.cv-pane-content',
          '.cv-code-view', '.cv-markdown-view', '.cv-media-image', '.cv-finder',
        ].map(selector => {
          const element = root.matches(selector) ? root : root.querySelector(selector);
          if (!element) return [selector, null];
          const computed = getComputedStyle(element);
          return [selector, computed.display, computed.color, computed.backgroundColor,
            computed.padding, computed.fontFamily, computed.fontSize, computed.gap,
            Math.round(element.getBoundingClientRect().width)];
        });
        return { actualShape: shape(actual), referenceShape: shape(reference),
          actualText: (actual as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
          referenceText: (reference as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
          actualStyles: styles(actual), referenceStyles: styles(reference) };
      }, { referenceMarkup, elementStyle, markdownStyle, pageStyle });
      expect(result.actualShape).toEqual(result.referenceShape);
      expect(result.actualText).toEqual(result.referenceText);
      expect(result.actualStyles).toEqual(result.referenceStyles);
    });
  }
}
