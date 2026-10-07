---
name: tv-code
description: Show a set of files, such as a code repository, in an HTML artifact as a file tree beside syntax-highlighted code, rendered Markdown and images, kept live as the files change.
---

# Show code in an artifact

Use `<tv-code>` when an HTML artifact needs to show files: a repository, a folder of scripts, an example project, or a few snippets. The element shows a file tree in a sidebar beside the open file. Code is highlighted in about 35 languages, Markdown is rendered, and images are shown. Readers can find a file by name with `Ctrl+P` or `Cmd+P`, select lines and wrap long lines. The element only shows files; it does not edit them.

The element is a view. It does not know where its files come from. Your page supplies them in one of three ways, described below, and tells the element when they change.

## Load the element

Copy `tv-code.js` and `tv-code.css` from this skill folder next to the artifact `index.html`, and load both:

```html
<link rel="stylesheet" href="./tv-code.css">
<script type="module" src="./tv-code.js"></script>
```

For a Television artifact, also load the canonical stylesheet and components as the `television` skill describes; the element then follows the active theme. The element is `100dvh` tall by default, which suits an artifact that shows only the viewer. Remove the body margin:

```css
html, body { margin: 0; }
```

In a larger layout, set the height of the element yourself.

## Supply files

### Write them into the page

For a few files known when you write the page, use child tags. No page JavaScript is needed.

```html
<tv-code label="hello-world">
  <tv-code-file path="README.md">
    <script type="text/plain">
      # Hello world

      Run `node src/index.js`.
    </script>
  </tv-code-file>
  <tv-code-folder path="src">
    <tv-code-file path="index.js">
      <script type="text/plain">
        console.log("Hello, world");
      </script>
    </tv-code-file>
  </tv-code-folder>
  <tv-code-file path="logo.png" src="./logo.png"></tv-code-file>
</tv-code>
```

- Put the text of each file in a `<script type="text/plain">`, so `<` and `&` in the code stay as written. Write `</script` inside the code as `<\/script`.
- Indent freely: the element removes the indentation shared by all lines, and the blank lines at the start and end.
- Paths inside `<tv-code-folder>` are relative to it. Folders are implied by file paths, so `<tv-code-file path="src/index.js">` works without a folder tag.
- `src` gives an image address. `language` overrides the language detected from the file name. `dimmed` shows an entry at reduced emphasis.

### Assign them from a script

For files your script already has, assign `files`: an object of paths to text, or an array of entries.

```js
const viewer = document.querySelector("tv-code");
viewer.files = {
  "README.md": "# Hello world",
  "src/index.js": 'console.log("Hello, world");',
};
```

An array entry is `{ path, type, content, src, language, size, modified, dimmed }`. Only `path` is required. Set `type` to `"folder"` for an empty folder or to set its `dimmed` value; otherwise folders are implied by file paths. Assign a new value to update the view; changing the old one in place does nothing.

### Connect a service

For a repository or anything else too large to supply at once, assign a `connection`: an object with two functions the element calls as the reader opens folders and files.

```js
viewer.connection = {
  // The entries directly inside a folder; "" is the root.
  list: async path => (await (await fetch(folderUrl(path))).json()).entries,
  // The contents of a file: a string, or the fetch Response itself.
  read: path => fetch(fileUrl(path)),
};
```

- `list(path)` returns entries with `name` (or a full `path`) and `type` (`"file"`, or `"folder"`, `"dir"` or `"directory"`), plus `size` and `modified` when the service provides them. A service that can list everything at once may return the whole subtree with full paths from `list("")`; the element then makes no further `list` calls.
- `read(path)` returns a string, a `Response`, a `Blob` or bytes. Returning the `Response` lets the element skip files over 2 MB and show images without more code.
- Throw or reject with a clear message when something fails; the reader sees it with a Retry button.
- Encode each path segment when building a URL: `path.split("/").map(encodeURIComponent).join("/")`.

## Show one file

Supply one file to `files`, or set `selected` and connect a `read` function without `list`. The file opens immediately with the pane filling the element.

```js
viewer.files = { "src/app.ts": "console.log('Hello');" };

// Or read one file from a service:
viewer.selected = "src/app.ts";
viewer.connection = { read: path => fetch(fileUrl(path)) };
```

## Make it live when the environment allows

When the files can change while the page is open, keep the view current using the mechanism your environment documents, such as your instructions or the documentation of the server that holds the files:

- With `files` or child tags, assign new `files` or edit the tags. The element updates in place.
- With a connection, call `viewer.refresh(path)` for each change the service reports, and `viewer.refresh()` after reconnecting to a change stream that has no replay. Call it straight from the change signal: the element combines nearby calls and reloads affected folders and the open file.

The open file updates without moving the reader: the line at the top stays at the top, and changed lines are marked briefly. A deleted file is marked `Deleted` and keeps its last content.

If the environment documents no way to learn about changes, the view shows the files as they were when loaded. Do not probe for undocumented mechanisms.

## Optional: share the open file in the address

The element remembers the open file, selected lines and folders for each page and restores them on the next visit. To give someone else a link to the same file and lines, keep them in the page address:

```js
const params = new URLSearchParams(location.hash.slice(1));
if (params.has("file")) {
  viewer.selected = params.get("file");
  viewer.lines = params.get("lines");
}
viewer.addEventListener("select", ({ detail }) => {
  const next = new URLSearchParams({ file: detail.path });
  if (detail.lines) next.set("lines", detail.lines);
  history.replaceState(null, "", "#" + next);
});
```

## Reference

| Name | Kind | Meaning |
| --- | --- | --- |
| `label` | attribute | Name of the root, such as the repository name. Default `Files`. |
| `selected` | attribute and property | Path of the open file. Set it to open a file; without a page selection, the remembered file or a root README opens. |
| `lines` | attribute and property | Selected lines of the open file, as `12` or `12-20`. A range beyond the end of a nonempty file clamps to its last line. |
| `wrap` | boolean attribute | Wrap long lines. The reader can toggle it. |
| `show-source` | boolean attribute | Show Markdown and SVG as source instead of rendered. The reader can toggle it. |
| `dim` | attribute | Name patterns shown dimmed, separated by spaces or commas, with `*` as a wildcard. Default: `.* node_modules dist build out coverage target __pycache__ .venv venv vendor`. Add your own build folders. |
| `files` | property | All files at once. |
| `connection` | property | `{ list?, read }` functions for files on demand. Omit `list` to show the file named by `selected`. |
| `refresh(path?)` | method | Fetch through the connection again, for one changed path or for everything. |
| `select` | event | The reader opened a file or changed the line selection. `detail` is `{ path, lines }`. Not sent when your script sets `selected` or `lines`. |
| `linkclick` | event | A link was clicked in rendered Markdown. Call `preventDefault()` to handle it yourself; otherwise relative file links open in the viewer, heading links scroll within it, and external links open in a new tab. The viewer leaves the page address unchanged. |

The viewer styles itself and follows the Television theme. To adjust it, set `--tv-code-*` variables on the element; `tv-code.css` lists them at the top.
