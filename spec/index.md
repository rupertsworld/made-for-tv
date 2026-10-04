# tv-skills — repository specification

`tv-skills` is a private, local repository for iterating on Television artifact skills: writing their specifications, building them, using the built skills directly, and moving a skill into Television by pull request once it is ready. The original Television skills stay in the Television repository. This document specifies how the repository is laid out, built and tested.

## Layout

```text
spec/
  index.md, types.ts         repository specification and Template type
  tv-markdown/               index.md and style.css
  tv-book-catalog/
    index.md
    templates/               tv-book-catalog.ts, grid.ts, card.ts, cover.ts, base.ts
packages/
  <skill>/                   the source package of one skill
storybook/
  main.ts, preview.ts        viewer configuration
  helpers.ts                 joins templates and demo pages
  sample-books.ts            book data used by stories
  sample-markdown.ts         rendered HTML used to show the Markdown CSS
  stories/
    *.stories.ts             Storybook views of specifications and parts
test/                       repository-wide unit tests, including helpers.test.ts
skills/
  <skill>/                   the built skill
package.json                 the root workspace
tsconfig.spec.json           typechecks templates, Storybook and root tests
```

Each skill has one name, used for its specification folder, package folder, package name, built folder and main files. For `tv-markdown` these are `spec/tv-markdown/`, `packages/tv-markdown/`, the package `tv-markdown`, `skills/tv-markdown/`, `tv-markdown.js` and `tv-markdown.css`.

## Packages

- The root `package.json` declares `packages/*` as npm workspaces and holds the development tools shared by every package: TypeScript, Vite, Vitest, Playwright and Storybook. The repository uses Node 24 and npm 11.
- Each skill is one private package, named after the skill without a scope. It contains `package.json` with a `build` script, `SKILL.md`, the TypeScript source in `src/`, the tests in `test/`, and its build configuration.
- Code bundled into a skill, such as a Markdown parser, is a dependency of that package. Tools are development dependencies of the root.

## Build

`npm run build` at the root builds every package. A package build replaces `skills/<skill>/` with:

- the JavaScript, built by Vite as one ES module named after the skill, with its dependencies bundled;
- the element CSS: `spec/tv-markdown/style.css` copied unchanged, or the distinct CSS strings from the default export of `spec/tv-book-catalog/templates/tv-book-catalog.ts` joined in order;
- `SKILL.md`, copied from the package.

Third-party licence notices for bundled code are deferred until the skills are distributed beyond Rupert.

A built skill is self-contained. An agent installs it by copying or linking `skills/<skill>/` into its skills directory, and an artifact copies the JavaScript and CSS next to its `index.html`.

`skills/` is committed, so the built files can be used straight from the repository without a build. A change to a package or a specification is committed together with the rebuilt skill.

## Tests

`npm test` at the root runs the TypeScript checks, the unit tests (Vitest) and the browser tests (Playwright with Chromium) of every package. The root TypeScript check includes the templates, Storybook code and tests under `test/`. Browser tests load the built files in `skills/<skill>/`, so they test what ships.

## Specifications and Storybook

The form of a skill specification follows who produces its markup. For `tv-markdown`, the Marked library transforms Markdown. Its output and behaviour are specified in prose in `spec/tv-markdown/index.md` and tested by the package. `spec/tv-markdown/style.css` specifies the element styling and is copied into the built skill. Storybook shows that stylesheet on static sample HTML from `storybook/sample-markdown.ts`; the story does not load production code.

The book catalog builds its own markup, so its specification adds templates. Each template default-exports `{ options, style, render }` and checks that object against the shared `Template<Args>` type in `spec/types.ts`. Options describe select or boolean settings that change element markup; the first value in each list is the default. Style is a list of element CSS strings, and render returns only element markup. Templates are separate specification files; production source does not import them. Package build configuration joins the distinct strings in the element template style list to write the shipped CSS. Browser tests import the templates and compare their markup and computed styles with the built elements.

The book catalog templates are under `spec/tv-book-catalog/templates/`. The grid calls `card.render`; the card and the detail record call `cover.render`. `base.ts` exports shared CSS only. Each parent puts child styles before its own CSS. Repeated strings are removed when the CSS is built or adopted in Storybook, so the cover rules occur once in the combined sheet. Templates require book data as `render` arguments. `storybook/sample-books.ts` supplies that data to the stories; browser comparisons use their own fixtures. Options contain only display settings. The repository-wide test under `test/` checks that templates import only other templates, `base.ts`, or the shared type with `import type`, and stay out of production source.

Each story defines a demo page object with `options`, `style` and `render(args, element)`. The page controls scheme, width and overrides as needed and wraps the element markup. `storybook/helpers.ts` uses the first option values as defaults and builds Storybook controls. Book stories pass sample book data to their templates. The Markdown story supplies a template-shaped object locally, using the raw `style.css` text and static sample HTML; its frontmatter option changes which sample markup is shown. On every render the helper adopts one constructable stylesheet for each distinct CSS string from the element and page, replacing sheets from the previous story. It caches sheets for later renders. `npm run storybook` opens the viewer using the configuration in `storybook/`. A story also renders alone at `iframe.html?id=<story-id>&args=<arguments>`.

## Git

The repository is local, with no remote. `node_modules/` and test output are ignored; `skills/` is not.
