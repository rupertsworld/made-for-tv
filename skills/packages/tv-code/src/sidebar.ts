/** Sidebar tree and its UI state: stable rows, ARIA navigation, reveal and resize. */
import { h, svg } from "./dom";
import type { PreferenceStore } from "./preferences";
import { iconForFile, icons, type IconName } from "./icons";
import { parentPath } from "./paths";
import { Loader } from "./loader";
import { TreeModel, type TreeNode } from "./tree-model";

const widthMin = 160;
const widthMax = 480;
const widthDefault = 260;
const snapDistance = 80;

interface RowParts { row: HTMLDivElement; caret: HTMLSpanElement; icon: HTMLSpanElement; name: HTMLSpanElement; }

/** A light-DOM sidebar whose rows retain identity across tree redraws. */
export class Sidebar {
  readonly element = h("aside", { className: "cv-sidebar" });
  readonly backdrop = h("div", { className: "cv-sidebar-backdrop" });
  readonly openButton = h("button", { className: "cv-button cv-open-sidebar", type: "button", "aria-label": "Open sidebar", title: "Open sidebar" }, svg(icons.sidebar));
  readonly tree = h("div", { className: "cv-tree", role: "tree", "aria-label": "Files" });
  private header = h("header", { className: "cv-sidebar-header" });
  private title = h("span", { className: "cv-sidebar-label", text: "Files" });
  private handle = h("div", { className: "cv-resize-handle", role: "separator", tabindex: 0, "aria-label": "Resize sidebar", "aria-orientation": "vertical", "aria-valuemin": widthMin, "aria-valuemax": widthMax, "aria-valuenow": widthDefault });
  private rows = new Map<string, RowParts>();
  private expanded = new Set<string>();
  private focused: string | null = null;
  private selected: string | null = null;
  private width = widthDefault;
  private closed = false;
  private narrow = false;
  private resizeObserver: ResizeObserver | null = null;
  private placeholderTimer: ReturnType<typeof setTimeout> | null = null;
  private showPlaceholders = false;
  private spinnerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private spinning = new Set<string>();
  private typeAhead = "";
  private typeTimer: ReturnType<typeof setTimeout> | null = null;
  private storageKey: string;
  private renderVersion = 0;
  private renderFrame: number | null = null;
  private revealVersion = 0;
  private pendingReveal: string | null = null;
  private cancelDrag: (() => void) | null = null;
  private iconTemplates = Object.fromEntries(Object.entries(icons).map(([name, markup]) => [name, svg(markup)])) as Record<IconName, SVGSVGElement>;

  constructor(private host: HTMLElement, private app: HTMLElement, private model: TreeModel, private loader: Loader, private onSelect: (path: string) => void, private preferences: PreferenceStore) {
    this.storageKey = `tv-code:sidebar-width:${location.pathname}`;
    try {
      const saved = Number(localStorage.getItem(this.storageKey));
      if (saved >= widthMin && saved <= widthMax) this.width = saved;
    } catch { /* Storage can be unavailable in an embedded artifact. */ }
    app.style.setProperty("--cv-sidebar-width", `${this.width}px`);
    const close = h("button", { className: "cv-button cv-close-sidebar", type: "button", title: "Close sidebar", "aria-label": "Close sidebar", onclick: () => this.close() }, svg(icons.sidebar));
    this.header.append(this.title, close);
    this.element.append(this.header, this.tree, this.handle);
    this.expanded = new Set(preferences.get("expanded") ?? []);
    if (preferences.get("sidebarClosed")) this.setClosed(true);
    this.openButton.addEventListener("click", () => { this.open(); this.tree.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus({ preventScroll: true }); });
    this.backdrop.addEventListener("click", () => this.close());
    this.tree.addEventListener("click", this.onTreeClick);
    this.tree.addEventListener("keydown", this.onTreeKeydown);
    this.tree.addEventListener("focusin", event => {
      const row = (event.target as Element).closest<HTMLElement>('[role="treeitem"]');
      if (row) this.focused = row.dataset.path ?? null;
    });
    this.tree.addEventListener("focusout", event => {
      if (this.tree.contains(event.relatedTarget as Node | null)) return;
      this.focused = null;
      const rows = [...this.tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
      const next = rows.find(row => row.dataset.path === this.selected) ?? rows[0];
      for (const row of rows) row.tabIndex = row === next ? 0 : -1;
    });
    this.handle.addEventListener("pointerdown", this.onPointerDown);
    this.handle.addEventListener("keydown", this.onHandleKeydown);
    this.handle.addEventListener("dblclick", () => this.resetWidth());
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(host);
    this.measure();
    this.render();
  }

  /** Tear down observers and timers when the element leaves the document. */
  destroy(): void {
    this.resizeObserver?.disconnect();
    this.cancelDrag?.();
    if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = null;
    if (this.placeholderTimer) clearTimeout(this.placeholderTimer);
    for (const timer of this.spinnerTimers.values()) clearTimeout(timer);
    if (this.typeTimer) clearTimeout(this.typeTimer);
  }

  /** Whether the sidebar currently covers or shares the pane. */
  get isOpen(): boolean { return !this.closed; }
  get isNarrow(): boolean { return this.narrow; }

  /** Open at the last stored width. */
  open(): void { this.setClosed(false); }
  /** Close without changing the remembered width. */
  close(): void { this.setClosed(true); }

  /** Change the title above the tree. */
  setLabel(label: string): void { this.title.textContent = label; this.tree.setAttribute("aria-label", label); }

  /** Keep selected tint separate from keyboard focus. */
  setSelected(path: string | null): void { this.selected = path; this.render(); }

  /** Cancel delayed indicators from a previous input while retaining row identity. */
  resetInput(): void {
    this.revealVersion++;
    this.pendingReveal = null;
    if (this.placeholderTimer) clearTimeout(this.placeholderTimer);
    this.placeholderTimer = null;
    this.showPlaceholders = false;
    for (const timer of this.spinnerTimers.values()) clearTimeout(timer);
    this.spinnerTimers.clear();
    this.spinning.clear();
  }

  /** Redraw after a model change while preserving rows, focus and scroll. */
  render(): void {
    const version = ++this.renderVersion;
    if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = null;
    const root = this.model.get("");
    if (root?.listing === "listed") {
      for (const [path] of this.rows) if (!this.model.get(path)) this.rows.delete(path);
    }
    if (root?.listing === "listing" && !this.placeholderTimer && !this.showPlaceholders) {
      this.placeholderTimer = setTimeout(() => { this.placeholderTimer = null; this.showPlaceholders = true; this.render(); }, 200);
    } else if (root?.listing !== "listing") {
      if (this.placeholderTimer) clearTimeout(this.placeholderTimer);
      this.placeholderTimer = null;
      this.showPlaceholders = false;
    }
    const visible: Array<{ node: TreeNode; level: number }> = [];
    const unlistedOpenFolders: string[] = [];
    const walk = (folder: string, level: number) => {
      for (const node of this.model.children(folder)) {
        visible.push({ node, level });
        if (node.type !== "folder" || !this.expanded.has(node.path)) continue;
        if (node.listing === "unlisted") unlistedOpenFolders.push(node.path);
        walk(node.path, level + 1);
      }
    };
    walk("", 1);
    // Folders remembered as open from an earlier visit are listed as they
    // come into view. Listing changes the model, which renders again, so it
    // starts after this render rather than inside it.
    if (unlistedOpenFolders.length) queueMicrotask(() => { for (const path of unlistedOpenFolders) void this.loader.list(path); });
    const wasFocused = this.tree.contains(document.activeElement);
    const activePath = wasFocused ? (document.activeElement as HTMLElement).dataset.path : undefined;
    const top = this.tree.scrollTop;
    const left = this.tree.scrollLeft;
    const fragment = document.createDocumentFragment();
    const tabPath = this.focused && visible.some(item => item.node.path === this.focused) ? this.focused : this.selected && visible.some(item => item.node.path === this.selected) ? this.selected : visible[0]?.node.path;
    const appendEntry = ({ node, level }: { node: TreeNode; level: number }, target: DocumentFragment): void => {
      const parts = this.rowFor(node.path);
      const { row, caret, icon, name } = parts;
      row.dataset.path = node.path;
      row.dataset.level = String(level);
      row.title = node.path;
      row.setAttribute("aria-level", String(level));
      row.tabIndex = node.path === tabPath ? 0 : -1;
      row.classList.toggle("cv-row-selected", node.type === "file" && node.path === this.selected);
      row.classList.toggle("cv-row-dimmed", this.model.isDimmed(node.path));
      row.classList.toggle("cv-row-folder", node.type === "folder");
      row.style.setProperty("--cv-depth", String(level - 1));
      if (name.textContent !== node.name) name.textContent = node.name;
      if (node.type === "folder") {
        row.setAttribute("aria-expanded", String(this.expanded.has(node.path)));
        row.removeAttribute("aria-selected");
        if (!caret.firstChild) caret.append(this.iconTemplates.caret.cloneNode(true));
        caret.classList.toggle("cv-caret-open", this.expanded.has(node.path));
        if (node.listing === "listing") this.scheduleSpinner(node.path);
        else { this.cancelSpinner(node.path); }
        caret.classList.toggle("cv-caret-spinning", this.spinning.has(node.path));
        this.setRowIcon(icon, this.expanded.has(node.path) ? "folderOpen" : "folder");
      } else {
        row.removeAttribute("aria-expanded");
        row.setAttribute("aria-selected", String(node.path === this.selected));
        if (caret.firstChild) caret.replaceChildren();
        this.setRowIcon(icon, iconForFile(node.path));
      }
      target.append(row);
      if (node.type === "folder" && this.expanded.has(node.path) && node.listing === "failed") target.append(this.failureRow(node.path, node.message ?? "Could not list folder", level + 1));
    };
    const firstBatch = visible.length > 500 ? 200 : visible.length;
    for (let index = 0; index < firstBatch; index++) appendEntry(visible[index]!, fragment);
    if (root?.listing === "failed") fragment.append(this.failureRow("", root.message ?? "Could not list files", 1));
    else if (!visible.length && root?.listing === "listing" && this.showPlaceholders) for (let index = 0; index < 5; index++) fragment.append(h("div", { className: "cv-tree-placeholder", "aria-hidden": "true" }));
    else if (!visible.length && root?.listing === "listed") fragment.append(h("div", { className: "cv-tree-empty", text: "No files" }));
    this.tree.replaceChildren(fragment);
    this.tree.tabIndex = visible.length ? -1 : 0;
    if (wasFocused && this.rows.get(activePath ?? tabPath ?? "")?.row.isConnected) this.rows.get(activePath ?? tabPath ?? "")?.row.focus({ preventScroll: true });
    this.tree.scrollTop = top;
    this.tree.scrollLeft = left;
    if (firstBatch === visible.length) this.scrollToPendingReveal();
    if (firstBatch < visible.length) {
      // A huge folder must respond to the opening gesture immediately. Later
      // animation frames fill its remaining rows without a long main-thread task.
      const continueRender = (start: number) => {
        this.renderFrame = null;
        if (version !== this.renderVersion) return;
        const next = document.createDocumentFragment();
        const end = Math.min(start + 200, visible.length);
        for (let index = start; index < end; index++) appendEntry(visible[index]!, next);
        this.tree.append(next);
        if (end < visible.length) this.renderFrame = requestAnimationFrame(() => continueRender(end));
        else {
          if (wasFocused && activePath) this.rows.get(activePath)?.row.focus({ preventScroll: true });
          this.tree.scrollTop = top;
          this.tree.scrollLeft = left;
          this.scrollToPendingReveal();
          if (this.selected && top === 0) this.rows.get(this.selected)?.row.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
      };
      this.renderFrame = requestAnimationFrame(() => continueRender(firstBatch));
    }
  }

  /** Open and list a folder as needed, then bring its row into view. */
  async reveal(path: string, openSidebar = false): Promise<void> {
    const version = ++this.revealVersion;
    const segments = path ? path.split("/") : [];
    let folder = "";
    for (const segment of segments) {
      // A listing in flight (such as the root listing right after a new
      // connection) must be awaited too, or the folders below it are unknown.
      if (this.model.get(folder)?.listing !== "listed") await this.loader.list(folder);
      if (version !== this.revealVersion) return;
      const next = folder ? `${folder}/${segment}` : segment;
      if (this.model.get(next)?.type === "folder") {
        this.expanded.add(next);
        this.rememberExpanded();
        folder = next;
      } else break;
    }
    if (this.model.get(path)?.type === "folder" && this.model.get(path)?.listing !== "listed") await this.loader.list(path);
    if (version !== this.revealVersion) return;
    this.pendingReveal = path;
    this.render();
    if (openSidebar) this.open();
    this.scrollToPendingReveal();
  }

  private scrollToPendingReveal(): void {
    const row = this.pendingReveal ? this.rows.get(this.pendingReveal)?.row : null;
    if (!row?.isConnected) return;
    row.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    this.pendingReveal = null;
  }

  /** Toggle a folder without changing the open file. */
  async toggleFolder(path: string): Promise<void> {
    if (this.expanded.has(path)) this.expanded.delete(path);
    else this.expanded.add(path);
    this.rememberExpanded();
    this.render();
    if (this.expanded.has(path) && this.model.get(path)?.listing === "unlisted") await this.loader.list(path);
  }

  private setRowIcon(host: HTMLElement, name: IconName): void {
    if (host.dataset.icon === name) return;
    host.dataset.icon = name;
    host.replaceChildren(this.iconTemplates[name].cloneNode(true));
  }

  private rowFor(path: string): RowParts {
    const previous = this.rows.get(path);
    if (previous) return previous;
    const caret = h("span", { className: "cv-caret" });
    const icon = h("span", { className: "cv-row-icon" });
    const name = h("span", { className: "cv-row-name" });
    const guides = h("span", { className: "cv-row-guides", "aria-hidden": "true" });
    const row = h("div", { className: "cv-row", role: "treeitem", tabindex: -1 }, guides, caret, icon, name);
    const parts = { row, caret, icon, name };
    this.rows.set(path, parts);
    return parts;
  }

  private failureRow(path: string, message: string, level: number): HTMLElement {
    const retry = h("button", { className: "cv-button cv-retry", type: "button", text: "Retry", onclick: () => { void this.loader.list(path, true); } });
    const row = h("div", { className: "cv-tree-failure", role: "alert" }, h("span", { text: message }), retry);
    row.style.setProperty("--cv-depth", String(level - 1));
    return row;
  }

  private scheduleSpinner(path: string): void {
    if (this.spinnerTimers.has(path) || this.spinning.has(path)) return;
    const timer = setTimeout(() => {
      this.spinnerTimers.delete(path);
      if (this.model.get(path)?.listing === "listing") { this.spinning.add(path); this.render(); }
    }, 200);
    this.spinnerTimers.set(path, timer);
  }
  private cancelSpinner(path: string): void {
    const timer = this.spinnerTimers.get(path);
    if (timer) clearTimeout(timer);
    this.spinnerTimers.delete(path);
    this.spinning.delete(path);
  }

  private measure(): void {
    const width = this.host.getBoundingClientRect().width;
    // A newly connected or hidden host can measure as zero before it has a
    // usable layout. Treating that as narrow closes the sidebar permanently
    // even when the host is later displayed at a wide width.
    if (width === 0) return;
    const narrow = width < 600;
    const becameNarrow = narrow && !this.narrow;
    this.narrow = narrow;
    this.app.classList.toggle("cv-app-narrow", narrow);
    if (becameNarrow) this.setClosed(true);
  }
  private rememberExpanded(): void { this.preferences.set("expanded", [...this.expanded]); }

  private setClosed(closed: boolean): void {
    const hadFocus = closed && this.tree.contains(document.activeElement);
    this.closed = closed;
    // On a narrow element the sidebar is an overlay that closes after every
    // choice; only a wide layout remembers whether the reader closed it.
    if (!this.narrow) this.preferences.set("sidebarClosed", closed);
    this.app.classList.toggle("cv-sidebar-closed", closed);
    this.element.toggleAttribute("inert", closed);
    this.element.setAttribute("aria-hidden", String(closed));
    this.openButton.tabIndex = closed ? 0 : -1;
    this.openButton.setAttribute("aria-hidden", String(!closed));
    if (hadFocus) this.openButton.focus({ preventScroll: true });
  }
  private resetWidth(): void {
    this.width = widthDefault;
    this.app.style.setProperty("--cv-sidebar-width", `${this.width}px`);
    this.handle.setAttribute("aria-valuenow", String(this.width));
    try { localStorage.removeItem(this.storageKey); } catch { /* See storage guard in constructor. */ }
  }

  private onHandleKeydown = (event: KeyboardEvent): void => {
    let width: number;
    if (event.key === "ArrowLeft") width = this.width - 10;
    else if (event.key === "ArrowRight") width = this.width + 10;
    else if (event.key === "Home") width = widthMin;
    else if (event.key === "End") width = widthMax;
    else return;
    event.preventDefault();
    this.width = Math.max(widthMin, Math.min(widthMax, width));
    this.app.style.setProperty("--cv-sidebar-width", `${this.width}px`);
    this.handle.setAttribute("aria-valuenow", String(this.width));
    try { localStorage.setItem(this.storageKey, String(this.width)); } catch { /* See storage guard in constructor. */ }
  };

  private onTreeClick = (event: MouseEvent): void => {
    const row = (event.target as Element).closest<HTMLElement>('[role="treeitem"]');
    if (!row) return;
    this.focusRow(row);
    const path = row.dataset.path!;
    if (this.model.get(path)?.type === "folder") void this.toggleFolder(path);
    else { this.onSelect(path); if (this.narrow) this.close(); }
  };
  private focusRow(row: HTMLElement): void {
    this.focused = row.dataset.path ?? null;
    for (const parts of this.rows.values()) parts.row.tabIndex = parts.row === row ? 0 : -1;
    row.focus();
  }
  private onTreeKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const rows = [...this.tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const current = (document.activeElement as HTMLElement)?.closest<HTMLElement>('[role="treeitem"]') ?? rows[0];
    const index = rows.indexOf(current);
    if (!current || index < 0) return;
    const path = current.dataset.path!;
    const folder = this.model.get(path)?.type === "folder";
    const level = Number(current.dataset.level);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown": next = rows[index + 1] ?? current; break;
      case "ArrowUp": next = rows[index - 1] ?? current; break;
      case "Home": next = rows[0]; break;
      case "End": next = rows.at(-1); break;
      case "ArrowRight":
        if (folder && !this.expanded.has(path)) void this.toggleFolder(path);
        else if (folder && Number(rows[index + 1]?.dataset.level) > level) next = rows[index + 1];
        break;
      case "ArrowLeft":
        if (folder && this.expanded.has(path)) void this.toggleFolder(path);
        else next = this.rows.get(parentPath(path))?.row;
        break;
      case "Enter": case " ":
        if (folder) void this.toggleFolder(path);
        else { this.onSelect(path); if (this.narrow) this.close(); }
        break;
      default:
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        this.typeAhead += event.key.toLocaleLowerCase();
        if (this.typeTimer) clearTimeout(this.typeTimer);
        this.typeTimer = setTimeout(() => { this.typeAhead = ""; }, 500);
        for (let offset = 1; offset <= rows.length; offset++) {
          const candidate = rows[(index + offset) % rows.length]!;
          if (this.model.get(candidate.dataset.path!)?.name.toLocaleLowerCase().startsWith(this.typeAhead)) { next = candidate; break; }
        }
    }
    event.preventDefault();
    if (next?.isConnected) this.focusRow(next);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.cancelDrag?.();
    const pointerId = event.pointerId;
    const initialX = event.clientX;
    const initialWidth = this.width;
    let rawWidth = initialWidth;
    let snapClosed = false;
    this.app.classList.add("cv-app-dragging");
    try { this.handle.setPointerCapture(pointerId); } catch { /* Synthetic events need no capture. */ }
    const move = (movement: PointerEvent) => {
      if (movement.pointerId !== pointerId) return;
      rawWidth = Math.max(0, Math.min(widthMax, initialWidth + movement.clientX - initialX));
      snapClosed = movement.clientX - this.host.getBoundingClientRect().left < snapDistance;
      const nextWidth = snapClosed ? 0 : Math.max(widthMin, rawWidth);
      this.app.style.setProperty("--cv-sidebar-width", `${nextWidth}px`);
      this.handle.setAttribute("aria-valuenow", String(nextWidth));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      this.app.classList.remove("cv-app-dragging");
      this.cancelDrag = null;
    };
    const cancel = () => { cleanup(); this.app.style.setProperty("--cv-sidebar-width", `${this.width}px`); };
    const end = (ending: PointerEvent) => {
      if (ending.pointerId !== pointerId) return;
      cleanup();
      if (snapClosed) {
        this.app.style.setProperty("--cv-sidebar-width", `${this.width}px`);
        this.close();
      } else {
        this.width = Math.max(widthMin, Math.min(widthMax, rawWidth));
        this.app.style.setProperty("--cv-sidebar-width", `${this.width}px`);
        this.open();
        try { localStorage.setItem(this.storageKey, String(this.width)); } catch { /* See storage guard in constructor. */ }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    this.cancelDrag = cancel;
    event.preventDefault();
  };
}
