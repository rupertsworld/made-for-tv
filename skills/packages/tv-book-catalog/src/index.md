---
name: tv-book-catalog
description: Show book metadata in a responsive card catalog and a full inline detail view, with safe text, local cover fallbacks and page-owned navigation.
---

# Show a book catalog

Use this skill to display book metadata in an HTML artifact. `<tv-book-catalog>` shows a card list; `<tv-book-detail>` shows one complete record inline, in place of the list. Both render in light DOM and work without runtime dependencies or host APIs. They do not fetch data, read book content, manage history or move focus.

## Load both assets

Copy `tv-book-catalog.js` and `tv-book-catalog.css` from this skill folder next to the artifact `index.html`:

```html
<link rel="stylesheet" href="./tv-book-catalog.css">
<script type="module" src="./tv-book-catalog.js"></script>
```

Importing the module defines both elements. Before assigning properties, wait for the module to load, for example by importing it inside the module script that assigns data. Give the page its own heading, background and padding. In Television, follow the documented artifact setup for the host. Neither another skill nor a font, icon or cover service is needed for these elements.

## Adapt the records

The page supplies records with these JavaScript fields:

| Field | Type | Requirement |
| --- | --- | --- |
| `id` | string | Non-empty stable identifier, unique in the catalog. Keep it unchanged across updates. |
| `title` | string | Non-empty complete title. |
| `authors` | string[] | Names in display order; `[]` displays `Unknown author`. |
| `cover` | string | Optional image URL. |
| `description` | string | Required, non-empty plain text; cards and detail preserve line breaks. |
| `publicationDate` | string | Optional display text, such as a year or partial date. Not parsed. |
| `pageCount` | number | Optional non-negative integer; zero is displayed. |
| `genre` | string | Optional genre label. |
| `rating` | string | Optional formatted display text including the scale, such as `4.2 / 5`. |
| `sourceUrl` | string | Optional URL property; detail labels it `URL` and shows its host as the link text. |

The detail view shows every supplied contract field, including the identifier, and ignores other source metadata. Blank, nullish or missing optional text is omitted. The catalog shows title, authors, the brief description beneath authors, cover, genre and rating. Other metadata belongs in detail. Missing, rejected or failed covers become decorative, title-derived covers without another network request.

```js
import './tv-book-catalog.js';
const catalog = document.querySelector('tv-book-catalog');
catalog.books = [{ id: 'book-1', title: 'Collected Essays', authors: ['A. Writer'], description: 'Essays on art and everyday life.', pageCount: 0 }];
```

Validate required fields and unique identifiers before assignment; missing or blank descriptions are record errors, not optional metadata. Adapt descriptions from a dedicated source field rather than guessing from a record body. Use the error states below when records cannot be loaded or adapted.

Assign `catalog.books` in display order and `detail.book` for one record. Reading either property returns the input, not a clone. Assigning `[]`, `null` or `undefined` clears the catalog; `null` or `undefined` clears detail. Assign new data to update the display: in-place mutations do not render. Children are output, not record input.

Each property assignment renders synchronously before returning, then dispatches a plain, nonbubbling `render` event. Listeners can use the updated DOM immediately. Rendering replaces book content and can detach a focused card.

## Manage presentation states

Both elements expose `status`, initially `ready`, and `message`:

| State | Catalog message without cards | Detail message |
| --- | --- | --- |
| Empty `ready` | `No books to show.` | `No book selected.` |
| `loading` | `Loading books…` | `Loading book…` |
| `error` | `Could not load books.` | `Could not load book.` |

Loading and error hide retained book input. Set `ready` to display it again, or assign replacement data. `message` replaces an empty/loading/error message, not a populated ready view. Empty or nullish messages restore the default. Loading marks the content region busy. Established announcement regions remain outside that region: empty/loading messages are polite status announcements; errors are alerts. Only changed message text is updated, so unchanged messages are not repeatedly announced.

The page clears stale messages when an operation finishes. Add a page-owned retry button if retry is possible. Cover failure is local to a book, not an element error state.

## Handle requests and focus

| Event | `detail` | Meaning |
| --- | --- | --- |
| `bookactivate` | `{ id, book, trigger }` | A card button requested opening its displayed record. `book` is the supplied record reference. |

`bookactivate` is a bubbling, composed, noncancelable `CustomEvent`, dispatched on the catalog element once per native button activation. `trigger` is the originating button, not a persistent focus target. Resolve the latest record by `id` when data may have changed. Pointer, Enter and Space produce the same event. Modifier keys do not open card buttons in another tab. Source links remain ordinary links and do not dispatch `bookactivate`.

Show only one view at a time. The page moves focus to the detail heading (`h2`, already `tabindex="-1"`) after rendering. If no record is displayed, focus an explicit detail entry point supplied by the page. When native Back returns to the catalog, the page restores catalog state and scroll, then focuses the button with the saved identifier. Give the catalog heading `tabindex="-1"` so it can receive focus without adding a Tab stop when that book has been removed. Compare `dataset.bookId` directly rather than putting an unescaped identifier into a selector:

```js
function focusBook(catalog, id, heading) {
  const button = [...catalog.querySelectorAll('button[data-book-id]')]
    .find(button => button.dataset.bookId === id);
  (button ?? heading).focus({ preventScroll: true });
}
```

Tab follows native document order; there is no arrow navigation, focus trap or automatic Escape handling. Put the detail heading within a consistent page heading hierarchy.

Before a live update, save the focused card identifier only if focus is in the catalog. After assignment (or in `render`), restore it when still relevant. If the book disappeared, use the catalog heading or another explicit entry point. Do not steal focus from elsewhere on the page.

## Keep navigation in the page

Route each selected book to a distinct same-artifact URL, such as `index.html?book=book-1`. Preserve catalog filters, ordering, the activated identifier and scroll position. Use browser or host Back and Forward through a documented history mechanism; the detail element supplies no navigation control. Direct detail entries add no return link; native history remains available when the host provides it.

This static-data example uses the standard browser History API. In Television, use the documented host navigation mechanism if one is provided; do not assume browser history changes are reported to the host. The markup has `<h1 id="catalog-heading" tabindex="-1">Books</h1>`, `tv-book-catalog#catalog` and `<tv-book-detail id="detail" tabindex="-1" aria-label="Book details" hidden></tv-book-detail>`. Include `[hidden] { display: none !important; }` in page styles. The example uses `focusBook` from the preceding section.

```js
import './tv-book-catalog.js';
const catalog = document.querySelector('#catalog');
const detail = document.querySelector('#detail');
const heading = document.querySelector('#catalog-heading');
const books = [{ id: 'book-1', title: 'Collected Essays', authors: ['A. Writer'], description: 'Essays on art and everyday life.' }];
let catalogState = { id: null, scroll: 0 };

function show() {
  const id = new URL(location.href).searchParams.get('book');
  const isDetail = id !== null;
  catalog.hidden = isDetail;
  detail.hidden = !isDetail;
  if (isDetail) {
    detail.book = books.find(book => book.id === id) ?? null;
    (detail.querySelector('h2') ?? detail).focus();
  } else {
    catalog.books = books;
    focusBook(catalog, catalogState.id, heading);
    scrollTo(0, catalogState.scroll);
  }
}
show();
catalog.addEventListener('bookactivate', event => {
  catalogState = { id: event.detail.id, scroll: scrollY };
  const url = new URL(location.href);
  url.searchParams.set('book', event.detail.id);
  history.pushState(null, '', url);
  show();
});
addEventListener('popstate', show);
```

The URL determines the view on initial load and on Back or Forward. Without a documented history integration, use ordinary same-artifact links rather than a local-only view change. Do not probe for undocumented host APIs.

If fetching detail, show loading first and guard responses with a selection counter or cancellation so an older response cannot replace a newer selection. If the environment documents live updates, use that mechanism to refresh records. Static embedded records are also valid; this skill prescribes no data server.

## Safe destinations and styling

All record strings and messages are text, never HTML or Markdown. Resolve `cover` and `sourceUrl` against the document base URL; only resolved `http:` and `https:` URLs are permitted. Blank, malformed, `javascript:`, `data:`, `blob:` and `file:` destinations are omitted. A permitted remote cover makes an image request: select trusted sources or local covers in the page. Protocol checks do not make a remote site trustworthy. If the page changes source links to open in a new tab, also set `rel="noopener noreferrer"`.

The scoped stylesheet follows light/dark colour schemes and leaves outer layout to the page. Set `color-scheme` on the page when needed. Each variable resolves through the corresponding Television variable, then a built-in default:

| Book variable suffix (`--tv-book-catalog-…`) | Television variable |
| --- | --- |
| `text`, `text-muted`, `link`, `border`, `surface` | `--color-text`, `--color-text-muted`, `--color-link`, `--color-border`, `--color-surface-muted` |
| `font`, `text-size`, `caption-size`, `heading-size` | `--font-sans`, `--text-md`, `--text-sm`, `--text-xl` |
| `weight`, `heading-weight` | `--font-weight-medium`, `--font-weight-semibold` |
| `gap`, `space`, `radius`, `focus` | `--space-24`, `--space-12`, `--control-radius`, `--outline-focus` |
| `cover-text`, `cover-font`, `cover-title-size`, `cover-author-size` | `--color-text-on-accent`, `--font-serif`, `--text-sm`, `--text-xs` |
| `cover-padding`, `control-padding` | `--space-16`, `--space-6` |
| `cover-background` | No matching theme variable; defaults to a title-derived gradient. |

`focus` is a full outline value. Override variables on an element or ancestor; low-specificity light-DOM rules also allow page styles.
