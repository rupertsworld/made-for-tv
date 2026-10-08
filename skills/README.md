# Artifact skills

The packages here are the artifact skills listed in the [repository README](../README.md#artifact-skills), which shows each one and how to install it. [`spec/index.md`](spec/index.md) specifies the layout, build, tests and screenshots.

## Install without the skills CLI

Copy the built files of a skill, such as [`packages/tv-code/dist/`](packages/tv-code/dist/), into a folder named after the skill in your agent's skills folder, such as `~/.claude/skills/tv-code/` for Claude Code.

## Develop

The skills need Node 24 and npm 11. Run these here, in `skills/`:

```sh
npm install
npm run build        # build every skill into packages/<skill>/dist/
npm test             # type checks, unit tests and browser tests
npm run storybook    # view the specifications in Storybook
npm run screenshots  # capture the images in docs/screenshots/
```

Each skill's built files in `packages/<skill>/dist/` are committed, so the skills install straight from the repository.

## Add a skill

Besides its package, a new skill needs an entry in [`../.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json), under `artifact-skills`. That file lists every skill folder in the repository so the skills CLI groups them and finds the server skills outside `skills/`.
