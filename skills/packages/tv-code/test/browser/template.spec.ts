/** Compare the spec's own interface markup and CSS with the built viewer. */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import template from '../../../../spec/tv-code/templates/tv-code';
import header from '../../../../spec/tv-code/templates/header';
import sidebar from '../../../../spec/tv-code/templates/sidebar';
import { stylesheet } from '../../../../spec/types';
import { sampleBodies, sampleInputHtml, sampleRows } from '../../../../storybook/sample-code';

const markdownStyle = readFileSync(new URL('../../../../spec/tv-markdown/style.css', import.meta.url), 'utf8');
const elementStyle = stylesheet(template.style);
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

test('a status letter and the header of a changed file match their templates', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/packages/tv-code/test/browser/fixture.html');
  const rows = [
    { path: 'b.ts', name: 'b.ts', kind: 'file', level: 1, icon: 'fileCode' },
    { path: 'new.ts', name: 'new.ts', kind: 'file', level: 1, icon: 'fileCode', status: 'added' },
  ] as const;
  const reference = {
    rows: sidebar.render({ label: 'Files', rows, selected: 'new.ts' }),
    diff: header.render({ path: 'new.ts', view: 'code', diff: { mode: 'diff', additions: 1, deletions: 0 } }),
    source: header.render({ path: 'new.ts', view: 'code', diff: { mode: 'source', additions: 1, deletions: 0 } }),
    markdown: header.render({ path: 'README.md', view: 'markdown', diff: { mode: 'diff' } }),
    image: header.render({ path: 'cover.png', view: 'image', diff: { mode: 'diff', additions: 1, deletions: 1 } }),
  };
  await page.locator('#host').evaluate(host => {
    host.innerHTML = '<tv-code></tv-code>';
    const viewer = host.firstElementChild as any;
    // An added file, and equal versions, which have no counts.
    const versions: Record<string, object> = { 'new.ts': { after: 'new' }, 'README.md': { before: '# Readme', after: '# Readme' }, 'cover.png': { before: 'old', after: 'new' } };
    viewer.diff = (path: string) => versions[path] ?? null;
    viewer.files = [{ path: 'b.ts', content: 'b' }, { path: 'new.ts', content: 'new', status: 'added' }, { path: 'README.md', content: '# Readme', status: 'modified' }, { path: 'cover.png', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', status: 'modified' }];
  });
  await page.locator('.cv-row[data-path="new.ts"]').click();
  await expect(page.locator('.cv-pane-diff:not(.cv-pane-diff-pending)')).toBeVisible();
  const shapes = async (selector: string, html: string) => page.evaluate(({ selector, html }) => {
    const shape = (element: Element): unknown => ({
      tag: element.localName,
      attributes: [...element.attributes].map(attribute => [attribute.name, attribute.value]).sort(),
      text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim(),
      children: [...element.children].map(shape),
    });
    const template = document.createElement('template');
    template.innerHTML = html;
    return {
      actual: [...document.querySelectorAll(`tv-code ${selector}`)].map(shape),
      reference: [...template.content.querySelectorAll(selector)].map(shape),
    };
  }, { selector, html });
  const tree = await shapes('.cv-row[data-path="b.ts"], .cv-row[data-path="new.ts"]', reference.rows);
  expect(tree.actual.length).toBe(2);
  expect(tree.actual).toEqual(tree.reference);
  const diff = await shapes('.cv-pane-header', reference.diff);
  expect(diff.actual).toEqual(diff.reference);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('.cv-code-text')).toHaveText('new');
  const source = await shapes('.cv-pane-header', reference.source);
  expect(source.actual).toEqual(source.reference);
  await page.locator('.cv-row[data-path="README.md"]').click();
  await expect(page.locator('.cv-pane-diff:not(.cv-pane-diff-pending)')).toHaveText('No differences');
  const markdown = await shapes('.cv-pane-header', reference.markdown);
  expect(markdown.actual).toEqual(markdown.reference);
  await page.locator('.cv-row[data-path="cover.png"]').click();
  await expect(page.locator('.cv-pane-diff:not(.cv-pane-diff-pending)')).toBeVisible();
  const image = await shapes('.cv-pane-header', reference.image);
  expect(image.actual).toEqual(image.reference);
});
