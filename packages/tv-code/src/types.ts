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
}

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
