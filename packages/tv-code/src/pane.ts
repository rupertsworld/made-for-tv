/** File pane: breadcrumbs, actions and one lifecycle for each body kind. */
import { CodeView } from "./code-view";
import { h, svg } from "./dom";
import { icons } from "./icons";
import type { DecodedRead } from "./input";
import { detectLanguage, fileKind } from "./languages";
import { MarkdownView } from "./markdown-view";
import { binaryBody, ImageView, largeBody, type ImageSource } from "./media-view";
import type { TreeNode } from "./tree-model";
import type { LineRange } from "./types";

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
  private currentPath: string | null = null;
  private entry: TreeNode | null = null;
  private deleted = false;
  private contentPath: string | null = null;
  private result: DecodedRead | null = null;
  private body: CodeView | MarkdownView | ImageView | null = null;
  private codeLanguageId: string | null = null;
  private linesValue: LineRange | null = null;
  private wrapped = false;
  private source = false;
  private singleFile = false;
  onRetry?: () => void;
  onReveal?: (path: string) => void;
  onLinesChange?: (lines: LineRange | null) => void;
  onMappedLines?: (lines: LineRange | null) => void;
  onShowAnyway?: () => void;
  onToggleWrap?: () => void;
  onToggleSource?: () => void;
  onFind?: () => void;
  resolveImage?: (path: string, force: boolean) => Promise<ImageSource | null>;
  hasImage?: (path: string) => boolean;

  constructor(private openSidebarButton: HTMLButtonElement) {
    const find = h("button", { className: "cv-button cv-pane-action cv-find", type: "button", title: "Find file", "aria-label": "Find file", onclick: () => this.onFind?.() }, svg(icons.search));
    this.findButton = find;
    this.header.append(this.openSidebarButton, this.pathArea, this.actions, find);
    this.element.append(this.header, this.progress, this.notice, this.content);
    this.showEmpty();
  }

  /** Whether the last successfully displayed body belongs to this path. */
  hasBodyFor(path: string): boolean { return this.contentPath === path && this.result !== null; }
  /** Whether the current path has been marked as removed. */
  get isDeleted(): boolean { return this.deleted; }
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
    this.lineObserver?.disconnect();
    this.body?.destroy();
    this.body = null;
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

  /** Show an immediate new header and keep old content during a pending read. */
  start(path: string): void {
    this.lineObserver?.disconnect();
    this.lineObserver = null;
    this.currentPath = path;
    this.entry = null;
    this.result = null;
    this.deleted = false;
    this.renderPath();
    this.renderActions();
    this.notice.replaceChildren();
    this.progress.classList.add("cv-pane-progress-active");
    this.content.classList.remove("cv-pane-faded");
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.content.classList.add("cv-pane-faded"), 200);
    this.content.scrollTop = 0;
  }

  /** Complete a first load, including an error shown in place of content. */
  show(result: DecodedRead): void { this.display(result, false); }
  /** Refresh the open body, preserving its viewport and marking code changes. */
  update(result: DecodedRead): void {
    if (result.kind === "failure") {
      if (result.status === 404) this.markDeleted();
      else this.showRefreshFailure(result.message);
      return;
    }
    this.display(result, true);
  }

  private display(result: DecodedRead, update: boolean): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.progress.classList.remove("cv-pane-progress-active");
    this.content.classList.remove("cv-pane-faded");
    this.notice.replaceChildren();
    if (result.kind === "failure") {
      this.clearBody();
      this.contentPath = null;
      this.result = null;
      this.content.replaceChildren(this.failure(result.message));
      this.renderActions();
      return;
    }
    const previous = this.result;
    const sameBody = update && this.contentPath === this.currentPath;
    this.result = result;
    this.deleted = false;
    this.contentPath = this.currentPath;
    this.renderPath();
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
          image => this.hasImage?.(image) ?? false);
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
    this.renderActions();
  }

  /** Keep the last body dimmed when its file disappears. */
  markDeleted(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.deleted = true;
    this.renderPath();
    this.notice.replaceChildren();
    this.progress.classList.remove("cv-pane-progress-active");
    if (this.contentPath !== this.currentPath) { this.clearBody(); this.content.replaceChildren(h("div", { className: "cv-pane-empty", text: "File deleted" })); }
    this.content.classList.add("cv-pane-faded");
  }

  /** Keep content visible under a transient read failure and offer Retry. */
  showRefreshFailure(message: string): void { this.notice.replaceChildren(this.failure(message)); }

  /** Clear the selection and show the finder hint. */
  showEmpty(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    this.currentPath = null;
    this.entry = null;
    this.deleted = false;
    this.contentPath = null;
    this.result = null;
    this.clearBody();
    this.renderPath();
    this.renderActions();
    this.progress.classList.remove("cv-pane-progress-active");
    this.notice.replaceChildren();
    this.content.classList.remove("cv-pane-faded");
    const shortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl";
    this.content.replaceChildren(h("div", { className: "cv-pane-empty cv-empty-state" },
      h("span", { className: "cv-empty-icon" }, svg(icons.file)),
      h("strong", { text: "No file open" }),
      h("span", { className: "cv-empty-hint" }, "Find a file with ",
        h("kbd", { text: shortcut }), h("kbd", { text: "P" }))));
  }

  private replaceBody(element: HTMLElement, body: CodeView | MarkdownView | ImageView | null = null): void {
    if (this.body !== body) this.clearBody();
    this.body = body;
    if (this.content.firstChild !== element) this.content.replaceChildren(element);
  }
  private clearBody(): void {
    this.lineObserver?.disconnect();
    this.lineObserver = null;
    this.body?.destroy();
    this.body = null;
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
    if (this.deleted) parts.push(h("span", { className: "cv-deleted", text: "Deleted" }));
    this.pathArea.replaceChildren(...parts);
  }

  private renderActions(): void {
    const focusedAction = this.actions.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).getAttribute("aria-label") : null;
    const path = this.currentPath;
    if (!path) { this.actions.replaceChildren(); return; }
    const kind = fileKind(path);
    const sourceToggle = kind === "markdown" || path.toLowerCase().endsWith(".svg");
    const isCode = kind === "text" || this.source && sourceToggle;
    const actions: HTMLElement[] = [];
    if (sourceToggle) {
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
