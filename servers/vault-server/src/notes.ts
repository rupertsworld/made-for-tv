/** Parses, serializes, lists, and resolves references for vault notes. */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, posix, relative } from "node:path";
import matter from "gray-matter";
import { CORE_SCHEMA, load } from "js-yaml";
import { isMap, parseDocument, stringify as stringifyYaml } from "yaml";

export type Fields = Record<string, unknown>;
export type LinkFormat = "wikilink" | "markdown";
export type BodyFormat = "markdown" | "raw";
export type LinkEntry = { path: string; field?: string; backlink?: true };
export type RecordContent = { fields: Fields; body?: string };
export type RawRecord = RecordContent & { rawBody: string };
export type RecordError = { code: "invalid_frontmatter"; message: "Frontmatter could not be parsed" };
export type Note = RecordContent & { path: string; links: LinkEntry[]; updated: string; error?: RecordError };
export type ListingEntry = RecordContent & { path: string; updated: string; error?: RecordError };
type IndexFileSystem = {
  readFile: (path: string) => Promise<Uint8Array>;
  stat: (path: string) => Promise<{ mtime: Date }>;
};
type ParsedMatter = { header: Fields; body?: string; invalidFrontmatter: boolean; rawHeader: string; rawBody: string };
type ReferenceTarget = { wanted: string; suffix: string };
type SuffixNode = { children: Map<string, SuffixNode>; paths: Set<string> };
type OutboundLink = { path: string; field?: string };
type FilePathEntry = { kind: "file" };
type RecordPathEntry = {
  kind: "record";
  generation: number;
  fields?: Fields;
  body?: string;
  updated?: string;
  error?: RecordError;
  unreadable?: true;
  contentHash?: string;
  suppressMatchingWatcherEvent?: true;
};
type PathEntry = FilePathEntry | RecordPathEntry;
export type RefreshOutcome = "committed" | "removed" | "superseded" | "unchanged";
const invalidFrontmatterError: RecordError = { code: "invalid_frontmatter", message: "Frontmatter could not be parsed" };

/** Canonical visible paths and cached record data maintained by watcher events. */
export class VaultIndex {
  linkFormat: LinkFormat;
  private readonly vaultRoot: string;
  private readonly fileSystem: IndexFileSystem;
  private readonly paths = new Map<string, PathEntry>();
  private readonly backlinksByTarget = new Map<string, OutboundLink[]>();
  private readonly outboundBySource = new Map<string, OutboundLink[]>();
  private readonly suffixRoot: SuffixNode = { children: new Map(), paths: new Set() };
  private bodyFormat: (path: string) => BodyFormat;
  private pathGeneration = 0;
  private linksPathGeneration = 0;
  constructor(
    vaultRoot: string,
    fileSystem: IndexFileSystem = { readFile, stat },
    linkFormat: LinkFormat = "wikilink",
    bodyFormat: (path: string) => BodyFormat = () => "markdown",
  ) {
    this.vaultRoot = vaultRoot;
    this.fileSystem = fileSystem;
    this.linkFormat = linkFormat;
    this.bodyFormat = bodyFormat;
  }
  configure(options: { linkFormat?: LinkFormat; bodyFormat?: BodyFormat | ((path: string) => BodyFormat) }): void {
    if (options.linkFormat !== undefined) this.linkFormat = options.linkFormat;
    if (options.bodyFormat !== undefined) {
      const bodyFormat = options.bodyFormat;
      this.bodyFormat = typeof bodyFormat === "function" ? bodyFormat : (): BodyFormat => bodyFormat;
      this.rebuildLinks();
    }
  }
  [Symbol.iterator](): IterableIterator<string> { return this.paths.keys(); }
  get files(): Set<string> { return new Set(this.paths.keys()); }
  pathFor(absolutePath: string): string { return toVaultPath(relative(this.vaultRoot, absolutePath)); }
  isRawBody(linkingNotePath: string): boolean {
    const recordPath = noteApiPath(toVaultPath(linkingNotePath).replace(/^\/+/, ""));
    return this.bodyFormat(recordPath) === "raw";
  }
  add(absolutePath: string): void {
    const path = this.pathFor(absolutePath);
    if (!hasDotSegment(path)) this.addPath(path);
  }
  delete(absolutePath: string): void {
    const path = this.pathFor(absolutePath);
    this.deletePath(path);
  }
  /** Remove one path and every indexed descendant after a file or directory deletion. */
  deleteTree(absolutePath: string): void {
    const path = this.pathFor(absolutePath);
    for (const candidate of this.paths.keys()) {
      if (candidate === path || candidate.startsWith(`${path}/`)) this.deletePath(candidate);
    }
  }
  /** The URL path that can fetch this indexed file under the resolution ladder. */
  apiPathFor(diskPath: string): string {
    const recordPath = noteApiPath(diskPath);
    return diskPath.endsWith(".md") && this.paths.has(recordPath) ? diskPath : recordPath;
  }
  /** Whether a markdown source currently has an addressable structured-record view. */
  isRecordPath(diskPath: string): boolean {
    return diskPath.endsWith(".md") && this.apiPathFor(diskPath) !== diskPath;
  }
  /** Whether any indexed file is nested beneath a directory-shaped path. */
  hasDescendant(diskPath: string): boolean {
    const prefix = `${diskPath}/`;
    for (const path of this.paths.keys()) if (path.startsWith(prefix)) return true;
    return false;
  }
  /** Read and cache a record after an add or change event. */
  async refresh(absolutePath: string): Promise<RefreshOutcome> {
    const diskPath = this.pathFor(absolutePath);
    if (hasDotSegment(diskPath)) return "superseded";
    this.addPath(diskPath);
    if (!diskPath.endsWith(".md")) { this.syncLinks(diskPath); return "committed"; }
    const current = this.paths.get(diskPath);
    const entry = current?.kind === "record" ? current : { kind: "record" as const, generation: 0 };
    if (entry !== current) this.paths.set(diskPath, entry);
    const generation = entry.generation + 1;
    entry.generation = generation;
    try {
      const bytes = await this.fileSystem.readFile(absolutePath);
      if (!this.isCurrent(diskPath, entry, generation)) return "superseded";
      const fileStat = await this.fileSystem.stat(absolutePath);
      if (!this.isCurrent(diskPath, entry, generation)) return "superseded";
      const updated = fileStat.mtime.toISOString();
      const contentHash = hash(bytes);
      if (entry.suppressMatchingWatcherEvent && entry.updated === updated && entry.contentHash === contentHash) {
        delete entry.suppressMatchingWatcherEvent;
        return "unchanged";
      }
      delete entry.suppressMatchingWatcherEvent;
      this.cacheRecord(entry, bytes, updated, contentHash);
      this.syncLinks(diskPath);
      return "committed";
    } catch (error) {
      if (!this.isCurrent(diskPath, entry, generation)) return "superseded";
      if (isMissing(error)) { this.deletePath(diskPath); this.rebuildLinks(); return "removed"; }
      throw error;
    }
  }
  /** Return a structured record entirely from cached data. */
  read(absolutePath: string): Note {
    const diskPath = this.pathFor(absolutePath);
    const entry = this.paths.get(diskPath);
    if (entry?.kind === "record" && entry.fields !== undefined && entry.updated !== undefined) {
      return {
        path: this.apiPathFor(diskPath),
        fields: resolveReferences(entry.fields, this, diskPath) as Fields,
        ...(entry.body === undefined ? {} : { body: this.isRawBody(diskPath) ? entry.body : serveMarkdownBody(entry.body, this, diskPath) }),
        links: this.linksFor(diskPath),
        updated: entry.updated,
        ...(entry.error ? { error: entry.error } : {}),
      };
    }
    if (entry?.kind === "record" && entry.unreadable) throw new InvalidUtf8Error("markdown file is not valid UTF-8");
    throw Object.assign(new Error("record is not indexed"), { code: "ENOENT" });
  }
  /** Update cached record data directly after an atomic API write. */
  updateFromNote(note: Pick<Note, "updated" | "error">, absolutePath: string, rawRecord: RecordContent, source: string): void {
    const diskPath = this.pathFor(absolutePath);
    this.addPath(diskPath);
    const current = this.paths.get(diskPath);
    this.paths.set(diskPath, {
      kind: "record",
      generation: current?.kind === "record" ? current.generation + 1 : 1,
      fields: rawRecord.fields,
      ...(rawRecord.body === undefined ? {} : { body: rawRecord.body }),
      updated: note.updated,
      contentHash: hash(Buffer.from(source)),
      suppressMatchingWatcherEvent: true,
      ...(note.error ? { error: note.error } : {}),
    });
    this.syncLinks(diskPath);
  }
  /** Return this record's outbound links followed by links made to it. */
  linksFor(linkingNotePath: string): LinkEntry[] {
    this.ensureLinks();
    const recordPath = this.apiPathFor(linkingNotePath);
    const outbound = (this.outboundBySource.get(recordPath) ?? []).map((link) => ({ ...link }));
    const backlinks = (this.backlinksByTarget.get(recordPath) ?? [])
      .map((link): LinkEntry => ({ ...link, backlink: true }))
      .sort(compareLinks);
    return [...outbound, ...backlinks];
  }
  /** Return one cached record in the listing form, or undefined when it has no record view. */
  listingEntry(diskPath: string): ListingEntry | undefined {
    const entry = this.paths.get(diskPath);
    if (entry?.kind !== "record" || entry.fields === undefined || entry.updated === undefined) return undefined;
    return {
      path: this.apiPathFor(diskPath),
      fields: resolveReferences(entry.fields, this, diskPath) as Fields,
      ...(entry.body === undefined ? {} : { body: this.isRawBody(diskPath) ? entry.body : serveMarkdownBody(entry.body, this, diskPath) }),
      updated: entry.updated,
      ...(entry.error ? { error: entry.error } : {}),
    };
  }

  /** Resolve a wikilink target against the indexed visible files. */
  resolveReference(linkingNotePath: string, target: string): string | null {
    const alternatives = [target, `${target}.md`];
    const linkingDirectory = dirname(linkingNotePath);
    for (const desired of alternatives) {
      let node: SuffixNode | undefined = this.suffixRoot;
      for (const segment of desired.split("/").reverse()) {
        node = node.children.get(segment);
        if (!node) break;
      }
      if (!node) continue;
      let nearest: string | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of node.paths) {
        const distance = relative(linkingDirectory, candidate).split(/[\\/]/).length;
        if (distance < nearestDistance || (distance === nearestDistance && (nearest === undefined || candidate.localeCompare(nearest) < 0))) {
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      if (nearest) return nearest;
    }
    return null;
  }

  /** Resolve an already vault-relative markdown target without suffix matching. */
  resolveMarkdownReference(target: string): string | null {
    return [target, `${target}.md`].find((path) => this.paths.has(path)) ?? null;
  }

  private addPath(path: string): void {
    if (this.paths.has(path)) return;
    this.paths.set(path, path.endsWith(".md") ? { kind: "record", generation: 0 } : { kind: "file" });
    this.pathGeneration += 1;
    let node = this.suffixRoot;
    for (const segment of path.split("/").reverse()) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map(), paths: new Set() };
        node.children.set(segment, child);
      }
      child.paths.add(path);
      node = child;
    }
  }

  private deletePath(path: string): void {
    if (!this.paths.delete(path)) return;
    this.pathGeneration += 1;
    const parents: Array<{ node: SuffixNode; segment: string; child: SuffixNode }> = [];
    let node = this.suffixRoot;
    for (const segment of path.split("/").reverse()) {
      const child = node.children.get(segment);
      if (!child) return;
      parents.push({ node, segment, child });
      node = child;
    }
    for (const { child } of parents) child.paths.delete(path);
    for (const { node: parent, segment, child } of parents.reverse()) {
      if (child.paths.size === 0) parent.children.delete(segment);
    }
  }

  private rebuildLinks(): void {
    this.outboundBySource.clear();
    this.backlinksByTarget.clear();
    for (const [diskPath, entry] of this.paths) {
      if (entry.kind === "record" && entry.fields !== undefined && this.isRecordPath(diskPath)) {
        this.addOutboundLinks(diskPath, { fields: entry.fields, ...(entry.body === undefined ? {} : { body: entry.body }) });
      }
    }
    this.linksPathGeneration = this.pathGeneration;
  }

  private syncLinks(diskPath: string): void {
    if (this.linksPathGeneration !== this.pathGeneration) return;
    if (!diskPath.endsWith(".md")) return;
    const source = this.apiPathFor(diskPath);
    this.clearOutboundLinks(source);
    const entry = this.paths.get(diskPath);
    if (entry?.kind === "record" && entry.fields !== undefined && this.isRecordPath(diskPath)) {
      this.addOutboundLinks(diskPath, { fields: entry.fields, ...(entry.body === undefined ? {} : { body: entry.body }) });
    }
  }

  private ensureLinks(): void {
    if (this.linksPathGeneration !== this.pathGeneration) this.rebuildLinks();
  }

  private addOutboundLinks(diskPath: string, record: RecordContent): void {
    const source = this.apiPathFor(diskPath);
    const links = extractOutboundLinks(record, this, diskPath);
    if (links.length > 0) this.outboundBySource.set(source, links);
    for (const link of links) {
      if (link.path === source) continue;
      const backlinks = this.backlinksByTarget.get(link.path) ?? [];
      backlinks.push({ path: source, ...(link.field === undefined ? {} : { field: link.field }) });
      this.backlinksByTarget.set(link.path, backlinks);
    }
  }

  private clearOutboundLinks(source: string): void {
    const previous = this.outboundBySource.get(source);
    if (!previous) return;
    this.outboundBySource.delete(source);
    for (const target of new Set(previous.map(({ path }) => path))) {
      const backlinks = (this.backlinksByTarget.get(target) ?? []).filter(({ path }) => path !== source);
      if (backlinks.length === 0) this.backlinksByTarget.delete(target);
      else this.backlinksByTarget.set(target, backlinks);
    }
  }

  private isCurrent(diskPath: string, entry: RecordPathEntry, generation: number): boolean {
    return this.paths.get(diskPath) === entry && entry.generation === generation;
  }

  private cacheRecord(entry: RecordPathEntry, bytes: Uint8Array, updated: string, contentHash: string): void {
    entry.updated = updated;
    entry.contentHash = contentHash;
    try {
      const parsed = parseMatter(decodeUtf8(bytes));
      entry.fields = parsed.header;
      if (parsed.body === undefined) delete entry.body;
      else entry.body = parsed.body;
      if (parsed.invalidFrontmatter) entry.error = invalidFrontmatterError;
      else delete entry.error;
      delete entry.unreadable;
    } catch (error) {
      if (!(error instanceof InvalidUtf8Error)) throw error;
      delete entry.fields;
      delete entry.body;
      delete entry.error;
      entry.unreadable = true;
    }
  }
}

/** Error raised when a markdown file is not valid UTF-8. */
export class InvalidUtf8Error extends Error {}

/** Error raised when a write uses the reserved $type key incorrectly. */
export class InvalidReferenceError extends Error {}

/** Return a record from the index's cached parsed data. */
export async function readNote(_vaultRoot: string, absolutePath: string, index: VaultIndex): Promise<Note> {
  return index.read(absolutePath);
}

/** Serialize a record for replacement through the base file-server atomic write. */
export async function serializeNote(
  absolutePath: string,
  record: RecordContent,
  fieldPatch?: Fields,
  bodyTouched = false,
  preservedBody?: string,
): Promise<string> {
  const body = fieldPatch !== undefined && !bodyTouched && preservedBody !== undefined
    ? preservedBody
    : record.body ?? "";
  if (fieldPatch === undefined) return serializeRecord(record.fields, body, "");
  const currentSource = await readUtf8(absolutePath);
  const parsed = parseMatter(currentSource);
  return serializePatchedNote(parsed, record.fields, body, fieldPatch, bodyTouched);
}

function serializeRecord(header: Fields, body: string, originalBody: string): string {
  const stringifyMatter = matter.stringify as unknown as (content: string, data: Fields, options: { noCompatMode: boolean }) => string;
  let source = Object.keys(header).length === 0 ? body : stringifyMatter(body, header, { noCompatMode: true });
  if (!body.endsWith("\n") && source.endsWith("\n")) source = source.slice(0, -1);
  if (body === "" && originalBody === "" && source.endsWith("\n")) source = source.slice(0, -1);
  return source;
}

/** Enforce the API-wide reservation of objects carrying $type. */
export function validateReferenceObjects(fields: Fields): void {
  if (Object.hasOwn(fields, "$type")) {
    if (fields.$type === "ref" && typeof fields.path !== "string") {
      throw new InvalidReferenceError("reference path must be a string");
    }
    throw new InvalidReferenceError("invalid $type object");
  }
  for (const value of Object.values(fields)) validateReferenceValue(value);
}

/**
 * Put fields into the form they will be stored in — references written back as
 * the links a file carries — so a caller inspecting a record about to be
 * written judges exactly what lands on disk.
 */
export function storedFields(
  fields: Fields,
  previous: Fields | undefined,
  index: VaultIndex,
  linkingNotePath: string,
  patch?: Fields,
): Fields {
  validateReferenceObjects(patch ?? fields);
  return patch === undefined
    ? serializeFieldMap(fields, previous, index, linkingNotePath)
    : serializePatchedFieldMap(fields, previous, patch, index, linkingNotePath);
}

/** Canonicalize a submitted body, retaining exact stored bytes on a served-form echo. */
export function storedBody(body: string, previous: string | undefined, index: VaultIndex, linkingNotePath: string): string | undefined {
  if (body.trim().length === 0) return undefined;
  if (index.isRawBody(linkingNotePath)) return body;
  return previous !== undefined && body === serveMarkdownBody(previous, index, linkingNotePath)
    ? previous
    : canonicalizeMarkdownBody(body, linkingNotePath, index);
}

/** Apply RFC 7386 object merge semantics. */
export function mergeFields(target: Fields, patch: Fields): Fields {
  const result: Fields = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else if (isObject(value)) result[key] = mergeFields(isObject(result[key]) ? result[key] as Fields : {}, value);
    else result[key] = value;
  }
  return result;
}

/** Read the raw parsed record used for echo and merge-patch. */
export async function readRawRecord(absolutePath: string): Promise<RawRecord> {
  const parsed = parseMatter(await readUtf8(absolutePath));
  if (parsed.invalidFrontmatter) return { fields: {}, ...(parsed.body === undefined ? {} : { body: parsed.body }), rawBody: parsed.rawBody };
  return { fields: parsed.header, ...(parsed.body === undefined ? {} : { body: parsed.body }), rawBody: parsed.rawBody };
}

async function readUtf8(absolutePath: string, read: (path: string) => Promise<Uint8Array> = readFile): Promise<string> {
  return decodeUtf8(await read(absolutePath));
}

function decodeUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new InvalidUtf8Error("markdown file is not valid UTF-8"); }
}

function parseMatter(source: string): ParsedMatter {
  try {
    // gray-matter caches failures by source and returns a different result on
    // the next parse. Always bypass its global cache.
    const parsed = matter(source, { engines: { yaml: (header) => load(header, { schema: CORE_SCHEMA }) as object } });
    if (!isObject(parsed.data)) throw new Error("header is not a map");
    return {
      header: parsed.data,
      ...(parsed.content.trim().length === 0 ? {} : { body: parsed.content }),
      invalidFrontmatter: false,
      rawHeader: parsed.matter,
      rawBody: parsed.content,
    };
  } catch {
    return { header: {}, ...(source.length === 0 ? {} : { body: source }), invalidFrontmatter: true, rawHeader: "", rawBody: source };
  }
}

function serializePatchedNote(parsed: ParsedMatter, header: Fields, body: string, patch: Fields, bodyTouched: boolean): string {
  const changedKeys = new Set(Object.keys(patch));
  if (changedKeys.size === 0) {
    if (bodyTouched) return serializeHeaderAndBody(parsed.rawHeader, header, body);
    throw new Error("empty patch must not be written");
  }
  const document = parseDocument(parsed.rawHeader, { keepSourceTokens: true });
  if (!isMap(document.contents)) return serializeRecord(header, body, parsed.body ?? "");
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  collectMapReplacements(parsed.rawHeader, document.contents, header, Object.fromEntries([...changedKeys].map((key) => [key, patch[key]])), replacements);
  let rawHeader = parsed.rawHeader;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    rawHeader = rawHeader.slice(0, replacement.start) + replacement.text + rawHeader.slice(replacement.end);
  }
  // Splicing text into a header is only worth doing while it keeps the header
  // readable. If an edit ever produces something that no longer parses, write
  // the record whole rather than leaving an unreadable file on disk.
  if (!parsesAsMap(rawHeader)) return serializeRecord(header, body, parsed.body ?? "");
  return serializeHeaderAndBody(rawHeader, header, body);
}

function collectMapReplacements(source: string, map: any, target: Fields, patch: Fields, replacements: Array<{ start: number; end: number; text: string }>): void {
  const pairs = map.items as any[];
  const pairByKey = new Map<string, { pair: any; index: number }>();
  pairs.forEach((pair, index) => pairByKey.set(String(pair.key && "value" in pair.key ? pair.key.value : pair.key), { pair, index }));
  const mapRange = map.range as [number, number, number];
  if (source[mapRange[0]] === "{" && pairs.length > 0 && [...pairByKey.keys()].every((key) => !(key in target))) {
    const contents = Object.entries(target).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ");
    replacements.push({ start: mapRange[0] + 1, end: mapRange[1] - 1, text: contents });
    return;
  }
  for (const [key, patchValue] of Object.entries(patch)) {
    const found = pairByKey.get(key);
    if (!found) continue;
    if (!(key in target)) { replacements.push({ ...pairRange(source, map, pairs, found.index), text: "" }); continue; }
    if (isObject(patchValue) && isMap(found.pair.value) && isObject(target[key])) {
      collectMapReplacements(source, found.pair.value, target[key] as Fields, patchValue, replacements);
      continue;
    }
    const range = found.pair.value?.range;
    if (range) {
      // An empty value's range starts right after the colon (`draft:`), so
      // splicing without a space would produce `draft:true` — a plain scalar
      // that breaks the whole header.
      const prefix = source[range[0] - 1] === ":" ? " " : "";
      const suffix = source[range[1]] === "#" ? " " : "";
      // A block collection's range runs to the end of its last line, so the
      // replaced span carries the newline separating it from the next key.
      // Dropping it would run the new value into that key.
      const trailing = source.slice(range[0], range[1]).endsWith("\n") ? "\n" : "";
      const value = renderPatchedValue(source, range[0], target[key]);
      replacements.push({ start: range[0], end: range[1], text: `${prefix}${value}${suffix}${trailing}` });
    } else {
      const end = found.pair.key?.range?.[1];
      if (end !== undefined) replacements.push({ start: end, end, text: `: ${JSON.stringify(target[key])}` });
    }
  }
  const additions = Object.keys(patch).filter((key) => !pairByKey.has(key) && key in target);
  if (additions.length === 0) return;
  const range = mapRange;
  const flow = source[range[0]] === "{";
  const text = additions.map((key) => `${JSON.stringify(key)}: ${JSON.stringify(target[key])}`).join(flow ? ", " : `\n${mapIndent(source, pairs)}`);
  if (flow) {
    const close = source.lastIndexOf("}", range[1]);
    replacements.push({ start: close, end: close, text: `${pairs.length === 0 ? "" : ", "}${text}` });
  } else {
    let insertion = range[1];
    while (insertion > range[0] && source[insertion - 1] === "\n") insertion -= 1;
    const indent = mapIndent(source, pairs);
    replacements.push({ start: insertion, end: insertion, text: `${insertion === range[0] ? "" : "\n"}${indent}${text}` });
  }
}

function mapIndent(source: string, pairs: any[]): string {
  const start = pairs[0]?.key?.range?.[0] ?? 0;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  return source.slice(lineStart, start).match(/^\s*/)?.[0] ?? "";
}

/**
 * Render a patched value where its old text sat. A value on its own line is a
 * block, and stays one — inline JSON there would flatten a nested structure
 * into a single unreadable line in a file people edit by hand. A value sharing
 * its key's line stays inline.
 */
function parsesAsMap(rawHeader: string): boolean {
  try { return isObject(load(rawHeader, { schema: CORE_SCHEMA })); }
  catch { return false; }
}

function renderPatchedValue(source: string, start: number, value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const indent = source.slice(source.lastIndexOf("\n", start - 1) + 1, start);
  if (indent.trim() !== "") return JSON.stringify(value);
  return stringifyYaml(value, { indent: 2 }).trimEnd().split("\n").join(`\n${indent}`);
}

function serializeHeaderAndBody(rawHeader: string, header: Fields, body: string): string {
  if (Object.keys(header).length === 0) return body;
  const normalized = rawHeader.replace(/^\n/, "").replace(/\n?$/, "\n");
  return `---\n${normalized}---\n${body}`;
}

function pairRange(source: string, map: any, pairs: any[], index: number): { start: number; end: number } {
  const pair = pairs[index];
  const flow = source[map.range?.[0] ?? -1] === "{";
  let start = pair.key?.range?.[0] ?? 0;
  let end = pair.value?.range?.[2] ?? pair.value?.range?.[1] ?? pair.key?.range?.[1] ?? start;
  if (flow) {
    const commaBefore = source.lastIndexOf(",", start);
    const openBefore = source.lastIndexOf("{", start);
    if (commaBefore > openBefore) start = commaBefore;
    else {
      const commaAfter = source.indexOf(",", end);
      if (commaAfter >= 0 && commaAfter < (map.range?.[1] ?? end)) end = commaAfter + 1;
    }
  }
  return { start, end };
}

function resolveReferences(value: unknown, index: VaultIndex, linkingNotePath: string): unknown {
  if (typeof value === "string") {
    // A link is a reference because of how it is written, not because of what
    // happens to exist. Both stored syntaxes are recognized on every read.
    const link = readFieldReference(value, index, linkingNotePath);
    if (!link) return value;
    return { $type: "ref", path: link.path, ...(link.rendered === link.path ? {} : { label: link.rendered }) };
  }
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, index, linkingNotePath));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveReferences(item, index, linkingNotePath)]));
  return value;
}

function serializeReferences(value: unknown, previous: unknown, vaultIndex: VaultIndex, linkingNotePath: string): any {
  if (Array.isArray(value)) return value.map((item, index) => serializeReferences(item, Array.isArray(previous) ? previous[index] : undefined, vaultIndex, linkingNotePath));
  if (isObject(value)) {
    if (Object.hasOwn(value, "$type")) {
      assertReferenceObject(value);
      const rendered = value.label ?? value.path;
      const oldLink = readFieldReference(previous, vaultIndex, linkingNotePath);
      if (oldLink
        && resolvedSubmittedReferencePath(vaultIndex, linkingNotePath, value.path) === oldLink.path
        && rendered === oldLink.rendered) return previous;
      return vaultIndex.linkFormat === "wikilink"
        ? `[[${value.path}${value.label === undefined ? "" : `|${value.label}`}]]`
        : serializeMarkdownReference(value.path, value.label, linkingNotePath);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      serializeReferences(item, isObject(previous) ? previous[key] : undefined, vaultIndex, linkingNotePath),
    ]));
  }
  return value;
}

function serializeFieldMap(fields: Fields, previous: Fields | undefined, vaultIndex: VaultIndex, linkingNotePath: string): Fields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    serializeReferences(value, previous?.[key], vaultIndex, linkingNotePath),
  ]));
}

/**
 * Convert only values supplied by a merge-patch. Values absent from the patch
 * retain their raw stored form, including mappings that use the reserved
 * `$type` key as ordinary pre-existing data.
 */
function serializePatchedFieldMap(
  fields: Fields,
  previous: Fields | undefined,
  patch: Fields,
  vaultIndex: VaultIndex,
  linkingNotePath: string,
): Fields {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => {
    if (!Object.hasOwn(patch, key)) {
      return [key, previous && Object.hasOwn(previous, key) ? previous[key] : serializeReferences(value, undefined, vaultIndex, linkingNotePath)];
    }
    return [key, serializePatchedValue(value, previous?.[key], patch[key], vaultIndex, linkingNotePath)];
  }));
}

function serializePatchedValue(
  value: unknown,
  previous: unknown,
  submitted: unknown,
  vaultIndex: VaultIndex,
  linkingNotePath: string,
): unknown {
  if (!isObject(submitted) || Array.isArray(submitted)) return serializeReferences(value, previous, vaultIndex, linkingNotePath);
  if (Object.hasOwn(submitted, "$type")) return serializeReferences(value, previous, vaultIndex, linkingNotePath);
  // A partial PATCH of a served reference merges into its object view, but the
  // corresponding stored value is a scalar link and must be serialized as one
  // complete reference at this position.
  if (isObject(value) && Object.hasOwn(value, "$type") && readFieldReference(previous, vaultIndex, linkingNotePath)) {
    return serializeReferences(value, previous, vaultIndex, linkingNotePath);
  }
  if (!isObject(value)) return serializeReferences(value, previous, vaultIndex, linkingNotePath);
  const previousMap = isObject(previous) ? previous : undefined;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (!Object.hasOwn(submitted, key)) {
      return [key, previousMap && Object.hasOwn(previousMap, key) ? previousMap[key] : serializeReferences(item, undefined, vaultIndex, linkingNotePath)];
    }
    return [key, serializePatchedValue(item, previousMap?.[key], submitted[key], vaultIndex, linkingNotePath)];
  }));
}

function validateReferenceValue(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) validateReferenceValue(item); return; }
  if (!isObject(value)) return;
  if (Object.hasOwn(value, "$type")) {
    assertReferenceObject(value);
    return;
  }
  for (const item of Object.values(value)) validateReferenceValue(item);
}

function isReferenceObject(value: Fields): value is Fields & { $type: "ref"; path: string; label?: string } {
  const keys = Object.keys(value);
  return value.$type === "ref"
    && typeof value.path === "string"
    && (keys.length === 2 || (keys.length === 3 && typeof value.label === "string"))
    && keys.every((key) => key === "$type" || key === "path" || key === "label");
}

function assertReferenceObject(value: Fields): asserts value is Fields & { $type: "ref"; path: string; label?: string } {
  if (value.$type === "ref" && typeof value.path !== "string") {
    throw new InvalidReferenceError("reference path must be a string");
  }
  if (!isReferenceObject(value)) throw new InvalidReferenceError("invalid $type object");
}

function parseWikilink(value: unknown): { target: string; rendered: string } | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("[[") || !value.endsWith("]]")) return null;
  const contents = value.slice(2, -2);
  if (!isWikilinkContents(contents)) return null;
  const alias = contents.indexOf("|");
  return alias < 0
    ? { target: contents, rendered: contents }
    : { target: contents.slice(0, alias), rendered: contents.slice(alias + 1) };
}

function readFieldReference(value: unknown, index: VaultIndex, linkingNotePath: string): { path: string; rendered: string } | null {
  const wikilink = parseWikilink(value);
  if (wikilink) return { path: resolvedWikilinkPath(index, linkingNotePath, wikilink.target), rendered: wikilink.rendered };
  if (typeof value !== "string") return null;
  const link = inlineMarkdownLinkAt(value, 0);
  if (!link || link.end !== value.length) return null;
  const destination = markdownDestinationValue(link.destination);
  const decoded = destination === null ? null : decodeMarkdownTarget(destination);
  if (destination === null || decoded === null || !isInternalMarkdownDestination(destination)) return null;
  const target = positionalWikilinkTarget(linkingNotePath, decoded);
  return {
    path: resolvedMarkdownPath(index, linkingNotePath, target),
    rendered: markdownLabelValue(value.slice(link.labelStart, link.labelEnd)),
  };
}

function extractOutboundLinks(record: RecordContent, index: VaultIndex, linkingNotePath: string): OutboundLink[] {
  const links: OutboundLink[] = [];
  for (const [field, value] of Object.entries(record.fields)) {
    collectFieldLinks(value, field, index, linkingNotePath, links);
  }
  if (record.body !== undefined && !index.isRawBody(linkingNotePath)) {
    links.push(...extractBodyLinks(record.body, index, linkingNotePath));
  }
  return links;
}

function collectFieldLinks(
  value: unknown,
  field: string,
  index: VaultIndex,
  linkingNotePath: string,
  links: OutboundLink[],
): void {
  if (typeof value === "string") {
    const path = resolvedFieldRecordPath(value, index, linkingNotePath);
    if (path !== null) links.push({ path, field });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFieldLinks(item, field, index, linkingNotePath, links);
    return;
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) collectFieldLinks(item, field, index, linkingNotePath, links);
  }
}

function resolvedFieldRecordPath(value: string, index: VaultIndex, linkingNotePath: string): string | null {
  const wikilink = parseWikilink(value);
  if (wikilink) return resolvedWikilinkRecordPath(index, linkingNotePath, wikilink.target);
  const link = inlineMarkdownLinkAt(value, 0);
  if (!link || link.end !== value.length) return null;
  return resolvedMarkdownRecordPath(index, linkingNotePath, link.destination);
}

function resolvedWikilinkRecordPath(index: VaultIndex, linkingNotePath: string, target: string): string | null {
  const { wanted } = splitReferenceTarget(target);
  const resolved = wanted === "" ? linkingNotePath : index.resolveReference(linkingNotePath, wanted);
  return addressableRecordPath(index, resolved);
}

function resolvedMarkdownRecordPath(index: VaultIndex, linkingNotePath: string, rawDestination: string): string | null {
  const destination = markdownDestinationValue(rawDestination);
  const decoded = destination === null ? null : decodeMarkdownTarget(destination);
  if (destination === null || decoded === null || !isInternalMarkdownDestination(destination)) return null;
  const { wanted } = positionalWikilinkTarget(linkingNotePath, decoded);
  const resolved = wanted === "" ? linkingNotePath : index.resolveMarkdownReference(wanted);
  return addressableRecordPath(index, resolved);
}

function addressableRecordPath(index: VaultIndex, diskPath: string | null): string | null {
  return diskPath !== null && index.isRecordPath(diskPath) ? index.apiPathFor(diskPath) : null;
}

function serializeMarkdownReference(path: string, label: string | undefined, linkingNotePath: string): string {
  const { wanted, suffix } = splitReferenceTarget(path);
  const destination = { wanted: relativeReferenceDestination(linkingNotePath, wanted), suffix };
  return `[${escapeMarkdownLabel(label ?? path)}](${formatMarkdownTarget(destination)})`;
}

function resolvedSubmittedReferencePath(index: VaultIndex, linkingNotePath: string, target: string): string {
  return index.linkFormat === "wikilink"
    ? resolvedWikilinkPath(index, linkingNotePath, target)
    : resolvedMarkdownPath(index, linkingNotePath, splitReferenceTarget(target));
}

function resolvedWikilinkPath(index: VaultIndex, linkingNotePath: string, target: string): string {
  const { wanted, suffix } = splitReferenceTarget(target);
  if (wanted === "") return `${index.apiPathFor(linkingNotePath)}${suffix}`;
  const resolved = index.resolveReference(linkingNotePath, wanted);
  return `${resolved === null ? wanted : index.apiPathFor(resolved)}${suffix}`;
}

function resolvedMarkdownPath(index: VaultIndex, linkingNotePath: string, { wanted, suffix }: ReferenceTarget): string {
  if (wanted === "") return `${index.apiPathFor(linkingNotePath)}${suffix}`;
  const resolved = index.resolveMarkdownReference(wanted);
  return `${resolved === null ? wanted : index.apiPathFor(resolved)}${suffix}`;
}

function canonicalizeMarkdownBody(body: string, linkingNotePath: string, index: VaultIndex): string {
  return transformMarkdownBody(body, linkingNotePath, (source, path) => canonicalizeInlineLinks(source, path, index));
}

function serveMarkdownBody(body: string, index: VaultIndex, linkingNotePath: string): string {
  return transformMarkdownBody(body, linkingNotePath, (source, path) => serveInlineWikilinks(source, index, path));
}

function extractBodyLinks(body: string, index: VaultIndex, linkingNotePath: string): OutboundLink[] {
  const links: OutboundLink[] = [];
  transformMarkdownBody(body, linkingNotePath, (source, path) => transformInlineProse(source, path, "inspect", index, (link) => {
    const target = link.syntax === "wikilink"
      ? resolvedWikilinkRecordPath(index, path, link.target)
      : resolvedMarkdownRecordPath(index, path, link.destination);
    if (target !== null) links.push({ path: target });
    return undefined;
  }));
  return links;
}

function transformMarkdownBody(body: string, linkingNotePath: string, transformInline: (source: string, path: string) => string): string {
  let output = "";
  let plain = "";
  let fence: { marker: string; length: number } | undefined;
  let htmlBlock: { end: RegExp | "blank" } | undefined;
  for (let start = 0; start < body.length;) {
    const end = markdownLineEnd(body, start);
    const fullLine = body.slice(start, end);
    const line = fullLine.replace(/(?:\r\n|\r|\n)$/, "");
    if (fence) {
      output += fullLine;
      if (closesFence(line, fence.marker, fence.length)) fence = undefined;
    } else if (htmlBlock) {
      output += fullLine;
      if (endsHtmlBlock(line, htmlBlock.end)) htmlBlock = undefined;
    } else {
      const opening = markdownContainerContent(line).match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening?.[1] && (opening[1][0] !== "`" || !opening[2]?.includes("`"))) {
        output += transformInline(plain, linkingNotePath) + fullLine;
        plain = "";
        fence = { marker: opening[1][0] as string, length: opening[1].length };
      } else {
        const html = htmlBlockStart(line, plain.length === 0 || endsWithBlankLine(plain));
        if (html) {
          output += transformInline(plain, linkingNotePath) + fullLine;
          plain = "";
          if (!endsHtmlBlock(line, html.end)) htmlBlock = html;
        } else plain += fullLine;
      }
    }
    start = end;
  }
  return output + transformInline(plain, linkingNotePath);
}

function markdownLineEnd(source: string, start: number): number {
  let end = start;
  while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end += 1;
  if (source[end] === "\r" && source[end + 1] === "\n") return end + 2;
  return end < source.length ? end + 1 : end;
}

function endsWithBlankLine(source: string): boolean {
  const lines = source.split(/\r\n|\r|\n/);
  return lines.length > 1 && lines[lines.length - 2]?.trim() === "";
}

function htmlBlockStart(line: string, allowTypeSeven: boolean): { end: RegExp | "blank" } | null {
  const special = line.match(/^ {0,3}<(script|pre|style|textarea)(?:[ \t>]|$)/i)?.[1];
  if (special) return { end: new RegExp(`</${special}[ \\t]*>`, "i") };
  if (/^ {0,3}<!--/.test(line)) return { end: /-->/ };
  if (/^ {0,3}<\?/.test(line)) return { end: /\?>/ };
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return { end: /\]\]>/ };
  if (/^ {0,3}<![A-Z]/.test(line)) return { end: />/ };
  const blockTag = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)$/i;
  const tag = line.match(/^ {0,3}<\/?([^ \t/>]+)/)?.[1];
  if (tag && blockTag.test(tag)) return { end: "blank" };
  const completeTag = /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:[^ "'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t]*\/?>|<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>)[ \t]*$/;
  return allowTypeSeven && completeTag.test(line) ? { end: "blank" } : null;
}

function endsHtmlBlock(line: string, end: RegExp | "blank"): boolean {
  return end === "blank" ? line.trim() === "" : end.test(line);
}

function closesFence(line: string, marker: string, minimumLength: number): boolean {
  const candidate = markdownContainerContent(line).match(/^[ \t]*(\S+)[ \t]*$/)?.[1];
  return candidate !== undefined && candidate.length >= minimumLength && [...candidate].every((character) => character === marker);
}

function markdownContainerContent(line: string): string {
  let content = line;
  while (true) {
    const quote = content.match(/^ {0,3}>[ \t]?/);
    if (quote) { content = content.slice(quote[0].length); continue; }
    const list = content.match(/^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]+|$)/);
    if (list) { content = content.slice(list[0].length); continue; }
    return content;
  }
}

function canonicalizeInlineLinks(source: string, linkingNotePath: string, index: VaultIndex): string {
  return transformInlineProse(source, linkingNotePath, index.linkFormat, index);
}

function serveInlineWikilinks(source: string, index: VaultIndex, linkingNotePath: string): string {
  return transformInlineProse(source, linkingNotePath, "serve", index);
}

type ProseLink = { syntax: "wikilink"; target: string } | { syntax: "markdown"; destination: string };

function transformInlineProse(
  source: string,
  linkingNotePath: string,
  mode: "serve" | "inspect" | LinkFormat,
  index?: VaultIndex,
  onLink?: (link: ProseLink) => void,
): string {
  let result = "";
  let codeTicks: number | undefined;
  for (let cursor = 0; cursor < source.length;) {
    if (source[cursor] === "`") {
      let end = cursor + 1;
      while (source[end] === "`") end += 1;
      const run = end - cursor;
      if (codeTicks === undefined && hasClosingBackticks(source, end, run)) codeTicks = run;
      else if (codeTicks === run) codeTicks = undefined;
      result += source.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (codeTicks === undefined && source[cursor] === "\\" && /[!-/:-@[-`{-~]/.test(source[cursor + 1] ?? "")) {
      result += source.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    if (codeTicks === undefined) {
      const definitionEnd = referenceDefinitionEnd(source, cursor);
      if (definitionEnd !== null) {
        result += source.slice(cursor, definitionEnd);
        cursor = definitionEnd;
        continue;
      }
    }
    if (codeTicks === undefined && source[cursor] === "<") {
      const end = inlineHtmlEnd(source, cursor);
      if (end !== null) {
        result += source.slice(cursor, end);
        cursor = end;
        continue;
      }
    }
    if (codeTicks === undefined) {
      const wikilink = bodyWikilinkAt(source, cursor);
      if (wikilink) {
        onLink?.({ syntax: "wikilink", target: wikilink.target });
        result += mode === "inspect"
          ? source.slice(cursor, wikilink.end)
          : mode === "serve"
          ? renderBodyReference(wikilink, index as VaultIndex, linkingNotePath)
          : mode === "markdown"
            ? renderBodyReference(wikilink, index as VaultIndex, linkingNotePath)
            : source.slice(cursor, wikilink.end);
        cursor = wikilink.end;
        continue;
      }
      const image = source[cursor] === "!" && source[cursor + 1] === "[";
      const markdown = inlineMarkdownLinkAt(source, image ? cursor + 1 : cursor);
      if (markdown) {
        onLink?.({ syntax: "markdown", destination: markdown.destination });
        if (mode === "serve" || mode === "inspect") result += source.slice(cursor, markdown.end);
        else if (mode === "wikilink") {
          const destination = markdownDestinationValue(markdown.destination);
          const decoded = destination === null ? null : decodeMarkdownTarget(destination);
          if (destination === null || decoded === null || !isInternalMarkdownDestination(destination)) result += source.slice(cursor, markdown.end);
          else {
            const target = positionalWikilinkTarget(linkingNotePath, decoded);
            const label = markdownLabelValue(source.slice(markdown.labelStart, markdown.labelEnd));
            const targetText = `${target.wanted}${target.suffix}`;
            result += isWikilinkComponent(targetText) && isWikilinkComponent(label)
              ? `${image ? "!" : ""}[[${targetText}${label === targetText ? "" : `|${label}`}]]`
              : source.slice(cursor, markdown.end);
          }
        } else result += rewriteRootedMarkdownDestination(source, cursor, markdown, linkingNotePath);
        cursor = markdown.end;
        continue;
      }
    }
    result += source[cursor];
    cursor += 1;
  }
  return result;
}

type BodyWikilink = { target: string; rendered: string; image: boolean; end: number };

function bodyWikilinkAt(source: string, start: number): BodyWikilink | null {
  const image = source[start] === "!";
  const opening = image ? start + 1 : start;
  if (!source.startsWith("[[", opening)) return null;
  const close = source.indexOf("]]", opening + 2);
  if (close < 0) return null;
  const contents = source.slice(opening + 2, close);
  if (!isWikilinkContents(contents)) return null;
  const alias = contents.indexOf("|");
  return {
    target: alias < 0 ? contents : contents.slice(0, alias),
    rendered: alias < 0 ? contents : contents.slice(alias + 1),
    image,
    end: close + 2,
  };
}

function renderBodyReference(link: BodyWikilink, index: VaultIndex, linkingNotePath: string): string {
  const { wanted, suffix } = splitReferenceTarget(link.target);
  const resolved = index.resolveReference(linkingNotePath, wanted);
  const destination = {
    wanted: resolved === null ? wanted : relativeReferenceDestination(linkingNotePath, index.apiPathFor(resolved)),
    suffix,
  };
  return `${link.image ? "!" : ""}[${escapeMarkdownLabel(link.rendered)}](${formatMarkdownTarget(destination)})`;
}

function escapeMarkdownLabel(label: string): string { return label.replace(/[\\`*_\[\]<>&]/g, "\\$&"); }

function formatMarkdownDestination(destination: string): string {
  return encodeURI(destination).replace(/[()]/g, "\\$&");
}

function formatMarkdownTarget({ wanted, suffix }: ReferenceTarget): string {
  const encodedSuffix = formatMarkdownDestination(suffix).replace(/%25(?=[0-9A-Fa-f]{2})/g, "%");
  return `${formatMarkdownDestination(wanted)}${encodedSuffix}`;
}

function referenceDefinitionEnd(source: string, start: number): number | null {
  if (start > 0 && source[start - 1] !== "\n" && source[start - 1] !== "\r") return null;
  let end = markdownLineEnd(source, start);
  const line = source.slice(start, end).replace(/(?:\r\n|\r|\n)$/, "");
  if (!/^ {0,3}\[(?:\\.|[^\]\r\n])+\]:/.test(line)) return null;
  while (end < source.length) {
    const next = markdownLineEnd(source, end);
    const continuation = source.slice(end, next).replace(/(?:\r\n|\r|\n)$/, "");
    if (!/^[ \t]+\S/.test(continuation)) break;
    end = next;
  }
  return end;
}

type InlineMarkdownLink = {
  labelStart: number;
  labelEnd: number;
  destinationStart: number;
  destinationEnd: number;
  destination: string;
  end: number;
};

function inlineMarkdownLinkAt(source: string, openBracket: number): InlineMarkdownLink | null {
  if (source[openBracket] !== "[") return null;
  let depth = 0;
  for (let cursor = openBracket; cursor < source.length; cursor += 1) {
    if (source[cursor] === "\\") { cursor += 1; continue; }
    if (source[cursor] === "[") depth += 1;
    else if (source[cursor] === "]") {
      depth -= 1;
      if (depth !== 0) continue;
      if (source[cursor + 1] !== "(") return null;
      const destination = inlineDestination(source, cursor);
      if (!destination) return null;
      return {
        labelStart: openBracket + 1,
        labelEnd: cursor,
        destinationStart: destination.start,
        destinationEnd: destination.end,
        destination: source.slice(destination.start, destination.end),
        end: destination.close + 1,
      };
    }
  }
  return null;
}

function rewriteRootedMarkdownDestination(
  source: string,
  start: number,
  link: InlineMarkdownLink,
  linkingNotePath: string,
): string {
  const destination = markdownDestinationValue(link.destination);
  const target = destination === null ? null : decodeMarkdownTarget(destination);
  if (destination === null || target === null || !target.wanted.startsWith("/") || destination.startsWith("//")) {
    return source.slice(start, link.end);
  }
  const relativeTarget = rootedMarkdownTarget(linkingNotePath, target);
  return source.slice(start, link.destinationStart)
    + formatMarkdownTarget(relativeTarget)
    + source.slice(link.destinationEnd, link.end);
}

function markdownDestinationValue(destination: string): string | null {
  return destination.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

function decodeMarkdownTarget(destination: string): ReferenceTarget | null {
  const { wanted, suffix } = splitReferenceTarget(destination);
  try { return { wanted: decodeURIComponent(wanted), suffix }; }
  catch { return null; }
}

function markdownLabelValue(label: string): string {
  return label.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

function isInternalMarkdownDestination(destination: string): boolean {
  return !destination.startsWith("//") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination);
}

function positionalWikilinkTarget(linkingNotePath: string, { wanted: pathname, suffix }: ReferenceTarget): ReferenceTarget {
  const rooted = pathname.startsWith("/");
  const relativePath = rooted ? pathname.slice(1) : pathname;
  if (rooted && relativePath === "") return rootedMarkdownTarget(linkingNotePath, { wanted: "/", suffix });
  if (!rooted && relativePath === "") return { wanted: "", suffix };
  const normalized = rooted ? posix.normalize(relativePath) : posix.normalize(posix.join(posix.dirname(linkingNotePath), relativePath));
  const target = clampVaultPath(normalized);
  return { wanted: target, suffix };
}

function clampVaultPath(path: string): string {
  let clamped = path;
  while (clamped === ".." || clamped.startsWith("../")) clamped = clamped === ".." ? "" : clamped.slice(3);
  return clamped;
}

function hasClosingBackticks(source: string, start: number, length: number): boolean {
  for (let index = source.indexOf("`", start); index >= 0; index = source.indexOf("`", index)) {
    let end = index + 1;
    while (source[end] === "`") end += 1;
    if (end - index === length) return true;
    index = end;
  }
  return false;
}

function inlineHtmlEnd(source: string, start: number): number | null {
  if (source.startsWith("<!--", start)) {
    const end = source.indexOf("-->", start + 4);
    return end < 0 ? source.length : end + 3;
  }
  for (const [opening, closing] of [["<?", "?>"], ["<![CDATA[", "]]>"]] as const) {
    if (!source.startsWith(opening, start)) continue;
    const end = source.indexOf(closing, start + opening.length);
    return end < 0 ? source.length : end + closing.length;
  }
  if (/^<![A-Z]/.test(source.slice(start))) {
    const end = source.indexOf(">", start + 2);
    return end < 0 ? source.length : end + 1;
  }
  const autolink = source.slice(start).match(/^<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\x00-\x20]*|[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/)?.[0];
  if (autolink) return start + autolink.length;
  if (!/^<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>])/.test(source.slice(start))) return null;
  let quote: string | undefined;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === ">") return index + 1;
  }
  return null;
}

function inlineDestination(source: string, closeBracket: number): { start: number; end: number; close: number } | null {
  let cursor = closeBracket + 2;
  while (/[ \t\r\n]/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] === "<") {
    const start = cursor + 1;
    cursor = start;
    while (cursor < source.length && source[cursor] !== ">") {
      if (source[cursor] === "\n" || source[cursor] === "\r" || source[cursor] === "<") return null;
      if (source[cursor] === "\\") cursor += 1;
      cursor += 1;
    }
    if (source[cursor] !== ">") return null;
    const close = inlineLinkClose(source, cursor + 1);
    return close === null ? null : { start, end: cursor, close };
  }

  const start = cursor;
  let parentheses = 0;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\\") { cursor += 2; continue; }
    if (character === "(") { parentheses += 1; cursor += 1; continue; }
    if (character === ")") {
      if (parentheses === 0) return { start, end: cursor, close: cursor };
      parentheses -= 1;
      cursor += 1;
      continue;
    }
    if (/[ \t\r\n]/.test(character ?? "") && parentheses === 0) {
      const close = inlineLinkClose(source, cursor);
      return close === null ? null : { start, end: cursor, close };
    }
    cursor += 1;
  }
  return null;
}

function inlineLinkClose(source: string, afterDestination: number): number | null {
  let cursor = afterDestination;
  while (/[ \t\r\n]/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] === ")") return cursor;
  if (cursor === afterDestination) return null;
  const opener = source[cursor];
  const closer = opener === "(" ? ")" : opener;
  if (opener !== "\"" && opener !== "'" && opener !== "(") return null;
  cursor += 1;
  while (cursor < source.length && source[cursor] !== closer) {
    if (source[cursor] === "\\") cursor += 1;
    cursor += 1;
  }
  if (source[cursor] !== closer) return null;
  cursor += 1;
  while (/[ \t\r\n]/.test(source[cursor] ?? "")) cursor += 1;
  return source[cursor] === ")" ? cursor : null;
}

function rootedMarkdownTarget(linkingNotePath: string, { wanted, suffix }: ReferenceTarget): ReferenceTarget {
  const target = wanted.slice(1);
  const relativeDestination = posix.relative(posix.dirname(linkingNotePath), target) || ".";
  if (target === "" && suffix !== "") {
    return { wanted: relativeDestination === "." ? "./" : `${relativeDestination}/`, suffix };
  }
  return { wanted: relativeDestination, suffix };
}

function relativeReferenceDestination(linkingNotePath: string, target: string): string {
  const linkingDirectory = posix.dirname(linkingNotePath);
  const destination = posix.relative(linkingDirectory, target);
  return destination || `../${posix.basename(target)}`;
}

function splitReferenceTarget(target: string): ReferenceTarget {
  const suffixStart = [target.indexOf("?"), target.indexOf("#")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? target.length;
  return { wanted: target.slice(0, suffixStart), suffix: target.slice(suffixStart) };
}

function isWikilinkContents(contents: string): boolean {
  const delimiter = contents.indexOf("|");
  return contents.length > 0
    && !/[\r\n]/.test(contents)
    && !contents.includes("]]")
    && (delimiter < 0 || contents.indexOf("|", delimiter + 1) < 0);
}

function isWikilinkComponent(component: string): boolean {
  return !/[\r\n]/.test(component) && !component.includes("]]") && !component.includes("|");
}

function isObject(value: unknown): value is Fields { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isMissing(error: unknown): boolean { return isObject(error) && "code" in error && error.code === "ENOENT"; }
function hash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("base64"); }
function toVaultPath(path: string): string { return path.split("\\").join("/"); }
function hasDotSegment(path: string): boolean { return path.split("/").some((segment) => segment.startsWith(".")); }
function compareLinks(left: OutboundLink, right: OutboundLink): number {
  return left.path.localeCompare(right.path) || (left.field ?? "").localeCompare(right.field ?? "");
}
function noteApiPath(path: string): string { return path.endsWith(".md") ? path.slice(0, -3) : path; }
