/** File pane: breadcrumbs, actions and one lifecycle for each body kind. */
import { CodeView } from "./code-view";
// Only types: the diff module is imported on first use by the element.
import type { DiffView, FileChange } from "./tv-code-diff";
import { h, svg } from "./dom";
import { icons } from "./icons";
import type { DecodedRead } from "./input";
import { detectLanguage, fileKind } from "./languages";
import { MarkdownView } from "./markdown-view";
import { binaryBody, ImageView, largeBody, type ImageSource } from "./media-view";
import type { TreeNode } from "./tree-model";
import type { LineRange } from "./types";
import { initialPaneState, paneAppearance, type PaneState } from "./pane-state";

/** Renders the currently selected file without owning input or navigation. */
export class Pane {
  readonly element = h("section", { className: "cv-pane" });
  readonly actions = h("div", { className: "cv-pane-actions" });
  readonly header = h("header", { className: "cv-pane-header" });
  private pathArea = h("div", { className: "cv-pane-path" });
  private findButton: HTMLButtonElement;
  private progress = h("div", { className: "cv-pane-progress" });
  private notice = h("div", { className: "cv-pane-notice" });
  private content = h("div", { className: "cv-pane-content" });
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private lineObserver: MutationObserver | null = null;
  private state: PaneState = initialPaneState;
  private renderedRevision = -1;
  private get currentPath(): string | null { return this.state.path; }
  private entry: TreeNode | null = null;
  private contentPath: string | null = null;
  private result: DecodedRead | null = null;
  private body: CodeView | MarkdownView | ImageView | null = null;
  private codeLanguageId: string | null = null;
  private linesValue: LineRange | null = null;
  private wrapped = false;
  private source = false;
  private singleFile = false;
  private get diff(): { change: FileChange | null; shown: boolean } | null {
    const comparison = this.state.comparison;
    return comparison.kind === "none" ? null : { change: comparison.kind === "ready" ? comparison.change : null, shown: this.state.mode === "diff" };
  }
  /** The diff in the content area, shown as the body of the current or previous file. */
  private diffBody: DiffView | null = null;
  /** A diff drawing unseen over the content it will replace. */
  private pendingDiff: { ticket: number; view: DiffView; wrapper: HTMLElement } | null = null;
  onDiffDrawn?: (ticket: number) => void;
  onRetry?: () => void;
  onReveal?: (path: string) => void;
  onLinesChange?: (lines: LineRange | null) => void;
  onMappedLines?: (lines: LineRange | null) => void;
  onShowAnyway?: () => void;
  onToggleWrap?: () => void;
  onToggleSource?: () => void;
  onFind?: () => void;
  onViewMode?: (mode: "preview" | "source" | "diff") => void;
  resolveImage?: (path: string, force: boolean) => Promise<ImageSource | null>;
  hasImage?: (path: string, signal: AbortSignal) => boolean | Promise<boolean>;

  constructor(private openSidebarButton: HTMLButtonElement) {
    const find = h("button", { className: "cv-button cv-pane-action cv-find", type: "button", title: "Find file", "aria-label": "Find file", onclick: () => this.onFind?.() }, svg(icons.search));
    this.findButton = find;
    this.header.append(this.openSidebarButton, this.pathArea, this.actions, find);
    this.element.append(this.header, this.progress, this.notice, this.content);
    this.render(initialPaneState);
  }

  /** Whether the drawn ordinary body belongs to this path. */
  hasBodyFor(path: string): boolean { return this.contentPath === path && this.result !== null; }

  /** Whether a Markdown image depends on a changed file. */
  referencesImage(path: string): boolean { return this.body instanceof MarkdownView && this.body.referencesImage(path); }
  /** Re-resolve one image without re-rendering the Markdown document. */
  reloadImage(path: string): void { if (this.body instanceof MarkdownView) this.body.reloadImage(path); }

  /** Hide tree navigation and use plain folder names in a single-file view. */
  setSingleFile(singleFile: boolean): void {
    this.singleFile = singleFile;
    this.findButton.style.display = singleFile ? "none" : "";
    this.openSidebarButton.style.display = singleFile ? "none" : "";
    this.renderPath();
  }

  /** Release timers, highlights and object URLs when disconnected. */
  destroy(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.discardPendingDiff();
    this.clearBody();
  }

  /** Set the repository label in the breadcrumb. */
  /** Refresh entry data when a listing or files assignment changes. */
  setEntry(entry: TreeNode | null): void {
    this.entry = entry;
    if (this.body instanceof CodeView && this.result?.kind === "text" && this.contentPath === this.currentPath) {
      const languageId = detectLanguage(this.currentPath ?? "", entry?.language)?.id ?? null;
      if (languageId !== this.codeLanguageId) {
        this.codeLanguageId = languageId;
        this.body.update({ text: this.result.text, languageId });
      }
    }
  }
  /** Apply page-assigned lines without dispatching a reader event. */
  setLines(lines: LineRange | null): void {
    this.linesValue = lines;
    if (this.body instanceof CodeView && this.contentPath === this.currentPath) {
      this.body.lines = lines;
      this.linesValue = this.body.lines;
      if (lines?.start !== this.linesValue?.start || lines?.end !== this.linesValue?.end) this.onMappedLines?.(this.linesValue);
    }
  }
  /** Apply the wrap attribute to the active code body. */
  setWrap(value: boolean): void { this.wrapped = value; if (this.body instanceof CodeView) this.body.wrap = value; this.renderActions(); }
  /** Apply the source preference; the owner reloads the active file. */
  setShowSource(value: boolean): void { this.source = value; this.renderActions(); }

  /** Render one state; all visual consequences come from its appearance. */
  render(state: PaneState): void {
    const priorPath = this.state.path;
    this.state = state;
    const appearance = paneAppearance(state);
    if (priorPath !== state.path) {
      this.lineObserver?.disconnect();
      this.lineObserver = null;
      this.entry = null;
      this.content.scrollTop = 0;
    }
    if (this.pendingDiff && this.pendingDiff.ticket !== appearance.pendingDiff?.ticket &&
      !(state.view.kind === "diff" && this.pendingDiff.ticket === state.drawTicket)) this.discardPendingDiff();
    if (appearance.body && this.renderedRevision !== appearance.body.revision) {
      if (appearance.body.kind === "content") this.display(appearance.body.result, appearance.body.update);
      else this.displayDiff(appearance.body);
      this.renderedRevision = appearance.body.revision;
    } else if (!appearance.body && !appearance.pendingDiff) {
      this.renderedRevision = -1;
      this.clearBody();
      this.contentPath = null;
      this.result = null;
      if (state.view.kind === "empty") this.renderEmpty();
      else if (appearance.inlineError) this.content.replaceChildren(this.failure(appearance.inlineError));
      else if (state.view.kind === "deleted") this.content.replaceChildren(h("div", { className: "cv-pane-empty", text: "File deleted" }));
      else this.content.replaceChildren();
    }
    if (appearance.pendingDiff && this.pendingDiff?.ticket !== appearance.pendingDiff.ticket) {
      const pending = appearance.pendingDiff;
      const view = pending.comparison.createView(() => this.onDiffDrawn?.(pending.ticket));
      const wrapper = h("div", { className: "cv-pane-diff cv-pane-diff-pending" }, view.element);
      this.pendingDiff = { ticket: pending.ticket, view, wrapper };
      this.content.append(wrapper);
      view.show(pending.comparison.change);
    }
    if (this.state !== state) return; // A synchronous diff draw dispatched a newer state.
    this.renderPath();
    this.renderActions();
    this.notice.replaceChildren(...(appearance.notice ? [this.failure(appearance.notice)] : []));
    this.progress.classList.toggle("cv-pane-progress-active", appearance.progress);
    if (!appearance.progress || !appearance.faded) {
      if (this.fadeTimer) clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
      this.content.classList.toggle("cv-pane-faded", appearance.faded);
    } else if (!this.fadeTimer && !this.content.classList.contains("cv-pane-faded")) {
      this.fadeTimer = setTimeout(() => {
        this.fadeTimer = null;
        if (paneAppearance(this.state).progress && paneAppearance(this.state).faded) this.content.classList.add("cv-pane-faded");
      }, 200);
    }
  }

  private displayDiff(body: Extract<NonNullable<ReturnType<typeof paneAppearance>["body"]>, { kind: "diff" }>): void {
    if (this.pendingDiff) {
      const pending = this.pendingDiff;
      this.pendingDiff = null;
      this.clearBody();
      this.diffBody = pending.view;
      this.result = null;
      this.contentPath = body.path;
      pending.wrapper.classList.remove("cv-pane-diff-pending");
      this.content.replaceChildren(pending.wrapper);
    } else if (this.diffBody && this.contentPath === body.path) this.diffBody.show(body.comparison.change);
  }

  private discardPendingDiff(): void {
    this.pendingDiff?.view.destroy();
    this.pendingDiff?.wrapper.remove();
    this.pendingDiff = null;
  }

  private display(result: Exclude<DecodedRead, { kind: "failure" }>, update: boolean): void {
    const previous = this.result;
    const sameBody = update && this.contentPath === this.currentPath;
    this.result = result;
    this.contentPath = this.currentPath;
    const path = this.currentPath ?? "";
    const kind = fileKind(path);
    const asSource = this.source && (kind === "markdown" || path.toLowerCase().endsWith(".svg"));
    if (result.kind === "large") {
      this.replaceBody(largeBody(result.size, () => this.onShowAnyway?.()));
    } else if (result.kind === "binary" && kind !== "image") {
      this.replaceBody(binaryBody(path.split("/").at(-1) ?? path, this.entry?.size));
    } else if (kind === "image" && !asSource) {
      const source: ImageSource = this.entry?.src ? { src: this.entry.src } : result.kind === "bytes" ?
        { blob: path.toLowerCase().endsWith(".svg") ? new Blob([result.blob], { type: "image/svg+xml" }) : result.blob } :
        { blob: new Blob([result.kind === "text" ? result.text : ""], { type: "image/svg+xml" }) };
      const image = new ImageView(source);
      this.replaceBody(image.element, image);
    } else if (result.kind === "text" && kind === "markdown" && !asSource) {
      if (sameBody && this.body instanceof MarkdownView) this.body.update(result.text);
      else {
        const markdown = new MarkdownView(path, result.text,
          (image, force) => this.resolveImage?.(image, force) ?? Promise.resolve(null),
          (image, signal) => this.hasImage?.(image, signal) ?? false);
        this.replaceBody(markdown.element, markdown);
      }
    } else if (result.kind === "text") {
      const text = result.text;
      const language = detectLanguage(path, this.entry?.language);
      const doc = { text, languageId: language?.id ?? null };
      this.codeLanguageId = doc.languageId;
      if (sameBody && this.body instanceof CodeView && previous?.kind === "text") {
        const code = this.body;
        this.lineObserver?.disconnect();
        const observer = new MutationObserver(() => {
          observer.disconnect();
          if (this.lineObserver === observer) this.lineObserver = null;
          if (this.body !== code || this.currentPath !== path) return;
          const lines = code.lines;
          if (this.linesValue?.start !== lines?.start || this.linesValue?.end !== lines?.end) {
            this.linesValue = lines;
            this.onMappedLines?.(lines);
          }
        });
        this.lineObserver = observer;
        // CodeView.update can commit after highlighting. Observe only its
        // direct row-block replacement so the attribute follows the version
        // the reader can actually see, including when an update is superseded.
        observer.observe(code.element, { childList: true });
        code.update(doc);
      } else {
        const code = new CodeView({ onLinesChange: lines => { this.linesValue = lines; this.onLinesChange?.(lines); } });
        code.wrap = this.wrapped;
        this.replaceBody(code.element, code);
        const requestedLines = this.linesValue;
        code.show(doc, requestedLines);
        this.linesValue = code.lines;
        if (this.linesValue?.start !== requestedLines?.start || this.linesValue?.end !== requestedLines?.end) this.onMappedLines?.(this.linesValue);
      }
    } else this.replaceBody(binaryBody(path.split("/").at(-1) ?? path, this.entry?.size));
  }

  private renderEmpty(): void {
    const shortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
    this.content.replaceChildren(h("div", { className: "cv-pane-empty cv-empty-state" },
      h("span", { className: "cv-empty-icon" }, svg(icons.file)),
      h("strong", { text: "No file open" }),
      h("span", { className: "cv-empty-hint" }, "Find a file with ",
        h("kbd", { text: shortcut }), h("kbd", { text: "P" }))));
  }

  private replaceBody(element: HTMLElement, body: CodeView | MarkdownView | ImageView | null = null): void {
    if (this.body !== body || this.diffBody) this.clearBody();
    this.body = body;
    if (this.content.firstChild !== element) this.content.replaceChildren(element);
  }
  private clearBody(): void {
    this.lineObserver?.disconnect();
    this.lineObserver = null;
    this.body?.destroy();
    this.body = null;
    this.diffBody?.destroy();
    this.diffBody = null;
    this.codeLanguageId = null;
  }

  private renderPath(): void {
    const path = this.currentPath;
    const segments = path ? path.split("/") : [];
    const crumb = (name: string, folder: string) => this.singleFile
      ? h("span", { className: "cv-crumb", text: name })
      : h("button", { className: "cv-crumb cv-button", type: "button", text: name, onclick: () => this.onReveal?.(folder) });
    // The path starts at the first folder: the root name is already at the
    // top of the sidebar.
    const parts: Node[] = [];
    const separate = (node: Node) => parts.push(...(parts.length ? [h("span", { className: "cv-path-separator", text: "/" })] : []), node);
    let folder = "";
    for (const segment of segments.slice(0, -1)) {
      folder = folder ? `${folder}/${segment}` : segment;
      separate(crumb(segment, folder));
    }
    if (path) separate(h("strong", { className: "cv-path-file", text: segments.at(-1) ?? "" }));
    // Equal versions have no counts.
    const change = this.diff?.change;
    if (change?.metadata) {
      parts.push(h("span", { className: "cv-diff-counts" },
        h("span", { className: "cv-diff-additions", text: `+${change.additions}` }),
        h("span", { className: "cv-diff-deletions", text: `\u2212${change.deletions}` })));
    }
    if (paneAppearance(this.state).deleted) parts.push(h("span", { className: "cv-deleted", text: "Deleted" }));
    this.pathArea.replaceChildren(...parts);
  }

  private renderActions(): void {
    const focusedAction = this.actions.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).getAttribute("aria-label") : null;
    const path = this.currentPath;
    if (!path) { this.actions.replaceChildren(); return; }
    const kind = fileKind(path);
    const sourceToggle = kind === "markdown" || path.toLowerCase().endsWith(".svg");
    const diffShown = this.diff?.shown ?? false;
    const isCode = !diffShown && (kind === "text" || this.source && sourceToggle);
    const actions: HTMLElement[] = [];
    if (this.diff) {
      // A changed file adds Diff to the views it already has: rendered and
      // source, or the one of them that applies.
      const views: Array<[string, string, "preview" | "source" | "diff", boolean]> = [];
      if (sourceToggle || kind === "image") views.push(["Preview", icons.preview, "preview", !diffShown && !(sourceToggle && this.source)]);
      if (sourceToggle || kind !== "image") views.push(["Source", icons.source, "source", !diffShown && (!sourceToggle || this.source)]);
      views.push(["Diff", icons.diff, "diff", diffShown]);
      const buttons = views.map(([label, icon, mode, pressed]) => {
        const button = this.action(label, icon, () => this.onViewMode?.(mode));
        button.setAttribute("aria-pressed", String(pressed));
        return button;
      });
      actions.push(h("div", { className: "cv-view-toggle", role: "group", "aria-label": "View mode" }, ...buttons));
    } else if (sourceToggle) {
      const preview = this.action("Preview", icons.preview, () => { if (this.source) this.onToggleSource?.(); });
      const source = this.action("Source", icons.source, () => { if (!this.source) this.onToggleSource?.(); });
      preview.setAttribute("aria-pressed", String(!this.source));
      source.setAttribute("aria-pressed", String(this.source));
      actions.push(h("div", { className: "cv-view-toggle", role: "group", "aria-label": "View mode" }, preview, source));
    }
    if (isCode) {
      const button = this.action("Wrap lines", icons.wrap, () => this.onToggleWrap?.());
      button.setAttribute("aria-pressed", String(this.wrapped));
      actions.push(button);
    }
    this.actions.replaceChildren(...actions);
    if (focusedAction) {
      [...this.actions.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.getAttribute("aria-label") === focusedAction)?.focus({ preventScroll: true });
    }
  }

  private action(label: string, icon: string, click: () => void): HTMLButtonElement {
    return h("button", { className: "cv-button cv-pane-action", type: "button", title: label, "aria-label": label, onclick: click }, svg(icon));
  }

  private failure(message: string): HTMLElement {
    const retry = h("button", { className: "cv-button cv-retry", type: "button", onclick: () => this.onRetry?.() }, svg(icons.retry), "Retry");
    return h("div", { className: "cv-failure", role: "alert" }, h("span", { text: message }), retry);
  }
}
