/**
 * Quick-open panel for a viewer's currently known files.
 *
 * The owner supplies live file, recent and pending-listing snapshots. This
 * module handles ranking and interaction; it does not ask a source to list or
 * read folders, so the element can update it as those operations complete.
 */
import { h, svg } from "./dom";
import { fuzzyMatch, fuzzyScore } from "./fuzzy";
import { iconForFile, icons, type IconName } from "./icons";

/** A file available to the finder, in the tree's display order. */
export interface FinderFile {
  path: string;
  dimmed: boolean;
}

interface FinderOptions {
  files(): FinderFile[];
  recent(): string[];
  pending(): number;
  onOpen(path: string, line: number | null): void;
  onGoToLine(line: number): void;
  onClose(): void;
}

type FileResult = {
  kind: "file";
  file: FinderFile;
  positions: number[];
  score: number;
  order: number;
};
type LineResult = { kind: "line"; line: number };
type FinderResult = FileResult | LineResult;

let nextListId = 0;
const iconCache = new Map<IconName, SVGSVGElement>();

/** An independent finder panel that the viewer appends within its element. */
export class Finder {
  readonly element: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly options: FinderOptions;
  private results: FinderResult[] = [];
  private files: FinderFile[] = [];
  private lowerPaths: string[] = [];
  private selectedIndex = 0;
  private line: number | null = null;
  private previousFocus: HTMLElement | null = null;
  private scrollFrame: number | null = null;

  constructor(options: FinderOptions) {
    this.options = options;
    const listId = `cv-finder-list-${++nextListId}`;
    this.field = h("input", {
      className: "cv-finder-input",
      type: "text",
      role: "combobox",
      placeholder: "Go to file",
      "aria-label": "Go to file",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": listId,
      autocomplete: "off",
      spellcheck: "false",
    });
    this.field.addEventListener("input", () => this.render(false));
    this.field.addEventListener("keydown", event => this.onKeyDown(event));

    this.list = h("div", { className: "cv-finder-list", id: listId, role: "listbox", "aria-label": "Files" });
    this.empty = h("div", { className: "cv-finder-empty", role: "status", text: "No matching files", hidden: true });
    this.progress = h("div", { className: "cv-finder-progress", role: "status", "aria-live": "polite", hidden: true },
      h("span", { className: "cv-finder-spinner", "aria-hidden": "true" }),
      h("span", { className: "cv-finder-progress-text" }));
    const backdrop = h("div", { className: "cv-finder-backdrop", "aria-hidden": "true" });
    backdrop.addEventListener("click", () => this.close());
    this.element = h("div", { className: "cv-finder", hidden: true },
      backdrop,
      h("div", { className: "cv-finder-panel" },
        h("div", { className: "cv-finder-field" }, renderIcon("search"), this.field),
        this.list,
        this.empty,
        this.progress));
  }

  /** Whether the panel currently receives input. */
  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Open with a fresh query, remembering the element to focus on close. */
  open(): void {
    if (this.isOpen) {
      this.field.focus();
      return;
    }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.element.hidden = false;
    this.field.value = "";
    this.field.setAttribute("aria-expanded", "true");
    this.readFiles();
    this.render(false);
    this.field.focus();
  }

  /** Close the panel, notify its owner, and restore the former focus. */
  close(): void {
    if (!this.isOpen) return;
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = null;
    this.element.hidden = true;
    this.field.setAttribute("aria-expanded", "false");
    this.field.removeAttribute("aria-activedescendant");
    const formerFocus = this.previousFocus;
    this.previousFocus = null;
    if (formerFocus?.isConnected) formerFocus.focus();
    this.options.onClose();
  }

  /** Re-run the current query after files or the pending-listing count changes. */
  update(): void {
    if (this.isOpen) {
      this.readFiles();
      this.render(true);
    }
  }

  private readFiles(): void {
    this.files = this.options.files();
    this.lowerPaths = this.files.map(file => file.path.toLowerCase());
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (this.results.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.select((this.selectedIndex + direction + this.results.length) % this.results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.activate(this.selectedIndex);
    }
  }

  private render(preserveSelection: boolean): void {
    const highlighted = preserveSelection ? this.results[this.selectedIndex] : undefined;
    const highlightedPath = highlighted?.kind === "file" ? highlighted.file.path : null;
    const rawQuery = this.field.value.trim();
    const lineSuffix = /^(.*):([0-9]+)$/.exec(rawQuery);
    const parsedLine = lineSuffix ? Number(lineSuffix[2]) : NaN;
    const hasLineSuffix = Number.isSafeInteger(parsedLine) && parsedLine > 0;
    const query = hasLineSuffix ? lineSuffix![1].trim() : rawQuery;
    this.line = hasLineSuffix ? parsedLine : null;

    if (hasLineSuffix && query === "") {
      this.results = [{ kind: "line", line: parsedLine }];
    } else if (query === "") {
      this.results = this.recentResults();
      if (highlightedPath && !this.results.some(result =>
        result.kind === "file" && result.file.path === highlightedPath)) {
        const order = this.files.findIndex(file => file.path === highlightedPath);
        if (order >= 0) {
          if (this.results.length === 50) this.results.pop();
          this.results.push({ kind: "file", file: this.files[order], positions: [], score: 0, order });
        }
      }
    } else {
      const best: FileResult[] = [];
      let highlightedCandidate: FileResult | null = null;
      const lowerQuery = query.replace(/\s/g, "").toLowerCase();
      for (let order = 0; order < this.files.length; order++) {
        if (!containsInOrder(lowerQuery, this.lowerPaths[order])) continue;
        const file = this.files[order];
        const score = fuzzyScore(query, file.path, this.lowerPaths[order]);
        if (score === null) continue;
        if (file.path === highlightedPath) {
          highlightedCandidate = { kind: "file", file, positions: [], score, order };
        }
        if (best.length < 50) {
          best.push({ kind: "file", file, positions: [], score, order });
          siftWorstUp(best, best.length - 1);
        } else if (compareRank(file.dimmed, score, order, best[0]) < 0) {
          best[0] = { kind: "file", file, positions: [], score, order };
          siftWorstDown(best);
        }
      }
      // A listed source may add stronger matches after the reader has moved
      // the highlight. Keep that file visible even when it falls below the
      // normal 50-result cutoff, so Enter still opens the intended path.
      if (highlightedCandidate && !best.some(result => result.file.path === highlightedPath)) {
        if (best.length === 50) best[0] = highlightedCandidate;
        else best.push(highlightedCandidate);
      }
      best.sort((first, second) => compareRank(first.file.dimmed, first.score, first.order, second));
      this.results = best;
      for (const result of this.results) {
        if (result.kind === "file") result.positions = fuzzyMatch(query, result.file.path)!.positions;
      }
    }

    const preservedIndex = highlightedPath === null ? -1 : this.results.findIndex(result =>
      result.kind === "file" && result.file.path === highlightedPath);
    this.selectedIndex = preservedIndex >= 0 ? preservedIndex : 0;
    const pending = this.options.pending();
    this.renderRows();
    this.empty.hidden = this.results.length > 0 || pending > 0;
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    if (preservedIndex >= 0) {
      // Scrolling newly inserted rows forces a full layout. Defer it until the
      // browser's next frame so typing stays quick even with 50 visible rows.
      const selectedId = `${this.list.id}-row-${this.selectedIndex}`;
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        if (this.isOpen && this.field.getAttribute("aria-activedescendant") === selectedId) {
          document.getElementById(selectedId)?.scrollIntoView({ block: "nearest" });
        }
      });
    } else {
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        if (this.isOpen) this.list.scrollTop = 0;
      });
    }
    this.progress.hidden = pending <= 0;
    this.progress.querySelector(".cv-finder-progress-text")!.textContent =
      `Listing ${pending} ${pending === 1 ? "folder" : "folders"}…`;
  }

  private recentResults(): FinderResult[] {
    const files = this.files;
    const byPath = new Map(files.map((file, order) => [file.path, { file, order }]));
    const results: FileResult[] = [];
    const added = new Set<string>();
    for (const path of this.options.recent()) {
      const found = byPath.get(path);
      if (!found || added.has(path)) continue;
      results.push({ kind: "file", ...found, positions: [], score: 0 });
      added.add(path);
      if (results.length === 50) return results;
    }
    for (let order = 0; order < files.length && results.length < 50; order++) {
      const file = files[order];
      if (added.has(file.path)) continue;
      results.push({ kind: "file", file, positions: [], score: 0, order });
      added.add(file.path);
    }
    return results;
  }

  private renderRows(): void {
    const rows = this.results.map((result, index) => {
      const row = h("div", {
        className: "cv-finder-row",
        id: `${this.list.id}-row-${index}`,
        role: "option",
        "aria-selected": index === this.selectedIndex ? "true" : "false",
      });
      // A fresh result list can appear under a stationary pointer during
      // listing. Only an actual pointer move should change the selection.
      row.addEventListener("pointermove", () => this.select(index, false));
      row.addEventListener("click", () => this.activate(index));
      if (result.kind === "line") {
        row.append(renderIcon("search"), h("span", { className: "cv-finder-name", text: `Go to line ${result.line}` }));
        return row;
      }

      const slash = result.file.path.lastIndexOf("/");
      const name = h("span", { className: "cv-finder-name" });
      appendEmphasis(name, result.file.path.slice(slash + 1), result.positions, slash + 1);
      const folder = h("span", { className: "cv-finder-folder" });
      if (slash >= 0) appendEmphasis(folder, result.file.path.slice(0, slash + 1), result.positions, 0);
      const iconKind = iconForFile(result.file.path);
      const icon = renderIcon(iconKind);
      icon.dataset.icon = iconKind;
      row.append(icon, name, folder);
      if (result.file.dimmed) row.classList.add("cv-finder-dimmed");
      return row;
    });
    this.list.replaceChildren(...rows);
    this.select(this.selectedIndex, false);
  }

  private select(index: number, scroll = true): void {
    const previous = this.list.children[this.selectedIndex];
    previous?.setAttribute("aria-selected", "false");
    this.selectedIndex = index;
    const selected = this.results[index] ? this.list.children[index] : null;
    if (selected instanceof HTMLElement) {
      selected.setAttribute("aria-selected", "true");
      this.field.setAttribute("aria-activedescendant", selected.id);
      if (scroll) selected.scrollIntoView({ block: "nearest" });
    } else {
      this.field.removeAttribute("aria-activedescendant");
    }
  }

  private activate(index: number): void {
    const result = this.results[index];
    if (!result) return;
    if (result.kind === "line") this.options.onGoToLine(result.line);
    else this.options.onOpen(result.file.path, this.line);
    this.close();
  }
}

// The heap root is the least useful displayed result. Keeping only 50 avoids
// allocating and sorting thousands of rows for short, broad queries.
function compareRank(dimmed: boolean, score: number, order: number, other: FileResult): number {
  if (dimmed !== other.file.dimmed) return dimmed ? 1 : -1;
  if (score !== other.score) return other.score - score;
  return order - other.order;
}

function siftWorstUp(heap: FileResult[], start: number): void {
  let index = start;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (compareRank(heap[parent].file.dimmed, heap[parent].score, heap[parent].order, heap[index]) >= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function siftWorstDown(heap: FileResult[]): void {
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worse = left;
    if (right < heap.length
      && compareRank(heap[right].file.dimmed, heap[right].score, heap[right].order, heap[left]) > 0) {
      worse = right;
    }
    if (compareRank(heap[index].file.dimmed, heap[index].score, heap[index].order, heap[worse]) >= 0) break;
    [heap[index], heap[worse]] = [heap[worse], heap[index]];
    index = worse;
  }
}

function containsInOrder(query: string, path: string): boolean {
  let pathIndex = -1;
  for (let queryIndex = 0; queryIndex < query.length; queryIndex++) {
    pathIndex = path.indexOf(query[queryIndex], pathIndex + 1);
    if (pathIndex < 0) return false;
  }
  return true;
}

function appendEmphasis(parent: HTMLElement, text: string, positions: number[], offset: number): void {
  let plainStart = 0;
  for (let index = 0; index < positions.length;) {
    const local = positions[index] - offset;
    if (local < 0 || local >= text.length) {
      index++;
      continue;
    }
    if (local > plainStart) parent.append(text.slice(plainStart, local));
    let end = local + 1;
    index++;
    while (index < positions.length && positions[index] - offset === end) {
      end++;
      index++;
    }
    parent.append(h("span", { className: "cv-finder-match", text: text.slice(local, end) }));
    plainStart = end;
  }
  if (plainStart < text.length) parent.append(text.slice(plainStart));
}

function renderIcon(name: IconName): SVGSVGElement {
  let prototype = iconCache.get(name);
  if (!prototype) {
    prototype = svg(icons[name]);
    iconCache.set(name, prototype);
  }
  return prototype.cloneNode(true) as SVGSVGElement;
}
