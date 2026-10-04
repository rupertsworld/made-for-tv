/** Normalize the three page input forms and decode connection reads at their boundary. */
import { joinPath, normalizePath } from "./paths";
import type { EntryInput, ReadResult } from "./types";

/** An entry after paths, fields and type aliases have been normalized. */
export interface Entry extends Omit<EntryInput, "path" | "name" | "type"> {
  path: string;
  type: "file" | "folder";
}

/** A decoded read, retaining status for the deleted-file rule. */
export type DecodedRead =
  | { kind: "text"; text: string }
  | { kind: "bytes"; blob: Blob }
  | { kind: "binary" }
  | { kind: "large"; size: number }
  | { kind: "failure"; message: string; status?: number };

/** Maximum file size shown without an explicit reader request. */
export const maximumBytes = 2 * 1024 * 1024;

/** Remove exterior blank lines and indentation common to nonblank lines. */
export function dedent(value: string): string {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  while (lines.length && !lines[0]?.trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  const indentation = Math.min(...lines.filter(line => line.trim()).map(line => /^\s*/.exec(line)?.[0].length ?? 0));
  if (!Number.isFinite(indentation)) return "";
  return lines.map(line => line.slice(indentation)).join("\n");
}

/** Keep the entry fields used by the viewer, with canonical paths and type. */
export function normalizeEntries(entries: EntryInput[], folder = ""): Entry[] {
  return entries.flatMap(input => {
    const givenPath = input.path ?? (input.name ? joinPath(folder, input.name) : "");
    const path = normalizePath(givenPath);
    if (!path) return [];
    const type = ["folder", "dir", "directory"].includes(input.type ?? "") ? "folder" : "file";
    const entry: Entry = { path, type };
    if (typeof input.size === "number") entry.size = input.size;
    if (typeof input.dimmed === "boolean") entry.dimmed = input.dimmed;
    if (typeof input.language === "string") entry.language = input.language;
    if (typeof input.content === "string") entry.content = input.content;
    if (typeof input.src === "string") entry.src = input.src;
    return [entry];
  });
}

/** Convert the `files` array or path-to-text object to entries. */
export function fromFiles(files: EntryInput[] | Record<string, string>): Entry[] {
  return normalizeEntries(Array.isArray(files) ? files : Object.entries(files).map(([path, content]) => ({ path, content })));
}

/** Read direct file and folder tags, interpreting nested paths relative to folders. */
export function fromChildTags(host: Element): Entry[] {
  const entries: Entry[] = [];
  const visit = (parent: Element, folder: string) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.localName;
      if (tag !== "tv-code-file" && tag !== "tv-code-folder") continue;
      const path = joinPath(folder, child.getAttribute("path") ?? "");
      if (!path) continue;
      const input: EntryInput = { path, type: tag === "tv-code-folder" ? "folder" : "file" };
      if (child.hasAttribute("dimmed")) input.dimmed = true;
      if (tag === "tv-code-file") {
        for (const name of ["src", "language"] as const) {
          const value = child.getAttribute(name);
          if (value !== null) input[name] = value;
        }
        const size = child.getAttribute("size");
        if (size !== null && Number.isFinite(Number(size))) input.size = Number(size);
        const script = [...child.children].find(element => element.localName === "script" && !/^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i.test(element.getAttribute("type") ?? ""));
        if (script) input.content = dedent(script.textContent ?? "");
        else {
          const text = [...child.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? "").join("");
          if (text.trim() || !input.src) input.content = dedent(text);
        }
      }
      entries.push(...normalizeEntries([input]));
      if (tag === "tv-code-folder") visit(child, path);
    }
  };
  visit(host, "");
  return entries;
}

/** Convert a rejected connection call to the reader-visible failure shape. */
export function readFailure(reason: unknown): Extract<DecodedRead, { kind: "failure" }> {
  return { kind: "failure", message: reason instanceof Error ? reason.message : String(reason) };
}

/** Decode text or preserve bytes, refusing known large bodies before reading them. */
export async function decodeRead(result: ReadResult, wanted: "text" | "bytes", entrySize?: number, showAnyway = false): Promise<DecodedRead> {
  if (!showAnyway && entrySize !== undefined && entrySize > maximumBytes) return { kind: "large", size: entrySize };
  try {
    let value: string | Blob | ArrayBuffer | ArrayBufferView;
    if (result instanceof Response) {
      if (!result.ok) {
        let message = `${result.status} ${result.statusText}`.trim();
        try {
          const body: unknown = await result.json();
          if (body && typeof body === "object") {
            const fields = body as Record<string, unknown>;
            if (typeof fields.error === "string") message = fields.error;
            else if (typeof fields.message === "string") message = fields.message;
          }
        } catch { /* A non-JSON response uses its status text. */ }
        return { kind: "failure", message, status: result.status };
      }
      const length = Number(result.headers.get("Content-Length"));
      if (!showAnyway && Number.isFinite(length) && length > maximumBytes) return { kind: "large", size: length };
      value = await result.blob();
    } else value = result;
    if (typeof value === "string") {
      if (wanted === "bytes") return { kind: "bytes", blob: new Blob([value]) };
      return value.slice(0, 8000).includes("\u0000") ? { kind: "binary" } : { kind: "text", text: value };
    }
    const copiedBytes = value instanceof Blob ? null : value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    const blob = value instanceof Blob ? value : new Blob([copiedBytes!]);
    if (!showAnyway && blob.size > maximumBytes) return { kind: "large", size: blob.size };
    if (wanted === "bytes") return { kind: "bytes", blob };
    const bytes = copiedBytes ?? new Uint8Array(await blobBytes(blob));
    if (bytes.subarray(0, 8000).includes(0)) return { kind: "binary" };
    return { kind: "text", text: new TextDecoder().decode(bytes) };
  } catch (error) {
    return readFailure(error);
  }
}

/** jsdom's Blob lacks arrayBuffer; browsers and undici use the native method. */
function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
