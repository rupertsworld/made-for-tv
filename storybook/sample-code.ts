/** Representative authored files and library-rendered panes for Storybook. */
export const sampleInputHtml = "<tv-code-file path=\"README.md\" modified=\"2026-09-29T16:00:00Z\">\n    # Daybook\n\n    A small timeline for field notes. Entries are kept in date order and rendered in the browser.\n\n    ![A landscape cover for Daybook](assets/cover.svg)\n\n    ## Start\n\n    Install packages, then run the local preview:\n\n    ```sh\n    npm install\n    npm run dev\n    ```\n\n    The timeline lives in [src/main.ts](src/main.ts). Dates are formatted in [src/lib/date.ts](src/lib/date.ts).\n  </tv-code-file>\n<tv-code-folder path=\"src\">\n    <tv-code-file path=\"main.ts\" modified=\"2026-09-30T10:20:00Z\">\n      import { readableDate } from \"./lib/date\";\n      import \"./styles.css\";\n\n      type Entry = { title: string; createdAt: string };\n\n      const entries: Entry[] = [\n        { title: \"First light\", createdAt: \"2026-09-12\" },\n        { title: \"North ridge\", createdAt: \"2026-09-18\" },\n        { title: \"After the rain\", createdAt: \"2026-09-27\" },\n      ];\n\n      export function renderTimeline(root: HTMLElement): void {\n        const list = document.createElement(\"ol\");\n        for (const entry of entries) {\n          const item = document.createElement(\"li\");\n          item.textContent = `${entry.title} · ${readableDate(entry.createdAt)}`;\n          list.append(item);\n        }\n        root.replaceChildren(list);\n      }\n\n      renderTimeline(document.querySelector(\"#app\")!);\n    </tv-code-file>\n    <tv-code-folder path=\"lib\">\n      <tv-code-file path=\"date.ts\">\n        export function readableDate(value: string): string {\n          return new Intl.DateTimeFormat(\"en\", { dateStyle: \"long\" }).format(new Date(value));\n        }\n      </tv-code-file>\n    </tv-code-folder>\n    <tv-code-file path=\"styles.css\">\n      body {\n        max-width: 48rem;\n        margin: 0 auto;\n        font-family: system-ui, sans-serif;\n      }\n\n      li { padding-block: 0.75rem; }\n    </tv-code-file>\n  </tv-code-folder>\n<tv-code-folder path=\"assets\">\n    <tv-code-file path=\"cover.svg\">\n      &lt;svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\" viewBox=\"0 0 640 360\"&gt;\n        &lt;rect width=\"640\" height=\"360\" fill=\"#122e3a\" /&gt;\n        &lt;circle cx=\"503\" cy=\"90\" r=\"35\" fill=\"#f9b663\" /&gt;\n        &lt;path d=\"M0 286 109 200l68 42 103-109 92 77 60-49 208 118v81H0Z\" fill=\"#387a80\" /&gt;\n        &lt;path d=\"M0 320 118 252l94 55 118-78 132 95 84-51 94 36v51H0Z\" fill=\"#73a793\" /&gt;\n        &lt;text x=\"34\" y=\"63\" font-family=\"sans-serif\" font-size=\"32\" font-weight=\"700\" fill=\"#ffffff\"&gt;Daybook&lt;/text&gt;\n      &lt;/svg&gt;\n    </tv-code-file>\n  </tv-code-folder>\n<tv-code-file path=\"package.json\">\n    {\n      \"name\": \"daybook\",\n      \"private\": true,\n      \"scripts\": { \"dev\": \"vite\", \"build\": \"vite build\" },\n      \"dependencies\": { \"vite\": \"^7.0.0\" }\n    }\n  </tv-code-file>";

/** Shiki tokens and rendered Markdown are sample output, not specification templates. */
export const sampleBodies = {
  "code": "<div class=\"cv-code-view\" tabindex=\"0\" role=\"region\" aria-label=\"Code\" style=\"--cv-gutter-digits: 2;\"><div class=\"cv-code-block\" style=\"--cv-block-lines: 22;\"><div class=\"cv-line\" data-line=\"1\"><button class=\"cv-line-number\" type=\"button\" data-line=\"1\" aria-label=\"Select line 1\"></button><span class=\"cv-code-text\"><span class=\"cv-t-keyword\">import</span> <span class=\"cv-t-punctuation\">{</span> readableDate <span class=\"cv-t-punctuation\">}</span> <span class=\"cv-t-keyword\">from</span> <span class=\"cv-t-string\">\"./lib/date\"</span><span class=\"cv-t-punctuation\">;</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"2\"><button class=\"cv-line-number\" type=\"button\" data-line=\"2\" aria-label=\"Select line 2\"></button><span class=\"cv-code-text\"><span class=\"cv-t-keyword\">import</span> <span class=\"cv-t-string\">\"./styles.css\"</span><span class=\"cv-t-punctuation\">;</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"3\"><button class=\"cv-line-number\" type=\"button\" data-line=\"3\" aria-label=\"Select line 3\"></button><span class=\"cv-code-text\"><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"4\"><button class=\"cv-line-number\" type=\"button\" data-line=\"4\" aria-label=\"Select line 4\"></button><span class=\"cv-code-text\"><span class=\"cv-t-keyword\">type</span> <span class=\"cv-t-type\">Entry</span> <span class=\"cv-t-operator\">=</span> <span class=\"cv-t-punctuation\">{</span> title<span class=\"cv-t-operator\">:</span> <span class=\"cv-t-type\">string</span><span class=\"cv-t-punctuation\">;</span> createdAt<span class=\"cv-t-operator\">:</span> <span class=\"cv-t-type\">string</span> <span class=\"cv-t-punctuation\">};</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"5\"><button class=\"cv-line-number\" type=\"button\" data-line=\"5\" aria-label=\"Select line 5\"></button><span class=\"cv-code-text\"><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"6\"><button class=\"cv-line-number\" type=\"button\" data-line=\"6\" aria-label=\"Select line 6\"></button><span class=\"cv-code-text\"><span class=\"cv-t-keyword\">const</span> entries<span class=\"cv-t-operator\">:</span> <span class=\"cv-t-type\">Entry</span><span class=\"cv-t-punctuation\">[]</span> <span class=\"cv-t-operator\">=</span> <span class=\"cv-t-punctuation\">[</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"7\"><button class=\"cv-line-number\" type=\"button\" data-line=\"7\" aria-label=\"Select line 7\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-punctuation\">{</span> <span class=\"cv-t-property\">title</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"First light\"</span><span class=\"cv-t-punctuation\">,</span> <span class=\"cv-t-property\">createdAt</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"2026-09-12\"</span> <span class=\"cv-t-punctuation\">},</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"8\"><button class=\"cv-line-number\" type=\"button\" data-line=\"8\" aria-label=\"Select line 8\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-punctuation\">{</span> <span class=\"cv-t-property\">title</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"North ridge\"</span><span class=\"cv-t-punctuation\">,</span> <span class=\"cv-t-property\">createdAt</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"2026-09-18\"</span> <span class=\"cv-t-punctuation\">},</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"9\"><button class=\"cv-line-number\" type=\"button\" data-line=\"9\" aria-label=\"Select line 9\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-punctuation\">{</span> <span class=\"cv-t-property\">title</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"After the rain\"</span><span class=\"cv-t-punctuation\">,</span> <span class=\"cv-t-property\">createdAt</span><span class=\"cv-t-punctuation\">:</span> <span class=\"cv-t-string\">\"2026-09-27\"</span> <span class=\"cv-t-punctuation\">},</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"10\"><button class=\"cv-line-number\" type=\"button\" data-line=\"10\" aria-label=\"Select line 10\"></button><span class=\"cv-code-text\"><span class=\"cv-t-punctuation\">];</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"11\"><button class=\"cv-line-number\" type=\"button\" data-line=\"11\" aria-label=\"Select line 11\"></button><span class=\"cv-code-text\"><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"12\"><button class=\"cv-line-number\" type=\"button\" data-line=\"12\" aria-label=\"Select line 12\"></button><span class=\"cv-code-text\"><span class=\"cv-t-keyword\">export</span> <span class=\"cv-t-keyword\">function</span> <span class=\"cv-t-function\">renderTimeline</span><span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-parameter\">root</span><span class=\"cv-t-operator\">:</span> <span class=\"cv-t-type\">HTMLElement</span><span class=\"cv-t-punctuation\">)</span><span class=\"cv-t-operator\">:</span> <span class=\"cv-t-type\">void</span> <span class=\"cv-t-punctuation\">{</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"13\"><button class=\"cv-line-number\" type=\"button\" data-line=\"13\" aria-label=\"Select line 13\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-keyword\">const</span> list <span class=\"cv-t-operator\">=</span> document.<span class=\"cv-t-function\">createElement</span><span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-string\">\"ol\"</span><span class=\"cv-t-punctuation\">);</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"14\"><button class=\"cv-line-number\" type=\"button\" data-line=\"14\" aria-label=\"Select line 14\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-keyword\">for</span> <span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-keyword\">const</span> entry <span class=\"cv-t-operator\">of</span> entries<span class=\"cv-t-punctuation\">)</span> <span class=\"cv-t-punctuation\">{</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"15\"><button class=\"cv-line-number\" type=\"button\" data-line=\"15\" aria-label=\"Select line 15\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 4;\">    <span class=\"cv-t-keyword\">const</span> item <span class=\"cv-t-operator\">=</span> document.<span class=\"cv-t-function\">createElement</span><span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-string\">\"li\"</span><span class=\"cv-t-punctuation\">);</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"16\"><button class=\"cv-line-number\" type=\"button\" data-line=\"16\" aria-label=\"Select line 16\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 4;\">    item.<span class=\"cv-t-property\">textContent</span> <span class=\"cv-t-operator\">=</span> <span class=\"cv-t-string\">`${</span><span class=\"cv-t-string\">entry.</span><span class=\"cv-t-property\">title</span><span class=\"cv-t-string\">} · ${</span><span class=\"cv-t-function\">readableDate</span><span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-string\">entry.</span><span class=\"cv-t-property\">createdAt</span><span class=\"cv-t-punctuation\">)</span><span class=\"cv-t-string\">}`</span><span class=\"cv-t-punctuation\">;</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"17\"><button class=\"cv-line-number\" type=\"button\" data-line=\"17\" aria-label=\"Select line 17\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 4;\">    list.<span class=\"cv-t-function\">append</span><span class=\"cv-t-punctuation\">(</span>item<span class=\"cv-t-punctuation\">);</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"18\"><button class=\"cv-line-number\" type=\"button\" data-line=\"18\" aria-label=\"Select line 18\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  <span class=\"cv-t-punctuation\">}</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"19\"><button class=\"cv-line-number\" type=\"button\" data-line=\"19\" aria-label=\"Select line 19\"></button><span class=\"cv-code-text\" style=\"--cv-indent: 2;\">  root.<span class=\"cv-t-function\">replaceChildren</span><span class=\"cv-t-punctuation\">(</span>list<span class=\"cv-t-punctuation\">);</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"20\"><button class=\"cv-line-number\" type=\"button\" data-line=\"20\" aria-label=\"Select line 20\"></button><span class=\"cv-code-text\"><span class=\"cv-t-punctuation\">}</span><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"21\"><button class=\"cv-line-number\" type=\"button\" data-line=\"21\" aria-label=\"Select line 21\"></button><span class=\"cv-code-text\"><span class=\"cv-line-break\" aria-hidden=\"true\">\n</span></span></div><div class=\"cv-line\" data-line=\"22\"><button class=\"cv-line-number\" type=\"button\" data-line=\"22\" aria-label=\"Select line 22\"></button><span class=\"cv-code-text\"><span class=\"cv-t-function\">renderTimeline</span><span class=\"cv-t-punctuation\">(</span>document.<span class=\"cv-t-function\">querySelector</span><span class=\"cv-t-punctuation\">(</span><span class=\"cv-t-string\">\"#app\"</span><span class=\"cv-t-punctuation\">)</span><span class=\"cv-t-operator\">!</span><span class=\"cv-t-punctuation\">);</span></span></div></div></div>",
  "markdown": "<tv-markdown class=\"cv-markdown-view\" show-frontmatter=\"\"><h1 id=\"daybook\">Daybook</h1>\n<p>A small timeline for field notes. Entries are kept in date order and rendered in the browser.</p>\n<p><img alt=\"A landscape cover for Daybook\" src=\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22360%22%20viewBox%3D%220%200%20640%20360%22%3E%0A%20%20%20%20%20%20%20%20%3Crect%20width%3D%22640%22%20height%3D%22360%22%20fill%3D%22%23122e3a%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Ccircle%20cx%3D%22503%22%20cy%3D%2290%22%20r%3D%2235%22%20fill%3D%22%23f9b663%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Cpath%20d%3D%22M0%20286%20109%20200l68%2042%20103-109%2092%2077%2060-49%20208%20118v81H0Z%22%20fill%3D%22%23387a80%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Cpath%20d%3D%22M0%20320%20118%20252l94%2055%20118-78%20132%2095%2084-51%2094%2036v51H0Z%22%20fill%3D%22%2373a793%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Ctext%20x%3D%2234%22%20y%3D%2263%22%20font-family%3D%22sans-serif%22%20font-size%3D%2232%22%20font-weight%3D%22700%22%20fill%3D%22%23ffffff%22%3EDaybook%3C%2Ftext%3E%0A%20%20%20%20%20%20%3C%2Fsvg%3E\"></p>\n<h2 id=\"start\">Start</h2>\n<p>Install packages, then run the local preview:</p>\n<pre><code><span class=\"cv-t-function\">npm</span> <span class=\"cv-t-string\">install</span>\n<span class=\"cv-t-function\">npm</span> <span class=\"cv-t-string\">run</span> <span class=\"cv-t-string\">dev</span>\n</code></pre>\n<p>The timeline lives in <a href=\"src/main.ts\">src/main.ts</a>. Dates are formatted in <a href=\"src/lib/date.ts\">src/lib/date.ts</a>.</p>\n</tv-markdown>",
  "image": "<div class=\"cv-media-image\"><img alt=\"\" src=\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22360%22%20viewBox%3D%220%200%20640%20360%22%3E%0A%20%20%20%20%20%20%20%20%3Crect%20width%3D%22640%22%20height%3D%22360%22%20fill%3D%22%23122e3a%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Ccircle%20cx%3D%22503%22%20cy%3D%2290%22%20r%3D%2235%22%20fill%3D%22%23f9b663%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Cpath%20d%3D%22M0%20286%20109%20200l68%2042%20103-109%2092%2077%2060-49%20208%20118v81H0Z%22%20fill%3D%22%23387a80%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Cpath%20d%3D%22M0%20320%20118%20252l94%2055%20118-78%20132%2095%2084-51%2094%2036v51H0Z%22%20fill%3D%22%2373a793%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%3Ctext%20x%3D%2234%22%20y%3D%2263%22%20font-family%3D%22sans-serif%22%20font-size%3D%2232%22%20font-weight%3D%22700%22%20fill%3D%22%23ffffff%22%3EDaybook%3C%2Ftext%3E%0A%20%20%20%20%20%20%3C%2Fsvg%3E\"></div>"
};

export const sampleRows = {
  "code": [
    {
      "path": "assets",
      "name": "assets",
      "kind": "folder",
      "level": 1,
      "expanded": false,
      "icon": "folder"
    },
    {
      "path": "src",
      "name": "src",
      "kind": "folder",
      "level": 1,
      "expanded": true,
      "icon": "folderOpen"
    },
    {
      "path": "src/lib",
      "name": "lib",
      "kind": "folder",
      "level": 2,
      "expanded": false,
      "icon": "folder"
    },
    {
      "path": "src/main.ts",
      "name": "main.ts",
      "kind": "file",
      "level": 2,
      "icon": "fileCode"
    },
    {
      "path": "src/styles.css",
      "name": "styles.css",
      "kind": "file",
      "level": 2,
      "icon": "fileCode"
    },
    {
      "path": "package.json",
      "name": "package.json",
      "kind": "file",
      "level": 1,
      "icon": "fileData"
    },
    {
      "path": "README.md",
      "name": "README.md",
      "kind": "file",
      "level": 1,
      "icon": "fileText"
    }
  ],
  "markdown": [
    {
      "path": "assets",
      "name": "assets",
      "kind": "folder",
      "level": 1,
      "expanded": false,
      "icon": "folder"
    },
    {
      "path": "src",
      "name": "src",
      "kind": "folder",
      "level": 1,
      "expanded": false,
      "icon": "folder"
    },
    {
      "path": "package.json",
      "name": "package.json",
      "kind": "file",
      "level": 1,
      "icon": "fileData"
    },
    {
      "path": "README.md",
      "name": "README.md",
      "kind": "file",
      "level": 1,
      "icon": "fileText"
    }
  ],
  "image": [
    {
      "path": "assets",
      "name": "assets",
      "kind": "folder",
      "level": 1,
      "expanded": true,
      "icon": "folderOpen"
    },
    {
      "path": "assets/cover.svg",
      "name": "cover.svg",
      "kind": "file",
      "level": 2,
      "icon": "fileImage"
    },
    {
      "path": "src",
      "name": "src",
      "kind": "folder",
      "level": 1,
      "expanded": false,
      "icon": "folder"
    },
    {
      "path": "package.json",
      "name": "package.json",
      "kind": "file",
      "level": 1,
      "icon": "fileData"
    },
    {
      "path": "README.md",
      "name": "README.md",
      "kind": "file",
      "level": 1,
      "icon": "fileText"
    }
  ]
} as const;
