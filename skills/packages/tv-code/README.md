# tv-code

Shows a set of files, such as a repository, in an HTML artifact as a file tree beside the open file. Code is highlighted in about 35 languages, Markdown is rendered and images are shown. Readers can find a file by name with `Ctrl+P` or `Cmd+P`, select lines and wrap long lines. The page supplies the files in the HTML, from a script, or on demand from a service, and the view updates in place when they change. It does not edit files.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/screenshots/tv-code-dark.png">
  <img src="../../docs/screenshots/tv-code-light.png" alt="This repository shown in tv-code, with the file tree in a sidebar and a highlighted TypeScript file open.">
</picture>

## Install

```sh
npx skills add rupertsworld/made-for-tv --skill tv-code
```

Add `-g` to install it for every project instead of the current one. To install without the [skills CLI](https://github.com/vercel-labs/skills), copy the contents of [`dist/`](dist/) into a folder named `tv-code` in the skills folder of your agent, such as `~/.claude/skills/tv-code/` for Claude Code.

[`SKILL.md`](dist/SKILL.md) tells the agent when and how to use the skill. It is built from [`src/index.md`](src/index.md).
