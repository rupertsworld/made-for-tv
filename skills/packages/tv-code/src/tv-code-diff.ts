/**
 * The diff module: two versions of a file compared and drawn by @pierre/diffs
 * as one unified diff, with the options of the artifact-view diff document.
 *
 * The element imports this module the first time the page gives it two
 * versions of a file, so a page that never shows a diff does not load it or
 * @pierre/diffs. The build emits it as `tv-code-diff.js` beside `tv-code.js`;
 * it shares the highlighter grammars and helpers already in `tv-code.js`.
 */
import { FileDiff, parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs";
import { h } from "./dom";

/** Two versions of one file compared: the lines added and removed, and the parsed diff. */
export interface FileChange {
  readonly additions: number;
  readonly deletions: number;
  /** The parsed diff, or null when the versions are equal. */
  readonly metadata: FileDiffMetadata | null;
}

/**
 * Compare two versions of the file at `path`. `languageId` is the bundled
 * grammar to highlight with, or null for plain text.
 */
export function compareVersions(path: string, before: string, after: string, languageId: string | null): FileChange {
  if (before === after) return { additions: 0, deletions: 0, metadata: null };
  const lang = languageId ?? "text";
  const metadata = parseDiffFromFile({ name: path, contents: before, lang }, { name: path, contents: after, lang });
  return {
    additions: metadata.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
    deletions: metadata.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    metadata,
  };
}

/**
 * The diff of one file. `show` draws a change, and draws a later change of
 * the same file in place, keeping the scroll position. `onDrawn` is called
 * each time a change has been drawn, so the pane can keep its previous
 * content in view until then.
 */
export class DiffView {
  readonly element = h("div", { className: "cv-diff-view" });
  private renderer: FileDiff | null = null;

  constructor(private onDrawn: () => void) {}

  /** Draw a change; equal versions show `No differences`. */
  show(change: FileChange): void {
    if (!change.metadata) {
      this.destroy();
      this.element.replaceChildren(h("p", { className: "cv-diff-equal", role: "status", text: "No differences" }));
      this.onDrawn();
      return;
    }
    if (this.renderer) { this.renderer.render({ fileDiff: change.metadata }); return; }
    const target = h("div");
    this.element.replaceChildren(target);
    this.renderer = new FileDiff({
      diffStyle: "unified",
      theme: { light: "github-light", dark: "github-dark" },
      hunkSeparators: "line-info",
      overflow: "wrap",
      // The diff sizes to its lines and the pane scrolls it, so the library's
      // containment, which assumes a scroll box of its own, is removed.
      unsafeCSS: "[data-code] { contain: none; }",
      disableFileHeader: true,
      disableErrorHandling: true,
      onPostRender: (_node, _instance, phase) => { if (phase !== "unmount") this.onDrawn(); },
    });
    this.renderer.render({ fileDiff: change.metadata, containerWrapper: target });
  }

  /** Release the renderer. */
  destroy(): void {
    this.renderer?.cleanUp();
    this.renderer = null;
  }
}
