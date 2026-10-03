# tv-skills — repository specification

`tv-skills` is a private, local repository for iterating on Television artifact skills: writing their specifications, building them, using the built skills directly, and moving a skill into Television by pull request once it is ready. The original Television skills stay in the Television repository. This document specifies how the repository is laid out, built and tested.

## Layout

```text
spec/
  index.md             this specification
  <skill>/             the specification of one skill: index.md and the files it names
packages/
  <skill>/             the source package of one skill
frames/
  frameset.json        Frameset configuration
  <skill>.frame        frames that show a skill
skills/
  <skill>/             the built skill
package.json           the root workspace
```

Each skill has one name, used for its specification folder, package folder, package name, built folder and main files. For `tv-markdown` these are `spec/tv-markdown/`, `packages/tv-markdown/`, the package `tv-markdown`, `skills/tv-markdown/`, `tv-markdown.js` and `tv-markdown.css`.

## Packages

- The root `package.json` declares `packages/*` as npm workspaces and holds the development tools shared by every package: TypeScript, Vite, Vitest, Playwright and Frameset. The repository uses Node 24 and npm 11.
- Each skill is one private package, named after the skill without a scope. It contains `package.json` with a `build` script, `SKILL.md`, the TypeScript source in `src/`, the tests in `test/`, and its build configuration.
- Code bundled into a skill, such as a Markdown parser, is a dependency of that package. Tools are development dependencies of the root.

## Build

`npm run build` at the root builds every package. A package build replaces `skills/<skill>/` with:

- the JavaScript, built by Vite as one ES module named after the skill, with its dependencies bundled;
- files the specification names for shipping, copied unchanged, such as `spec/tv-markdown/style.css` as `tv-markdown.css`;
- `SKILL.md`, copied from the package.

Third-party licence notices for bundled code are deferred until the skills are distributed beyond Rupert.

A built skill is self-contained. An agent installs it by copying or linking `skills/<skill>/` into its skills directory, and an artifact copies the JavaScript and CSS next to its `index.html`.

`skills/` is committed, so the built files can be used straight from the repository without a build. A change to a package or a specification is committed together with the rebuilt skill.

## Tests

`npm test` at the root runs the TypeScript checks, the unit tests (Vitest) and the browser tests (Playwright with Chromium) of every package. Browser tests load the built files in `skills/<skill>/`, so they test what ships.

## Frames

Frames live in `frames/`, named after the skill they show. A frame imports the specification files it shows, such as `../spec/tv-markdown/style.css`, so it always renders the specified styling rather than a copy. `npm run frames` starts Frameset from `frames/`, where `frameset.json` is.

## Git

`node_modules/` and test output are ignored; `skills/` is not.
