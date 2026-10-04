# Storybook specifications in tv-skills

This report records the migration from the former frame viewer to Storybook in `tv-skills`. The three skills use different specification files: tv-markdown defines library-produced markup in prose; tv-book-catalog and tv-code specify markup built by their own code with independent templates. Storybook displays all three without importing production code.

## Implementation

`spec/tv-markdown/` contains `index.md` and `style.css`. The prose states the Markdown input, output, frontmatter, wikilink and link rules. Package tests exercise those rules. The build copies `style.css` to `skills/tv-markdown/tv-markdown.css`. Its header now says that the Storybook story shows the stylesheet on sample HTML.

`storybook/sample-markdown.ts` holds rendered sample HTML from the old Markdown frame, including the frontmatter panel. The five Markdown stories show that HTML inside `<tv-markdown>`. Their local template-shaped object provides the frontmatter option, imports `style.css?raw`, and renders the sample markup. The story does not import `packages/` or `skills/`. The sample shows the stylesheet; the package tests establish rendering behaviour.

The catalog specification still composes templates under `spec/tv-book-catalog/templates/`. `cover.ts` supplies the shared cover to cards and detail records; `grid.ts` renders cards; the element template renders the catalog or detail view. `base.ts` holds shared CSS. Each template default-exports `{ options, style, render }` and checks the shared `Template` type. Style lists include child CSS first. The build removes repeated strings before writing the catalog CSS. Production source imports no templates.

The tv-code specification now composes templates under `spec/tv-code/templates/`. The element template builds the shell from a sidebar and tree, pane header and finder. A shared base module holds common CSS; each part owns its rules, and the root style list preserves their cascade order. Storybook supplies authored file tags plus sample highlighted code, rendered Markdown and image HTML from `storybook/sample-code.ts`. Shiki and tv-markdown produce those pane contents in the built element, so their transformation rules stay in prose and package tests. The tv-code build joins the template CSS and appends the tv-markdown stylesheet. Production source imports no templates.

The `frames/` directory and the temporary viewer package are removed. `npm run storybook` is the viewer command.

`storybook/helpers.ts` derives controls and default values from the option lists of a template-shaped object and its demo page. It adopts their CSS strings as cached constructable stylesheets, replacing the sheets used by the previous story on each render. The viewer exposes standalone `iframe.html?id=...&args=...` documents. The manager writes changed control values into its address; changing scheme and frontmatter in the Markdown Default story produced `&args=frontmatter:hidden;scheme:dark` and changed the preview. Storybook telemetry is disabled.

## Tests and specification boundary

The Markdown browser suite retains its behaviour tests and no longer compares the element with static sample markup or with its own stylesheet. Package tests cover inline input, GitHub-flavoured output, sanitizing, heading IDs, frontmatter, wikilinks and links. Five focused unit tests were added for rules that lacked direct coverage: bare child text is ignored; permitted heading, emphasis, list, quote, rule and line-break tags survive; strikethrough, tables and an ordered-list start render; table span attributes survive while authored IDs outside headings are removed; and relative image addresses resolve against the page URL. Existing tests cover property input and clearing, inline scripts, task checkboxes, frontmatter types and invalid YAML, wikilink labels and activation, ordinary links and click events, and unsafe elements and attributes.

The catalog browser tests compare the built elements with the independent templates across light, dark, narrow and overridden page conditions. The tv-code browser comparisons check code, Markdown and image views in wide/light and narrow/dark conditions, including structure, text and computed styles. The root `test/template-boundary.test.ts` checks that tv-markdown has only prose and CSS in its specification folder, that templates import only other templates, their `base.ts` or the shared type, and that production source imports no specification files. The rule does not make TypeScript templates as restricted as Liquid frames; a template can execute arbitrary JavaScript. A syntax restriction would be needed if that language limit mattered for this repository.

Typecheck passed. Unit tests passed **112/112**. The tv-markdown browser suite passed **18/18**, the catalog suite **19/19**, and the final tv-code suite **132/132**, including six new template comparisons. A first tv-code run passed 131/132: its 20,000-file finder timing test took 45.5 ms against a 45 ms limit. The targeted finder run and the final full run passed without changing production code. The old Books to get test is absent from the merged branch, so its earlier failure is no longer part of these results.

## Viewer and parity

The saved baseline has 64 catalog combinations and 16 Markdown combinations at 1280 × 900. The catalog capture on port 6107 matched **64/64 rendered markups and 64/64 full-page screenshots pixel for pixel**. Sixteen raw catalog markup records contain old ready-state comment markers; removing those comments makes their rendered markup equal. The [baseline records](storybook-frames-experiment/parity/baseline.json), [Storybook records](storybook-frames-experiment/parity/storybook.json) and screenshots are in the ignored local parity folder.

The Markdown Default and Dark standalone stories use the old sample document. Their full-page screenshots both matched the corresponding baseline pixel for pixel. All **35** live standalone stories rendered on port 6006 without page errors. Chromium changed controls for tv-code, catalog, tv-markdown and the tv-code tree in the manager; each address gained an `&args=...` value and reloading restored the selected control and preview. The catalog CSS diff only reorders rules: a CSS parser found the same 105 declarations before and after, and no winning declaration changed.

### tv-code migration

The tv-code frame was captured before migration at all **12** combinations of scheme, width and open file (code, Markdown or image). Each capture used a fresh browser context because the built element remembers expanded folders in local storage. The independent template specifies the shell, sidebar tree, pane header and finder. It receives the rendered pane body as sample data; it does not duplicate Shiki or tv-markdown. No inspected prose rule disagreed with the built element.

The Storybook standalone documents matched **12/12 normalized page markups and 12/12 full-page screenshots pixel for pixel**. Markup normalization removes whitespace between tags and replaces transient blob or data image addresses and the generated finder list ID with stable tokens. The image bytes and rendered pixels match. The [tv-code baseline](storybook-frames-experiment/parity/tv-code-baseline.json), [Storybook comparison](storybook-frames-experiment/parity/tv-code-storybook.json) and screenshots are in the ignored parity folder. The catalog still matches **64/64** markups and screenshots after this migration.

The rebuilt tv-code CSS has the same rules in the same order as the former `spec/tv-code/style.css` after removing comments and whitespace. The shipped `skills/` diff changes the tv-code header to point to the composed templates, changes the bundled tv-markdown header to describe its current Storybook sample, and adds blank lines where CSS strings join. The standalone tv-markdown CSS has the same header correction. No CSS declaration or cascade winner changed.

## Measured cost

| Measure                                    | Former viewer baseline | Storybook experiment |
| ------------------------------------------ | ---------------------: | -------------------: |
| Process start to first document response   | 1,541 ms               | 2,259 ms             |
| `node_modules/` disk use                   | 223,947,163 bytes      | 146,093,595 bytes    |
| Authored code, CSS and configuration lines | 476 removed            | 960 added            |

These measurements belong to the earlier two-skill experiment, before tv-code was merged. The process timing is one start per viewer with existing filesystem and Vite caches. The former viewer selected port 4401 because 4400 was occupied; Storybook used 6107 because the live server occupies 6006. Storybook took 718 ms longer in this measurement, while `node_modules/` used 77,853,568 fewer bytes. The line count compares that earlier working tree with its then-current `HEAD`; it includes code, CSS, JSON configuration and `.gitignore`, and excludes docs, built skills and the generated package lock. Storybook and `@storybook/html-vite` are pinned to `10.6.0`.

## Recommendation

Use Storybook for all three skills. Keep tv-markdown as prose plus its copied stylesheet, with package tests for the transformation performed by Marked. Keep independent templates for catalog and tv-code interface markup that this repository builds itself. All checked catalog and tv-code states match their saved screenshots, and the specification boundary is tested. Library-produced content remains in prose and package tests.
