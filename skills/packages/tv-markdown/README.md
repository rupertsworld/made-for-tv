# tv-markdown

Renders a Markdown document in an HTML artifact. It supports GitHub-flavoured Markdown, including tables and task lists, and gives each heading an id that can be linked to. Frontmatter can be shown as a properties panel. `[[wikilinks]]` become links, and the page decides where they lead. Scripts, styles and other HTML outside an allowed list are removed.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/screenshots/tv-markdown-dark.png">
  <img src="../../docs/screenshots/tv-markdown-light.png" alt="A Markdown trip plan rendered by tv-markdown, with a properties panel, a heading, links, a task list, a table and a quote.">
</picture>

## Install

```sh
npx skills add rupertsworld/made-for-tv --skill tv-markdown
```

Add `-g` to install it for every project instead of the current one. To install without the [skills CLI](https://github.com/vercel-labs/skills), copy the contents of [`dist/`](dist/) into a folder named `tv-markdown` in the skills folder of your agent, such as `~/.claude/skills/tv-markdown/` for Claude Code.

[`SKILL.md`](dist/SKILL.md) tells the agent when and how to use the skill. It is built from [`src/index.md`](src/index.md).
