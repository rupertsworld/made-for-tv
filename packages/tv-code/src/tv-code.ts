/** The <tv-code> shell: page API, input precedence and UI composition. */
import { decodeRead, fromChildTags, fromFiles, maximumBytes, readFailure, type DecodedRead, type Entry } from "./input";
import { Loader } from "./loader";
import { decodeAddress, formatLines, normalizePath, parentPath, parseLineFragment, parseLines, resolvePath } from "./paths";
import { Pane } from "./pane";
import { PreferenceStore } from "./preferences";
import { Sidebar } from "./sidebar";
import { TreeModel } from "./tree-model";
import type { Connection, EntryInput, LineRange } from "./types";
import { h } from "./dom";
import { Finder } from "./finder";
import { detectLanguage, fileKind } from "./languages";
import { highlightElement } from "./highlight";
import type { ImageSource } from "./media-view";
import { LinkClickEvent } from "tv-markdown";

/** The view element; it never owns persistence or transport details. */
export class TvCodeElement extends HTMLElement {
  static observedAttributes = ["label", "selected", "lines", "wrap", "show-source", "dim"];
  private model = new TreeModel();
  /** Created on connection, when the page address it is keyed by is known. */
  private preferences = new PreferenceStore();
  private loader = new Loader(this.model, () => this.modelChanged());
  private sidebar: Sidebar | null = null;
  private pane: Pane | null = null;
  private finder: Finder | null = null;
  private app: HTMLDivElement | null = null;
  private observer: MutationObserver | null = null;
  private activeInput: "tags" | "files" | "connection" = "tags";
  private filesValue: EntryInput[] | Record<string, string> | null = null;
  private connectionValue: Connection | null = null;
  private singleFile = false;
  private selectedValue: string | null = null;
  private linesValue: LineRange | null = null;
  private pageSelected = false;
  private pendingRestore = false;
  private inputEpoch = 0;
  private readEpoch = 0;
  private autoOpened = false;
  private reflecting = false;
  private selectedWasKnown = false;
  private recentPaths: string[] = [];
  private finderPending = 0;
  private finderDiscovery: Promise<void> | null = null;
  private warming: number | null = null;
  private warmed = false;
  private pendingHeading: { path: string; fragment: string } | null = null;

  constructor() {
    super();
    this.loader.onRefreshRead = (path, result) => {
      if (path === this.selectedValue) { this.pane?.setEntry(this.model.get(path) ?? null); this.pane?.update(result); }
    };
    this.loader.onRefreshComplete = (paths, all) => {
      if (all) return; // Re-reading the open Markdown file already resolves its images.
      for (const path of paths) if (this.pane?.referencesImage(path)) this.pane.reloadImage(path);
    };
  }

  /** Replace all files, or clear the active input with nullish. */
  get files(): EntryInput[] | Record<string, string> | null { return this.activeInput === "files" ? this.filesValue : null; }
  set files(value: EntryInput[] | Record<string, string> | null | undefined) {
    this.activeInput = "files";
    this.filesValue = value ?? null;
    this.connectionValue = null;
    this.applyInput();
  }

  /** Supply the functions used to list folders and read files. */
  get connection(): Connection | null { return this.activeInput === "connection" ? this.connectionValue : null; }
  set connection(value: Connection | null | undefined) {
    this.activeInput = "connection";
    this.connectionValue = value ?? null;
    this.filesValue = null;
    this.applyInput();
  }

  /** The currently open file path, or null when no file is open. */
  get selected(): string | null { return this.selectedValue; }
  set selected(value: string | null | undefined) { this.pageSelected = true; this.setSelection(value, false); }

  /** The currently selected one-based line or range, formatted for the attribute. */
  get lines(): string | null { return formatLines(this.linesValue); }
  set lines(value: string | null | undefined) { this.setLines(value, false); }

  /** Whether code lines wrap. */
  get wrap(): boolean { return this.hasAttribute("wrap"); }
  set wrap(value: boolean) { this.toggleAttribute("wrap", Boolean(value)); }

  /** Whether Markdown and SVG should show source. */
  get showSource(): boolean { return this.hasAttribute("show-source"); }
  set showSource(value: boolean) { this.toggleAttribute("show-source", Boolean(value)); }

  /** Fetch changed connection entries and the open file again. */
  refresh(path?: string): void {
    const changed = path === undefined ? undefined : normalizePath(path);
    this.loader.refresh(changed);
  }

  /** Open quick file navigation and discover currently unlisted folders. */
  openFinder(): void {
    if (this.singleFile) return;
    this.finder?.open();
    if (this.activeInput !== "connection" || !this.connectionValue || this.finderDiscovery) return;
    const epoch = this.inputEpoch;
    this.finderDiscovery = (async () => {
      // The root may still be listing when the finder opens. Discover its
      // folders only after that listing has supplied them to the model.
      await this.loader.list("");
      if (epoch !== this.inputEpoch) return;
      await this.loader.listAllUndimmed(count => {
        if (epoch !== this.inputEpoch) return;
        this.finderPending = count;
        this.finder?.update();
      });
    })().finally(() => { if (epoch === this.inputEpoch) this.finderDiscovery = null; });
  }

  /** Open a finder result, optionally selecting a line. */
  openFromFinder(path: string, line: number | null = null): void {
    this.setSelection(path, true, line && Number.isSafeInteger(line) && line > 0 ? { start: line, end: line } : null);
  }

  connectedCallback(): void {
    if (this.app) return;
    this.preferences = new PreferenceStore();
    // A choice the reader made on an earlier visit wins over the markup.
    const wrap = this.preferences.get("wrap");
    if (wrap !== undefined) this.wrap = wrap;
    const showSource = this.preferences.get("showSource");
    if (showSource !== undefined) this.showSource = showSource;
    this.model.setDimPatterns(this.getAttribute("dim"));
    const app = h("div", { className: "cv-app" });
    this.app = app;
    const sidebar = new Sidebar(this, app, this.model, this.loader, path => this.setSelection(path, true), this.preferences);
    this.sidebar = sidebar;
    const pane = new Pane(sidebar.openButton);
    this.pane = pane;
    sidebar.setLabel(this.getAttribute("label") || "Files");
    pane.onReveal = path => { sidebar.open(); void sidebar.reveal(path, true); };
    pane.onRetry = () => { if (this.selectedValue) void this.loadFile(this.selectedValue, true); };
    pane.onShowAnyway = () => { if (this.selectedValue) void this.loadFile(this.selectedValue, true, true); };
    pane.onToggleWrap = () => this.toggleWrap();
    pane.onFind = () => this.openFinder();
    pane.onToggleSource = () => { this.showSource = !this.showSource; this.preferences.set("showSource", this.showSource); };
    pane.onLinesChange = lines => this.setLines(formatLines(lines), true, false);
    pane.onMappedLines = lines => this.setLines(formatLines(lines), false, false);
    pane.resolveImage = (path, force) => this.resolveImage(path, force);
    pane.hasImage = (path, signal) => this.hasImage(path, signal);
    pane.setWrap(this.wrap);
    pane.setShowSource(this.showSource);
    const finder = new Finder({
      files: () => this.finderFiles(),
      recent: () => this.recentPaths,
      pending: () => this.finderPending,
      onOpen: (path, line) => this.openFromFinder(path, line),
      onGoToLine: line => { if (this.selectedValue) this.setLines(String(line), true); },
      onClose: () => undefined,
    });
    this.finder = finder;
    app.append(sidebar.backdrop, sidebar.element, pane.element);
    app.append(finder.element);
    this.append(app);
    this.selectedValue = normalizePath(this.getAttribute("selected") ?? "") || null;
    this.linesValue = parseLines(this.getAttribute("lines"));
    pane.setLines(this.linesValue);
    // Capture first so the reserved T shortcut reaches the finder before the
    // tree's ordinary printable-character type-ahead handler.
    this.addEventListener("keydown", this.onShortcut, true);
    this.addEventListener("click", this.onMarkdownClick);
    document.addEventListener("keydown", this.onDocumentShortcut);
    this.observer = new MutationObserver(mutations => {
      if (this.activeInput !== "tags") return;
      if (mutations.some(mutation => this.isInputMutation(mutation))) this.applyInput();
    });
    this.observer.observe(this, { subtree: true, childList: true, characterData: true, attributes: true });
    this.applyInput();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", this.onDocumentReady, { once: true });
  }

  disconnectedCallback(): void {
    this.inputEpoch++;
    this.readEpoch++;
    this.pendingHeading = null;
    this.observer?.disconnect();
    this.observer = null;
    this.sidebar?.destroy();
    this.sidebar = null;
    this.pane?.destroy();
    this.pane = null;
    this.finder?.close();
    this.finder = null;
    this.app?.remove();
    this.app = null;
    this.removeEventListener("keydown", this.onShortcut, true);
    this.removeEventListener("click", this.onMarkdownClick);
    if (this.warming !== null) { if (typeof cancelIdleCallback === "function") cancelIdleCallback(this.warming); else clearTimeout(this.warming); this.warming = null; }
    document.removeEventListener("keydown", this.onDocumentShortcut);
    document.removeEventListener("DOMContentLoaded", this.onDocumentReady);
    this.loader.setConnection(null);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (this.reflecting) return;
    if (name === "selected") { this.pageSelected = true; this.setSelection(value, false); }
    else if (name === "lines") this.setLines(value, false);
    else if (name === "dim") { this.model.setDimPatterns(value); this.sidebar?.render(); }
    else if (name === "label") { const label = value || "Files"; this.sidebar?.setLabel(label); }
    else if (name === "wrap") this.pane?.setWrap(value !== null);
    else if (name === "show-source") { this.pane?.setShowSource(value !== null); if (this.selectedValue) void this.loadFile(this.selectedValue); }
  }

  /** A reader toggle of line wrapping, remembered for the next visit. */
  private toggleWrap(): void {
    this.wrap = !this.wrap;
    this.preferences.set("wrap", this.wrap);
  }

  private onDocumentReady = (): void => { if (this.activeInput === "tags") this.applyInput(); };

  private isInputMutation(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (target?.closest(".cv-app")) return false;
    if (target === this && mutation.type === "attributes") return false;
    if (target?.closest("tv-code-file, tv-code-folder")) return true;
    if (target === this && mutation.type === "childList") return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element && (node.matches("tv-code-file, tv-code-folder") || node.querySelector("tv-code-file, tv-code-folder")));
    return false;
  }

  private applyInput(): void {
    if (!this.app) return;
    const epoch = ++this.inputEpoch;
    this.readEpoch++;
    this.autoOpened = false;
    this.finderPending = 0;
    this.finderDiscovery = null;
    this.pendingRestore = false;
    this.sidebar?.resetInput();
    this.finder?.update();
    if ((this.activeInput === "files" && !this.filesValue) || (this.activeInput === "connection" && !this.connectionValue)) this.setSelection(null, false);
    const previous = this.selectedValue;
    const remembered = !previous && !this.pageSelected && (this.activeInput !== "connection" || !!this.connectionValue?.list)
      ? normalizePath(this.preferences.get("selected") ?? "") : "";
    const entries: Entry[] = this.activeInput === "files" ? (this.filesValue ? fromFiles(this.filesValue) : []) : this.activeInput === "tags" ? fromChildTags(this) : [];
    const files = entries.filter(entry => entry.type === "file");
    const singleFile = (this.activeInput === "connection" && !!this.connectionValue && !this.connectionValue.list) ||
      (this.activeInput !== "connection" && files.length === 1);
    this.singleFile = singleFile;
    if (this.sidebar) {
      this.sidebar.element.style.display = singleFile ? "none" : "";
      this.sidebar.backdrop.style.display = singleFile ? "none" : "";
    }
    this.pane?.setSingleFile(singleFile);
    if (singleFile) this.finder?.close();
    if (this.activeInput === "connection" && this.connectionValue) {
      this.pendingRestore = !!remembered;
      this.loader.setConnection(this.connectionValue);
      this.loader.setOpenFile(previous && fileKind(previous) !== "binary" ? previous : null);
      if (singleFile) {
        this.model.replace(previous ? [{ path: previous, type: "file" }] : []);
        if (previous) {
          this.selectedWasKnown = true;
          this.pane?.setEntry(this.model.get(previous) ?? null);
          void this.loadFile(previous);
        }
        return;
      }
      void this.loader.list("").then(async () => {
        if (epoch !== this.inputEpoch || this.activeInput !== "connection") return;
        if (previous && this.selectedValue === previous) {
          void this.sidebar?.reveal(previous);
          if (this.model.get(parentPath(previous))?.listing !== "listed" || this.model.get(previous)) void this.loadFile(previous);
        } else if (remembered && !this.selectedValue && !this.pageSelected) {
          await this.sidebar?.reveal(remembered);
          if (epoch !== this.inputEpoch) return;
          this.pendingRestore = false;
          if (this.selectedValue || this.pageSelected) return;
          if (this.model.get(remembered)?.type === "file") this.openAutomatically(remembered, this.preferences.get("lines"));
          else this.maybeOpenReadme();
        } else { this.pendingRestore = false; this.maybeOpenReadme(); }
      });
      return;
    }
    this.loader.setConnection(null);
    this.model.replace(entries);
    this.sidebar?.render();
    this.finder?.update();
    this.scheduleWarmup();
    if (previous && this.model.get(previous)?.type === "file") {
      this.selectedWasKnown = true;
      this.pane?.setEntry(this.model.get(previous) ?? null);
      this.sidebar?.setSelected(previous);
      void this.loadFile(previous);
    }
    else if (previous && this.selectedWasKnown) { this.readEpoch++; this.pane?.markDeleted(); }
    else if (previous) { this.pane?.start(previous); this.pane?.show({ kind: "failure", message: "File not found" }); }
    else if (remembered && this.model.get(remembered)?.type === "file") this.openAutomatically(remembered, this.preferences.get("lines"));
    else if (singleFile) this.openAutomatically(files[0].path);
    else this.maybeOpenReadme();
  }

  private modelChanged(): void {
    this.sidebar?.render();
    this.finder?.update();
    this.scheduleWarmup();
    const path = this.selectedValue;
    const openEntry = path ? this.model.get(path) : null;
    if (openEntry?.type === "file") {
      this.selectedWasKnown = true;
      this.pane?.setEntry(openEntry);
    }
    if (path && this.activeInput === "connection" && this.model.get(parentPath(path))?.listing === "listed" && !this.model.get(path) && this.selectedWasKnown) {
      this.readEpoch++;
      this.pane?.markDeleted();
    }
    if (path && this.model.get(path)?.type === "file" && this.pane?.isDeleted && !this.loader.isRefreshing) {
      this.selectedWasKnown = true;
      this.pane.setEntry(this.model.get(path) ?? null);
      void this.loadFile(path);
    }
    if (!path) this.maybeOpenReadme();
  }

  private maybeOpenReadme(): void {
    if (this.autoOpened || this.selectedValue || this.pendingRestore || this.model.get("")?.listing !== "listed") return;
    this.autoOpened = true;
    const root = this.model.children("");
    for (const name of ["readme.md", "readme", "readme.markdown", "readme.txt"]) {
      const readme = root.find(node => node.type === "file" && node.name.toLowerCase() === name);
      if (readme) { this.openAutomatically(readme.path); break; }
    }
  }

  /** Open a known file with its chosen lines, without reporting a reader action. */
  private openAutomatically(path: string, lines: string | null = null): void {
    this.setLines(lines, false);
    this.setSelection(path, false);
  }

  private setSelection(value: string | null | undefined, reader: boolean, readerLines: LineRange | null = null): void {
    const path = value ? normalizePath(value) : null;
    // Closing the file must outlast later connection listings. A new input
    // resets this flag and may make the README rule apply again.
    if (!path) this.autoOpened = true;
    if (path !== this.selectedValue) this.pendingHeading = null;
    if (path !== this.selectedValue && this.singleFile && this.activeInput === "connection" && !this.connectionValue?.list) {
      this.model.replace(path ? [{ path, type: "file" }] : []);
    }
    if (path && this.model.get(path)?.type === "folder") { void this.sidebar?.reveal(path); return; }
    if (path === this.selectedValue && this.pane) {
      if (!path) { this.preferences.set("selected", null); this.setLines(null, false); }
      if (path && !this.singleFile) void this.sidebar?.reveal(path);
      if (reader && path) {
        this.setLines(formatLines(readerLines), false);
        this.dispatchEvent(new CustomEvent("select", { bubbles: true, detail: { path, lines: this.lines } }));
      }
      return;
    }
    this.selectedValue = path;
    // A page can change `selected` without assigning `lines`. Save the range
    // that is actually active so old stored lines cannot follow a new file.
    this.preferences.set("selected", path);
    this.preferences.set("lines", this.lines);
    this.selectedWasKnown = !!(path && this.model.get(path)?.type === "file");
    this.reflect("selected", path);
    this.loader.setOpenFile(path && fileKind(path) !== "binary" ? path : null);
    this.sidebar?.setSelected(path);
    if (path) {
      this.pane?.start(path);
      this.pane?.setEntry(this.model.get(path) ?? null);
      if (!this.singleFile) void this.sidebar?.reveal(path);
      void this.loadFile(path);
    } else { this.setLines(null, false); this.pane?.showEmpty(); }
    if (reader && path) {
      this.recentPaths = [path, ...this.recentPaths.filter(recent => recent !== path)];
      this.setLines(formatLines(readerLines), false);
      this.dispatchEvent(new CustomEvent("select", { bubbles: true, detail: { path, lines: this.lines } }));
    }
  }

  private setLines(value: string | null | undefined, reader: boolean, applyToPane = true): void {
    this.linesValue = parseLines(value);
    this.reflect("lines", this.lines);
    this.preferences.set("lines", this.lines);
    if (applyToPane) this.pane?.setLines(this.linesValue);
    if (reader) this.dispatchEvent(new CustomEvent("select", { bubbles: true, detail: { path: this.selectedValue, lines: this.lines } }));
  }

  private reflect(name: string, value: string | null): void {
    this.reflecting = true;
    if (value === null) this.removeAttribute(name);
    else this.setAttribute(name, value);
    this.reflecting = false;
  }

  private async loadFile(path: string, retry = false, showAnyway = false): Promise<void> {
    const epoch = ++this.readEpoch;
    let result: DecodedRead | null = null;
    const entry = this.model.get(path);
    const kind = fileKind(path);
    const imagePreview = kind === "image" && !(path.toLowerCase().endsWith(".svg") && this.showSource);
    if (!entry && this.model.get(parentPath(path))?.listing === "listed") result = { kind: "failure", message: "File not found" };
    else if (kind === "binary") result = { kind: "binary" };
    else if (!showAnyway && entry?.size !== undefined && entry.size > maximumBytes) result = { kind: "large", size: entry.size };
    else if (imagePreview && entry?.src) result = { kind: "binary" };
    else if (this.activeInput === "connection" && this.connectionValue) result = await this.loader.read(path, imagePreview ? "bytes" : "text", showAnyway, retry);
    else {
      if (entry?.content !== undefined) result = await decodeRead(entry.content, imagePreview ? "bytes" : "text", entry.size, showAnyway);
      else if (entry?.src && path.toLowerCase().endsWith(".svg") && this.showSource) {
        try { result = await decodeRead(await fetch(entry.src), "text", entry.size, showAnyway); }
        catch (error) { result = readFailure(error); }
      } else result = entry?.src ? { kind: "binary" } : { kind: "failure", message: "File has no content" };
    }
    if (!result || epoch !== this.readEpoch || this.selectedValue !== path) return;
    if (result.kind === "failure" && result.status === 404) {
      if (this.selectedWasKnown) this.pane?.markDeleted();
      else this.pane?.show({ kind: "failure", message: "File not found" });
      return;
    }
    this.pane?.setEntry(this.model.get(path) ?? null);
    if (this.model.get(path)?.type === "file") this.selectedWasKnown = true;
    if (this.pane?.hasBodyFor(path)) this.pane.update(result);
    else this.pane?.show(result);
    this.revealHeading();
  }

  private finderFiles(): Array<{ path: string; dimmed: boolean }> {
    const files: Array<{ path: string; dimmed: boolean }> = [];
    const visit = (folder: string) => {
      for (const node of this.model.children(folder)) {
        if (node.type === "folder") visit(node.path);
        else files.push({ path: node.path, dimmed: this.model.isDimmed(node.path) });
      }
    };
    visit("");
    return files;
  }

  private async resolveImage(path: string, force = false): Promise<ImageSource | null> {
    const entry = this.model.get(path);
    if (!entry || entry.type !== "file") return null;
    if (entry.src) return { src: entry.src };
    if (entry.content !== undefined) {
      if (/^data:/i.test(entry.content)) return { src: entry.content };
      return { blob: new Blob([entry.content], { type: path.toLowerCase().endsWith(".svg") ? "image/svg+xml" : undefined }) };
    }
    if (this.activeInput !== "connection") return null;
    const result = await this.loader.read(path, "bytes", false, force);
    return result?.kind === "bytes" ? { blob: result.blob } : null;
  }

  private hasImage(path: string, signal: AbortSignal): boolean | Promise<boolean> {
    const entry = this.model.get(path);
    if (entry) return entry.type === "file";
    if (this.model.get(parentPath(path))?.listing === "listed") return false;
    if (this.activeInput !== "connection" || !this.connectionValue?.list) return false;
    const epoch = this.inputEpoch;
    return (async () => {
      let folder = "";
      for (const segment of path.split("/")) {
        if (signal.aborted || epoch !== this.inputEpoch) return false;
        const parent = this.model.get(folder);
        if (!parent || parent.type !== "folder") return false;
        if (parent.listing !== "listed") await this.loader.list(folder);
        if (signal.aborted || epoch !== this.inputEpoch) return false;
        const next = folder ? `${folder}/${segment}` : segment;
        if (next === path) return this.model.get(next)?.type === "file";
        if (this.model.get(next)?.type !== "folder") return false;
        folder = next;
      }
      return false;
    })();
  }

  // TvMarkdown dispatches linkclick from its own click listener. A page that
  // cancels it makes the original click defaultPrevented before it bubbles here.
  private onMarkdownClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("tv-markdown a");
    if (!anchor || !this.pane?.element.contains(anchor)) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) {
      // tv-markdown leaves native fragments alone. Dispatch the same event so
      // a page can still cancel navigation from inside the viewer.
      const handledByPage = !anchor.closest("tv-markdown")!.dispatchEvent(new LinkClickEvent(anchor, event));
      event.preventDefault();
      if (!handledByPage && this.selectedValue) this.scrollToMarkdownHeading(this.selectedValue, href.slice(1));
      return;
    }
    if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(href)) return;
    event.preventDefault();
    const [relative, fragment] = href.split("#", 2);
    const path = resolvePath(parentPath(this.selectedValue ?? ""), decodeAddress(relative));
    if (href.endsWith("/") || this.model.get(path)?.type === "folder") {
      this.sidebar?.open();
      void this.sidebar?.reveal(path, true);
      return;
    }
    const lines = fragment ? parseLineFragment(`#${fragment}`) : null;
    this.setSelection(path, true, lines);
    if (fragment && !lines) this.scrollToMarkdownHeading(path, fragment);
  };

  private scrollToMarkdownHeading(path: string, fragment: string): void {
    this.pendingHeading = { path, fragment };
    if (this.pane?.hasBodyFor(path)) this.revealHeading();
  }

  private revealHeading(): void {
    const target = this.pendingHeading;
    if (!target || this.selectedValue !== target.path || !this.pane?.hasBodyFor(target.path)) return;
    const body = this.pane.element.querySelector<HTMLElement>(".cv-pane-content");
    const heading = [...(body?.querySelectorAll<HTMLElement>("[id]") ?? [])]
      .find(node => node.id === decodeAddress(target.fragment));
    if (!body || !heading) return;
    body.scrollTop += heading.getBoundingClientRect().top - body.getBoundingClientRect().top;
    this.pendingHeading = null;
  }

  /** Pay the highlighter's first grammar cost during idle time after input exists. */
  private scheduleWarmup(): void {
    if (this.warmed || this.warming !== null || !this.app) return;
    const first = this.finderFiles().find(file => detectLanguage(file.path));
    if (!first) return;
    const language = detectLanguage(first.path);
    if (!language) return;
    const warm = () => {
      this.warming = null;
      if (!this.isConnected || this.warmed) return;
      this.warmed = true;
      void highlightElement(document.createElement("code"), language.id).catch(error => console.error("Highlighter warmup failed", error));
    };
    this.warming = typeof requestIdleCallback === "function" ? requestIdleCallback(warm) : window.setTimeout(warm, 80);
  }

  private onShortcut = (event: KeyboardEvent): void => { this.handleShortcut(event); };
  private onDocumentShortcut = (event: KeyboardEvent): void => {
    if (event.target !== document.body || document.querySelectorAll("tv-code").length !== 1) return;
    this.handleShortcut(event);
  };
  private handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement)?.isContentEditable) return;
    if ((event.key.toLowerCase() === "p" && (event.ctrlKey || event.metaKey)) || (event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey && !event.altKey)) {
      if (this.singleFile) return;
      event.preventDefault();
      this.openFinder();
    }
    else if (event.altKey && event.key.toLowerCase() === "z" && this.selectedValue && this.pane?.element.querySelector(".cv-code-view")) { event.preventDefault(); this.toggleWrap(); }
    else if (event.key === "Escape" && this.sidebar?.isNarrow && this.sidebar.isOpen) { event.preventDefault(); this.sidebar.close(); }
  }
}

if (!customElements.get("tv-code")) customElements.define("tv-code", TvCodeElement);
