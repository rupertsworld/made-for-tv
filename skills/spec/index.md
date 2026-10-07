# Skills — specification

The `skills/` folder of the made-for-tv repository holds skills for building Television artifacts: the specification, source, tests and built files of each skill, and the tools that build and test them. The skills that ship with Television, such as `tv-calendar`, stay in the Television repository. This document specifies how the folder is laid out, built and tested, and how the README screenshots are made. Paths are relative to `skills/`, and npm commands run there.

## Layout

```text
spec/
  index.md, types.ts         this specification; Template type and stylesheet()
  tv-markdown/               index.md and style.css
  tv-book-catalog/
    index.md
    templates/               tv-book-catalog.ts, grid.ts, card.ts, cover.ts, base.ts
  tv-code/
    index.md
    templates/               tv-code.ts, sidebar.ts, header.ts, finder.ts and parts
packages/
  <skill>/                   the package of one skill
    src/                     TypeScript source, and index.md, the source of SKILL.md
    test/                    unit and browser tests
    dist/                    the built skill
storybook/
  main.ts, preview.ts        viewer configuration
  helpers.ts                 joins templates and demo pages
  sample-books.ts            book data used by stories
  sample-markdown.ts         rendered HTML used to show the Markdown CSS
  sample-code.ts             authored files and rendered code and Markdown samples
  stories/
    *.stories.ts             Storybook views of specifications and parts
test/                        unit tests that span skills
scripts/                     test runners, the screenshot script and its book covers
docs/
  screenshots/               images of each skill shown in the READMEs
package.json                 the npm project: workspaces and shared tools
tsconfig.spec.json           typechecks templates, Storybook and the tests in test/
vitest.config.ts             unit test configuration
```

Each skill has one name, used for its specification folder, package folder, package name and main files. For `tv-markdown` these are `spec/tv-markdown/`, `packages/tv-markdown/`, the package `tv-markdown`, `tv-markdown.js` and `tv-markdown.css`.

## Packages

- `package.json` declares `packages/*` as npm workspaces and holds the development tools shared by every package: TypeScript, Vite, Vitest, Playwright and Storybook. It needs Node 24 and npm 11.
- Each skill is one private package in `packages/<skill>/`, named after the skill without a scope. It contains `package.json` with a `build` script, a `README.md` for people, the TypeScript source and `index.md` in `src/`, the tests in `test/`, its build configuration, and the built skill in `dist/`. `src/index.md` is the source of the built `SKILL.md`. The README gives an overview, the screenshot and installation, and is not part of the built skill.
- The only file named `SKILL.md`, in any capitalisation, in a skill package is `dist/SKILL.md`. The skills CLI installs the folder that holds a `SKILL.md`, searching up to three levels below `skills/` and preferring the shallower match. A source copy at `packages/<skill>/SKILL.md` would make it install the whole package instead of the built skill, and one in `src/` would appear as a second skill. File names on macOS ignore case, so `skill.md` counts too. `packages/<skill>/dist/` is exactly three levels down, so `packages/` cannot gain another level of folders.
- Code bundled into a skill, such as a Markdown parser, is a dependency of that package. Tools are development dependencies in `package.json`.

## Build

`npm run build` builds every package. A package build replaces `packages/<skill>/dist/` with:

- the JavaScript, built by Vite as one ES module named after the skill, with its dependencies bundled;
- the element CSS: `spec/tv-markdown/style.css` copied unchanged, or, for a skill with templates, the style list of the element template joined by `stylesheet()` from `spec/types.ts`. The tv-code build then appends the tv-markdown stylesheet for rendered Markdown files;
- `SKILL.md`, copied from `src/index.md`.

When the Vite module graph contains third-party code, the build also emits `THIRD-PARTY-NOTICES.txt`. It contains the published licence files of every bundled npm package and the separate upstream terms supplied for any bundled Shiki TextMate grammars or themes. The build emits no notices file when the module graph contains no third-party code.

A built skill is self-contained. An agent installs it by copying or linking `packages/<skill>/dist/` into its skills directory as a folder named after the skill, and an artifact copies the JavaScript and CSS next to its `index.html`.

Each `dist/` folder is committed, so the built files can be used straight from the repository without a build. A change to a package or a specification is committed together with the rebuilt skill.

## Tests

`npm test` runs the TypeScript checks, the unit tests (Vitest) and the browser tests (Playwright with Chromium) of every package. The TypeScript check of `tsconfig.spec.json` covers the templates, Storybook code and tests under `test/`. Browser tests load the built files in `packages/<skill>/dist/`, so they test what ships.

## Specifications

Every skill specification states behaviour in prose in `spec/<skill>/index.md`, and the package tests that behaviour. What else the specification holds depends on what produces the element markup:

- When a library produces it, as Marked does for tv-markdown, the specification adds `style.css`, the element stylesheet that the build copies.
- When the skill code builds it, as in tv-book-catalog and tv-code, the specification adds templates in `spec/<skill>/templates/`, and the skill specification describes them.

Each template default-exports `{ options, style, render }`, checked against `Template<Args>` in `spec/types.ts`:

- `options` lists the select and boolean settings that change the element markup. The first value of each list is the default.
- `style` is the element CSS as a list of strings: the styles of child templates first, then its own.
- `render` returns the element markup for its arguments, which may include data such as books.

A template composes another by calling its `render` and listing its `style`. Repeated strings are removed when a style list is joined or adopted, so a part used twice, such as the book cover, contributes its CSS once. A `base.ts` file may hold shared CSS only. Templates import only other templates, a `base.ts` file and, with `import type`, `spec/types.ts`; production source imports nothing from `spec/`. `test/template-boundary.test.ts` checks both rules. Browser tests in each package compare the markup and computed styles of the built elements with their templates.

## Storybook

`npm run storybook` opens Storybook with the configuration in `storybook/`. The server accepts requests addressed to `localhost` or an IP address. To accept other host names, such as the network name of the machine, set `STORYBOOK_ALLOWED_HOSTS` to a comma-separated list of them. Stories show specifications, not production code: they import templates, `style.css` files and sample data from `storybook/sample-*.ts`, and nothing from `packages/`.

Each story pairs a template with a demo page: an object of the same shape, whose options hold page settings such as scheme, width and overrides, and whose `render(args, element)` wraps the element markup. `story()` in `storybook/helpers.ts` builds controls and defaults from both option lists, adopts both style lists as constructable stylesheets on each render, and renders the element inside the page. The tv-markdown story builds a template-shaped object from `style.css` and sample HTML. A story also renders alone at `iframe.html?id=<story-id>&args=<arguments>`.

## Screenshots

`npm run screenshots` runs `scripts/screenshots.mjs`, which renders each built skill with sample content and saves `docs/screenshots/<skill>-light.png` and `<skill>-dark.png`. The repository README and each package README show the image that matches the colour scheme of the reader. The tv-code image shows the files of the whole repository. After a change to how a skill looks, run the script and commit the new images with the change.

- The pages load the Television canonical stylesheet from the `@telepath-computer/television` development dependency, so the images show the skills as they look in Television.
- Each image is the same square with a rounded border and transparent corners. The border is drawn into the image because GitHub removes styles from README markup.
- The book covers are public-domain first-edition covers from Wikimedia Commons, stored in `scripts/screenshot-covers/`. The script records the source of each.

## Git

`node_modules/` and test output are ignored; the `dist/` folders of the packages are not.
