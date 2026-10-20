/** Contracts shared by the parts of the viewer: page input and line ranges. */

/** A file or folder as the page supplies it: in `files`, as a child tag, or in a `list` result. */
export interface EntryInput {
  path?: string;
  name?: string;
  type?: string;
  size?: number;
  modified?: string | number;
  dimmed?: boolean;
  language?: string;
  content?: string;
  src?: string;
  status?: EntryStatus;
}

/** How an entry differs from a version it is compared with, shown as a letter in the tree. */
export type EntryStatus = "added" | "modified" | "removed";

/**
 * The text of a file before and after a change. A missing version is a file
 * that does not exist on that side, and counts as empty.
 */
export interface DiffVersions {
  before?: string | null;
  after?: string | null;
}

/** The versions of a changed file to show as its diff, or nothing for an unchanged file. */
export type DiffFunction = (path: string) => DiffVersions | null | undefined | Promise<DiffVersions | null | undefined>;

/** What `Connection.read` may resolve to. */
export type ReadResult = string | Response | Blob | ArrayBuffer | ArrayBufferView;

/** Functions the page supplies to list folders and read files on demand. */
export interface Connection {
  /** Omit to show the single file named by `selected`. */
  list?(path: string): EntryInput[] | Promise<EntryInput[]>;
  read(path: string): ReadResult | Promise<ReadResult>;
}

/** A 1-based, inclusive range of lines. */
export interface LineRange {
  start: number;
  end: number;
}
