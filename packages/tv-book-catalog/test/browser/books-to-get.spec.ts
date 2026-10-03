/** Exercise the deployed Books to get page without changing its vault records. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const artifact = path.resolve('../../artifacts/books-to-get');
test.skip(!existsSync(path.join(artifact, 'index.html')), 'Local Books to get artifact is not installed');
const recordPath = 'references/a space & café';
let title: string;
let description: unknown;
let body: string;
async function ready(page: Page, query = '', invalidDescription?: { value: unknown }) {
  title = 'Alpha';
  description = invalidDescription ? invalidDescription.value : 'A description\n<b>Literal markup</b>';
  body = '**Body Author · 1999 · Body Genre**\nBody-only description';
  await page.route('**/books-to-get/**', route => {
    const file = new URL(route.request().url()).pathname.split('/').pop() || 'index.html';
    return route.fulfill({ body: readFileSync(path.join(artifact, file)),
      contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.route('**/canonical/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('http://rubot/vault/**', route => {
    const requested = decodeURIComponent(new URL(route.request().url()).pathname.slice('/vault/'.length));
    const record = requested === 'collections/books-to-get'
      ? { fields: { title: 'Books to get', items: [{ $type: 'ref', path: recordPath }] } }
      : { body, fields: { title, author: 'A Writer', description, cover_image: 'https://covers.example/cover.svg' } };
    return route.fulfill({ json: record });
  });
  await page.route('https://covers.example/**', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="navy"/></svg>' }));
  await page.routeWebSocket('ws://rubot/vault/', socket => {
    socket.onMessage(() => {});
    // Tests request a refetch through the established live connection.
    (page as Page & { updateBooks?: () => void }).updateBooks = () => socket.send('{"type":"modified","path":"references/elsewhere"}');
  });
  await page.goto('/books-to-get/index.html' + query);
  if (invalidDescription) await expect(page.locator('#catalog [role="alert"]')).toHaveText('Could not load books.');
  else await expect(page.locator('#result-count')).toHaveText(/\d of 1/);
}

test('page adapts description only from fields, renders literal text on cards and detail, and never parses body metadata', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#catalog .bc-authors + .bc-description')).toHaveText('A description\n<b>Literal markup</b>');
  await expect(page.locator('#catalog b')).toHaveCount(0);
  await page.locator('#catalog button').click();
  await expect(page.locator('#detail .bc-authors + .bc-description')).toHaveText('A description\n<b>Literal markup</b>');
  await expect(page.locator('#detail dt')).toHaveText(['ID']);
  await expect(page.locator('#detail')).not.toContainText('Body-only');
  await expect(page.locator('#detail')).not.toContainText('List name');
});

for (const value of [undefined, null, '', '  \n ', 42, {}, ['description']]) {
  test(`invalid description ${JSON.stringify(value)} safely fails without a body fallback`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page, '', { value });
    await expect(page.locator('#catalog button')).toHaveCount(0);
    await expect(page.locator('#retry')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Body-only description');
    expect(errors).toEqual([]);
  });
}

test('invalid description on refresh keeps the last valid collection and retries safely', async ({ page }) => {
  await ready(page);
  description = null;
  (page as Page & { updateBooks?: () => void }).updateBooks!();
  await expect(page.locator('#refresh-error')).toBeVisible();
  await expect(page.locator('#catalog .bc-description')).toHaveText('A description\n<b>Literal markup</b>');
  description = 'Recovered description';
  await page.locator('#retry').click();
  await expect(page.locator('#catalog .bc-description')).toHaveText('Recovered description');
  await expect(page.locator('#refresh-error')).toBeHidden();
});

test('real page encodes record paths, preserves query parameters, filters and restores native history focus', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await ready(page, '?keep=a%26b');
  expect(requests.some(url => url.endsWith('/references/a%20space%20%26%20caf%C3%A9'))).toBe(true);
  await page.locator('#search').fill('Alpha');
  await expect(page).toHaveURL(/q=Alpha/);
  const filteredUrl = page.url();
  await page.locator('#catalog button').click();
  const detailUrl = page.url();
  expect(new URL(detailUrl).searchParams.get('keep')).toBe('a&b');
  expect(new URL(detailUrl).searchParams.get('q')).toBe('Alpha');
  await expect(page.locator('#detail h2')).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.locator('#catalog button')).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.locator('#detail h2')).toBeFocused();
  await page.reload();
  await expect(page.locator('#detail h2')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#catalog button')).toBeFocused();
});

test('direct missing detail adds no return controls; encoded filter URLs and clear search work', async ({ page }) => {
  await ready(page, '?book=missing&q=A%26B%20%2B%20caf%C3%A9&keep=x%26y');
  await expect(page.locator('#detail')).toBeFocused();
  await expect(page.locator('#detail')).toContainText('This book is no longer in the collection.');
  await expect(page.locator('#heading-row')).toBeHidden();
  await expect(page.locator('#filters')).toBeHidden();
  await expect(page.locator('header, #catalog-link')).toHaveCount(0);
  await page.goto('/books-to-get/index.html?q=A%26B%20%2B%20caf%C3%A9&keep=x%26y');
  await expect(page.locator('#search')).toHaveValue('A&B + café');
  await expect(page.locator('#catalog')).toContainText('No books match your search.');
  await page.locator('#clear-filter').click();
  await expect(page.locator('#search')).toBeFocused();
  await expect(page.locator('#catalog button')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('keep')).toBe('x&y');
});

test('external cover is not cropped and live updates preserve relevant focus without stealing search focus', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#catalog img')).toHaveJSProperty('naturalWidth', 400);
  expect(await page.locator('#catalog img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  await page.locator('#catalog button').focus();
  title = 'Updated Alpha';
  (page as Page & { updateBooks?: () => void }).updateBooks!();
  await expect(page.locator('#catalog .bc-title')).toHaveText(title);
  await expect(page.locator('#catalog button')).toBeFocused();
  await page.locator('#search').focus();
  title = 'Final Alpha';
  (page as Page & { updateBooks?: () => void }).updateBooks!();
  await expect(page.locator('#catalog .bc-title')).toHaveText(title);
  await expect(page.locator('#search')).toBeFocused();
});

for (const width of [240, 375, 1440]) {
  test(`inline catalog heading, count and right-aligned search fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    await expect(page.locator('#catalog-heading')).toHaveText('Books to read');
    await expect(page).toHaveTitle('Books to read');
    await expect(page.locator('#result-count')).toHaveText('1 of 1');
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return { heading: rect('#catalog-heading').left, cover: rect('#catalog .bc-cover').left,
        countRight: rect('#result-count').right, rowRight: rect('#heading-row').right,
        searchLeft: rect('.search').left, countTop: rect('#result-count').top,
        searchTop: rect('.search').top, headingTop: rect('#catalog-heading').top,
        searchRight: rect('.search').right, filterRight: rect('#filters').right,
        filterTop: rect('#filters').top, headingBottom: rect('#heading-row').bottom,
        countInFilters: document.querySelector('#filters')!.contains(document.querySelector('#result-count')),
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.heading).toBeCloseTo(layout.cover, 1);
    expect(layout.searchRight).toBeCloseTo(layout.rowRight, 1);
    expect(layout.searchRight).toBeCloseTo(layout.filterRight, 1);
    if (width === 1440) {
      expect(layout.countRight).toBeLessThan(layout.searchLeft);
      expect(Math.abs(layout.headingTop - layout.searchTop)).toBeLessThan(16);
      expect(Math.abs(layout.countTop - layout.searchTop)).toBeLessThan(16);
    }
    expect(layout.countInFilters).toBe(false);
    expect(layout.overflow).toBe(false);
    await page.locator('#search').fill('nothing matches');
    await expect(page.locator('#result-count')).toHaveText('0 of 1');
    await page.locator('#clear-filter').click();
    await expect(page.locator('#result-count')).toHaveText('1 of 1');
  });
}
