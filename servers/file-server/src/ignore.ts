// Ignore patterns: which root-relative paths the server hides because they
// match one of its configured patterns (spec/file-server/cli.md#config).
//
// Patterns follow .gitignore rules and are matched by the `ignore` package
// without regard to letter case (its default, and how git behaves with
// `core.ignorecase`). A path inside an ignored directory is ignored too: the
// package checks each parent directory first, and as in git a `!` pattern
// cannot re-include anything beneath one.
//
// A pattern ending in `/` matches only directories, so a caller says whether
// the path is one, or asks for both answers. Parents are always judged as
// directories, since only a directory can have children.
//
// The package remembers the answer for every path it checks, and for every
// parent of that path, for as long as the matcher lives. That cache is how it
// stays fast over a tree whose paths share parents, but it never shrinks, so
// matchers are kept only as long as their inputs are bounded:
//
// - Paths named in requests come from clients, so any number of distinct
//   paths can arrive, each as deep as a URL allows. Each is checked with a
//   matcher built for that check alone, which costs tens of microseconds and
//   leaves nothing behind.
// - Paths found on disk, by the watcher and in listings, are bounded by the
//   tree, but a tree can keep gaining uniquely named files for as long as the
//   server runs. They share one matcher, rebuilt from the same patterns after
//   a fixed number of checks, so its cache stays bounded.

import ignore from "ignore";

/** The number of checks of paths found on disk after which their matcher is rebuilt. */
export const cachedChecksLimit = 10_000;

/** The server's ignore patterns, answering whether a root-relative path is hidden. */
export class IgnorePatterns {
  private readonly patterns: readonly string[];
  private cachedMatcher: ignore.Ignore;
  private cachedChecks = 0;

  constructor(patterns: readonly string[]) {
    this.patterns = patterns;
    this.cachedMatcher = ignore().add(patterns);
  }

  /**
   * Whether a path found on disk is hidden, judged as a directory or as
   * anything else. The root, the empty path, is never hidden: it is what the
   * server serves.
   */
  hides(path: string, isDirectory: boolean): boolean {
    if (this.patterns.length === 0 || path === "") return false;
    if (this.cachedChecks === cachedChecksLimit) {
      this.cachedMatcher = ignore().add(this.patterns);
      this.cachedChecks = 0;
    }
    this.cachedChecks += 1;
    return this.cachedMatcher.ignores(asMatcherPath(path, isDirectory));
  }

  /**
   * Whether a path named in a request is hidden, as a file and as a
   * directory, since the caller may not yet know which it is. Nothing is
   * remembered once the answers are returned.
   */
  hidesRequested(path: string): { asFile: boolean; asDirectory: boolean } {
    if (this.patterns.length === 0 || path === "") return { asFile: false, asDirectory: false };
    const matcher = ignore().add(this.patterns);
    return { asFile: matcher.ignores(asMatcherPath(path, false)), asDirectory: matcher.ignores(asMatcherPath(path, true)) };
  }
}

/** The package reads a trailing `/` as marking a directory. */
function asMatcherPath(path: string, isDirectory: boolean): string {
  return isDirectory ? `${path}/` : path;
}
