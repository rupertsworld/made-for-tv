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

## Recommendation

Use Storybook for all three skills. Keep tv-markdown as prose plus its copied stylesheet, with package tests for the transformation performed by Marked. Keep independent templates for catalog and tv-code interface markup that this repository builds itself. The specification boundary is tested. Library-produced content remains in prose and package tests.
