/** Chromium tests exercise shipped assets, native controls and page-owned history/focus. */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import template from '../../../../spec/tv-book-catalog/templates/tv-book-catalog';
import type { Book, TvBookCatalogElement, TvBookDetailElement } from '../../src/tv-book-catalog';

declare global {
  interface Window {
    fixture: { catalog: TvBookCatalogElement; detail: TvBookDetailElement; books: Book[] };
    requests: { type: string; id: string | null; sameBook: boolean; sameTrigger: boolean;
      bubbles: boolean; composed: boolean; cancelable: boolean; custom: boolean }[];
  }
}

async function ready(page: Page): Promise<void> {
  await page.goto('/packages/tv-book-catalog/test/browser/fixture.html');
  await page.waitForFunction(() => Boolean(window.fixture));
}

async function isolate(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Fresh instances leave page navigation out of tests for element requests.
    const catalog = document.createElement('tv-book-catalog') as TvBookCatalogElement;
    const detail = document.createElement('tv-book-detail') as TvBookDetailElement;
    const books = window.fixture.books;
    document.querySelector('main')!.replaceChildren(catalog, detail);
    catalog.books = books;
    detail.book = books[0];
    window.fixture = { catalog, detail, books };
    window.requests = [];
    for (const type of ['bookactivate']) {
      document.querySelector('main')!.addEventListener(type, event => {
        const request = event as CustomEvent;
        window.requests.push({ type, id: request.detail.id,
          sameBook: type !== 'bookactivate' || request.detail.book === books[0],
          sameTrigger: request.detail.trigger === document.activeElement,
          bubbles: request.bubbles, composed: request.composed, cancelable: request.cancelable,
          custom: request instanceof CustomEvent });
      });
    }
  });
}

test('ships the composed CSS and a standalone module', async ({ page }) => {
  expect(readFileSync('skills/tv-book-catalog/tv-book-catalog.css', 'utf8'))
    .toBe([...new Set(template.style)].join('\n'));
  await ready(page);
  expect(await page.evaluate(async url => {
    const first = customElements.get('tv-book-catalog');
    await import(url);
    return first === customElements.get('tv-book-catalog') && Boolean(customElements.get('tv-book-detail'));
  }, '/skills/tv-book-catalog/tv-book-catalog.js?copy=2')).toBe(true);
});

test('assignments synchronously replace children, render after clear/state changes, and never bubble or move focus', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const { catalog, books } = window.fixture;
    document.querySelector<HTMLButtonElement>('#outside')!.focus();
    const snapshots: string[] = [];
    let bubbled = 0;
    document.body.addEventListener('render', () => bubbled++);
    catalog.addEventListener('render', event => {
      if (event.constructor !== Event || event.bubbles) throw new Error('Wrong render event');
      snapshots.push(catalog.textContent!);
    });
    catalog.books = books;
    const identity = catalog.books === books;
    Object.assign(books[0], { title: 'Changed in place' });
    const unchanged = !catalog.textContent!.includes('Changed in place');
    catalog.books = books;
    catalog.books = [];
    catalog.books = null;
    catalog.books = undefined;
    catalog.status = 'loading';
    catalog.message = '<b>Waiting</b>';
    return { identity, unchanged, snapshots, bubbled, focus: document.activeElement?.id,
      markup: catalog.querySelector('b') !== null, shadow: catalog.shadowRoot !== null };
  });
  expect(result.identity && result.unchanged).toBe(true);
  expect(result.snapshots).toHaveLength(7);
  expect(result.snapshots.slice(2)).toEqual(['No books to show.', 'No books to show.', 'No books to show.',
    'Loading books…', '<b>Waiting</b>']);
  expect(result).toMatchObject({ bubbled: 0, focus: 'outside', markup: false, shadow: false });
});

test('cards are list items with one native button; pointer, modifiers, Enter and Space produce one request each', async ({ page }) => {
  await ready(page);
  await isolate(page);
  await expect(page.locator('tv-book-catalog li')).toHaveCount(3);
  await expect(page.locator('tv-book-catalog li button')).toHaveCount(3);
  await expect(page.locator('tv-book-catalog a, [role="grid"]')).toHaveCount(0);
  const button = page.getByRole('button', { name: 'A complete title — First Author, Second Author', exact: true });
  await button.click();
  await button.click({ modifiers: ['Control'] });
  await button.press('Enter');
  await button.press('Space');
  await button.press('Escape');
  await button.press('ArrowRight');
  const requests = await page.evaluate(() => window.requests);
  expect(requests).toHaveLength(4);
  for (const request of requests) expect(request).toEqual({ type: 'bookactivate', id: 'a " ] # <id>',
    sameBook: true, sameTrigger: true, bubbles: true, composed: true, cancelable: false, custom: true });
  await expect(button).toBeFocused();
});

test('cards show literal descriptions immediately beneath authors without list metadata', async ({ page }) => {
  await ready(page);
  const card = page.locator('tv-book-catalog button').first();
  await expect(card.locator('.bc-authors + .bc-description')).toHaveText('A full description.\n<b>Literal markup</b>');
  await expect(card.locator('b')).toHaveCount(0);
  await expect(card).not.toContainText('List name');
  await card.click();
  await expect(page.locator('tv-book-detail .bc-authors + .bc-description')).toHaveText('A full description.\n<b>Literal markup</b>');
});

test('Tab reaches the source link directly and detail has no navigation buttons in any state', async ({ page }) => {
  await ready(page);
  await isolate(page);
  await page.locator('tv-book-catalog button').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('tv-book-detail .bc-source')).toBeFocused();
  await expect(page.locator('tv-book-detail button')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('tv-book-catalog button').last()).toBeFocused();
  for (const status of ['loading', 'error', 'ready'] as const) {
    await page.evaluate(status => {
      window.fixture.detail.status = status;
      if (status === 'ready') window.fixture.detail.book = null;
    }, status);
    await expect(page.locator('tv-book-detail h2')).toHaveCount(0);
    await expect(page.locator('tv-book-detail button, tv-book-detail a')).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.requests)).toEqual([]);
});

test('states hide stale content, use status/alert announcements, retain input and avoid unchanged message mutations', async ({ page }) => {
  await ready(page);
  await isolate(page);
  for (const tag of ['catalog', 'detail'] as const) {
    const element = page.locator(`tv-book-${tag}`);
    await page.evaluate(tag => { window.fixture[tag].status = 'loading'; }, tag);
    await expect(element.locator('[aria-busy="true"]')).toHaveCount(1);
    await expect(element.getByRole('status')).toHaveText(tag === 'catalog' ? 'Loading books…' : 'Loading book…');
    const mutations = await page.evaluate(async tag => {
      const element = window.fixture[tag];
      let count = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(element.querySelector('[role="status"]')!, { childList: true, characterData: true, subtree: true });
      const message = element.querySelector('[role="status"]');
      element.status = 'loading';
      element.message = '';
      await Promise.resolve();
      observer.disconnect();
      return { count, same: message === element.querySelector('[role="status"]') };
    }, tag);
    expect(mutations).toEqual({ count: 0, same: true });
    await page.evaluate(tag => { window.fixture[tag].status = 'error'; }, tag);
    await expect(element.getByRole('alert')).toHaveText(tag === 'catalog' ? 'Could not load books.' : 'Could not load book.');
    await expect(element.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.evaluate(tag => { window.fixture[tag].status = 'ready'; }, tag);
    await expect(element).toContainText('A complete title');
  }
});

test('announcement regions stay established outside busy content and mutate only when their message changes', async ({ page }) => {
  await ready(page);
  await isolate(page);
  for (const tag of ['catalog', 'detail'] as const) {
    const result = await page.evaluate(async tag => {
      const element = window.fixture[tag];
      const status = element.querySelector('[role="status"]')!;
      const alert = element.querySelector('[role="alert"]')!;
      const content = element.querySelector('.bc-content')!;
      if (!status || !alert) return null;
      const outside = !content.contains(status) && !content.contains(alert);
      const messages: string[][] = [];
      let count = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
      observer.observe(alert, { childList: true, characterData: true, subtree: true });
      element.status = 'loading';
      await Promise.resolve();
      messages.push([status.textContent!, alert.textContent!]);
      count = 0;
      element.status = 'loading';
      element.message = '';
      element.message = undefined;
      await Promise.resolve();
      const unchanged = count;
      element.message = '<b>Waiting</b>';
      await Promise.resolve();
      messages.push([status.textContent!, alert.textContent!]);
      element.status = 'error';
      await Promise.resolve();
      messages.push([status.textContent!, alert.textContent!]);
      element.message = null;
      element.status = 'ready';
      messages.push([status.textContent!, alert.textContent!]);
      if (tag === 'catalog') window.fixture.catalog.books = [];
      else window.fixture.detail.book = null;
      messages.push([status.textContent!, alert.textContent!]);
      observer.disconnect();
      return { outside, unchanged, messages,
        same: status === element.querySelector('[role="status"]') && alert === element.querySelector('[role="alert"]'),
        markup: element.querySelector('b') !== null };
    }, tag);
    expect(result).toEqual({ outside: true, unchanged: 0, same: true, markup: false, messages: [
      [tag === 'catalog' ? 'Loading books…' : 'Loading book…', ''],
      ['<b>Waiting</b>', ''], ['', '<b>Waiting</b>'], ['', ''],
      [tag === 'catalog' ? 'No books to show.' : 'No book selected.', ''],
    ] });
  }
});

test('covers resolve relative URLs, fail locally to decorative generated covers and do not cause global errors', async ({ page }) => {
  await ready(page);
  await isolate(page);
  await page.route('**/missing-cover.png', route => route.abort());
  await page.evaluate(() => {
    const { books, catalog, detail } = window.fixture;
    const book = { ...books[0], cover: './missing-cover.png' };
    catalog.books = [book];
    detail.book = book;
  });
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('.bc-cover[aria-hidden="true"]')).toHaveCount(2);
  await expect(page.locator('tv-book-catalog button')).toHaveAccessibleName('A complete title — First Author, Second Author');
  await expect(page.locator('tv-book-catalog [role="alert"]')).toBeEmpty();
  await expect(page.locator('tv-book-detail [role="alert"]')).toBeEmpty();
  await page.route('**/good-cover.svg', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="navy"/></svg>' }));
  await page.evaluate(() => {
    window.fixture.detail.book = { ...window.fixture.books[0], cover: './good-cover.svg' };
  });
  await expect(page.locator('img')).toHaveAttribute('alt', '');
  await expect(page.locator('img')).toHaveJSProperty('naturalWidth', 400);
  expect(await page.locator('img').evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
});

test('full detail preserves plain description lines and source links keep ordinary and modifier navigation without requests', async ({ page, context }) => {
  await ready(page);
  await isolate(page);
  const detail = page.locator('tv-book-detail');
  await expect(detail.getByRole('heading')).toHaveText('A complete title');
  await expect(detail.locator('.bc-description')).toHaveText('A full description.\n<b>Literal markup</b>');
  await expect(detail.locator('b')).toHaveCount(0);
  await expect(detail.locator('dt')).toHaveText(['ID', 'Publication date', 'Page count', 'Genre', 'Rating', 'URL']);
  await expect(detail.locator('dd')).toHaveText(['a " ] # <id>', '2024-05', '0', 'Essays', '4.2 / 5', new URL(page.url()).host]);
  const link = detail.locator('.bc-source');
  await expect(link).toHaveAccessibleName(new URL(page.url()).host);
  const popup = context.waitForEvent('page');
  await link.click({ modifiers: ['Control'] });
  const newPage = await popup;
  await newPage.waitForLoadState();
  await expect(newPage).toHaveURL(/destination.html$/);
  await newPage.close();
  const middlePopup = context.waitForEvent('page');
  await link.click({ button: 'middle' });
  const middlePage = await middlePopup;
  await middlePage.waitForLoadState();
  await expect(middlePage).toHaveURL(/destination.html$/);
  await middlePage.close();
  expect(await page.evaluate(() => window.requests)).toEqual([]);
  await link.click();
  await expect(page).toHaveURL(/destination.html$/);
});

test('page wiring replaces the catalog with inline detail and restores id focus through Back and Forward', async ({ page }) => {
  await ready(page);
  const catalogUrl = page.url();
  await page.locator('tv-book-catalog button').first().click();
  const detailUrl = page.url();
  expect(new URL(detailUrl).searchParams.get('book')).toBe('a " ] # <id>');
  expect(new URL(detailUrl).pathname).toBe(new URL(catalogUrl).pathname);
  await expect(page.locator('tv-book-catalog')).toBeHidden();
  await expect(page.locator('tv-book-detail h2')).toBeFocused();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(catalogUrl);
  await expect(page.locator('tv-book-catalog button').first()).toBeFocused();
  await expect(page.locator('tv-book-detail')).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.locator('tv-book-detail h2')).toBeFocused();
  await page.goBack();
  await expect(page.locator('tv-book-catalog button').first()).toBeFocused();
  // A live update records the value, not the obsolete trigger node.
  await page.evaluate(() => {
    const { catalog, books } = window.fixture;
    const id = (document.activeElement as HTMLButtonElement).dataset.bookId;
    catalog.books = [...books].reverse();
    [...catalog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.bookId === id)!.focus();
  });
  await expect(page.locator('tv-book-catalog button').last()).toBeFocused();
});

test('native Back restores catalog scroll without focus scrolling to the card', async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 500 });
  await ready(page);
  await page.evaluate(() => {
    document.body.style.minHeight = '2400px';
    scrollTo(0, 140);
    // Capture after any pointer-induced scrolling, before page navigation runs.
    document.body.addEventListener('bookactivate', () => {
      document.body.dataset.activationScroll = String(scrollY);
    }, { capture: true, once: true });
  });
  await page.locator('tv-book-catalog button').first().click();
  const savedScroll = await page.evaluate(() => Number(document.body.dataset.activationScroll));
  expect(savedScroll).toBeGreaterThan(0);
  await expect(page.locator('tv-book-detail h2')).toBeFocused();
  await page.goBack();
  await expect(page.locator('tv-book-catalog button').first()).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(savedScroll);
});

test('returning after the selected book is removed focuses the catalog heading without adding a Tab stop', async ({ page }) => {
  await ready(page);
  await page.locator('tv-book-catalog button').first().click();
  await expect(page.locator('tv-book-detail h2')).toBeFocused();
  await page.evaluate(() => { window.fixture.books.splice(0, 1); });
  await page.goBack();
  await expect(page.locator('tv-book-detail')).toBeHidden();
  await expect(page.locator('tv-book-catalog button')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('tv-book-catalog button').first()).toBeFocused();
});

test('direct detail entry adds no return control, including a missing record', async ({ page }) => {
  for (const id of ['unknown', 'removed']) {
    const url = new URL('/packages/tv-book-catalog/test/browser/fixture.html', 'http://placeholder');
    url.searchParams.set('book', id);
    await page.goto(url.pathname + url.search);
    await page.waitForFunction(() => Boolean(window.fixture));
    await expect(page.locator('tv-book-catalog')).toBeHidden();
    await expect(page.locator('tv-book-detail')).toBeVisible();
    if (id === 'unknown') {
      await expect(page.locator('tv-book-detail h2')).toHaveText('Unknown authors');
      await expect(page.locator('tv-book-detail h2')).toBeFocused();
    } else {
      await expect(page.locator('tv-book-detail')).toHaveText('No book selected.');
    }
    await expect(page.getByRole('link', { name: 'Catalog', exact: true })).toHaveCount(0);
    for (const status of ['loading', 'error'] as const) {
      await page.evaluate(status => { window.fixture.detail.status = status; }, status);
      await expect(page.locator('tv-book-detail button')).toHaveCount(0);
    }
  }
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [190, 900]) {
    test(`responsive cards/detail wrap and keyboard focus is visible at ${width}px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: width + 32, height: 900 });
      await ready(page);
      await isolate(page);
      await page.evaluate(({ width, scheme }) => {
        document.body.style.colorScheme = scheme;
        document.querySelector<HTMLElement>('main')!.style.width = `${width}px`;
        window.fixture.detail.book = window.fixture.books[2];
      }, { width, scheme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const cards = await page.locator('tv-book-catalog li').evaluateAll(cards =>
        cards.map(card => ({ x: card.getBoundingClientRect().x, width: card.getBoundingClientRect().width })));
      expect(new Set(cards.map(card => card.x)).size).toBe(width === 190 ? 1 : 3);
      const description = page.locator('tv-book-catalog .bc-description').last();
      await expect(description).toHaveText('VeryLongDescription'.repeat(30) + '\nAnother line.');
      const wrapping = await description.evaluate(element => {
        const style = getComputedStyle(element);
        return { display: style.display, whiteSpace: style.whiteSpace,
          fits: element.scrollWidth <= element.clientWidth,
          wrapped: element.clientHeight > parseFloat(style.lineHeight) * 2 };
      });
      expect(wrapping).toEqual({ display: 'block', whiteSpace: 'pre-wrap', fits: true, wrapped: true });
      const ratio = await page.locator('tv-book-catalog .bc-cover').first().evaluate(cover => {
        const rect = cover.getBoundingClientRect();
        return rect.width / rect.height;
      });
      expect(ratio).toBeCloseTo(2 / 3, 2);
      await page.locator('tv-book-catalog button').first().focus();
      await page.keyboard.press('Tab');
      const outline = await page.locator('tv-book-catalog button').nth(1).evaluate(button => {
        const style = getComputedStyle(button);
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
      });
      expect(outline.width).toBeGreaterThan(0);
      expect(outline.style).not.toBe('none');
      expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
      await page.evaluate(() => {
        window.fixture.catalog.style.setProperty('--tv-book-catalog-text', 'rgb(120, 30, 60)');
        window.fixture.catalog.style.setProperty('--tv-book-catalog-font', 'Georgia');
      });
      const overrides = await page.locator('tv-book-catalog button').first().evaluate(button => ({
        color: getComputedStyle(button).color, font: getComputedStyle(button).fontFamily,
      }));
      expect(overrides).toEqual({ color: 'rgb(120, 30, 60)', font: 'Georgia' });
    });
  }
}
