# tv-code file pane state

The open file has one state. A listing, read, comparison, mode choice, or diff draw reports an event; none of those callers changes a pane class or notice directly.

| Part | Owner | Interface |
| --- | --- | --- |
| Visible file and view | `pane-state.ts` | `reducePane(state, event)` returns a new state. Its `view` is empty, loading, content, diff, deleted, or error. Loading, deletion, and recoverable errors carry the last good body. The state also holds the chosen mode, comparison, and request tickets. `paneAppearance(state)` supplies progress, fade, Deleted mark, notice, and the comparison used by the mode controls. |
| Open file requests | `open-file.ts` | `OpenFile` accepts `open`, `refreshRead`, `refreshComparison`, `comparisonChanged`, `mode`, `deleted`, `returned`, and `retry`. It alone starts reads and comparisons. Each result carries the ticket issued by the state transition; a superseded result is inert. Mode choices use the held comparison and start an ordinary read without awaiting `diff`. |
| Transport and listing | `loader.ts` | Lists and decodes connection reads. On refresh it asks `OpenFile` to re-read the open file, then reports the completed listing round. It does not decide what the pane shows. |
| DOM | `pane.ts` | `render(state)` applies the appearance and draws the body's read or comparison. A pending diff reports `drawn(ticket)` to `OpenFile`; deletion or a newer view discards it. It does not decide whether the callback is current. |
| Diff rendering | `tv-code-diff.ts` | `DiffView.show(change)` draws the supplied change and calls `onDrawn`. It has no file or request state. |

A known file removed by a listing or a 404 becomes Deleted immediately, keeping its last drawn body faded. A comparison or draw already in flight cannot restore it. Only a successful read after the file returns leaves Deleted. A non-404 re-read failure keeps the last body and shows a Retry notice, including when a diff has disappeared.
