/** Open-file transitions are independent of the DOM and request timing. */
import { describe, expect, it } from "vitest";
import { initialPaneState, paneAppearance, reducePane, type Comparison, type PaneState } from "../../src/pane-state";
import { OpenFile } from "../../src/open-file";

const read = { kind: "text" as const, text: "last" };
const changed = (name: string): Comparison => ({ kind: "ready", change: { name } as never, createView: (() => null) as never });
const step = (state: PaneState, event: Parameters<typeof reducePane>[1]) => reducePane(state, event);
function content(): PaneState {
  let state = step(initialPaneState, { type: "open", path: "a.ts", mode: "source" });
  state = step(state, { type: "read-start" });
  return step(state, { type: "read-result", ticket: state.readTicket, result: read });
}
function drawnDiff(): PaneState {
  let state = step(initialPaneState, { type: "open", path: "a.ts", mode: "diff" });
  state = step(state, { type: "compare-start" });
  state = step(state, { type: "compare-result", ticket: state.compareTicket, result: changed("old") });
  return step(state, { type: "drawn", ticket: state.drawTicket });
}

describe("open-file pane state", () => {
  it("ignores stale comparison and read results after newer requests", () => {
    let state = drawnDiff();
    state = step(state, { type: "compare-start" });
    const older = state.compareTicket;
    state = step(state, { type: "compare-start" });
    state = step(state, { type: "compare-result", ticket: state.compareTicket, result: changed("new") });
    expect((paneAppearance(state).body as any).comparison.change.name).toBe("new");
    expect(step(state, { type: "compare-result", ticket: older, result: changed("stale") })).toBe(state);

    state = step(state, { type: "mode", mode: "source" });
    state = step(state, { type: "read-start" });
    const oldRead = state.readTicket;
    state = step(state, { type: "read-start" });
    expect(step(state, { type: "read-result", ticket: oldRead, result: read })).toBe(state);
  });

  it("switches modes during a pending comparison using the held comparison", () => {
    let state = drawnDiff();
    state = step(state, { type: "compare-start" });
    const pending = state.compareTicket;
    state = step(state, { type: "mode", mode: "source" });
    state = step(state, { type: "read-start" });
    expect(paneAppearance(state)).toMatchObject({ progress: true, faded: true, mode: "source" });
    state = step(state, { type: "compare-result", ticket: pending, result: changed("new") });
    expect(state.view.kind).toBe("loading");
    state = step(state, { type: "read-result", ticket: state.readTicket, result: read });
    expect(state.view.kind).toBe("content");
    state = step(state, { type: "mode", mode: "diff" });
    expect(state.view.kind).toBe("loading");
    state = step(state, { type: "drawn", ticket: state.drawTicket });
    expect((paneAppearance(state).body as any).comparison.change.name).toBe("new");
  });

  it("shows a module load failure with Retry and recovers on a later comparison", () => {
    let state = step(initialPaneState, { type: "open", path: "a.ts", mode: "diff" });
    state = step(state, { type: "compare-start" });
    state = step(state, { type: "compare-result", ticket: state.compareTicket, result: { kind: "module-error" } });
    expect(paneAppearance(state)).toMatchObject({ inlineError: "Could not load diff", retry: true, progress: false });
    state = step(state, { type: "compare-start" });
    state = step(state, { type: "compare-result", ticket: state.compareTicket, result: changed("retry") });
    state = step(state, { type: "drawn", ticket: state.drawTicket });
    expect(state.view.kind).toBe("diff");
  });

  it("keeps the last drawn body deleted through pending diff draws and comparisons", () => {
    let state = drawnDiff();
    state = step(state, { type: "compare-start" });
    const compare = state.compareTicket;
    state = step(state, { type: "compare-result", ticket: compare, result: changed("pending") });
    state = step(state, { type: "compare-start" });
    const pending = state.compareTicket;
    const draw = state.drawTicket;
    state = step(state, { type: "deleted" });
    expect(paneAppearance(state)).toMatchObject({ deleted: true, faded: true, progress: false });
    expect(step(state, { type: "drawn", ticket: draw })).toBe(state);
    expect(step(state, { type: "compare-result", ticket: pending, result: changed("late") })).toBe(state);
    expect((paneAppearance(state).body as any).comparison.change.name).toBe("pending");
  });

  it("treats a 404 after listing as Deleted and ignores its later comparison", () => {
    let state = content();
    state = step(state, { type: "compare-start" });
    const compare = state.compareTicket;
    state = step(state, { type: "read-start" });
    state = step(state, { type: "read-result", ticket: state.readTicket, result: { kind: "failure", status: 404, message: "gone" } });
    expect(paneAppearance(state)).toMatchObject({ deleted: true, faded: true });
    expect(step(state, { type: "compare-result", ticket: compare, result: changed("late") })).toBe(state);
  });

  it("keeps the last diff and an error notice when its replacement read fails", () => {
    let state = drawnDiff();
    state = step(state, { type: "compare-start" });
    state = step(state, { type: "compare-result", ticket: state.compareTicket, result: { kind: "none" } });
    state = step(state, { type: "read-start" });
    expect(paneAppearance(state)).toMatchObject({ progress: true, faded: true });
    state = step(state, { type: "read-result", ticket: state.readTicket, result: { kind: "failure", message: "offline", status: 503 } });
    expect(paneAppearance(state)).toMatchObject({ notice: "offline", retry: true, progress: false });
    expect((paneAppearance(state).body as any).comparison.change.name).toBe("old");
  });

  it("stays Deleted until a successful read after the file returns", () => {
    let state = step(content(), { type: "deleted" });
    state = step(state, { type: "read-start" });
    expect(paneAppearance(state).deleted).toBe(true);
    state = step(state, { type: "read-result", ticket: state.readTicket, result: { kind: "failure", message: "offline" } });
    expect(paneAppearance(state).deleted).toBe(true);
    state = step(state, { type: "read-start" });
    state = step(state, { type: "read-result", ticket: state.readTicket, result: { kind: "text", text: "returned" } });
    expect(state.view.kind).toBe("content");
    expect(paneAppearance(state)).toMatchObject({ deleted: false, faded: false });
  });

  it("does not attribute a previous file's body to one deleted before it draws", () => {
    let state = content();
    state = step(state, { type: "open", path: "b.ts", mode: "diff" });
    state = step(state, { type: "deleted" });
    expect(paneAppearance(state)).toMatchObject({ deleted: true, body: null });
  });

  it("updates an unchanged file in place even while Diff is the default choice", () => {
    let state = step(initialPaneState, { type: "open", path: "a.ts", mode: "diff" });
    state = step(state, { type: "read-start" });
    state = step(state, { type: "read-result", ticket: state.readTicket, result: read });
    state = step(state, { type: "open", path: "a.ts", mode: "diff" });
    state = step(state, { type: "read-start" });
    state = step(state, { type: "read-result", ticket: state.readTicket, result: { kind: "text", text: "new" } });
    expect(state.view).toMatchObject({ kind: "content", body: { update: true } });
  });

  it("clearing diff invalidates its pending comparison and opens the ordinary file", async () => {
    let release!: (comparison: Comparison) => void;
    let enabled = true;
    const open = new OpenFile({
      read: async () => read,
      compare: () => new Promise(resolve => { release = resolve; }),
      hasComparison: () => enabled,
      known: () => true,
      changed: () => undefined,
    });
    open.open("a.ts");
    enabled = false;
    open.comparisonChanged();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(open.state.view.kind).toBe("content");
    release(changed("stale"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(open.state.comparison.kind).toBe("none");
    expect(open.state.view.kind).toBe("content");
  });
});
