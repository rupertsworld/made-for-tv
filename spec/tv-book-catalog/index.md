# tv-book-catalog — specification

`tv-book-catalog` is a reusable, dependency-free artifact skill for viewing book metadata. It provides a responsive card grid through `<tv-book-catalog>` and a full record view through `<tv-book-detail>`. This specification defines their input, presentation, events and responsibilities of the surrounding artifact.

The elements display records supplied by the page. They do not fetch books, manage navigation or read EPUB or PDF content.

## Elements

- Importing `tv-book-catalog.js` defines both `<tv-book-catalog>` and `<tv-book-detail>`.
- Both elements render in light DOM, not a shadow root. Page styles and event listeners apply to the rendered content.
- The module and stylesheet work in Television and ordinary web pages without runtime libraries, other skills or host APIs.
- Assigning a property renders synchronously before the assignment returns, then dispatches `render`. The page assigns new values to update the display; changing an object or array in place does not trigger rendering.
- Rendering replaces generated content. Neither element interprets child content as book input.

## Book input

Both elements accept the same book record. Field names below are the JavaScript property names.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Required, non-empty stable identifier. Unique within the catalog and unchanged across updates to the same book. |
| `title` | string | Required, non-empty book title. |
| `authors` | string[] | Required list of author names, in display order. An empty list means authors are unknown. |
| `cover` | string | Optional cover image URL, subject to [Safe content and URLs](#safe-content-and-urls). |
| `description` | string | Required, non-empty plain-text description; line breaks are preserved. |
| `publicationDate` | string | Optional display text for a publication date, including a year or a partial date. The element does not parse it or invent missing parts. |
| `pageCount` | number | Optional non-negative integer page count. Zero is a supplied value, not a missing field. |
| `genre` | string | Optional genre label. |
| `rating` | string | Optional display text including any scale, such as `4.2 / 5`. The page formats source ratings; the element does not assume a scale. |
| `sourceUrl` | string | Optional URL property, subject to [Safe content and URLs](#safe-content-and-urls). |

The page adapts source data to this contract, including required fields, unique identifiers and display text. Missing, `null` or empty optional text is omitted rather than displayed as `undefined`, `null` or an empty label. A full record view means every supplied field in this contract; it does not infer or expose other source metadata. The elements do not mutate supplied records or derive identity from the title, array position or cover URL.

## Element API

| Element | Kind | Name | Description |
| --- | --- | --- | --- |
| `<tv-book-catalog>` | Property | `books` | Array of book records in display order. Assigning an empty array, `null` or `undefined` clears the records. Reading returns the current input. |
| `<tv-book-detail>` | Property | `book` | One book record. Assigning `null` or `undefined` clears the record. Reading returns the current input. |
| Both | Property | `status` | `ready`, `loading` or `error`; initially `ready`. Controls the presentation described in [Presentation states](#presentation-states). |
| Both | Property | `message` | Optional plain-text replacement for the current state message. Empty, `null` or `undefined` uses the default message. |
| `<tv-book-catalog>` | Event | `bookactivate` | Requests that the page open a book. See [Events](#events). |
| Both | Event | `render` | Plain `Event`, dispatched after each completed render, including a clear or state change. Does not bubble. The updated light DOM is available to listeners. |

No property causes a fetch or a history change. State messages are separate from book data and are cleared or replaced by the page when an operation finishes.

## Catalog presentation

The catalog presents books as a semantic list of cards in the supplied order. The visual reference is the simplified MCP book grid in `../../tv-mcp/src/app/client/mock/demo-uis.ts`: responsive cards, 2:3 covers, title-derived covers with a spine shadow, title and author captions, and a small hover lift. This skill retains those choices and omits that prototype's add and remove controls. The grid is responsive, not an ARIA grid: it uses multiple columns when space permits and a single column at narrow widths. Cards do not overflow the element, and long titles and author names wrap.

Each card shows a cover, the complete title, the authors and the brief description. Optional genre and rating are shown when supplied. Publication date, page count and URL property belong in the detail view. Missing authors are identified as `Unknown author`.

A missing, rejected or failed cover image is replaced with a generated cover showing the title and author text. The fallback requires no network request or external image service and remains legible in light and dark colour schemes. Cover images fill a consistent cover area without distortion; the edges of an image whose shape differs from the area are cropped. Images and generated covers are decorative to assistive technology because the title and authors are also provided as text.

Each card has one native button that activates the book, with an accessible name identifying the title and authors. Cards have no nested links or other interactive controls. The button carries `data-book-id` with the exact stable identifier; the page can locate it after a render to restore focus. Identifiers are data, not CSS selectors or HTML markup.

## Detail presentation

The detail view shows a cover or generated fallback, the complete title, authors, description and every supplied optional metadata field. Metadata labels identify publication date, page count, genre, rating and URL. A permitted URL appears as an ordinary link in the labelled URL property, with its host as the visible value.

The title is a heading. The surrounding page supplies the catalog heading and uses the detail title within a consistent heading hierarchy. Metadata uses labelled values rather than unlabeled icons. Description text is not truncated and is not interpreted as Markdown or HTML.

At wide widths the cover and record text may sit beside each other; at narrow widths they stack. Text and covers stay within the available width. The page shows the detail view in place of the catalog, not in a detail pane beside the grid. It is inline page content, not a modal, and does not trap focus.

## Events

The `bookactivate` request event is a `CustomEvent` dispatched on the catalog element. It bubbles, is composed and is not cancelable. It reports a user request; there is no automatic navigation or other default action to cancel.

| Event | `detail` fields | When dispatched |
| --- | --- | --- |
| `bookactivate` | `id`: stable book identifier; `book`: the displayed input record; `trigger`: the activated card button | Once for each activation of a catalog card button. |

The `book` field refers to the supplied record, not a clone or a promise of current server data. The page uses `id` to resolve the latest record when necessary. A `trigger` reference identifies the control that initiated the request; it may be detached by a later render. It is not a persistent focus target.

Pointer activation and native button activation with Enter or Space produce the same request event. Modifier keys do not turn a card button into a link or open a new tab. Source links retain ordinary browser behaviour, including modifier-click and middle-click; they do not dispatch request events.

## Keyboard and focus

- Tab and Shift+Tab follow the document order of native buttons and links. Cards do not use arrow-key navigation or roving tab stops.
- Interactive controls show a visible keyboard focus indicator in both colour schemes. Accessible names and metadata remain available without a cover image.
- Rendering does not move focus automatically. The elements do not handle Escape as Back or intercept browser Back.
- On opening a detail view, the page moves focus to the detail title after rendering. The title is programmatically focusable without adding a Tab stop.
- Before leaving the catalog, the page stores the activated book identifier. When native Back returns to the catalog, it restores catalog state, including scroll position where applicable, and focuses the card button for that identifier after rendering. If the record was removed, it focuses the catalog heading with `tabindex="-1"` or another explicit catalog entry point instead.
- Live updates can replace a focused control. The page records the focused book identifier before assigning new data and restores focus after `render` when that control is still relevant. It must not steal focus from another part of the page.

The `data-book-id` attribute and `render` event support restoration; retaining a previous `trigger` reference is insufficient. Pages compare identifier values directly, or escape them correctly if using selectors.

## Safe content and URLs

Every record string and state message is rendered as text, never as raw HTML. A description containing markup displays that markup as text. Record content cannot supply attributes, styles or event handlers.

For `cover` and `sourceUrl`, resolve relative URLs against the document base URL and accept only URLs whose resolved protocol is `http:` or `https:`. Same-origin relative paths are therefore usable in served artifacts. Blank, malformed or rejected URLs are not assigned to an image or anchor. Other protocols, including `javascript:`, `data:`, `blob:` and `file:`, are rejected.

A rejected cover uses the generated fallback. A rejected source URL produces no source link. Permitted source links use ordinary anchors; the element does not fetch or embed their targets. If a page elects to open source links in a new tab, it also prevents access to the opener with `rel="noopener noreferrer"`.

URL checks restrict browser destinations; they do not establish that a remote site is trustworthy. Loading a permitted remote cover makes an image request. The page decides which sources may be used and whether to provide local covers instead.

## Presentation states

| State | Catalog | Detail |
| --- | --- | --- |
| `ready`, with input | Book cards. | Full book record. |
| `ready`, without input | `No books to show.` | `No book selected.` |
| `loading` | `Loading books…` | `Loading book…` |
| `error` | `Could not load books.` | `Could not load book.` |

A non-ready state hides book content rather than leaving stale cards or a stale detail record active. Input remains available so that the page can return to `ready` with the retained data or assign replacement data. `message` replaces the text in the applicable empty, loading or error state, not text in a populated ready view.

Loading sets `aria-busy="true"` on the content region; other states clear it. Each element keeps an established announcement region outside that content region. Loading and empty messages update its polite status text; errors update its alert text. State changes do not move focus or repeatedly announce unchanged messages. Cover failure is a per-book fallback, not an error state for the whole element.

The elements supply no retry operation. A page that can retry adds its own control and manages `status` and `message` around that operation. The page provides a route back to the catalog through the documented native navigation mechanism.

## Styling

The shipped `tv-book-catalog.css` styles both custom elements and their generated content, scoped so it does not change unrelated page content. [The cover template](templates/cover.ts) renders a book cover used by both [the card template](templates/card.ts) and the detail record in [the element template](templates/tv-book-catalog.ts). [The grid template](templates/grid.ts) renders cards in a list. [The base module](templates/base.ts) holds host, reset and shared text CSS; status-message CSS belongs to the element template. The [repository specification](../index.md#specifications) describes how templates compose and how the shipped CSS is built.

The templates require book data as arguments; [Storybook sample data](../../storybook/sample-books.ts) supplies the stories. The `options` lists hold only element display settings. [The Storybook stories](../../storybook/stories/tv-book-catalog.stories.ts) show the catalog and detail; separate [cover](../../storybook/stories/tv-book-cover.stories.ts), [card](../../storybook/stories/tv-book-card.stories.ts) and [grid](../../storybook/stories/tv-book-grid.stories.ts) stories show the parts. This contract does not choose exact CSS values or internal rendering structure; those choices must satisfy the presentation and accessibility requirements above.

The stylesheet supplies usable defaults outside Television, follows light and dark colour schemes, and allows page overrides without a shadow root. Its colours, type and spacing resolve first through `--tv-book-catalog-*` variables, then matching Television variables, then built-in defaults. Both elements leave the page background, outer padding and header to the artifact. No font, icon or cover service is required.

## Left to the page

The surrounding artifact owns:

- fetching and adapting catalog and detail records, with explicit loading and error states;
- keeping records current through documented update mechanisms when the environment supports them;
- preventing an older asynchronous response from replacing a newer selection;
- responding to `bookactivate` by showing the selected detail view;
- history for catalog and detail views, including any catalog filter, order and scroll state;
- routing a `bookactivate` request to a distinct catalog-detail URL;
- browser or host Back and Forward integration when the environment documents a supported mechanism;
- focus transitions and restoration as described in [Keyboard and focus](#keyboard-and-focus);
- source selection, retries, page headings, padding and background.

The page routes detail to a distinct same-artifact URL, such as a `book` query parameter. When the environment documents a supported history mechanism, that navigation records a native step; browser or host Back restores the catalog and Forward restores the selected detail. Direct detail entries do not add a return link; native history remains available when the host provides it.

The skill instructions explain how to wire these responsibilities using documented facilities. They do not require an undocumented host API or prescribe a data server. Static embedded records remain a supported input; they do not imply fetching or live updates.

## Skill contents and specification dependencies

The built skill in `skills/tv-book-catalog/` contains:

- `SKILL.md`: when to use the skill, loading both assets next to the artifact `index.html`, the record contract, both elements, request events, state handling, safe content and URLs, and short examples of page-owned navigation and focus restoration;
- `tv-book-catalog.js`: one self-contained ES module defining both elements, with no runtime dependencies;
- `tv-book-catalog.css`: the distinct CSS strings in the default-exported element template, joined in order for both elements;

The build emits no `THIRD-PARTY-NOTICES.txt` for this skill because its module graph contains no third-party code.

The [repository specification](../index.md) defines package layout, tools, build output and testing conventions. The [tv-markdown specification](../tv-markdown/index.md) supplies the existing convention for documenting a light-DOM artifact element, page-owned behaviour and CSS held in a template; it is not a runtime dependency. Neither `tv-markdown` nor another Television skill is needed to render descriptions or navigate between these two views.

The source package is one private package named `tv-book-catalog` in `packages/tv-book-catalog/`, containing `package.json` with a `build` script, `SKILL.md`, TypeScript source in `src/`, tests in `test/` and build configuration. Main built filenames and the specification, package and built folders all use `tv-book-catalog`, as required by the repository convention. Both elements belong to this single package and built skill; detail is not a separate package.

This specification does not select internal source modules or rendering algorithms. The source, tests, build output and template remain separate files; this specification is not the published skill.
