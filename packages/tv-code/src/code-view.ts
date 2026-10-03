/** Scrollable, selectable source lines. Plain rendering is synchronous; Shiki
 * enriches it later. Updates stage a highlighted replacement before swapping. */
import { h } from "./dom";
import { diffLines, type LineDiff } from "./diff";
import { highlightLines } from "./highlight";
import type { LineRange } from "./types";

/** Contents and grammar of the file currently displayed as code. */
export interface CodeDocument { text: string; languageId: string | null; }

const blockSize = 200;
const highlightLimit = 20_000;
const markDurationMs = 2_500;

/** The body of one code file, owned by the pane. */
export class CodeView {
  readonly element: HTMLElement;
  private readonly onLinesChange: (lines: LineRange | null) => void;
  private document: CodeDocument = { text: "", languageId: null };
  private lineCount = 1;
  private selectedLines: LineRange | null = null;
  private anchorLine: number | null = null;
  private wrapped = false;
  private highlightState: "pending" | "done" | "off" = "off";
  private controller: AbortController | null = null;
  private markTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private readonly rowTemplate: HTMLElement;
  private readonly breakTemplate: HTMLElement;

  constructor(options: { onLinesChange(lines: LineRange | null): void }) {
    this.onLinesChange = options.onLinesChange;
    this.element = h("div", { className: "cv-code-view", tabindex: "0", role: "region", "aria-label": "Code" });
    this.rowTemplate = h("div", { className: "cv-line" },
      h("button", { className: "cv-line-number", type: "button" }),
      h("span", { className: "cv-code-text" }));
    this.breakTemplate = h("span", { className: "cv-line-break", "aria-hidden": "true", text: "\n" });
    this.element.addEventListener("click", event => this.onGutterClick(event as MouseEvent));
  }

  /** Display another file immediately in plain text, then enrich it. */
  show(doc: CodeDocument, lines: LineRange | null = null): void {
    this.cancelWork();
    this.document = doc;
    this.lineCount = doc.text.split("\n").length;
    this.selectedLines = this.clamp(lines);
    this.anchorLine = this.selectedLines?.start ?? null;
    this.element.classList.toggle("cv-wrap", this.wrapped);
    this.element.replaceChildren(this.renderRows(doc.text));
    this.applySelection();
    this.element.scrollTop = 0;
    this.element.scrollLeft = 0;
    if (this.selectedLines) this.scrollToLine(this.selectedLines.start);
    this.startHighlight(doc);
  }

  /** Replace the same file, mapping viewport, selection and change marks. */
  update(doc: CodeDocument): void {
    const previous = this.document;
    const diff = diffLines(previous.text, doc.text);
    this.cancelWork();
    const generation = this.generation;
    const commit = (fragments?: DocumentFragment[]) => {
      if (generation !== this.generation) return;
      // The old DOM stays visible during highlighting. Read the viewport and
      // selection at commit time so scrolling or selecting meanwhile wins.
      const viewport = this.topLine();
      const mappedTop = diff.map(viewport.line);
      const mappedSelection = this.selectedLines && {
        start: diff.map(this.selectedLines.start), end: diff.map(this.selectedLines.end),
      };
      this.document = doc;
      this.lineCount = doc.text.split("\n").length;
      this.selectedLines = this.clamp(mappedSelection);
      this.anchorLine = this.selectedLines?.start ?? null;
      this.element.replaceChildren(this.renderRows(doc.text, fragments));
      this.applySelection();
      this.applyMarks(diff);
      this.anchorViewport(mappedTop, viewport.offsetPx);
      if (fragments) this.highlightState = "done";
      this.expireMarks();
    };
    if (doc.languageId && this.countLines(doc.text) <= highlightLimit) {
      // The old highlighted DOM remains visible while the new tokens are
      // computed, so refresh never flashes an unhighlighted version.
      this.highlightState = "pending";
      const controller = new AbortController();
      this.controller = controller;
      void highlightLines(doc.text, doc.languageId, controller.signal).then(fragments => {
        if (!controller.signal.aborted) commit(fragments);
      }).catch(error => {
        if (controller.signal.aborted) return;
        console.error("Code highlighting failed", error);
        this.highlightState = "off";
        commit();
      });
    } else {
      this.highlightState = "off";
      commit();
    }
  }

  /** Selected 1-based inclusive line range. Setter does not notify the page. */
  get lines(): LineRange | null { return this.selectedLines; }
  set lines(value: LineRange | null) {
    this.selectedLines = this.clamp(value);
    this.anchorLine = this.selectedLines?.start ?? null;
    this.applySelection();
    if (this.selectedLines) this.scrollToLine(this.selectedLines.start);
  }

  /** Whether long lines wrap inside the code pane. */
  get wrap(): boolean { return this.wrapped; }
  set wrap(value: boolean) {
    this.wrapped = Boolean(value);
    this.element.classList.toggle("cv-wrap", this.wrapped);
    if (this.wrapped) this.element.scrollLeft = 0;
  }

  /** Current syntax highlighting lifecycle state. */
  get highlighted(): "pending" | "done" | "off" { return this.highlightState; }

  /** Stop asynchronous work and release timers before removing this body. */
  destroy(): void {
    this.cancelWork();
    this.element.remove();
  }

  private countLines(text: string): number { return text.split("\n").length; }

  private clamp(range: LineRange | null | undefined): LineRange | null {
    if (!range || !this.lineCount) return null;
    const start = Math.min(this.lineCount, Math.max(1, Math.trunc(range.start)));
    const end = Math.max(start, Math.trunc(range.end));
    return { start, end: Math.min(end, this.lineCount) };
  }

  private renderRows(text: string, fragments?: DocumentFragment[]): DocumentFragment {
    const root = document.createDocumentFragment();
    const lines = text.split("\n");
    // The gutter is as wide as the largest line number, and at least two digits.
    this.element.style.setProperty("--cv-gutter-digits", String(Math.max(2, String(lines.length).length)));
    let block: HTMLElement | null = null;
    for (let index = 0; index < lines.length; index++) {
      if (index % blockSize === 0) {
        block = h("div", { className: "cv-code-block" });
        block.style.setProperty("--cv-block-lines", String(Math.min(blockSize, lines.length - index)));
        root.append(block);
      }
      const number = index + 1;
      const row = this.rowTemplate.cloneNode(true) as HTMLElement;
      const gutter = row.firstElementChild as HTMLButtonElement;
      gutter.dataset.line = String(number);
      gutter.setAttribute("aria-label", `Select line ${number}`);
      const code = row.lastElementChild as HTMLElement;
      if (fragments?.[index]) code.append(fragments[index]);
      else code.textContent = lines[index];
      if (index < lines.length - 1) code.append(this.lineBreak());
      row.dataset.line = String(number);
      block!.append(row);
    }
    return root;
  }

  private startHighlight(doc: CodeDocument): void {
    if (!doc.languageId || this.lineCount > highlightLimit) {
      this.highlightState = "off";
      return;
    }
    this.highlightState = "pending";
    const controller = new AbortController();
    this.controller = controller;
    const generation = this.generation;
    void highlightLines(doc.text, doc.languageId, controller.signal).then(fragments => {
      if (controller.signal.aborted || generation !== this.generation) return;
      const codeLines = this.element.querySelectorAll<HTMLElement>(".cv-code-text");
      fragments.forEach((fragment, index) => codeLines[index]?.replaceChildren(
        fragment, ...(index < codeLines.length - 1 ? [this.lineBreak()] : [])));
      this.highlightState = "done";
    }).catch(error => {
      if (controller.signal.aborted) return;
      console.error("Code highlighting failed", error);
      this.highlightState = "off";
    });
  }

  private onGutterClick(event: MouseEvent): void {
    const target = (event.target as Element).closest<HTMLElement>(".cv-line-number");
    if (!target || !this.element.contains(target)) return;
    const pressed = Number(target.dataset.line);
    if (event.shiftKey && this.anchorLine !== null) {
      this.selectedLines = { start: Math.min(this.anchorLine, pressed), end: Math.max(this.anchorLine, pressed) };
    } else if (this.selectedLines?.start === pressed && this.selectedLines.end === pressed) {
      this.selectedLines = null;
      this.anchorLine = null;
    } else {
      this.selectedLines = { start: pressed, end: pressed };
      this.anchorLine = pressed;
    }
    this.applySelection();
    this.onLinesChange(this.selectedLines);
  }

  private lineBreak(): HTMLElement {
    return this.breakTemplate.cloneNode(true) as HTMLElement;
  }

  private applySelection(): void {
    if (!this.selectedLines) {
      this.element.querySelectorAll(".cv-line-selected").forEach(row => row.classList.remove("cv-line-selected"));
      return;
    }
    this.element.querySelectorAll<HTMLElement>(".cv-line").forEach(row => {
      const number = Number(row.dataset.line);
      row.classList.toggle("cv-line-selected", !!this.selectedLines &&
        number >= this.selectedLines.start && number <= this.selectedLines.end);
    });
  }

  private scrollToLine(line: number): void {
    const row = this.element.querySelector<HTMLElement>(`.cv-line[data-line="${line}"]`);
    if (!row) return;
    this.element.scrollTop += row.getBoundingClientRect().top -
      this.element.getBoundingClientRect().top - this.element.clientHeight / 3;
  }

  private topLine(): { line: number; offsetPx: number } {
    const bounds = this.element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + Math.min(65, bounds.width / 2), bounds.top + 1);
    const row = hit?.closest<HTMLElement>(".cv-line");
    if (row && this.element.contains(row))
      return { line: Number(row.dataset.line), offsetPx: bounds.top - row.getBoundingClientRect().top };
    const lineHeight = this.element.querySelector(".cv-line")?.getBoundingClientRect().height || 18;
    return { line: Math.min(this.lineCount, Math.floor(this.element.scrollTop / lineHeight) + 1),
      offsetPx: this.element.scrollTop % lineHeight };
  }

  private anchorViewport(line: number, offsetPx: number): void {
    const row = this.element.querySelector<HTMLElement>(`.cv-line[data-line="${line}"]`);
    if (!row) return;
    const top = this.element.getBoundingClientRect().top;
    this.element.scrollTop += row.getBoundingClientRect().top - top + offsetPx;
  }

  private applyMarks(diff: LineDiff): void {
    for (const line of diff.changed)
      this.element.querySelector<HTMLElement>(`.cv-line[data-line="${line}"]`)?.classList.add("cv-line-added");
    for (const line of diff.removedBefore) {
      const row = this.element.querySelector<HTMLElement>(`.cv-line[data-line="${line}"]`);
      if (row) row.classList.add("cv-line-removed-before");
      else this.element.lastElementChild?.classList.add("cv-line-removed-end");
    }
  }

  private expireMarks(): void {
    this.markTimer = setTimeout(() => {
      this.element.querySelectorAll(".cv-line-added, .cv-line-removed-before, .cv-line-removed-end")
        .forEach(row => row.classList.remove("cv-line-added", "cv-line-removed-before", "cv-line-removed-end"));
      this.markTimer = null;
    }, markDurationMs);
  }

  private cancelWork(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (this.markTimer) clearTimeout(this.markTimer);
    this.markTimer = null;
  }
}
