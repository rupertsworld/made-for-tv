# Storybook specifications in tv-skills

This report records the experiment to replace Frameset in `tv-skills`. The two skills need different specification files: tv-markdown defines rendering rules in prose and uses Marked to produce markup; tv-book-catalog builds its own markup and has independent templates. Storybook displays both specifications without importing production code.

## Implementation

`spec/tv-markdown/` contains `index.md` and `style.css`. The prose states the Markdown input, output, frontmatter, wikilink and link rules. Package tests exercise those rules. The build copies `style.css` to `skills/tv-markdown/tv-markdown.css`. The copied file has the same SHA-256 hash (`bea7cd37f801a12637c5078225ad44d9c8b877c6f674a861b9eee5459dd0238d`) as the CSS built in the previous round. Against `HEAD`, its only diff is the previously approved header comment. That retained comment refers to “named examples”; the current stories show one sample in five named states. Changing the comment would change the required CSS bytes.

`storybook/sample-markdown.ts` holds rendered sample HTML from the old Markdown frame, including the frontmatter panel. The five Markdown stories show that HTML inside `<tv-markdown>`. Their local template-shaped object provides the frontmatter option, imports `style.css?raw`, and renders the sample markup. The story does not import `packages/` or `skills/`. The sample shows the stylesheet; the package tests establish rendering behaviour.

The catalog specification still composes templates under `spec/tv-book-catalog/templates/`. `cover.ts` supplies the shared cover to cards and detail records; `grid.ts` renders cards; the element template renders the catalog or detail view. `base.ts` holds shared CSS. Each template default-exports `{ options, style, render }` and checks the shared `Template` type. Style lists include child CSS first. The build removes repeated strings before writing the catalog CSS. Production source imports no templates.

`storybook/helpers.ts` derives controls and default values from the option lists of a template-shaped object and its demo page. It adopts their CSS strings as cached constructable stylesheets, replacing the sheets used by the previous story on each render. The viewer exposes standalone `iframe.html?id=...&args=...` documents. The manager writes changed control values into its address; changing scheme and frontmatter in the Markdown Default story produced `&args=frontmatter:hidden;scheme:dark` and changed the preview. Storybook telemetry is disabled.

## Tests and specification boundary

The Markdown browser suite retains its behaviour tests and no longer compares the element with static sample markup or with its own stylesheet. Package tests cover inline input, GitHub-flavoured output, sanitizing, heading IDs, frontmatter, wikilinks and links. Five focused unit tests were added for rules that lacked direct coverage: bare child text is ignored; permitted heading, emphasis, list, quote, rule and line-break tags survive; strikethrough, tables and an ordered-list start render; table span attributes survive while authored IDs outside headings are removed; and relative image addresses resolve against the page URL. Existing tests cover property input and clearing, inline scripts, task checkboxes, frontmatter types and invalid YAML, wikilink labels and activation, ordinary links and click events, and unsafe elements and attributes.

The catalog browser tests still compare the built elements with the independent templates across light, dark, narrow and overridden page conditions. The root `test/template-boundary.test.ts` checks that tv-markdown has only prose and CSS in its specification folder, that catalog templates import only other templates, `base.ts` or the shared type, and that production source imports no specification files. The rule does not make TypeScript templates as restricted as Liquid frames; a template can execute arbitrary JavaScript. A syntax restriction would be needed if that language limit mattered for this repository.

Typecheck passed. Unit tests passed **46/46**. The tv-markdown browser suite passed **18/18**; the catalog suite passed **33/34**, including both template comparisons. The single failure is the unchanged Books to get test: a separately installed artifact displays “Body-only” text that the test expects to be absent. The test file is identical to `HEAD`, and the failure predates this experiment.

## Viewer and parity

The saved Frameset baseline has 64 catalog combinations and 16 Markdown combinations at 1280 × 900. The catalog capture on port 6107 matched **64/64 rendered markups and 64/64 full-page screenshots pixel for pixel**. Sixteen raw markup records contain old ready-state comment markers; removing those comments makes their rendered markup equal. The [baseline records](storybook-frames-experiment/parity/baseline.json), [Storybook records](storybook-frames-experiment/parity/storybook.json) and screenshots are in the ignored local parity folder.

The Markdown Default and Dark standalone stories use the old frame sample. Their full-page screenshots both matched the corresponding Frameset baseline pixel for pixel. All **23** live standalone stories rendered on port 6006 without page errors. Chromium changed the Markdown scheme and frontmatter controls in the live manager and confirmed the preview state. The catalog CSS diff only reorders rules: a CSS parser found the same 105 declarations before and after, and no winning declaration changed.

## Measured cost

| Measure                                    | Frameset baseline | Storybook experiment |
| ------------------------------------------ | ----------------: | -------------------: |
| Process start to first document response   | 1,541 ms          | 2,259 ms             |
| `node_modules/` disk use                   | 223,947,163 bytes | 146,093,595 bytes    |
| Authored code, CSS and configuration lines | 476 removed       | 960 added            |

The process timing is one start per viewer with existing filesystem and Vite caches. Frameset selected port 4401 because 4400 was occupied; Storybook used 6107 because the live server occupies 6006. Storybook took 718 ms longer in this measurement, while `node_modules/` used 77,853,568 fewer bytes. The line count compares the working tree with `HEAD`; it includes code, CSS, JSON configuration and `.gitignore`, and excludes docs, built skills and the generated package lock. Storybook and `@storybook/html-vite` are pinned to `10.6.0`.

## Recommendation

Use Storybook for these two skills. Keep tv-markdown as prose plus its copied stylesheet, with package tests for the transformation performed by Marked. Keep independent templates for catalog markup that the repository builds itself. The catalog states and the two checked Markdown states match Frameset screenshots, the new specification boundaries are tested, and the remaining browser failure belongs to the separately installed Books to get artifact.
