/** Path and line-range handling shared by input, the tree and navigation. */
import type { LineRange } from "./types";

/** Canonicalize a rooted path by removing empty, dot and traversing segments. */
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/** Join a folder and a child path, treating both as relative to the file set. */
export function joinPath(folder: string, child: string): string {
  return normalizePath(`${normalizePath(folder)}/${child}`);
}

/** Return the folder that directly contains a path. */
export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  return normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
}

/** Return the final segment of a path. */
export function baseName(path: string): string {
  return normalizePath(path).split("/").at(-1) ?? "";
}

/** Resolve a relative link against its containing folder. */
export function resolvePath(folder: string, relative: string): string {
  return joinPath(folder, relative);
}

/** Decode an address segment, leaving malformed escapes unchanged. */
export function decodeAddress(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

/** Parse a one-based inclusive line number or range. */
export function parseLines(value: string | null | undefined): LineRange | null {
  const match = /^(\d+)(?:-(\d+))?$/.exec(value ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Number.isSafeInteger(start) && start > 0 && Number.isSafeInteger(end) && end >= start ? { start, end } : null;
}

/** Format a line range for the `lines` attribute. */
export function formatLines(lines: LineRange | null): string | null {
  return lines ? (lines.start === lines.end ? String(lines.start) : `${lines.start}-${lines.end}`) : null;
}

/** Parse a `#L12` or `#L12-L20` link fragment. */
export function parseLineFragment(fragment: string): LineRange | null {
  return fragment.startsWith("#L") ? parseLines(fragment.slice(2).replace("-L", "-")) : null;
}
