# tv-code — specification

`tv-code` is an artifact skill for reading a set of files, such as a code repository, in a page. It provides one custom element, `<tv-code>`: a file tree in a sidebar beside a pane that shows the chosen file with syntax highlighting, or rendered when it is Markdown or an image. This specification defines the contract of that element: how files go in, what the reader sees and can do, the events it reports, and what it leaves to the page.

The element is a view. It does not know where its files come from, whether they are static or live, or what kind of page it is in. Files arrive as child tags written into the page, as a property holding all of them, or through a connection: functions the page supplies to read a file and, for a set of files, to list a folder. Any service that can list folders and return file contents can be connected with a few lines of script.

## Element

- Importing `tv-code.js` defines `<tv-code>`. The module exports the element class `TvCodeElement`.
- The module is self-contained. It bundles its syntax highlighter (Shiki, with a fixed set of languages) and the `tv-markdown` element, which renders Markdown files. A page that also loads `tv-markdown.js` keeps whichever definition of `<tv-markdown>` loaded first; both are the same element.
- The element renders its interface in its light DOM, inside one generated container. It does not use a shadow root, so page styles and event listeners apply to the rendered content. Child tags that describe files stay in place and are hidden.
- The element fills the space it is given. Its default height is the height of the viewport (`100dvh`), which suits an artifact that shows only the viewer; a page that places it in a larger layout sets its height.

## Files

The element shows one set of files, organised as a tree of folders. A path names a file or folder from the root of the set: segments separated by `/`, without a leading or trailing `/`, such as `src/app.ts`. The root itself is the empty path `""`.

### Entries

Every input describes files and folders as entries. An entry is an object with these fields:

| Field      | Type                   | Meaning                                                                                                                                           |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`     | string                 | The full path of the file or folder. Required, except in a `list` result, where `name` may be given instead.                                     |
| `name`     | string                 | In a `list` result only: the name of the entry within the listed folder. The path is the folder path, `/`, and the name.                         |
| `type`     | string                 | `"file"` or `"folder"`. `"dir"` and `"directory"` also mean a folder. Missing or any other value means a file.                                     |
| `size`     | number                 | Optional size of a file in bytes.                                                                                                                 |
| `modified` | string or number       | Optional time the file last changed: an ISO 8601 string or milliseconds since the Unix epoch.                                                     |
| `dimmed`   | boolean                | Optional. `true` shows the entry dimmed and `false` shows it normally, overriding the [dim patterns](#dimmed-entries).                             |
| `language` | string                 | Optional language of a file, as a language name or alias the highlighter knows, such as `ts` or `python`. Overrides detection from the file name. |
| `content`  | string                 | In the `files` property only: the text of the file.                                                                                               |
| `src`      | string                 | In the `files` property and child tags only: an address from which the browser can load the file as an image.                                    |

Folders do not need entries of their own. A file at `src/lib/util.ts` implies the folders `src` and `src/lib`. An entry of type folder is needed only for an empty folder, or to set `dimmed` on a folder.

Unknown fields are ignored, so a page can pass entries from its own data without copying them.

### Child tags

Files can be written into the page as child tags, with no script:

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

- `<tv-code-file>` describes a file. Its attributes are the entry fields `path`, `src`, `language`, `size`, `modified` and `dimmed` (a boolean attribute).
- `<tv-code-folder>` describes a folder, with the attributes `path` and `dimmed`. Tags inside it take paths relative to it, so the file above is `src/index.js`. Folders can be nested.
- The text of a file is the content of a child `<script type="text/plain">`. The browser does not parse the inside of a script element as HTML, so `<` and `&` in the code reach the element unchanged; only the sequence `</script` must be written differently, for example as `<\/script`. Any script `type` other than a JavaScript type works the same way. Without a script, the text content of the tag is used, which is suitable only for text without `<` or `&`.
- The element removes the leading and trailing blank lines of the text and the indentation shared by its non-blank lines, so the file can be indented to match the surrounding HTML.

The element reads the child tags when it is connected, or when the document finishes parsing if they are not yet present. While no property has been assigned, it reads them again whenever they change, so a page script that edits the tags updates the view.

### The `files` property

Assigning `files` replaces the whole set at once. It accepts either an array of entries or an object that maps each path to the text of the file:

```js
viewer.files = {
  "README.md": "# Hello world",
  "src/index.js": 'console.log("Hello, world");',
};
```

The element reads only the fields listed in [Entries](#entries). To update the view, assign a new value; changing the supplied array or objects in place does nothing.

### The `connection` property

For a set that is too large to supply at once, or that lives on a server, the page assigns a connection: an object with functions that the element calls as it needs data, `read` always and `list` for a set of files.

```ts
interface Connection {
  list?(path: string): Entry[] | Promise<Entry[]>;
  read(path: string): ReadResult | Promise<ReadResult>;
}

type ReadResult = string | Response | Blob | ArrayBuffer | ArrayBufferView;
```

- `list(path)` returns the entries inside the folder at `path`. It is optional: a connection without it shows a [single file](#single-file). The element calls it for the root when the connection is assigned, for a folder the first time it is opened, and on [refresh](#live-updates). It does not call it again for a folder that has been listed, except on refresh.
  - The result is normally the direct children of the folder. Entries may use `name` instead of `path`.
  - A result may instead contain the whole subtree below the folder, with full paths. When any entry lies more than one level below the listed folder, the element treats the result as complete for every folder in it and does not list those folders separately. A connection whose service can return everything at once uses this to supply the whole set in one call.
- `read(path)` returns the contents of a file. The element calls it when a file is opened, on refresh, and for images referenced by rendered Markdown.
  - A string is the text of the file.
  - A `Response`, as returned by `fetch`, is read by the element. A response whose status is not in the 200 range is a failure; its message is the `error` or `message` field when the body is a JSON object that has one as a string, and otherwise the status and status text.
  - A `Blob`, `ArrayBuffer` or typed array holds the bytes of the file. The element decodes text as UTF-8, and uses the bytes directly to show an image.
- A thrown error or rejected promise is a failure, shown to the reader with its message (`error.message`, or the value itself when it is not an `Error`).

The page usually supplies a connection with a few lines that call its service with `fetch`. For a service that lists a folder as JSON entries with `name` and `type` fields and returns each file at its own address:

```js
const base = "https://files.example/project/";
const url = path => base + path.split("/").map(encodeURIComponent).join("/");

viewer.connection = {
  list: async path => (await (await fetch(url(path) + "/")).json()).entries,
  read: path => fetch(url(path)),
};
```

### Single file

Showing one file is as simple as showing a folder. The element shows a single file when its input holds one file:

- `files`, or the child tags, describe exactly one file, at any path; or
- the connection has no `list` function. The file is the one named by `selected`, read through `read`.

```js
viewer.selected = "src/app.ts";
viewer.connection = { read: path => fetch(fileUrl(path)) };
```

The file opens at once, without `selected` when the input names it. There is no sidebar, no resize handle, no button to open the sidebar, no Find file button, and the finder keys do nothing. The file header shows the folders of the path as plain text, then the file name. Everything else is as for any open file: highlighting, rendered Markdown, line selection, wrapping, and live updates through new `files`, edited child tags, or `refresh()` on the connection. When the input changes to hold more than one file, or a connection with `list`, the sidebar appears.

### Input precedence

The view shows the most recently supplied input. Assigning `files` replaces a connection and child tags; assigning `connection` replaces `files` and child tags. Assigning `null` or `undefined` to the property in use clears the view. Child tags are read only while neither property has been assigned.

When the input changes, the element keeps the open file, the line selection and the open folders wherever the same paths exist in the new input.

## Element API

| Kind      | Name              | Description                                                                                                                                                                            |
| --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Property  | `files`           | All files at once, as an array of entries or an object of paths to text. See [The `files` property](#the-files-property).                                                             |
| Property  | `connection`      | An object with a `read` function and an optional `list` function. See [The `connection` property](#the-connection-property).                                                            |
| Child     | `<tv-code-file>`, `<tv-code-folder>` | Files and folders written into the page. See [Child tags](#child-tags).                                                                                     |
| Attribute | `label`           | The name of the root, such as a repository name, shown at the top of the sidebar. Defaults to `Files`.                                                                                  |
| Attribute | `selected`        | The path of the open file. Reflects the property of the same name. See [Selection](#selection).                                                                                        |
| Attribute | `lines`           | The selected line range of the open file, as `12` or `12-20`. Reflects the property of the same name. See [Line selection](#line-selection).                                           |
| Attribute | `wrap`            | Boolean. Wraps long lines of code instead of scrolling horizontally. The reader toggles it from the file header.                                                                       |
| Attribute | `show-source`     | Boolean. Shows Markdown and SVG files as highlighted source instead of rendered. The reader toggles it from the file header.                                                          |
| Attribute | `dim`             | Name patterns for entries shown dimmed. See [Dimmed entries](#dimmed-entries).                                                                                                        |
| Method    | `refresh(path?)`  | Fetches data through the connection again. See [Live updates](#live-updates).                                                                                                                 |
| Event     | `select`          | A `CustomEvent`, dispatched when the reader opens a file or changes the line selection. See [Selection](#selection).                                                                    |
| Event     | `linkclick`       | The `tv-markdown` link event, from links in rendered Markdown. Bubbles; cancelable. See [Links in rendered Markdown](#links-in-rendered-markdown).                                       |

The `selected`, `lines`, `wrap` and `show-source` attributes change when the reader acts, so a page can observe them as well as set them. No property, attribute or method changes the page address or browser history.

## Layout

The element is divided left to right: the sidebar with the file tree, and the file pane taking the rest. A [single file](#single-file) has the file pane only. Both fill the height of the element and scroll independently.

### Sidebar

- **Header.** The top of the sidebar shows the `label` and a button that closes the sidebar.
- **Resize and close.** The right edge of the sidebar is a drag handle, 6 px wide, straddling the boundary, with a `col-resize` cursor; it shows as a thin bar while hovered or dragged. Dragging sets the width between 160 and 480 px, starting at 260 px. Dragging below 160 px holds the sidebar at 160 px until the pointer is within 80 px of the left edge of the element, where the sidebar snaps closed; dragging back out reopens it. Releasing while closed leaves the sidebar closed. Double-clicking the handle resets the width. The width is kept in `localStorage` for the page address path, so it survives reloads, and so are the other [remembered preferences](#remembered-preferences).
- **Open button.** While the sidebar is closed, a button at the start of the file header reopens it at its previous width. The sidebar width animates over 200 ms when it opens or closes by button, and follows the pointer without animation while dragged.
- **Narrow elements.** When the element is narrower than 600 px, the sidebar starts closed and opens over the file pane, with the pane dimmed behind it. Choosing a file, pressing Escape, or pressing the dimmed pane closes it.

### File tree

- **Rows.** One row per entry: a disclosure caret for folders, an icon for the kind of file, and the name. Rows are indented 12 px per level, with a faint vertical guide line for each level. Names do not wrap; a long name is cut off with an ellipsis, and the full path shows as the row tooltip. Each row carries its path in `data-path`.
- **Order.** Folders come before files at each level. Within each group, names are ordered case-insensitively, with numbers in names compared by value (`file2` before `file10`).
- **Folders.** Pressing a folder row, on the caret or the name, opens or closes it. Opening a folder that has not been listed calls `list` on the connection; if the listing takes longer than 200 ms, the caret becomes a small spinner until it arrives. A failed listing shows a row inside the folder with the message and a Retry button. Open folders stay open across refreshes and new input.
- **Files.** Pressing a file row opens it. The row of the open file is tinted more strongly than the hover tint.
- **Reveal.** When a file is opened from anywhere other than its row, such as the finder, a link or the `selected` property, the folders above it open, listing them if needed, and its row scrolls into view without animation.
- **Keyboard.** The tree is a single tab stop with ARIA tree semantics. Up and Down move focus between visible rows, and Home and End go to the first and last. Right opens a closed folder, or moves to the first child of an open one. Left closes an open folder, or moves to the parent folder. Enter or Space opens a file or toggles a folder. Typing printable characters moves focus to the next visible row whose name starts with the characters typed within the last 500 ms. Focus lands on the open file row when the tree receives focus, and otherwise on the first row. Focus and the open file are independent, and focus stays on the same row when the tree redraws.
- **States.** Before the root listing arrives, the tree shows placeholder rows after 200 ms. If the root listing fails, the sidebar shows the message and a Retry button. A set with no entries shows `No files`.

### Dimmed entries

Dimmed entries are shown at reduced emphasis and are otherwise ordinary: they can be opened, read and refreshed. The finder ranks them below other files and does not list dimmed folders through a connection on its own.

An entry is dimmed when its `dimmed` field is `true`, or when its field is absent and its name, or the name of a folder above it, matches a dim pattern. The `dim` attribute holds the patterns, separated by spaces or commas; `*` matches any run of characters and every other character matches itself. An empty `dim` attribute dims nothing by pattern. Without the attribute, the patterns are:

```text
.* node_modules dist build out coverage target __pycache__ .venv venv vendor
```

## File pane

The file pane shows the open file: a header, then its content. With no file open, it shows `No file open` and the key to open the finder. When a set is first shown and no file has been selected, the element opens the file named `README.md` at the root, if there is one (case-insensitive, also matching `README`, `README.markdown` and `README.txt`). This opening sets `selected` like any other but does not dispatch `select`.

### Header

The header stays at the top of the pane while the content scrolls. It shows:

- **Path.** Each folder of the path, then the file name in a heavier weight. The `label` is not repeated here; it is at the top of the sidebar. Pressing a folder name reveals that folder in the tree, opening the sidebar if it is closed.
- **Actions.** Icon buttons with tooltips and accessible names:
  - **Preview / Source**, for Markdown and SVG files: a two-option toggle that sets the `show-source` attribute.
  - **Wrap lines**, for files shown as code: a toggle that sets the `wrap` attribute. `Alt+Z` does the same.
  - **Find file**, always shown, last: opens the [file finder](#file-finder).

The header shows no other details of the file.

### Opening a file

When a file is opened, the header changes at once. The previous content stays in place until the new content is ready, faded after 200 ms, with a thin progress bar at the top of the pane. The scroll position starts at the top, or at the [selected lines](#line-selection) when there are any. A failed read shows the message and a Retry button in place of the content.

### Kinds of file

The element decides how to show a file from its name and, when needed, its bytes.

- **Images** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.bmp`, `.ico`, `.svg`) are shown at their natural size, scaled down to fit the pane, centred on a checkerboard backdrop. The image comes from `src` in the entry, or from the bytes returned by `read`. An SVG file can also be shown as source.
- **Markdown** (`.md`, `.markdown`, `.mdx`) is shown rendered, unless `show-source` is set. See [Markdown](#markdown).
- **Known binary files**, such as fonts, archives, PDF documents, audio, video and executables, are not read. The pane shows the file name, its size and `Binary file not shown`.
- **Large files**, larger than 2 MB by the `size` of their entry or the `Content-Length` of the response, are not read. The pane shows the size and a `Show anyway` button.
- **Other files** are read and shown as [code](#code). Text whose first 8,000 bytes contain a zero byte is binary, and is shown as a known binary file is.

### Code

- **Lines.** Each line has its number in a gutter at the left. The gutter stays in place when the code scrolls horizontally. Text selected and copied from the code contains the source text exactly: no line numbers and no added blank lines.
- **Highlighting.** The element highlights code in the [bundled languages](#languages), chosen from the `language` field of the entry or the file name. The text is shown plain at once and highlighted as soon as highlighting finishes. Highlighting runs in portions, so it never blocks the page for long, and a newer version of the file cancels the highlighting of an older one. Files over 20,000 lines are shown without highlighting. A file in another language is shown as plain text.
- **Wrapping.** By default long lines scroll horizontally. With `wrap`, they wrap at the width of the pane, with the line number on the first row only. Continuation rows keep the indentation of their line, as in VS Code, so nested code stays nested; a tab counts to the next 4-column stop, and the indentation is capped at 40% of the pane width so deeply nested lines keep room.
- **Typography.** Code uses the monospace font, with tab stops every 4 characters.

### Line selection

- Pressing a line number selects that line. Pressing another line number with Shift held selects the range between it and the first selected line. Pressing the number of the only selected line clears the selection.
- Selected lines are tinted across the full width of the pane, and the line numbers are emphasised.
- Setting `lines` selects that range in the open file and scrolls it into view, about a third of the way down the pane. A range that reaches beyond the end of the file is cut to the last line; in an empty file the selection is cleared.
- When the reader opens another file, the selection is cleared, unless the file is opened with a line range from a link or the finder. Setting `selected` leaves `lines` as it is; a page that sets one sets both.

### Markdown

Rendered Markdown uses the bundled `tv-markdown` element with its frontmatter panel shown, so the page matches other Markdown in Television. Rendered content is limited to a readable width and centred in the pane. Code blocks with a language are highlighted in the same colours as code files.

Relative image addresses in rendered Markdown are resolved against the folder of the Markdown file. An image that resolves to a file in the set is loaded from its `src` or through `read`. Other image addresses are left as written.

#### Links in rendered Markdown

A link click in rendered Markdown dispatches `linkclick` from `tv-markdown`, which bubbles through the viewer. A page that cancels it handles the link itself. Otherwise:

- A relative link, without a scheme and not starting with `/` or `#`, is resolved against the folder of the Markdown file and opens that path in the viewer. A fragment `#L12` or `#L12-L20` selects those lines; any other fragment scrolls the rendered target to the heading with that id. A link to a folder, ending in `/` or naming a known folder, reveals the folder.
- A link that starts with `#` moves to the heading in the current document.
- Any other link opens in a new browsing context, with `noopener`.
- A wikilink without an address does nothing beyond the event.

### Live updates

The element keeps the view current as its input changes, without moving the reader.

- **`files` and child tags.** Assigning new `files`, or editing the child tags, updates the view at once.
- **A connection.** The element cannot know when files behind a connection change, so the page reports changes by calling `refresh`:
  - `refresh()` lists every folder that has been listed again, and reads the open file again.
  - `refresh(path)` lists the parent folder of `path` again if it has been listed, lists `path` again if it is a listed folder, and reads the open file again if it is `path` or an image shown in it. Other paths are ignored.

  A folder that is no longer in the listing of its parent is not listed again. A failed listing during a refresh keeps the entries already shown and adds the failure row with Retry. In `files` and child-tag input, `refresh` does nothing.

  Calls within 100 ms of each other are combined, and each folder and file is fetched at most once for them. A call made while fetches are in flight starts one more round when they finish. A page therefore calls `refresh` directly from each change signal of its service, with no debouncing of its own, and calls `refresh()` after reconnecting to a change stream that has no replay.

When the open file changes:

- The line at the top of the pane stays at the top, following it through the change when lines are added or removed above it. Rendered Markdown keeps its scroll position.
- Added and changed lines are marked with a tint and a bar in the gutter, and the position of removed lines with a short mark between lines. The marks fade over 2.5 seconds; with reduced motion they disappear after the same time without fading.
- The line selection stays on the same lines, following them through the change.

When the open file is no longer in its folder listing or in new `files` or child tags, or its read fails with a 404 status, the header marks it `Deleted` and the last content stays, faded. If it returns, it is shown again. A path set through `selected` that was never in the set is a failure: the pane shows `File not found`. Other failed reads during a refresh keep the content and show the message in a bar above it, with a Retry button, until a read succeeds.

## Remembered preferences

The element remembers the choices a reader makes, in `localStorage` under the page address path, so each page, and so each artifact, keeps its own:

- the sidebar width, and whether the reader closed the sidebar on a wide element (an overlaid sidebar on a narrow element closes after every choice and is not remembered);
- the open folders;
- the open file and its selected lines;
- line wrapping and the Preview/Source choice.

On the next visit, the remembered folders open as they come into view, listing them through a connection when needed, and a remembered `wrap` or `show-source` choice takes precedence over the attribute in the markup. The remembered file opens, with its lines selected, unless the page has set `selected` before the input arrives; it takes the place of the README opening, and like it, sets `selected` without dispatching `select`. A remembered file that is no longer in the set is not opened. When storage is unavailable, the element starts from its defaults.

Pages therefore need no code of their own to return a reader to where they were. A page that also wants a shareable address for the open file keeps it in its address, as [Selection](#selection) shows.

## Selection

- `selected` is the path of the open file. Setting it opens that file, revealing it in the tree; the path does not have to be listed yet. Setting it to the path of a known folder reveals the folder and leaves the open file, and `selected`, unchanged. Setting it to `null` or an empty string closes the file.
- `lines` is the selected line range. See [Line selection](#line-selection).
- `select` is dispatched when the reader opens a file or changes the line selection: from the tree, the finder, a link in rendered Markdown or a line number. It is a `CustomEvent` that bubbles and is not cancelable. Its `detail` holds `path`, the open file, and `lines`, the line range or `null`. It is not dispatched for property or attribute assignments, or for the automatic opening of a README.

A page keeps the open file in its address with a few lines:

```js
const params = new URLSearchParams(location.hash.slice(1));
viewer.selected = params.get("file");
viewer.lines = params.get("lines");
viewer.addEventListener("select", ({ detail }) => {
  const next = new URLSearchParams({ file: detail.path });
  if (detail.lines) next.set("lines", detail.lines);
  history.replaceState(null, "", "#" + next);
});
```

## File finder

The finder opens a file by name. `Ctrl+P` or `Cmd+P`, the `T` key, or the Find file button in the file header opens it, as a panel near the top of the element over the content, with a text field and up to 50 results.

- **Matching.** A file matches when the characters of the query appear in its path in order, ignoring case. Results are ranked by how well they match: matches in the file name, at the start of a name or word, and in consecutive characters rank higher, shorter paths rank higher, and dimmed files rank lower. Matched characters are emphasised in each result, shown as the file name followed by its folder in a muted colour. When nothing matches and no folders are still being listed, the panel shows `No matching files`.
- **Empty query.** Files opened earlier, most recent first, and then other files in tree order.
- **Lines.** A query ending in `:` and a number opens the matched file at that line. A query of only `:` and a number goes to that line in the open file.
- **Keys.** Up and Down move the highlight, Enter opens the highlighted file, and Escape or a press outside the panel closes it. Focus returns to where it was before the finder opened.
- **Listing through a connection.** The finder can only search files that have been listed. When it opens with a connection, the element lists every folder that has not been listed and is not dimmed, at most four at a time, and adds files to the results as they arrive, without moving the highlight off the highlighted file. The panel shows the number of folders still being listed until it is done.

## Keyboard shortcuts

Shortcuts apply while focus is inside the element, or on the page body when the page has one viewer. They are not handled while focus is in a text field outside the finder.

| Keys                       | Action                                    |
| -------------------------- | ----------------------------------------- |
| `Ctrl+P`, `Cmd+P` or `T`   | Open the file finder                      |
| `Alt+Z`                    | Toggle line wrapping                      |
| `Escape`                   | Close the finder or an overlaid sidebar   |

## Languages

The bundled languages are JavaScript, TypeScript, JSX, TSX, JSON, JSON with comments, HTML, CSS, SCSS, Less, Markdown, YAML, TOML, XML, SVG (as XML), Python, Ruby, Go, Rust, Java, Kotlin, Swift, C, C++, C#, SQL, shell scripts (Bash, Zsh, sh), PowerShell, Dockerfile, Makefile, INI, diff, GraphQL, Lua, Vue and Svelte. Detection uses the file extension, and the full name for files such as `Dockerfile`, `Makefile`, `.gitignore`, `.env` and `tsconfig.json`.

## Styling

The element stylesheet styles all rendered content, so the element looks the same inside Television and on any other web page. The `style` lists in [`templates/`](templates/) are the authority for its values. The element template composes the styles of its parts; the build writes them, followed by the `tv-markdown` stylesheet, as `tv-code.css`.

- The interface uses the sans-serif font and Television control density: rows 26 px high, text at the small size. Code uses the monospace font at 12 px with a line height of 18 px.
- Colours follow the `color-scheme` in effect for the element. Inside Television, the element follows the active theme with no configuration.
- The element paints the background of the sidebar and the file pane, so it is readable on any page. The sidebar uses the muted surface colour, and the pane the surface colour.
- Selectors in the stylesheet are scoped to the element and select each part by class, so they take precedence over the zero-specificity rules of the Television canonical stylesheet whatever the order the stylesheets load in.
- Interactive controls show a focus outline when focused from the keyboard. The finder field is the exception: the open finder panel, with the caret in its field, shows where focus is. Animations respect `prefers-reduced-motion`.

### Variables

Each variable resolves through three layers: the `--tv-code-*` variable when the page sets it, otherwise the Television variable, otherwise a built-in default. A page overrides a variable by setting it on the element or an ancestor. Exact default values live in the templates' `style` lists.

| Variable                                | Television variable    | Used for                                                    |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `--tv-code-background`           | `--color-surface`      | the file pane                                               |
| `--tv-code-sidebar-background`   | `--color-surface-muted`| the sidebar                                                 |
| `--tv-code-text`                 | `--color-text`         | text and code without a syntax colour                       |
| `--tv-code-text-muted`           | `--color-text-muted`   | line numbers, details, folder paths in the finder           |
| `--tv-code-border`               | `--color-border`       | dividers and the finder panel border                        |
| `--tv-code-hover`                | `--tint-hover`         | rows and buttons under the pointer                          |
| `--tv-code-selection`            | `--tint-primary`       | the open file row, selected lines and the finder highlight  |
| `--tv-code-accent`               | `--color-primary`      | emphasised line numbers and matched characters              |
| `--tv-code-added`                | `--color-success`      | marks for added and changed lines                           |
| `--tv-code-removed`              | `--color-danger`       | marks for removed lines                                     |
| `--tv-code-focus`                | `--outline-focus`      | focus outlines, as an `outline` value                       |
| `--tv-code-font`                 | `--font-sans`          | the interface                                               |
| `--tv-code-font-mono`            | `--font-mono`          | code                                                        |
| `--tv-code-shadow`               | `--popover-shadow`     | the finder panel and the overlaid sidebar                   |

### Syntax colours

The highlighter assigns each token one of the roles below, and each role has a variable. A role variable resolves to the page value, otherwise to a step of the Television colour palette, a lighter step under a dark colour scheme, otherwise to a built-in default.

`keyword`, `string`, `number`, `comment`, `function`, `type`, `property`, `parameter`, `tag`, `attribute`, `operator`, `punctuation`, `regexp`, `escape`, `heading`, `link`, `inserted`, `deleted`.

The variables are named `--tv-code-syntax-<role>`. Comments are italic. Tokens without a role use `--tv-code-text`.

## Left to the page

- supplying the files, and choosing the input that suits the data;
- connecting the change signal of its service to `refresh`, when the service has one;
- keeping the open file and line selection in the page address, if wanted;
- the page title, background around the element, and anything outside it;
- editing. The element shows files and does not change them.

## Skill contents

The built skill, in `skills/tv-code/`, contains:

- `SKILL.md`: when to use the skill; how to load it (copy `tv-code.js` and `tv-code.css` next to the artifact `index.html`); the three inputs with short examples; connecting a service through a connection and its change signal through `refresh`; keeping the selection in the address; and the attributes and events;
- `tv-code.js`, with the highlighter, its languages and `tv-markdown` bundled;
- `tv-code.css`, the specification stylesheet followed by the `tv-markdown` stylesheet.

The package, in `packages/tv-code/`, depends on the `tv-markdown` package in this repository for the Markdown element. It holds the element code, `SKILL.md` and tests: unit tests for logic with real branching, such as path handling, ordering and dim patterns, language detection, matching in the finder and the comparison of file versions, and browser tests for every behaviour a reader can observe. The independent templates under [`templates/`](templates/) specify the interface markup that tv-code builds: the shell, sidebar tree, pane header and finder. They receive highlighted code, rendered Markdown and image HTML as data; Shiki and tv-markdown produce that content, as specified in the [Code](#code) and [Markdown](#markdown) sections. Storybook shows each view and useful parts without importing package source. Browser comparisons check the built interface against the templates. The repository layout and build are specified in [the repository specification](../index.md).
