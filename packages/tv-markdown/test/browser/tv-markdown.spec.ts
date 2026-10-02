/** Browser contract tests load the same built JavaScript and CSS that an artifact copies. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const frameFile = path.resolve(here, '../../../../frames/tv-markdown.frame');
const frameSource = readFileSync(frameFile, 'utf8');
const [, frameHeader, frameBodyTemplate] = frameSource.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
if (!frameHeader || !frameBodyTemplate) throw new Error('Could not read the tv-markdown frame');
const frameStyle = frameHeader.match(/^style: \|\n((?:  .*\n)+)/m)?.[1]
  .split('\n').map(line => line.replace(/^  /, '')).join('\n') ?? '';
if (!frameStyle) throw new Error('Could not read the frame page styles');
const frameImageMarkup = frameBodyTemplate.match(/<img[^>]+>/)?.[0];
if (!frameImageMarkup) throw new Error('Could not read the frame image');

async function ready(page: Page): Promise<void> {
  await page.goto('/packages/tv-markdown/test/browser/fixture.html');
  await page.evaluate(() => customElements.whenDefined('tv-markdown'));
}

async function setMarkdown(page: Page, markdown: string): Promise<void> {
  await page.evaluate(source => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
    document.querySelector('#host')!.replaceChildren(element);
    element.markdown = source;
  }, markdown);
}

test('the markdown property renders immediately, reads back, and clears on empty or nullish values', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string | null | undefined };
    document.querySelector('#host')!.append(element);
    element.markdown = '# First\n\n**Bold**';
    const first = { source: element.markdown, heading: element.querySelector('h1')?.textContent,
      bold: element.querySelector('strong')?.textContent };
    element.markdown = '';
    const empty = { source: element.markdown, children: element.children.length };
    element.markdown = '# Second';
    element.markdown = null;
    const nullish = { source: element.markdown, children: element.children.length };
    element.markdown = '# Third';
    element.markdown = undefined;
    return { first, empty, nullish, undefinedChildren: element.children.length };
  });
  expect(result).toEqual({
    first: { source: '# First\n\n**Bold**', heading: 'First', bold: 'Bold' },
    empty: { source: '', children: 0 },
    nullish: { source: '', children: 0 },
    undefinedChildren: 0,
  });
});

test('inline script is dedented, rendered, and replaced with output', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
    element.innerHTML = '<script type="text/markdown">\n\n    # In the page\n\n    A 1 < 2 & 3.\n\n</script>';
    document.querySelector('#host')!.append(element);
    return { heading: element.querySelector('h1')?.textContent,
      paragraph: element.querySelector('p')?.textContent,
      source: element.markdown, scriptGone: element.querySelector('script') === null };
  });
  expect(result).toEqual({ heading: 'In the page', paragraph: 'A 1 < 2 & 3.',
    source: '# In the page\n\nA 1 < 2 & 3.', scriptGone: true });
});

test('inline script works when the element connects before its child is parsed', async ({ page }) => {
  await ready(page);
  const connectedBeforeChild = await page.evaluate(() => {
    document.open();
    document.write('<!doctype html><html><body><tv-markdown id="early">');
    const element = document.querySelector('#early');
    const connectedWithoutChildren = Boolean(element?.isConnected && element.children.length === 0);
    document.write('<script type="text/markdown">\n  ## Late child\n</script></tv-markdown></body></html>');
    document.close();
    return connectedWithoutChildren;
  });
  expect(connectedBeforeChild).toBe(true);
  await expect(page.locator('#early h2')).toHaveText('Late child');
  await expect(page.locator('#early script')).toHaveCount(0);
});

test('property set during parsing renders once when no later inline child arrives', async ({ page }) => {
  await ready(page);
  const firstCount = await page.evaluate(() => {
    document.open();
    document.write('<!doctype html><html><body><tv-markdown id="early">');
    const element = document.querySelector('#early') as HTMLElement & { markdown: string };
    element.dataset.renderCount = '0';
    element.addEventListener('render', () => {
      element.dataset.renderCount = String(Number(element.dataset.renderCount) + 1);
    });
    element.markdown = '# Property';
    const count = element.dataset.renderCount;
    document.write('</tv-markdown></body></html>');
    document.close();
    return count;
  });
  expect(firstCount).toBe('1');
  await expect(page.locator('#early h1')).toHaveText('Property');
  await page.evaluate(() => new Promise<void>(resolve => {
    if (document.readyState !== 'loading') resolve();
    else document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  }));
  await expect(page.locator('#early')).toHaveAttribute('data-render-count', '1');
});

test('property set during parsing replaces a later inline script', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.open();
    document.write('<!doctype html><html><body><tv-markdown id="early">');
    const element = document.querySelector('#early') as HTMLElement & { markdown: string };
    element.markdown = '# Property';
    document.write('<script type="text/markdown"># Late inline</script></tv-markdown></body></html>');
    document.close();
  });
  await expect(page.locator('#early h1')).toHaveText('Property');
  await expect(page.locator('#early script')).toHaveCount(0);
  const source = await page.locator('#early').evaluate(element =>
    (element as HTMLElement & { markdown: string }).markdown);
  expect(source).toBe('# Property');
});

test('setting the property replaces inline content, and later inline content cannot supersede it', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
    element.innerHTML = '<script type="text/markdown"># Inline</script>';
    element.markdown = '# Property';
    document.querySelector('#host')!.append(element);
    return { source: element.markdown, heading: element.querySelector('h1')?.textContent,
      scriptGone: element.querySelector('script') === null };
  });
  expect(result).toEqual({ source: '# Property', heading: 'Property', scriptGone: true });
});

test('render fires after each render including clear, and does not bubble', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const parent = document.querySelector('#host')!;
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string | null };
    parent.append(element);
    const snapshots: Array<{ text: string; bubbles: boolean; type: string }> = [];
    let parentEvents = 0;
    parent.addEventListener('render', () => parentEvents++);
    element.addEventListener('render', event => snapshots.push({
      text: element.textContent?.trim() ?? '', bubbles: event.bubbles, type: event.constructor.name,
    }));
    element.markdown = 'First';
    element.markdown = 'Second';
    element.markdown = null;
    return { snapshots, parentEvents };
  });
  expect(result).toEqual({ snapshots: [
    { text: 'First', bubbles: false, type: 'Event' },
    { text: 'Second', bubbles: false, type: 'Event' },
    { text: '', bubbles: false, type: 'Event' },
  ], parentEvents: 0 });
});

test('an uncancelled ordinary link reports linkclick before the browser follows it', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[Next](/packages/tv-markdown/test/browser/destination.html)');
  await page.evaluate(() => {
    document.querySelector('tv-markdown')!.addEventListener('linkclick', event => {
      const linkEvent = event as MouseEvent & { href: string | null; wikilink: string | null; anchor: HTMLAnchorElement };
      sessionStorage.setItem('linkclick', JSON.stringify({ href: linkEvent.href,
        wikilink: linkEvent.wikilink, anchorText: linkEvent.anchor.textContent,
        bubbles: linkEvent.bubbles, cancelable: linkEvent.cancelable,
        isMouseEvent: linkEvent instanceof MouseEvent }));
    });
  });
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/packages\/tv-markdown\/test\/browser\/destination\.html$/);
  const event = await page.evaluate(() => JSON.parse(sessionStorage.getItem('linkclick') ?? 'null'));
  expect(event).toEqual({ href: '/packages/tv-markdown/test/browser/destination.html',
    wikilink: null, anchorText: 'Next', bubbles: true, cancelable: true, isMouseEvent: true });
});

test('preventDefault on linkclick stops ordinary link navigation', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[Next](/packages/tv-markdown/test/browser/destination.html)');
  await page.evaluate(() => {
    document.querySelector('tv-markdown')!.addEventListener('linkclick', event => {
      event.preventDefault();
      document.body.dataset.cancelled = String(event.defaultPrevented);
    });
  });
  const originalUrl = page.url();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.locator('body')).toHaveAttribute('data-cancelled', 'true');
});

test('wikilinks activate by primary click and Enter with target, anchor, and no href', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[[notes/topic#part|Topic]]');
  await page.evaluate(() => {
    const events: object[] = [];
    document.querySelector('tv-markdown')!.addEventListener('linkclick', event => {
      const linkEvent = event as MouseEvent & { href: string | null; wikilink: string | null; anchor: HTMLAnchorElement };
      events.push({ href: linkEvent.href, wikilink: linkEvent.wikilink,
        anchorText: linkEvent.anchor.textContent, mouseEvent: linkEvent instanceof MouseEvent });
    });
    (window as Window & { capturedLinkEvents?: object[] }).capturedLinkEvents = events;
  });
  const link = page.locator('a[data-wikilink]');
  await expect(link).toHaveAttribute('tabindex', '0');
  await expect(link).toHaveAttribute('role', 'link');
  await expect(link).not.toHaveAttribute('href', /./);
  await link.click();
  await link.focus();
  await link.press('Enter');
  const events = await page.evaluate(() => (window as Window & { capturedLinkEvents?: object[] }).capturedLinkEvents);
  expect(events).toEqual([
    { href: null, wikilink: 'notes/topic#part', anchorText: 'Topic', mouseEvent: true },
    { href: null, wikilink: 'notes/topic#part', anchorText: 'Topic', mouseEvent: true },
  ]);
});

test('a page-added wikilink href appears alongside its target in linkclick', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const element = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
    document.querySelector('#host')!.append(element);
    element.addEventListener('render', () => element.querySelector('a[data-wikilink]')?.setAttribute('href', '/note/jane'));
    element.addEventListener('linkclick', event => {
      const linkEvent = event as MouseEvent & { href: string | null; wikilink: string | null };
      event.preventDefault();
      document.body.dataset.link = JSON.stringify([linkEvent.href, linkEvent.wikilink]);
    });
    element.markdown = '[[jane|Jane]]';
  });
  await page.getByRole('link', { name: 'Jane' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-link', '["/note/jane","jane"]');
});

test('a wikilink given a fragment href follows it without linkclick', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[[section|Jump]]\n\n## Section');
  await page.evaluate(() => {
    document.querySelector('a[data-wikilink]')!.setAttribute('href', '#section');
    document.querySelector('tv-markdown')!.addEventListener('linkclick', () => {
      document.body.dataset.linkEvents = '1';
    });
  });
  await page.getByRole('link', { name: 'Jump' }).click();
  await expect(page).toHaveURL(/#section$/);
  await expect(page.locator('body')).not.toHaveAttribute('data-link-events', /./);
});

test('linkclick retains pointer data and each modifier key', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[Next](/next)');
  await page.evaluate(() => {
    const events: object[] = [];
    document.querySelector('tv-markdown')!.addEventListener('linkclick', event => {
      event.preventDefault();
      const mouse = event as MouseEvent;
      events.push({ button: mouse.button, metaKey: mouse.metaKey, ctrlKey: mouse.ctrlKey,
        shiftKey: mouse.shiftKey, altKey: mouse.altKey,
        clientX: mouse.clientX, clientY: mouse.clientY });
    });
    (window as Window & { capturedLinkEvents?: object[] }).capturedLinkEvents = events;
  });
  const link = page.getByRole('link', { name: 'Next' });
  for (const modifier of ['Meta', 'Control', 'Shift', 'Alt'] as const) {
    await link.click({ modifiers: [modifier], position: { x: 2, y: 2 } });
  }
  const events = await page.evaluate(() => (window as Window & { capturedLinkEvents?: Array<Record<string, number | boolean>> }).capturedLinkEvents);
  expect(events).toHaveLength(4);
  for (const [index, key] of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'].entries()) {
    expect(events?.[index]?.[key]).toBe(true);
    expect(events?.[index]?.button).toBe(0);
    expect(events?.[index]?.clientX).toBeGreaterThan(0);
    expect(events?.[index]?.clientY).toBeGreaterThan(0);
  }
});

test('heading fragments and middle clicks do not dispatch linkclick', async ({ page }) => {
  await ready(page);
  await setMarkdown(page, '[Jump](#section)\n\n## Section\n\n[Next](/next)');
  await page.evaluate(() => {
    document.querySelector('tv-markdown')!.addEventListener('linkclick', () => {
      document.body.dataset.linkEvents = String(Number(document.body.dataset.linkEvents ?? 0) + 1);
    });
  });
  await page.getByRole('link', { name: 'Jump' }).click();
  await expect(page).toHaveURL(/#section$/);
  await page.getByRole('link', { name: 'Next' }).click({ button: 'middle' });
  await expect(page.locator('body')).not.toHaveAttribute('data-link-events', /./);
});

const sampleMarkdown = `# Reading notes

Notes on *agent behaviour* and **goal pressure**, with sources linked as ordinary links such as [ImpossibleBench](https://example.org/impossiblebench) and as wikilinks such as [[topics/goal-pressure]] or [[jane|Jane]]. A link to a heading: [open questions](#open-questions).

## Sources

- Training conditions shape later failures.
- Stopping options reduce specification violations.
  - Some models more than others.
- A longer item that wraps onto a second line, to show the line height and the indent of continued text in a list item.

3. A numbered list that starts at three.
4. Its second item.

### To do

- [x] Read the full paper
- [ ] Compare the benchmark numbers

> Behaviour does not establish motives.

Inline code looks like \`linkclick\`, and a block of code looks like this:

~~~
md.addEventListener('linkclick', event => {
  if (event.wikilink) openNote(event.wikilink);
});
~~~

| Source | Finding | Limits |
| --- | --- | --- |
| ImpossibleBench | Feedback increased violations | Runtime not isolated |
| Reward Hacking Benchmark | More exploits in longer chains | Several conditions changed together |

---

## Open questions

An image keeps its aspect ratio and never exceeds the width of the element:

<p>${frameImageMarkup}</p>

<p>A very long address wraps instead of overflowing: https://example.org/a/very/long/path/that/would/otherwise/push/the/page/wider/than/the/element</p>`;

interface FrameComparison {
  error?: string;
  actualShape?: unknown;
  frameShape?: unknown;
  actualTextByElement?: unknown;
  frameTextByElement?: unknown;
  actualStyles?: unknown;
  frameStyles?: unknown;
}

test('the built element matches the frame structure and computed prose styles', async ({ page }) => {
  await ready(page);
  for (const variant of [
    { scheme: 'light', width: 'wide', overrides: 'false' },
    { scheme: 'dark', width: 'narrow', overrides: 'false' },
    { scheme: 'light', width: 'wide', overrides: 'true' },
  ]) {
    const result = await page.evaluate(({ frameBodyTemplate, frameStyle, markdown, variant }) => {
      const frameBody = frameBodyTemplate.replaceAll('{{ scheme }}', variant.scheme)
        .replaceAll('{{ width }}', variant.width).replaceAll('{{ overrides }}', variant.overrides);
      const iframe = document.createElement('iframe');
      iframe.id = 'frame-reference';
      iframe.style.cssText = 'width: 1000px; height: 1500px; border: 0';
      iframe.srcdoc = `<!doctype html><html><head><link rel="stylesheet" href="/spec/tv-markdown/style.css"><style>${frameStyle}</style></head><body>${frameBody}</body></html>`;
      document.body.replaceChildren(iframe);
      const pageStyle = document.createElement('style');
      pageStyle.textContent = frameStyle;
      document.head.append(pageStyle);
      const actualPage = document.createElement('div');
      actualPage.className = 'page';
      actualPage.dataset.scheme = variant.scheme;
      actualPage.dataset.width = variant.width;
      actualPage.dataset.overrides = variant.overrides;
      const actual = document.createElement('tv-markdown') as HTMLElement & { markdown: string };
      actualPage.append(actual);
      document.body.append(actualPage);
      actual.markdown = markdown;
      return new Promise(resolve => {
        iframe.addEventListener('load', () => {
          const reference = iframe.contentDocument?.querySelector('tv-markdown');
          if (!reference) { resolve({ error: 'frame reference missing' }); return; }
          const shape = (root: Element): unknown => [root.tagName.toLowerCase(),
            [...root.attributes].map(attribute => [attribute.name, attribute.value]).sort((a, b) => a[0].localeCompare(b[0])),
            [...root.children].map(shape)];
          const textByElement = (root: Element): unknown => [root.tagName.toLowerCase(),
            [...root.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent ?? '').join('').replace(/\s+/g, ' ').trim(),
            [...root.children].map(textByElement)];
          const styleOf = (root: Element, selector: string): Record<string, string> => {
            const element = selector ? root.querySelector(selector) : root;
            if (!element) return { error: `missing ${selector}` };
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return { color: style.color, backgroundColor: style.backgroundColor,
              fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
              lineHeight: style.lineHeight, marginTop: style.marginTop, marginBottom: style.marginBottom,
              paddingLeft: style.paddingLeft, borderLeftWidth: style.borderLeftWidth,
              textDecorationLine: style.textDecorationLine, display: style.display,
              overflowX: style.overflowX, maxWidth: style.maxWidth,
              width: `${Math.round(rect.width)}px` };
          };
          const selectors = ['', 'h1', 'h2', 'h3', 'p', 'a[href]', 'a[data-wikilink]',
            'ul', 'ol', 'li:has(> input)', 'input', 'blockquote', 'code', 'pre', 'table', 'th', 'img'];
          resolve({ actualShape: shape(actual), frameShape: shape(reference),
            actualTextByElement: textByElement(actual),
            frameTextByElement: textByElement(reference),
            actualStyles: selectors.map(selector => [selector, styleOf(actual, selector)]),
            frameStyles: selectors.map(selector => [selector, styleOf(reference, selector)]) });
        }, { once: true });
      });
    }, { frameBodyTemplate, frameStyle, markdown: sampleMarkdown, variant }) as FrameComparison;
    expect(result, JSON.stringify(variant)).not.toHaveProperty('error');
    expect(result, JSON.stringify(variant)).toMatchObject({
      actualShape: result.frameShape,
      actualTextByElement: result.frameTextByElement,
      actualStyles: result.frameStyles,
    });
  }
});

test('a second copy of the module loads without error and leaves the first definition in place', async ({ page }) => {
  await ready(page);
  const error = await page.evaluate(async url => {
    try {
      await import(url);
      return null;
    } catch (caught) {
      return String(caught);
    }
  }, '/skills/tv-markdown/tv-markdown.js?copy=2');
  expect(error).toBeNull();
  expect(await page.evaluate(() => customElements.get('tv-markdown') !== undefined)).toBe(true);
  await setMarkdown(page, '# Still works');
  await expect(page.locator('#host tv-markdown h1')).toHaveText('Still works');
});
