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

/** The address of a page to show in the file pane in place of a file, or nothing to show the file. */
export type FrameFunction = (path: string) => string | null | undefined | Promise<string | null | undefined>;

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
