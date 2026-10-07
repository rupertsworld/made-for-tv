#!/usr/bin/env node
/**
 * Capture the README screenshots: each built skill with sample content, in
 * Television's canonical styles, light and dark, written to docs/screenshots/.
 *
 * Every image is the same square frame with a rounded border and transparent
 * corners, because GitHub removes styles from README markup.
 *
 * Pages are served from a made-up origin through Playwright routes, so no
 * server is started: /canonical/ maps to the stylesheet of the Television npm
 * package, other paths to the skills folder, and each page is generated here.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const skillsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(skillsRoot, "..");
const outputDirectory = path.join(skillsRoot, "docs", "screenshots");
const canonicalDirectory = path.join(skillsRoot, "node_modules", "@telepath-computer", "television", "dist", "canonical");
const origin = "http://made-for-tv.test";
// Small enough that text stays readable at the width GitHub shows the image.
const frameSize = 720;

const markdown = `---
title: Kyoto in November
travellers: Ana, Sam, Theo
status: Booking
---

# Kyoto in November

A week for the autumn leaves, staying near [[places/demachiyanagi|Demachiyanagi]]. Train times are in the [JR West planner](https://www.westjr.co.jp/global/en/).

## Before we go

- [x] Book the ryokan for the first three nights
- [x] Reserve the Shinkansen from Tokyo
- [ ] Pick a day trip: Nara or Lake Biwa

## Plan

| Day | Morning | Afternoon |
| --- | --- | --- |
| Thu | Walk the Kamo River | Nishiki Market |
| Fri | Fushimi Inari at 7 am | Tofuku-ji gardens |
| Sat | Arashiyama bamboo grove | Okochi Sanso villa |

> Temples with famous leaves fill by nine. Go early.

## Packing

- Layers for cold mornings
- Walking shoes
`;

// First-edition covers from Wikimedia Commons, all public domain, resized for the screenshot.
const cover = name => `/scripts/screenshot-covers/${name}.jpg`;
const books = [
  // https://commons.wikimedia.org/wiki/File:The_Great_Gatsby_Cover_1925_Retouched.jpg
  { id: "gatsby", title: "The Great Gatsby", authors: ["F. Scott Fitzgerald"], cover: cover("the-great-gatsby"), description: "A mysterious millionaire throws parties to win back a lost love.", genre: "Novel", rating: "4.4 / 5" },
  // https://commons.wikimedia.org/wiki/File:Cover_(Hound_of_Baskervilles,_1902).jpg
  { id: "hound", title: "The Hound of the Baskervilles", authors: ["Arthur Conan Doyle"], cover: cover("the-hound-of-the-baskervilles"), description: "Holmes investigates a family curse on the moor.", genre: "Mystery", rating: "4.5 / 5" },
  // https://commons.wikimedia.org/wiki/File:Dracula-First-Edition-1897.jpg (cropped)
  { id: "dracula", title: "Dracula", authors: ["Bram Stoker"], cover: cover("dracula"), description: "A Transylvanian count sets out for England.", genre: "Gothic", rating: "4.1 / 5" },
  // https://commons.wikimedia.org/wiki/File:The_Wind_in_the_Willows_cover.jpg
  { id: "willows", title: "The Wind in the Willows", authors: ["Kenneth Grahame"], cover: cover("the-wind-in-the-willows"), description: "Mole, Rat, Badger and Toad by the river.", genre: "Children's", rating: "4.3 / 5" },
  // https://commons.wikimedia.org/wiki/File:The_Time_Machine_(Heinemann_text)_-_front_cover.jpg
  { id: "time-machine", title: "The Time Machine", authors: ["H. G. Wells"], cover: cover("the-time-machine"), description: "An inventor travels to the year 802,701.", genre: "Science fiction", rating: "4.0 / 5" },
  // https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_(1865).jpg
  { id: "alice", title: "Alice's Adventures in Wonderland", authors: ["Lewis Carroll"], cover: cover("alices-adventures-in-wonderland"), description: "Alice follows a rabbit down a hole.", genre: "Fantasy", rating: "4.2 / 5" },
];

// Text files of the whole repository, for tv-code to show; the bundles, lockfile and images are left out.
const repositoryFiles = execFileSync("git", ["ls-files"], { cwd: repositoryRoot, encoding: "utf8" })
  .split("\n")
  .filter(file => file && !/^skills\/packages\/[^/]+\/dist\/.*\.js$|package-lock\.json$|\.(png|jpg)$/.test(file))
  .map(file => ({ path: file, content: readFileSync(path.join(repositoryRoot, file), "utf8") }));

const shots = [
  {
    name: "tv-markdown",
    body: `<main style="padding: 32px 40px;"><tv-markdown show-frontmatter></tv-markdown></main>`,
    setup: page => page.locator("tv-markdown").evaluate((element, source) => { element.markdown = source; }, markdown),
  },
  {
    name: "tv-code",
    body: `<tv-code label="made-for-tv" style="height: 100%;"></tv-code>`,
    setup: async page => {
      await page.locator("tv-code").evaluate((element, files) => {
        element.files = files;
        element.selected = "skills/packages/tv-code/src/paths.ts";
      }, repositoryFiles);
      // Highlighting is applied after the plain text first renders.
      await page.locator(".cv-code-view .cv-t-keyword").first().waitFor();
    },
  },
  {
    name: "tv-book-catalog",
    // Narrow enough for three columns, so the covers are large.
    body: `<main style="max-width: 580px; margin: 0 auto; padding: 28px 0;"><h1 style="margin: 0 0 20px;">Books</h1><tv-book-catalog></tv-book-catalog></main>`,
    setup: async page => {
      await page.locator("tv-book-catalog").evaluate((element, records) => { element.books = records; }, books);
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
    },
  },
];

// Without hinting, glyphs keep their designed positions instead of snapping to pixels, as on macOS.
const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
mkdirSync(outputDirectory, { recursive: true });
try {
  for (const shot of shots) {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: frameSize, height: frameSize }, deviceScaleFactor: 2 });
      await page.route(`${origin}/**`, route => {
        const { pathname } = new URL(route.request().url());
        if (pathname === "/index.html") return route.fulfill({ contentType: "text/html", body: html(shot, theme) });
        const file = pathname.startsWith("/canonical/")
          ? path.join(canonicalDirectory, pathname.slice("/canonical/".length))
          : path.join(skillsRoot, decodeURIComponent(pathname));
        return route.fulfill({ path: file });
      });
      await page.goto(`${origin}/index.html`);
      await shot.setup(page);
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".frame").screenshot({ path: path.join(outputDirectory, `${shot.name}-${theme}.png`), omitBackground: true });
      await page.close();
      console.log(`docs/screenshots/${shot.name}-${theme}.png`);
    }
  }
} finally {
  await browser.close();
}

function html(shot, theme) {
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/canonical/v2/styles.css">
  <link rel="stylesheet" href="/packages/${shot.name}/dist/${shot.name}.css">
  <script type="module" src="/packages/${shot.name}/dist/${shot.name}.js"></script>
  <style>
    html, body { margin: 0; background: transparent; }
    .frame {
      box-sizing: border-box; width: ${frameSize}px; height: ${frameSize}px; overflow: hidden;
      border: 1px solid var(--color-border); border-radius: 16px;
      background: var(--color-surface); color: var(--color-text); font-family: var(--font-sans);
    }
  </style>
</head>
<body><div class="frame">${shot.body}</div></body>
</html>`;
}
