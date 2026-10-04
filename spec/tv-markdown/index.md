# tv-markdown — specification

`tv-markdown` is an artifact skill that renders Markdown as Television prose through one custom element, `<tv-markdown>`. This specification defines the contract of that element: how Markdown goes in, what comes out, how links behave, and what the element leaves to the page that uses it.

The element is generic. It does not know where its Markdown comes from or where its links lead. It also doesn't know whether it is in Television, or a generic web page.

## Element

- `<tv-markdown>` is defined by the module `tv-markdown.js`, which bundles its Markdown parser (Marked) and sanitizer (DOMPurify).
- Rendered content is placed in the light DOM of the element, not a shadow root. Page styles and page event listeners therefore apply to it.

## Element API

Importing `tv-markdown.js` defines `<tv-markdown>`. The module exports the element class `TvMarkdownElement` and the event class `LinkClickEvent`.

| Kind      | Name                            | Description                                                                                                                                                                                       |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Property  | `markdown`                      | The Markdown source, as a string. Setting it renders. See [Input](#input).                                                                                                                        |
| Child     | `<script type="text/markdown">` | Markdown written into the page. See [Input](#input).                                                                                                                                              |
| Attribute | `show-frontmatter`              | Shows the document's frontmatter as a properties panel above the content. See [Frontmatter](#frontmatter).                                                                                        |
| Property  | `frontmatter`                   | Read-only. The parsed frontmatter of the current document as an object, or `null` when there is none or it cannot be parsed.                                                                      |
| Event     | `linkclick`                     | A `LinkClickEvent`, dispatched when a link is clicked with the primary button. Bubbles; cancelable. See [Links](#links).                                                                          |
| Event     | `render`                        | A plain `Event`, dispatched after each render, including a clear. Does not bubble. Pages that build on the rendered content, such as section navigation from the headings, run in response to it. |

`LinkClickEvent` is a `MouseEvent`. It carries the button, pointer position and modifier keys (`metaKey`, `ctrlKey`, `shiftKey`, `altKey`) of the click that caused it, and adds these read-only properties:

- `href` — the `href` of the clicked link as written, or `null` for a wikilink without an address.
- `wikilink` — the target of a wikilink as written, including any `#` part; `null` for an ordinary link.
- `anchor` — the clicked `<a>` element, for uses beyond navigation, such as reading the link text or placing a preview beside the link.

## Input

Markdown arrives in one of two ways.

- **The `markdown` property.** Assigning a string renders it immediately. Assigning an empty string, `null` or `undefined` clears the content. Reading the property returns the current Markdown source.
- **An inline script.** A child `<script type="text/markdown">` holds Markdown written directly into the page. The browser does not parse the inside of a script element as HTML, so characters such as `<` and `&` reach the element unchanged. The element reads the script when it is connected, or once the document finishes parsing if the script is not yet present. It removes leading and trailing blank lines and the indentation shared by all non-blank lines, then renders the result.

Text placed directly inside the element without the script is not read. Assigning `markdown` replaces any inline content. Rendering replaces all children of the element, including the inline script.

## Output

- Markdown is parsed as GitHub-flavoured Markdown.
- The result is sanitized before insertion. Only these elements are kept: `p`, `br`, `hr`, `h1`–`h6`, `strong`, `em`, `del`, `s`, `blockquote`, `ul`, `ol`, `li`, `pre`, `code`, `a`, `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, and `input` with `type="checkbox"` for task lists. Only these attributes are kept: `href`, `src`, `alt`, `title`, `start`, `colspan`, `rowspan`, `id` on headings, and `type`, `checked` and `disabled` on task-list checkboxes. Raw HTML using those elements and attributes survives sanitizing. Data and ARIA attributes, scripts, styles, frames and other elements outside the list are removed.
- Task-list items (`- [ ]` and `- [x]`) render with a disabled checkbox in place of the bullet. The checkbox shows state; it does not change it.
- Image `src` values are kept as written; relative addresses resolve against the page address.

### Heading ids

Each heading receives an `id` so that `#section` links can address it. The id follows the GitHub convention: the heading text in lowercase, with characters other than letters, digits, spaces and hyphens removed, and spaces replaced by hyphens. A repeated id receives the suffix `-1`, `-2` and so on, in document order. Links to `#section` within the content scroll to the heading through normal browser behaviour.

## Frontmatter

A document may begin with YAML frontmatter: a first line `---`, YAML, and a closing line `---` or `...`. The element separates it from the Markdown before rendering, so frontmatter never appears as text in the content. Anything else at the start of a document is ordinary Markdown.

- Without the `show-frontmatter` attribute, frontmatter is hidden. The `frontmatter` property still returns it.
- With the attribute, the element renders a properties panel before the content: a `<dl data-frontmatter>` holding one `<div>` per key, each with a `<dt>` for the key and a `<dd>` for the value, in the order the keys appear.
- Values render by type, always as text and never as HTML:
  - strings as text, except that an address beginning `http://` or `https://` renders as an ordinary link and a value that is entirely a wikilink renders as a wikilink, with the same `linkclick` behaviour as in the content;
  - numbers and dates as written;
  - `true` and `false` as read-only checkboxes;
  - `null` and empty values as a muted dash, with `data-empty` on the `<dd>`;
  - lists as a `<ul>` of items, each rendered by the same rules and shown as a small rounded tag;
  - nested objects as a one-line `key: value` summary in a `<code>` element.
- Frontmatter that is not valid YAML is hidden, and `frontmatter` is `null`; with the attribute, the panel shows the raw frontmatter in a code block instead.

The panel is generated by the element after sanitizing, so its structure and attributes cannot come from the Markdown. The YAML parser is bundled into `tv-markdown.js`.

## Wikilinks

`[[target]]` and `[[target|label]]` render as links.

A wikilink target is not an address. Its meaning, such as a name or a path from the root of a vault, is known only to the page, so the element does not interpret it and gives the wikilink no address. A wikilink renders as an `<a>` without `href`, styled as a link, focusable, and activated by a click or the Enter key. Activation dispatches `linkclick` with the target in `wikilink`; nothing else happens unless the page acts on the event.

- The label is the text after `|`. Without one, the label is the target as written.
- Inside Markdown tables, `[[target\|label]]` is read as a wikilink with a label.
- `[[…]]` inside code spans and code blocks stays code.
- Each wikilink anchor carries its target in a `data-wikilink` attribute. The element adds this attribute after sanitizing, so it cannot come from the Markdown itself. Page styles can use it to style wikilinks.

A page that wants wikilinks to behave as addresses, for example so that a modifier-click opens a new tab through the browser, sets an `href` on each wikilink anchor in response to `render`. Those anchors then behave as ordinary links, and their `linkclick` events carry both `href` and `wikilink`.

## Links

Markdown links render as ordinary `<a href>` elements with the `href` as written.

A click with the primary button on any link, whatever modifier keys are held, dispatches `linkclick` on the element first. The exception is a link whose `href` starts with `#`, which moves to its heading through normal browser behaviour. If a listener calls `preventDefault()`, nothing else happens and the page handles the link. Otherwise the browser does what it normally does for that click: it follows the link, or opens it in a new tab or window when a modifier key is held. Inside a Television artifact, Television records a followed link and provides Back and Forward. A wikilink without an address has no browser behaviour to fall back on.

Clicks with other buttons, such as the middle button, are reported by browsers as `auxclick` rather than `click`. The element leaves them to the browser and does not dispatch `linkclick` for them.

A page that opens notes inside the same artifact needs only this:

```js
md.addEventListener('linkclick', event => {
  if (event.wikilink) openNote(event.wikilink, { newTab: event.metaKey || event.ctrlKey });
});
```

## Styling

The element stylesheet styles all rendered content itself, so the element looks the same inside Television and on any other web page. [`style.css`](style.css) is the authority for every element CSS value; the build copies it unchanged as `tv-markdown.css`. The Markdown transformation is specified by the output rules above and tested by the package. [The Storybook stories](../../storybook/stories/tv-markdown.stories.ts) show the stylesheet on [sample rendered HTML](../../storybook/sample-markdown.ts), with light and dark colour schemes, wide and narrow widths, and page overrides of the variables. They do not load the production element.

Its typography is a copy of the prose rules in the Television canonical stylesheet (`/canonical/v2/base.css`, the rules for regions marked `text-display="prose"`): the body size and line height, the heading scale, the space between blocks, underlined links, list indentation, blockquotes, code, rules, tables and images. The copy is scoped to `tv-markdown` and keeps the zero specificity of the original (`:where()`), so any page style overrides it. The element does not use the `text-display` attribute.

Beyond the copied rules:

- Wikilinks look the same as ordinary links. Pages that want them to differ select them by `data-wikilink`.
- Links and wikilinks show a focus outline when focused from the keyboard.
- Task-list checkboxes hang in the list indent in place of the bullet.
- The frontmatter properties panel is a muted panel with rounded corners: keys in a muted column capped at 40% of the width, values beside them, and list items as small rounded tags.
- Built-in colour defaults follow the `color-scheme` in effect for the element, so a page that declares a dark scheme gets dark defaults outside Television.
- Code blocks and tables scroll horizontally instead of overflowing. Tables display as blocks, and words in table cells stay whole.
- A nested list has no gap below it inside its parent item.
- Images are at most the width of the element and keep their aspect ratio.
- The first rendered block has no top margin and the last has no bottom margin.
- Long words and addresses in running text wrap.

The element paints no background of its own; the page surface shows through.

### Variables

The element exposes the variables below. Each resolves through three layers: the `--tv-markdown-*` variable when the page sets it, otherwise the Television variable, otherwise a built-in default. Inside Television the element therefore matches Television prose and follows the active theme with no configuration; elsewhere the built-in defaults apply. A page overrides a variable by setting it on the element or an ancestor. The stylesheet resolves each variable once, at the top, for example `--_text: var(--tv-markdown-text, var(--color-text, <default>));`. Exact default values live in `tv-markdown.css`.

| Variable                         | Television variable      | Used for                                                                  |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `--tv-markdown-text`             | `--color-text`           | body text                                                                 |
| `--tv-markdown-text-muted`       | `--color-text-muted`     | blockquote text                                                           |
| `--tv-markdown-link`             | `--color-link`           | link text                                                                 |
| `--tv-markdown-border`           | `--color-border`         | rules, and table, code block and blockquote borders                       |
| `--tv-markdown-code-background`  | `--color-surface-muted`  | code and table header backgrounds                                         |
| `--tv-markdown-focus`            | `--outline-focus`        | the focus outline on links, as an `outline` value                         |
| `--tv-markdown-font`             | `--font-sans`            | body text                                                                 |
| `--tv-markdown-font-mono`        | `--font-mono`            | code                                                                      |
| `--tv-markdown-text-size`        | `--text-md`              | body text                                                                 |
| `--tv-markdown-heading-1-size`   | `--text-3xl`             | `h1`                                                                      |
| `--tv-markdown-heading-2-size`   | `--text-xl`              | `h2`                                                                      |
| `--tv-markdown-heading-3-size`   | `--text-lg`              | `h3` to `h6`                                                              |
| `--tv-markdown-code-size`        | `--text-sm`              | code                                                                      |
| `--tv-markdown-weight`           | `--font-weight-medium`   | body text                                                                 |
| `--tv-markdown-heading-weight`   | `--font-weight-semibold` | headings                                                                  |
| `--tv-markdown-block-space`      | `--space-12`             | space after paragraphs, lists, blockquotes, code blocks, rules and tables |
| `--tv-markdown-radius`           | `--control-radius`       | corners of code and code blocks; the properties panel uses twice this     |
| `--tv-markdown-panel-background` | `--color-surface-muted`  | the frontmatter properties panel                                          |

The remaining spacing in the copied rules, such as heading margins and list indentation, resolves the matching Television spacing variable directly, with a built-in default, and is not exposed. Line heights are fixed numbers, as in the original. Television prose uses medium weight for its Hind typeface; the built-in default for `--tv-markdown-weight` is normal weight, which suits system fonts.

## Interactivity

The element renders what it is given; where the Markdown comes from and where its links lead are up to the page. The skill instructions tell agents to make two things live when the environment supports them, using whatever mechanism the environment documents, and to keep the plain behaviour otherwise. An agent decides from what the environment documents, such as its own instructions or the documentation of the server that holds the file. It does not probe for undocumented mechanisms.

### Live updates

The page keeps the content current as the document changes. This is supported when the page loads the document over HTTP from an address it can reach, and the environment documents a way to learn that the document changed. Markdown written into the page, generated once by the agent, or held where no server exposes it renders once.

### Following links

Clicking a link to another document opens it inside the page, with Back and Forward returning to earlier documents. This is supported when the target is a document the page can load the same way as the current one: a relative link that resolves on the same server, or a wikilink whose meaning the environment documents, such as a path from the root of a vault. Other links keep their normal behaviour, and wikilinks whose meaning is not documented stay without an address.

## Left to the page

- fetching the Markdown, and wiring [Interactivity](#interactivity) where the environment supports it;
- deciding what a wikilink target means and what activating it does;
- the page title, header, padding and background;
- section navigation;
- editing. A later `<tv-markdown-editor>` element in the same package is the intended route. It would share the `markdown` property and appearance, and load only when a page needs it.

## Skill contents

The built skill, in `skills/tv-markdown/`, contains:

- `SKILL.md`: when to use the skill, how to load it (copy `tv-markdown.js` and `tv-markdown.css` next to the artifact `index.html`), both input forms, wikilinks, handling `linkclick`, [Interactivity](#interactivity) with its conditions, and short examples;
- `tv-markdown.js`, with the parser and sanitizer bundled;
- `tv-markdown.css`, copied from [`style.css`](style.css).

The source package, in `packages/tv-markdown/`, holds the element code, `SKILL.md` and tests: unit tests for indentation removal, heading ids, wikilink parsing and sanitizing, and browser tests for rendering, the precedence of the property over inline content, `linkclick` and `render`. The repository layout and build are specified in [the repository specification](../index.md).
