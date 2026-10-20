/** The sole coordinator of reads and comparisons for the open file. */
import type { DecodedRead } from "./input";
import { initialPaneState, reducePane, type Comparison, type PaneEvent, type PaneMode, type PaneState } from "./pane-state";

export interface OpenFileRequests {
  read: (path: string, retry: boolean, showAnyway: boolean) => Promise<DecodedRead | null>;
  compare: (path: string) => Promise<Comparison>;
  hasComparison: () => boolean;
  known: (path: string) => boolean;
  changed: (state: PaneState) => void;
  readSucceeded?: () => void;
}

/** Tickets live in PaneState, so every async completion passes through one reducer. */
export class OpenFile {
  state: PaneState = initialPaneState;

  constructor(private requests: OpenFileRequests) {}

  private send(event: PaneEvent): boolean {
    const next = reducePane(this.state, event);
    if (next === this.state) return false;
    this.state = next;
    this.requests.changed(next);
    return true;
  }

  open(path: string, mode: PaneMode = "diff"): void {
    this.send({ type: "open", path, mode });
    if (this.requests.hasComparison()) void this.compare();
    else void this.read();
  }

  close(): void { this.send({ type: "close" }); }

  deleted(): void { this.send({ type: "deleted" }); }

  /** A returning file must be read successfully before its Deleted mark clears. */
  returned(): void { if (this.state.path) void this.read(false, false, true, true); }

  /** Reader mode choices never call or await the page's comparison function. */
  mode(mode: PaneMode): void {
    if (!this.state.path || this.state.view.kind === "deleted") return;
    this.send({ type: "mode", mode });
    if (mode !== "diff") void this.read();
  }

  retry(showAnyway = false): void {
    if (!this.state.path || this.state.view.kind === "deleted") return;
    if (!showAnyway && this.state.mode === "diff" && this.state.comparison.kind === "module-error") void this.compare();
    else void this.read(true, showAnyway);
  }

  /** A changed `diff` property or a completed refresh asks for one new comparison. */
  comparisonChanged(): void { if (this.state.path && this.state.view.kind !== "deleted") void this.compare(); }

  /** Refresh only files that have or offer a comparison. */
  refreshComparison(): void {
    if (!this.state.path || this.state.view.kind === "deleted") return;
    if (this.requests.hasComparison() || this.state.comparison.kind !== "none") void this.compare();
  }

  /** The loader calls this after listing and awaits it before reporting the round. */
  async refreshRead(path: string): Promise<void> {
    if (path === this.state.path) await this.read(true, false, this.state.view.kind === "deleted", false);
  }

  drawn(ticket: number): void { this.send({ type: "drawn", ticket }); }

  private async compare(): Promise<void> {
    const path = this.state.path;
    if (!path || this.state.view.kind === "deleted") return;
    this.send({ type: "compare-start" });
    const ticket = this.state.compareTicket;
    const result = this.requests.hasComparison() ? await this.requests.compare(path) : { kind: "none" } as Comparison;
    const oldView = this.state.view;
    if (!this.send({ type: "compare-result", ticket, result })) return;
    if (result.kind === "none" && this.state.mode === "diff" &&
      (oldView.kind === "diff" || oldView.kind === "loading" || oldView.kind === "error")) void this.read();
  }

  private async read(retry = false, showAnyway = false, recovery = false, compareAfterRecovery = false): Promise<void> {
    const path = this.state.path;
    if (!path) return;
    if (this.state.view.kind === "deleted" && !recovery) return;
    this.send({ type: "read-start" });
    const ticket = this.state.readTicket;
    const result = await this.requests.read(path, retry, showAnyway);
    if (!result) return;
    const wasDeleted = this.state.view.kind === "deleted";
    if (!this.send({ type: "read-result", ticket, result, known: this.requests.known(path) })) return;
    if (result.kind !== "failure") {
      this.requests.readSucceeded?.();
      if (wasDeleted && compareAfterRecovery && this.requests.hasComparison()) void this.compare();
    }
  }
}
