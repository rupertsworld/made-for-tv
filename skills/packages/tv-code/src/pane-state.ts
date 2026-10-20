/** The open file's visible state and all transitions that may change it. */
import type { DecodedRead } from "./input";
import type { DiffView, FileChange } from "./tv-code-diff";

export type PaneMode = "preview" | "source" | "diff";
export type Comparison =
  | { kind: "none" }
  | { kind: "module-error" }
  | { kind: "ready"; change: FileChange; createView: (onDrawn: () => void) => DiffView };
export type PaneBody =
  | { kind: "content"; path: string; result: Exclude<DecodedRead, { kind: "failure" }>; revision: number; update: boolean }
  | { kind: "diff"; path: string; comparison: Extract<Comparison, { kind: "ready" }>; revision: number };
type PaneView =
  | { kind: "empty" }
  | { kind: "loading"; last: PaneBody | null; pendingDiff?: { ticket: number; comparison: Extract<Comparison, { kind: "ready" }> } }
  | { kind: "content"; body: Extract<PaneBody, { kind: "content" }> }
  | { kind: "diff"; body: Extract<PaneBody, { kind: "diff" }> }
  | { kind: "deleted"; last: PaneBody | null }
  | { kind: "error"; last: PaneBody | null; message: string };

export interface PaneState {
  readonly path: string | null;
  readonly mode: PaneMode;
  readonly view: PaneView;
  readonly comparison: Comparison;
  readonly readTicket: number;
  readonly compareTicket: number;
  readonly drawTicket: number;
  readonly revision: number;
}

export const initialPaneState: PaneState = {
  path: null, mode: "source", view: { kind: "empty" }, comparison: { kind: "none" },
  readTicket: 0, compareTicket: 0, drawTicket: 0, revision: 0,
};

export type PaneEvent =
  | { type: "open"; path: string; mode: PaneMode }
  | { type: "close" }
  | { type: "compare-start" }
  | { type: "compare-result"; ticket: number; result: Comparison }
  | { type: "read-start" }
  | { type: "read-result"; ticket: number; result: DecodedRead; known?: boolean }
  | { type: "mode"; mode: PaneMode }
  | { type: "deleted" }
  | { type: "drawn"; ticket: number };

function lastBody(view: PaneView): PaneBody | null {
  if (view.kind === "content" || view.kind === "diff") return view.body;
  if (view.kind === "loading" || view.kind === "deleted" || view.kind === "error") return view.last;
  return null;
}

function showComparison(state: PaneState, comparison: Extract<Comparison, { kind: "ready" }>): PaneState {
  const last = lastBody(state.view);
  const revision = state.revision + 1;
  // An already drawn diff changes in place, preserving its viewport.
  if (last?.kind === "diff" && last.path === state.path && state.view.kind === "diff") {
    return { ...state, revision, view: { kind: "diff", body: { ...last, comparison, revision } } };
  }
  const drawTicket = state.drawTicket + 1;
  return { ...state, drawTicket, view: { kind: "loading", last, pendingDiff: { ticket: drawTicket, comparison } } };
}

/** A pure reducer: stale async completions and stale draw callbacks return the same state. */
export function reducePane(state: PaneState, event: PaneEvent): PaneState {
  switch (event.type) {
    case "open":
      return {
        ...state, path: event.path, mode: event.mode, comparison: { kind: "none" },
        view: { kind: "loading", last: lastBody(state.view) },
        readTicket: state.readTicket + 1, compareTicket: state.compareTicket + 1, drawTicket: state.drawTicket + 1,
      };
    case "close":
      return { ...state, path: null, view: { kind: "empty" }, comparison: { kind: "none" },
        readTicket: state.readTicket + 1, compareTicket: state.compareTicket + 1, drawTicket: state.drawTicket + 1 };
    case "compare-start":
      return state.path && state.view.kind !== "deleted" ? { ...state, compareTicket: state.compareTicket + 1 } : state;
    case "compare-result": {
      if (!state.path || state.view.kind === "deleted" || event.ticket !== state.compareTicket) return state;
      const next = { ...state, comparison: event.result };
      if (state.mode !== "diff") return next;
      if (event.result.kind === "ready") return showComparison(next, event.result);
      if (event.result.kind === "module-error") return { ...next, drawTicket: next.drawTicket + 1, view: { kind: "error", last: null, message: "Could not load diff" } };
      if (state.view.kind === "content") return next;
      return { ...next, drawTicket: next.drawTicket + 1, view: { kind: "loading", last: lastBody(state.view) } };
    }
    case "read-start":
      if (!state.path) return state;
      return { ...state, readTicket: state.readTicket + 1, drawTicket: state.drawTicket + 1,
        view: state.view.kind === "deleted" ? state.view : { kind: "loading", last: lastBody(state.view) } };
    case "read-result": {
      if (!state.path || event.ticket !== state.readTicket) return state;
      if (event.result.kind === "failure") {
        if (event.result.status === 404 && event.known !== false) return reducePane(state, { type: "deleted" });
        if (state.view.kind === "deleted") return state;
        const last = lastBody(state.view);
        return { ...state, view: { kind: "error", last: last?.path === state.path ? last : null, message: event.result.message } };
      }
      const last = lastBody(state.view);
      const revision = state.revision + 1;
      const body: Extract<PaneBody, { kind: "content" }> = {
        kind: "content", path: state.path, result: event.result, revision,
        update: last?.kind === "content" && last.path === state.path,
      };
      return { ...state, revision, view: { kind: "content", body } };
    }
    case "mode": {
      if (!state.path || state.view.kind === "deleted") return state;
      const next = { ...state, mode: event.mode, readTicket: state.readTicket + 1, drawTicket: state.drawTicket + 1 };
      if (event.mode === "diff") {
        if (state.comparison.kind === "ready") return showComparison(next, state.comparison);
        if (state.comparison.kind === "module-error") return { ...next, view: { kind: "error", last: null, message: "Could not load diff" } };
      }
      return next;
    }
    case "deleted": {
      if (!state.path || state.view.kind === "deleted") return state;
      const last = lastBody(state.view);
      return { ...state, view: { kind: "deleted", last: last?.path === state.path ? last : null },
        readTicket: state.readTicket + 1, compareTicket: state.compareTicket + 1, drawTicket: state.drawTicket + 1 };
    }
    case "drawn":
      if (!state.path || state.view.kind !== "loading" || state.view.pendingDiff?.ticket !== event.ticket || event.ticket !== state.drawTicket) return state;
      return { ...state, view: { kind: "diff", body: {
        kind: "diff", path: state.path, comparison: state.view.pendingDiff.comparison, revision: state.revision + 1,
      } }, revision: state.revision + 1 };
  }
}

/** The only source of pane loading, fading, Deleted, notice, and failure UI. */
export function paneAppearance(state: PaneState): {
  path: string | null; mode: PaneMode; body: PaneBody | null; pendingDiff: Extract<PaneView, { kind: "loading" }>["pendingDiff"];
  progress: boolean; faded: boolean; deleted: boolean; notice: string | null; inlineError: string | null; retry: boolean;
  comparison: Comparison;
} {
  const view = state.view;
  const body = lastBody(view);
  return {
    path: state.path, mode: state.mode, body,
    pendingDiff: view.kind === "loading" ? view.pendingDiff : undefined,
    progress: view.kind === "loading", faded: view.kind === "deleted" || (view.kind === "loading" && !!body),
    deleted: view.kind === "deleted", notice: view.kind === "error" && !!view.last ? view.message : null,
    inlineError: view.kind === "error" && !view.last ? view.message : null, retry: view.kind === "error",
    comparison: state.comparison,
  };
}
