/** Rendered HTML used only to display the Markdown stylesheet in Storybook. */
export const frontmatterPanel = `<dl data-frontmatter aria-label="Properties">
<div><dt>status</dt><dd>active</dd></div>
<div><dt>tags</dt><dd><ul><li>agents</li><li>research</li><li>safety</li></ul></dd></div>
<div><dt>related</dt><dd><ul><li><a data-wikilink="topics/goal-pressure" tabindex="0" role="link">Goal pressure</a></li><li><a data-wikilink="references/zhong-impossiblebench" tabindex="0" role="link">references/zhong-impossiblebench</a></li></ul></dd></div>
<div><dt>source</dt><dd><a href="https://example.org/impossiblebench">https://example.org/impossiblebench</a></dd></div>
<div><dt>updated</dt><dd>2026-09-24</dd></div>
<div><dt>reviewed</dt><dd><input type="checkbox" disabled checked></dd></div>
<div><dt>rating</dt><dd>4</dd></div>
<div><dt>owner</dt><dd data-empty>—</dd></div>
<div><dt>details</dt><dd><code>pages: 12, format: pdf</code></dd></div>
</dl>`;

export const sampleBody = `<h1 id="reading-notes">Reading notes</h1>
<p>Notes on <em>agent behaviour</em> and <strong>goal pressure</strong><sup><a id="footnote-ref-source" href="#footnote-source" data-footnote-ref aria-describedby="footnote-label">1</a></sup><sup>,<a id="footnote-ref-context" href="#footnote-context" data-footnote-ref aria-describedby="footnote-label">2</a></sup>, with sources linked as ordinary links such as <a href="https://example.org/impossiblebench">ImpossibleBench</a> and as wikilinks such as <a data-wikilink="topics/goal-pressure" tabindex="0" role="link">topics/goal-pressure</a> or <a data-wikilink="jane" tabindex="0" role="link">Jane</a>. The first source applies twice<sup><a id="footnote-ref-source-2" href="#footnote-source" data-footnote-ref aria-describedby="footnote-label">1</a></sup>. A link to a heading: <a href="#open-questions">open questions</a>.</p>
<h2 id="sources">Sources</h2>
<ul>
<li>Training conditions shape later failures.</li>
<li>Stopping options reduce specification violations.
<ul>
<li>Some models more than others.</li>
</ul>
</li>
<li>A longer item that wraps onto a second line, to show the line height and the indent of continued text in a list item.</li>
</ul>
<ol start="3">
<li>A numbered list that starts at three.</li>
<li>Its second item.</li>
</ol>
<h3 id="to-do">To do</h3>
<ul>
<li><input type="checkbox" disabled checked> Read the full paper</li>
<li><input type="checkbox" disabled> Compare the benchmark numbers</li>
</ul>
<blockquote>
<p>Behaviour does not establish motives.</p>
</blockquote>
<p>Inline code looks like <code>linkclick</code>, and a block of code looks like this:</p>
<pre><code>md.addEventListener('linkclick', event =&gt; {
  if (event.wikilink) openNote(event.wikilink);
});</code></pre>
<table>
<thead>
<tr><th>Source</th><th>Finding</th><th>Limits</th></tr>
</thead>
<tbody>
<tr><td>ImpossibleBench</td><td>Feedback increased violations</td><td>Runtime not isolated</td></tr>
<tr><td>Reward Hacking Benchmark</td><td>More exploits in longer chains</td><td>Several conditions changed together</td></tr>
</tbody>
</table>
<hr>
<h2 id="open-questions">Open questions</h2>
<p>An image keeps its aspect ratio and never exceeds the width of the element:</p>
<p><img alt="A wide sample image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='240'%3E%3Crect width='960' height='240' fill='%23a3a3a3'/%3E%3Ctext x='480' y='130' font-family='sans-serif' font-size='28' text-anchor='middle' fill='white'%3E960 × 240 image%3C/text%3E%3C/svg%3E"></p>
<p>A very long address wraps instead of overflowing: https://example.org/a/very/long/path/that/would/otherwise/push/the/page/wider/than/the/element</p>
<section data-footnotes>
<h2 id="footnote-label">Footnotes</h2>
<ol><li id="footnote-source"><p><a href="https://example.org/impossiblebench">ImpossibleBench</a>. Supports both claims. <a href="#footnote-ref-source" data-footnote-backref aria-label="Back to citation 1">↩</a> <a href="#footnote-ref-source-2" data-footnote-backref aria-label="Back to citation 1 (2)">↩<sup>2</sup></a></p></li>
<li id="footnote-context"><p>Background context. <a href="#footnote-ref-context" data-footnote-backref aria-label="Back to citation 2">↩</a></p></li></ol>
</section>`;
