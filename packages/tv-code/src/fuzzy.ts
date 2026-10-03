/**
 * Score ordered query characters against a path for quick-open.
 *
 * A subsequence scan rejects most repository paths cheaply. Matching paths use
 * dynamic programming so each character can be assigned to the best segment,
 * rather than committing to the first occurrence found in a folder name.
 */

/** A scored path match and the zero-based positions to emphasise. */
export interface FuzzyMatch {
  score: number;
  positions: number[];
}

// Finder calls the matcher once per file for the same keystroke. Reusing the
// normalised query avoids doing regex and case conversion 20,000 times while
// leaving fuzzyMatch's public, value-based behaviour unchanged.
let cachedQuery = "";
let cachedNeedle = "";
let cachedLowerNeedle = "";

// A query can be scored with one path pass. Each query-prefix state retains its
// best score and the score ending at the previous character (for run bonuses).
// Reused scratch avoids allocating arrays for every file in a large listing.
let bestScores = new Float64Array(0);
let endingScores = new Float64Array(0);
let endingIndices = new Int32Array(0);
let bestNodes = new Int32Array(0);
let endingNodes = new Int32Array(0);
const nodePositions: number[] = [];
const nodePredecessors: number[] = [];
let lastBestNode = -1;

/** Match non-space query characters in order, choosing the highest scoring positions. */
export function fuzzyMatch(query: string, path: string): FuzzyMatch | null {
  normaliseQuery(query);
  const needle = cachedNeedle;
  if (needle.length === 0) return { score: 0, positions: [] };
  if (needle.length > path.length) return null;

  const lowerPath = path.toLowerCase();
  let nextCharacter = 0;
  for (let index = 0; index < path.length && nextCharacter < needle.length; index++) {
    if (lowerPath[index] === cachedLowerNeedle[nextCharacter]) nextCharacter++;
  }
  if (nextCharacter !== needle.length) return null;

  const score = scorePath(path, lowerPath, true);
  if (score === null) return null;
  const positions = new Array<number>(needle.length);
  let node = lastBestNode;
  for (let index = needle.length - 1; index >= 0; index--) {
    positions[index] = nodePositions[node];
    node = nodePredecessors[node];
  }
  return { score, positions };
}

/** Score a prefiltered, lowercase path for Finder without allocating highlight positions. */
export function fuzzyScore(query: string, path: string, lowerPath: string): number | null {
  normaliseQuery(query);
  if (cachedNeedle.length === 0) return 0;
  if (cachedNeedle.length > path.length) return null;
  return scorePath(path, lowerPath, false);
}

function normaliseQuery(query: string): void {
  if (query !== cachedQuery) {
    cachedQuery = query;
    cachedNeedle = query.replace(/\s/g, "");
    cachedLowerNeedle = cachedNeedle.toLowerCase();
  }
}

function scorePath(path: string, lowerPath: string, trackPositions: boolean): number | null {
  const needle = cachedNeedle;
  const lowerNeedle = cachedLowerNeedle;
  const fileNameStart = path.lastIndexOf("/") + 1;
  // A gain at a higher tier outweighs every possible gain below it for this
  // query length. This keeps a long query's extra boundaries from defeating a
  // match in the file name, or runs from defeating word starts.
  // A complete word beats the length tie-break, but cannot outweigh losing
  // even one adjacent pair in an otherwise identical alignment.
  const wordEndWeight = Math.min(needle.length + 1, 9);
  const boundaryWeight = needle.length * 11 + wordEndWeight + needle.length + 1;
  const fileNameWeight = (needle.length + 1) * boundaryWeight
    + needle.length * 11 + wordEndWeight + needle.length;
  if (!trackPositions && needle.length === 1) {
    let highestScore = -Infinity;
    for (let index = lowerPath.indexOf(lowerNeedle); index >= 0;
      index = lowerPath.indexOf(lowerNeedle, index + 1)) {
      const precedingCharacter = path[index - 1];
      const isWordStart = index === 0 || "/-_. ".includes(precedingCharacter)
        || (precedingCharacter >= "a" && precedingCharacter <= "z"
          && path[index] >= "A" && path[index] <= "Z");
      const score = (index >= fileNameStart ? fileNameWeight : 0)
        + (isWordStart ? boundaryWeight : 0)
        + (isWordEnd(path, index) ? wordEndWeight : 0)
        + (path[index] === needle ? 1 : 0);
      if (score > highestScore) highestScore = score;
    }
    return highestScore === -Infinity ? null
      : highestScore - Math.min(path.length, 999_999) / 1_000_000;
  }
  // An exact-case prefix of the file name has the maximum possible file-name,
  // run, and case score. A later word end cannot compensate for losing the
  // prefix's word start or an adjacent pair, so only later word starts matter.
  if (!trackPositions && path.startsWith(needle, fileNameStart)) {
    let competingBoundary = false;
    for (let index = fileNameStart + needle.length; index < path.length; index++) {
      const precedingCharacter = path[index - 1];
      const isWordStart = "/-_. ".includes(precedingCharacter)
        || (precedingCharacter >= "a" && precedingCharacter <= "z"
          && path[index] >= "A" && path[index] <= "Z");
      if (isWordStart && lowerNeedle.includes(lowerPath[index])) {
        competingBoundary = true;
        break;
      }
    }
    if (!competingBoundary) {
      let score = (needle.length - 1) * 10;
      for (let index = 0; index < needle.length; index++) {
        const pathIndex = fileNameStart + index;
        const precedingCharacter = path[pathIndex - 1];
        const isWordStart = pathIndex === 0 || "/-_. ".includes(precedingCharacter)
          || (precedingCharacter >= "a" && precedingCharacter <= "z"
            && path[pathIndex] >= "A" && path[pathIndex] <= "Z");
        score += fileNameWeight + (isWordStart ? boundaryWeight : 0) + 1;
      }
      if (isWordEnd(path, fileNameStart + needle.length - 1)) score += wordEndWeight;
      return score - Math.min(path.length, 999_999) / 1_000_000;
    }
  }
  if (bestScores.length < needle.length) {
    bestScores = new Float64Array(needle.length);
    endingScores = new Float64Array(needle.length);
    endingIndices = new Int32Array(needle.length);
    bestNodes = new Int32Array(needle.length);
    endingNodes = new Int32Array(needle.length);
  }
  bestScores.fill(-Infinity, 0, needle.length);
  endingIndices.fill(-1, 0, needle.length);
  if (trackPositions) {
    nodePositions.length = 0;
    nodePredecessors.length = 0;
  }

  for (let pathIndex = 0; pathIndex < path.length; pathIndex++) {
    const pathCharacter = lowerPath[pathIndex];
    const precedingCharacter = path[pathIndex - 1];
    const isWordStart = pathIndex === 0 || "/-_. ".includes(precedingCharacter)
      || (precedingCharacter >= "a" && precedingCharacter <= "z"
        && path[pathIndex] >= "A" && path[pathIndex] <= "Z");
    const baseScore = (pathIndex >= fileNameStart ? fileNameWeight : 0)
      + (isWordStart ? boundaryWeight : 0);

    // Descending order prevents one path character from satisfying two query
    // positions. The ending state adds a bonus only for adjacent characters.
    for (let queryIndex = needle.length - 1; queryIndex >= 0; queryIndex--) {
      if (pathCharacter !== lowerNeedle[queryIndex]) continue;
      let previousScore = queryIndex === 0 ? 0 : bestScores[queryIndex - 1];
      let previousNode = queryIndex === 0 ? -1 : bestNodes[queryIndex - 1];
      if (queryIndex > 0 && pathIndex > 0 && endingIndices[queryIndex - 1] === pathIndex - 1
        && endingScores[queryIndex - 1] + 10 > previousScore) {
        previousScore = endingScores[queryIndex - 1] + 10;
        previousNode = endingNodes[queryIndex - 1];
      }
      if (previousScore === -Infinity) continue;
      const score = previousScore + baseScore
        + (queryIndex === needle.length - 1 && isWordEnd(path, pathIndex) ? wordEndWeight : 0)
        + (path[pathIndex] === needle[queryIndex] ? 1 : 0);
      let node = -1;
      if (trackPositions) {
        node = nodePositions.length;
        nodePositions.push(pathIndex);
        nodePredecessors.push(previousNode);
      }
      endingScores[queryIndex] = score;
      endingIndices[queryIndex] = pathIndex;
      if (trackPositions) endingNodes[queryIndex] = node;
      if (score > bestScores[queryIndex]) {
        bestScores[queryIndex] = score;
        if (trackPositions) bestNodes[queryIndex] = node;
      }
    }
  }

  const highestScore = bestScores[needle.length - 1];
  if (highestScore === -Infinity) return null;
  if (trackPositions) lastBestNode = bestNodes[needle.length - 1];
  // Length only settles otherwise close matches; it cannot undo a character
  // placement preference such as matching in the file name.
  return highestScore - Math.min(path.length, 999_999) / 1_000_000;
}

function isWordEnd(path: string, index: number): boolean {
  const next = path[index + 1];
  return next === undefined || "/-_. ".includes(next)
    || (path[index] >= "a" && path[index] <= "z" && next >= "A" && next <= "Z");
}
