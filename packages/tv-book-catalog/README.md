# tv-book-catalog

Shows book records in an HTML artifact as a list of cards with cover, title, authors, a short description, genre and rating, and one record in full on a detail view. A book without a usable cover image gets a cover drawn from its title. The page owns navigation between the list and the detail view.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/screenshots/tv-book-catalog-dark.png">
  <img src="../../docs/screenshots/tv-book-catalog-light.png" alt="Book cards in tv-book-catalog for The Great Gatsby, The Hound of the Baskervilles and Dracula, each with its first-edition cover, author, description, genre and rating.">
</picture>

## Install

```sh
npx skills add rupertsworld/tv-skills --skill tv-book-catalog
```

Add `-g` to install it for every project instead of the current one. To install without the [skills CLI](https://github.com/vercel-labs/skills), copy [`skills/tv-book-catalog/`](../../skills/tv-book-catalog/) into the skills folder of your agent, such as `~/.claude/skills/` for Claude Code.

[`SKILL.md`](SKILL.md) tells the agent when and how to use the skill.
