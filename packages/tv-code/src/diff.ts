/** A trimmed Myers line diff for update marks and stable line identities. */

/** New-line marks and a mapper from old 1-based lines to new lines. */
export interface LineDiff {
  changed: Set<number>;
  removedBefore: Set<number>;
  map(oldLine: number): number;
}

type Edit = "same" | "remove" | "add";

/** Compare line contents while preserving the positions of unchanged lines. */
export function diffLines(oldText: string, newText: string): LineDiff {
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = newText === "" ? [] : newText.split("\n");
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  let prefix = 0;
  while (prefix < oldCount && prefix < newCount && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldCount - prefix && suffix < newCount - prefix &&
    oldLines[oldCount - suffix - 1] === newLines[newCount - suffix - 1]) suffix++;

  const oldMiddle = oldLines.slice(prefix, oldCount - suffix);
  const newMiddle = newLines.slice(prefix, newCount - suffix);
  const edits = myersEdits(oldMiddle, newMiddle);
  const changed = new Set<number>();
  const removedBefore = new Set<number>();
  const mapped = new Array<number>(oldCount).fill(0);
  for (let index = 0; index < prefix; index++) mapped[index] = index + 1;

  let oldIndex = prefix;
  let newIndex = prefix;
  let cursor = 0;
  while (cursor < edits.length) {
    if (edits[cursor] === "same") {
      mapped[oldIndex++] = ++newIndex;
      cursor++;
      continue;
    }
    const removed: number[] = [];
    let added = 0;
    // A contiguous edit hunk represents a replacement. Paired lines keep
    // their identity; only excess removals get a between-line mark.
    while (cursor < edits.length && edits[cursor] !== "same") {
      if (edits[cursor] === "remove") removed.push(oldIndex++);
      else {
        changed.add(++newIndex);
        added++;
      }
      cursor++;
    }
    for (let index = 0; index < Math.min(removed.length, added); index++)
      mapped[removed[index]] = newIndex - added + index + 1;
    if (removed.length > added) removedBefore.add(newIndex + 1);
  }
  for (let index = 0; index < suffix; index++)
    mapped[oldCount - suffix + index] = newCount - suffix + index + 1;

  // A removed line follows the nearest later surviving line. When deletion
  // reaches the end, it follows the previous survivor instead.
  let following = 0;
  for (let index = oldCount - 1; index >= 0; index--) {
    if (mapped[index]) following = mapped[index];
    else if (following) mapped[index] = following;
  }
  let preceding = 1;
  for (let index = 0; index < oldCount; index++) {
    if (mapped[index]) preceding = mapped[index];
    else mapped[index] = preceding;
  }
  return {
    changed,
    removedBefore,
    map(oldLine: number): number {
      if (!oldCount) return newCount ? 1 : 0;
      const index = Math.min(oldCount, Math.max(1, Math.trunc(oldLine))) - 1;
      return mapped[index];
    },
  };
}

/** Recover a shortest edit script. Prefix and suffix trimming keeps routine
 * one-line refreshes independent of the full file size. */
function myersEdits(oldLines: string[], newLines: string[]): Edit[] {
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  if (!oldCount) return new Array<Edit>(newCount).fill("add");
  if (!newCount) return new Array<Edit>(oldCount).fill("remove");
  let frontier = new Map<number, number>([[1, 0]]);
  const history: Map<number, number>[] = [];
  for (let distance = 0; distance <= oldCount + newCount; distance++) {
    history.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = diagonal === -distance ||
        (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
      let oldIndex = down ? frontier.get(diagonal + 1) ?? 0 : (frontier.get(diagonal - 1) ?? 0) + 1;
      let newIndex = oldIndex - diagonal;
      while (oldIndex < oldCount && newIndex < newCount && oldLines[oldIndex] === newLines[newIndex]) {
        oldIndex++;
        newIndex++;
      }
      frontier.set(diagonal, oldIndex);
      if (oldIndex >= oldCount && newIndex >= newCount)
        return backtrack(history, distance, oldCount, newCount);
    }
  }
  return [];
}

function backtrack(history: Map<number, number>[], distance: number, oldCount: number, newCount: number): Edit[] {
  const reversed: Edit[] = [];
  let oldIndex = oldCount;
  let newIndex = newCount;
  for (let step = distance; step >= 0; step--) {
    const frontier = history[step];
    const diagonal = oldIndex - newIndex;
    const down = diagonal === -step ||
      (diagonal !== step && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
    const previousDiagonal = down ? diagonal + 1 : diagonal - 1;
    const previousOld = step === 0 ? 0 : frontier.get(previousDiagonal) ?? 0;
    const previousNew = previousOld - previousDiagonal;
    while (oldIndex > previousOld && newIndex > previousNew) {
      reversed.push("same");
      oldIndex--;
      newIndex--;
    }
    if (step) {
      reversed.push(down ? "add" : "remove");
      if (down) newIndex--;
      else oldIndex--;
    }
  }
  return reversed.reverse();
}
