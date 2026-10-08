# made-for-tv

Skills, themes and servers made for [Television](https://github.com/telepath-computer/television).

The skills help an agent build beautiful artifacts: the HTML pages an agent makes to show you something. Each skill provides custom HTML elements, such as a Markdown document view or a code viewer, and a `SKILL.md` that tells the agent how to use them. The agent copies the JavaScript and CSS files of the skill next to the `index.html` of the artifact. The elements work in any web page, and inside Television they take on its styles and the active theme.

The themes change how Television itself looks.

The servers give artifacts live access to the files and notes on your machine.

## Install the skills

```sh
npx skills add rupertsworld/made-for-tv
```

The [skills CLI](https://github.com/vercel-labs/skills) lists the skills in this repository, the artifact skills and the skills for the [servers](#servers), and asks which ones to install and for which agents. Add `--skill tv-code` to install one skill, or `-g` to install for every project instead of the current one.

To install without the CLI, copy the built files of a skill, such as [`skills/packages/tv-code/dist/`](skills/packages/tv-code/dist/), into a folder named after the skill in the skills folder of your agent, such as `~/.claude/skills/tv-code/` for Claude Code.

To use the elements with Television styles, also install Television, which provides the `television` skill these skills refer to.

Then ask your agent for an artifact that uses a skill, for example:

> Make an artifact that shows `notes/trip.md` with tv-markdown.

## Skills

### [tv-markdown](skills/packages/tv-markdown/README.md)

Renders a Markdown document, with task lists, tables, linkable headings and wikilinks.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="skills/docs/screenshots/tv-markdown-dark.png">
  <img src="skills/docs/screenshots/tv-markdown-light.png" alt="A Markdown trip plan rendered by tv-markdown, with a properties panel, a heading, links, a task list, a table and a quote.">
</picture>

### [tv-code](skills/packages/tv-code/README.md)

Shows a set of files, such as a repository, as a file tree beside highlighted code, rendered Markdown and images.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="skills/docs/screenshots/tv-code-dark.png">
  <img src="skills/docs/screenshots/tv-code-light.png" alt="This repository shown in tv-code, with the file tree in a sidebar and a highlighted TypeScript file open.">
</picture>

### [tv-book-catalog](skills/packages/tv-book-catalog/README.md)

Shows book records as cards with covers, and one book in full on a detail view.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="skills/docs/screenshots/tv-book-catalog-dark.png">
  <img src="skills/docs/screenshots/tv-book-catalog-light.png" alt="Book cards in tv-book-catalog for The Great Gatsby, The Hound of the Baskervilles and Dracula, each with its first-edition cover, author, description, genre and rating.">
</picture>

## Themes

### [Zen Ink](themes/zen-ink/README.md)

Washi-paper surfaces, sumi-ink text and a single vermilion accent over a soft dusk gradient, in light and dark.

To install a theme, copy its folder from [`themes/`](themes/) into the themes folder of Television, which `tv themes-path` prints, then select it with `tv set-theme`, such as `tv set-theme zen-ink`. [`themes/README.md`](themes/README.md) describes what a theme folder holds.

## Servers

The servers let an artifact read and change files on your computer while it is open, and update as soon as the files change. There are two:

- [file-server](servers/file-server/README.md) serves any folder. Each file has its own URL, a folder URL returns its listing as JSON, and a WebSocket tells the artifact when something changes.
- [vault-server](servers/vault-server/README.md) does the same for a folder of Markdown notes, and also gives each note as JSON: its frontmatter fields, its body and its links.

Neither server has a login. Each listens only on your own computer unless you choose otherwise.

### Get started with the servers

You need [Node.js](https://nodejs.org) 24 or later and git.

1. Download and build the servers. This links the `file-server` and `vault-server` commands into `~/.local/bin`:

   ```sh
   git clone https://github.com/rupertsworld/made-for-tv
   cd made-for-tv/servers
   ./setup.sh
   ```

   If your shell then says `command not found: file-server`, add that folder to your PATH, for example with `export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc`.

2. Start a server on a folder and leave it running:

   ```sh
   file-server ~/Documents/notes
   ```

   It prints the address it serves, `url: http://127.0.0.1:8765`. Open that address in a browser: a JSON list of the folder's files means it works. For a folder of Markdown notes, run `vault-server ~/Documents/notes` instead; it prints `url: http://127.0.0.1:4747`.

3. Install the server's skill, so your agent knows how to use it:

   ```sh
   npx skills add rupertsworld/made-for-tv --skill file-server
   ```

   Use `--skill vault-server` for vault-server.

4. Ask your agent for an artifact, and give it the address:

   > Make an artifact that lists the files at http://127.0.0.1:8765 and updates when they change.

### Use the servers over Tailscale

If Television runs on a different device from the files, for example on your laptop while the files are on a home server, start the server on the computer's [Tailscale](https://tailscale.com) address instead:

```sh
file-server ~/Documents/notes --host "$(tailscale ip -4)"
```

It prints an address such as `url: http://100.101.102.103:8765`. With MagicDNS on, `http://<computer-name>:8765` reaches it too. Give that address to your agent. If the `tailscale` command is not installed, copy the computer's address from the Tailscale app.

Only devices on your tailnet can reach the server, but every one of them can read and change the files, because the servers have no login. The server then answers only on that address, not on `127.0.0.1`.

### Several servers under one address

[Bellhop](servers/bellhop/README.md) runs several servers and makes them reachable under one address, such as `http://127.0.0.1:2355/notes/` and `http://127.0.0.1:2355/photos/`. You do not need it to get started. `setup.sh` builds it when [Go](https://go.dev) 1.22 or later is installed.

## Layout

The repository has one folder for each kind of thing it holds:

- [`skills/`](skills/) is an npm project with the skills and the tools that build and test them: a package for each skill in `packages/`, and the specifications, Storybook, tests and scripts beside them. Each skill has its built files in `skills/packages/<skill>/dist/`, committed so the skills install straight from the repository. [`skills/spec/index.md`](skills/spec/index.md) specifies the layout, build, tests and screenshots.
- [`themes/`](themes/) has one folder per Television theme, ready to install. Themes have no build step.
- [`servers/`](servers/) contains the file server, vault server, Bellhop, and their specifications.
- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) lists every skill folder, grouped into artifact skills and server skills, so the skills CLI finds the server skills outside `skills/`. A new skill is added to it.

## Develop the skills

The skills need Node 24 and npm 11. Run these in `skills/`:

```sh
npm install
npm run build        # build every skill into packages/<skill>/dist/
npm test             # type checks, unit tests and browser tests
npm run storybook    # view the specifications in Storybook
npm run screenshots  # capture the images in docs/screenshots/
```

## Licence

The whole repository, including `servers/`, is MIT; see [`LICENSE`](LICENSE). A skill that bundles third-party code, such as a Markdown parser, carries the licences of that code in `THIRD-PARTY-NOTICES.txt` in its `dist/` folder.
