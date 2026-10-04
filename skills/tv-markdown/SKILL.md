---
name: tv-markdown
description: Render Markdown as Television prose in an HTML artifact, with safe formatting, heading links, task lists, and page-controlled wikilinks.
---

# Render Markdown in an artifact

Use `<tv-markdown>` when an HTML artifact needs to show a Markdown document. The element renders GitHub-flavoured Markdown in its light DOM. It supplies prose styling, heading ids, and read-only task checkboxes. Your page supplies the document, layout, and any navigation or editing behaviour.

## Load the element

Copy `tv-markdown.js` and `tv-markdown.css` from this skill folder next to the artifact `index.html`. Load both from that folder:

```html
<link rel="stylesheet" href="./tv-markdown.css">
<script type="module" src="./tv-markdown.js"></script>
```

For a Television artifact, also load the canonical stylesheet and components as the `television` skill describes. Give the page its own padding, and paint its background yourself, because the element paints none:

```css
body { background: var(--color-surface); }
```

Inside Television the artifact frame shows the theme surface behind a transparent page. Opened anywhere else, such as a browser tab or a home-screen web app, a transparent page shows the browser default white, and the light text of a dark theme becomes unreadable.

## Supply Markdown

Set the `markdown` property when the text arrives from JavaScript. Setting it again replaces the rendered content; setting `''`, `null`, or `undefined` clears it.

```html
<tv-markdown id="document"></tv-markdown>
<script type="module">
  const documentView = document.querySelector('#document');
  documentView.markdown = '# Reading notes\n\nSee [[jane|Jane]].';
</script>
```

For text written into the HTML, put a `text/markdown` script inside the element. The element removes surrounding blank lines and the indentation shared by its nonblank lines. Use the script so `<` and `&` in the source reach the Markdown parser unchanged.

```html
<tv-markdown>
  <script type="text/markdown">
    # Reading notes

    See [[jane|Jane]].
  </script>
</tv-markdown>
```

Text directly inside `<tv-markdown>` is ignored. Assigning the property takes precedence over the inline script and replaces all children. The `markdown` getter returns the current source.

## Show frontmatter

A document can start with YAML between a first-line `---` and a closing `---` or `...`. The element removes that block from the rendered Markdown. Read `documentView.frontmatter` for the parsed object; it is `null` when frontmatter is absent or invalid.

Add `show-frontmatter` to display a properties panel above the content. It is hidden by default. Adding or removing the attribute later renders the current document again. Invalid YAML appears as raw text in a code block when the panel is shown.

## Handle links

Ordinary Markdown links have their authored `href`. Links to a heading, such as `[Sources](#sources)`, use normal browser scrolling. Other primary-button clicks dispatch a bubbling, cancelable `linkclick` event before browser navigation. The event is a `MouseEvent` with the original pointer position and modifier keys. It has `href`, `wikilink`, and `anchor` properties.

`[[target]]` and `[[target|label]]` become focusable links with no address. A click or Enter dispatches `linkclick` with the target in `wikilink`; the element leaves the meaning of that target to your page. Inside a Markdown table, escape the separator as `[[target\|label]]`. Wikilink syntax inside code remains code.

```js
documentView.addEventListener('linkclick', event => {
  if (event.wikilink !== null) {
    event.preventDefault();
    openNote(event.wikilink, { newTab: event.metaKey || event.ctrlKey });
  }
});
```

Call `preventDefault()` when your page handles an ordinary link too. Without it, the browser follows the link as usual. Middle clicks remain browser controlled and do not dispatch `linkclick`.

To give wikilinks browser navigation, set an `href` on each `a[data-wikilink]` after rendering. Their events then carry both `href` and `wikilink`. The `render` event fires after every render, including a clear, and does not bubble:

```js
documentView.addEventListener('render', () => {
  for (const anchor of documentView.querySelectorAll('a[data-wikilink]')) {
    anchor.href = addressFor(anchor.dataset.wikilink);
  }
  updateSections(documentView.querySelectorAll('h1, h2, h3, h4, h5, h6'));
});
```

The element removes scripts, styling, data attributes from source Markdown, and other content outside its allowlist. Keep application state and controls in the page around it.

## Make it live when the environment allows

When the environment supports it, wire up two behaviours using the mechanism the environment documents, such as your instructions or the documentation of the server that holds the file:

- **Live updates.** Keep the content current as the document changes. This applies when the page loads the document over HTTP and the environment documents a way to learn that it changed. Markdown written into the page, generated once, or held where no server exposes it renders once.
- **Following links.** Clicking a link to another document opens it inside the page, with Back and Forward returning to earlier documents. This applies to relative links that resolve on the same server and to wikilinks whose meaning the environment documents, such as a vault path. Other links keep their normal behaviour; wikilinks without a documented meaning stay without an address.

If the environment documents no way to do either, keep the plain behaviour. Do not probe for undocumented mechanisms.
