/** Extends the file-server protocol with structured markdown records. */
import type { Dirent, Stats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { STATUS_CODES, type IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { TextDecoder } from "node:util";
import {
  FileServer,
  type DirectoryEntry,
  type DirectoryListing,
  type FileChangeEvent,
  type FileServerExtension,
  type FileServerExtensionContext,
  type ListenOptions,
} from "@rupertsworld/file-server";
import express, { type NextFunction, type Request, type Response } from "express";

import {
  InvalidReferenceError,
  InvalidUtf8Error,
  mergeFields,
  readRawRecord,
  serializeNote,
  storedBody,
  storedFields,
  VaultIndex,
  type BodyFormat,
  type Fields,
  type LinkFormat,
  type RecordContent,
} from "./notes.ts";

const recordContentType = "application/vnd.telepath.record+json";
const recordResponseContentType = `${recordContentType}; charset=utf-8`;
const jsonContentType = "application/json; charset=utf-8";
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const exposedResponseHeaders = "ETag, Accept-Ranges, Content-Range, Accept-Patch";
const bootstrapQuietMs = 100;
const bootstrapQuietLimitMs = 1_000;

/** A record in the form it will be stored, offered for approval before it is written. */
export type ValidatedRecord = RecordContent & { path: string };
export type Validate = (record: ValidatedRecord) => void | Promise<void>;
export type { BodyFormat, LinkFormat, ListenOptions };
export type VaultServerOptions = {
  root: string;
  linkFormat?: LinkFormat;
  bodyFormat?: BodyFormat | ((path: string) => BodyFormat);
  validate?: Validate;
  jsonLimit?: string | number;
  pingIntervalMs?: number;
};

/** Raised when a caller's validate hook refuses a record write. */
class ValidationError extends Error {}

/** A file server with cached structured views for visible markdown files. */
export class VaultServer {
  readonly app: FileServer["app"];
  readonly server: FileServer["server"];
  readonly ready: Promise<void>;

  private readonly files: FileServer;
  private readonly validate: Validate | undefined;
  private readonly maximumJsonBytes: number;
  private readonly activeChanges = new Set<Promise<FileChangeEvent | null>>();
  private readonly changesByPath = new Map<string, Promise<FileChangeEvent | null>>();
  private readonly bootstrapPathGenerations = new Map<string, number>();
  private readonly directories = new Set<string>();
  private readonly pathView: Iterable<string>;
  private root: string | undefined;
  private index: VaultIndex | undefined;
  private linkFormat: LinkFormat;
  private bodyFormat: BodyFormat | ((path: string) => BodyFormat);
  private resolveIndex!: () => void;
  private readonly indexAvailable: Promise<void>;
  private changeGeneration = 0;
  private bootstrapComplete = false;

  constructor(options: VaultServerOptions) {
    rejectUnknownOptions(options, ["root", "linkFormat", "bodyFormat", "validate", "jsonLimit", "pingIntervalMs"]);
    const {
      root,
      linkFormat = "wikilink",
      bodyFormat = "markdown",
      validate,
      jsonLimit = "32mb",
      pingIntervalMs,
    } = options;
    this.linkFormat = linkFormat;
    this.bodyFormat = bodyFormat;
    this.validate = validate;
    this.maximumJsonBytes = parseByteLimit(jsonLimit);
    this.indexAvailable = new Promise<void>((resolve) => { this.resolveIndex = resolve; });
    this.pathView = {
      [Symbol.iterator]: () => this.index?.[Symbol.iterator]() ?? [][Symbol.iterator](),
    };

    const extension: FileServerExtension = {
      handle: (request, response, context) => this.handle(request, response, context),
      listing: async (_request, listing) => {
        await this.ready;
        return decorateListing(listing, this.index as VaultIndex);
      },
      change: (event) => this.change(event),
    };
    this.files = new FileServer({
      root,
      defaultPort: 4747,
      ...(pingIntervalMs === undefined ? {} : { pingIntervalMs }),
      extension,
    });
    this.server = this.files.server;

    const resolvedRoot = realpath(root);
    this.ready = Promise.all([this.files.ready, resolvedRoot]).then(async ([, canonicalRoot]) => {
      this.root = canonicalRoot;
      const bodyFormat = this.bodyFormat;
      this.index = new VaultIndex(
        canonicalRoot,
        undefined,
        this.linkFormat,
        typeof bodyFormat === "function" ? bodyFormat : (): BodyFormat => bodyFormat,
      );
      this.resolveIndex();
      await this.bootstrap(canonicalRoot, this.index);
      await this.drainBootstrapChanges();
      this.bootstrapComplete = true;
      this.bootstrapPathGenerations.clear();
    });
    void this.ready.catch(() => {});

    // FileServer deliberately validates methods and OPTIONS before invoking an
    // extension hook. This thin mount wrapper makes the vault's additional
    // index readiness gate apply to those requests too, without copying the
    // base router or any of its resource dispatch.
    this.app = express();
    this.app.disable("x-powered-by");
    this.app.use(async (request: Request, response: Response, next: NextFunction) => {
      try { await this.ready; }
      catch (error) {
        // A base readiness failure is still best mapped by FileServer itself.
        // Only vault-index bootstrap failures need the local error boundary.
        try { await this.files.ready; }
        catch { this.files.app(request, response, next); return; }
        sendReadinessError(request, response, error);
        return;
      }
      this.files.app(request, response, next);
    });
  }

  /** The URL currently bound, or undefined before listening and after closing. */
  get url(): string | undefined { return this.files.url; }

  /** The port currently bound, including an operating-system-selected port. */
  get port(): number | undefined { return this.files.port; }

  /** Every visible regular-file disk path currently held by the live index. */
  get paths(): Iterable<string> { return this.pathView; }

  /** Replace runtime formatting settings, rebuilding data derived from bodies synchronously. */
  configure(options: { linkFormat?: LinkFormat; bodyFormat?: BodyFormat | ((path: string) => BodyFormat) }): void {
    rejectUnknownOptions(options, ["linkFormat", "bodyFormat"]);
    if (options.linkFormat !== undefined) this.linkFormat = options.linkFormat;
    if (options.bodyFormat !== undefined) this.bodyFormat = options.bodyFormat;
    this.index?.configure(options);
  }

  /** Start accepting connections after the base watcher and record index are ready. */
  async listen(options: ListenOptions = {}): Promise<this> {
    await this.ready;
    await this.files.listen(options);
    return this;
  }

  /** Release the embedded file server resources. */
  close(): Promise<void> { return this.files.close(); }

  /** Delegate a mount-relative WebSocket upgrade after the record index is ready. */
  async handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    requestTarget = request.url ?? "",
  ): Promise<void> {
    try { await this.ready; }
    catch (error) {
      try { await this.files.ready; }
      catch { await this.files.handleUpgrade(request, socket, head, requestTarget); return; }
      await sendUpgradeReadinessError(socket, error);
      return;
    }
    await this.files.handleUpgrade(request, socket, head, requestTarget);
  }

  private async bootstrap(root: string, index: VaultIndex): Promise<void> {
    await this.refreshTree(root, index);
  }

  private async refreshTree(root: string, index: VaultIndex): Promise<void> {
    const walk = async (directory: string): Promise<void> => {
      let entries: Dirent<Buffer>[];
      try { entries = await readdir(directory, { withFileTypes: true, encoding: "buffer" }); }
      catch (error) { if (isMissing(error)) return; throw error; }
      for (const entry of entries) {
        const name = decodeDirectoryName(entry.name);
        if (name === undefined || name.startsWith(".") || name.includes("\\")) continue;
        const path = join(directory, name);
        const diskPath = index.pathFor(path);
        const generation = this.bootstrapGenerationFor(diskPath);
        let current: Stats;
        try { current = await lstat(path); }
        catch (error) { if (isMissing(error)) continue; throw error; }
        if (this.bootstrapGenerationFor(diskPath) !== generation) continue;
        if (current.isDirectory()) {
          this.directories.add(diskPath);
          await walk(path);
        }
        else if (current.isFile()) {
          if (name.endsWith(".md")) await index.refresh(path);
          else index.add(path);
        }
      }
    };
    await walk(root);
  }

  private bootstrapGenerationFor(path: string): number {
    let generation = 0;
    let prefix = "";
    for (const segment of path.split("/")) {
      prefix = prefix === "" ? segment : `${prefix}/${segment}`;
      generation = Math.max(generation, this.bootstrapPathGenerations.get(prefix) ?? 0);
    }
    return generation;
  }

  private async drainBootstrapChanges(): Promise<void> {
    const deadline = Date.now() + bootstrapQuietLimitMs;
    while (true) {
      while (this.activeChanges.size > 0) await Promise.all([...this.activeChanges]);
      const observedGeneration = this.changeGeneration;
      const quietMs = Math.min(bootstrapQuietMs, Math.max(0, deadline - Date.now()));
      if (quietMs === 0) return;
      await new Promise((resolve) => setTimeout(resolve, quietMs));
      if (this.activeChanges.size === 0 && this.changeGeneration === observedGeneration) return;
      if (Date.now() >= deadline) {
        while (this.activeChanges.size > 0) await Promise.all([...this.activeChanges]);
        return;
      }
    }
  }

  private async handle(request: Request, response: Response, context: FileServerExtensionContext): Promise<boolean> {
    await this.ready;
    const index = this.index as VaultIndex;
    const root = this.root as string;

    try {
      if (request.method === "DELETE") {
        if (context.trailingSlash) {
          if (context.resource.type === "dir") this.directories.add(context.path);
          return false;
        }
        if (context.resource.type === "file") return false;
        const sourcePath = `${context.path}.md`;
        if ((await context.inspect(sourcePath)).type !== "file") {
          if (context.resource.type === "dir") this.directories.add(context.path);
          return false;
        }
        await context.remove(sourcePath);
        response.status(204).end();
        return true;
      }

      const recordMutation = (request.method === "PUT" || request.method === "PATCH")
        && isRecordContentType(request.get("Content-Type"))
        && !context.trailingSlash
        && !context.path.endsWith(".md");
      if (recordMutation) {
        if (context.resource.type === "file") {
          sendError(request, response, 409, "literal file occupies record URL");
          return true;
        }
        await this.mutateRecord(request, response, context, root, index);
        return true;
      }

      if (request.method !== "GET" && request.method !== "HEAD") return false;
      if (!context.trailingSlash && context.resource.type !== "file") {
        const sourcePath = `${context.path}.md`;
        if ((await context.inspect(sourcePath)).type === "file") {
          try { sendRecord(request, response, 200, index.read(join(root, ...sourcePath.split("/")))); }
          catch (error) {
            if (error instanceof InvalidUtf8Error) sendError(request, response, 422, error.message);
            else throw error;
          }
          return true;
        }
      }

      return false;
    } catch (error) {
      if (error instanceof InvalidReferenceError) { sendError(request, response, 400, error.message); return true; }
      if (error instanceof ValidationError) { sendError(request, response, 422, error.message); return true; }
      if (error instanceof InvalidUtf8Error) { sendError(request, response, 422, error.message); return true; }
      throw error;
    }
  }

  private async mutateRecord(
    request: Request,
    response: Response,
    context: FileServerExtensionContext,
    root: string,
    index: VaultIndex,
  ): Promise<void> {
    const document = await readRecordDocument(request, this.maximumJsonBytes, response);
    if (document === undefined) return;
    if (Object.hasOwn(document, "fields") && !isObject(document.fields)) {
      sendError(request, response, 400, "fields must be an object");
      return;
    }
    if (Object.hasOwn(document, "body") && document.body !== null && typeof document.body !== "string") {
      sendError(request, response, 400, "body must be a string or null");
      return;
    }

    const sourcePath = `${context.path}.md`;
    const source = await context.inspect(sourcePath);
    if (source.type === "dir") {
      sendError(request, response, 409, "cannot replace a directory");
      return;
    }
    const exists = source.type === "file";
    const absolutePath = join(root, ...sourcePath.split("/"));
    const linkingPath = sourcePath;

    if (request.method === "PUT") {
      let previous: RecordContent | undefined;
      if (exists) {
        try { previous = await readRawRecord(absolutePath); }
        catch (error) { if (!(error instanceof InvalidUtf8Error)) throw error; }
      }
      const fields = storedFields((document.fields ?? {}) as Fields, previous?.fields, index, linkingPath);
      const body = typeof document.body === "string"
        ? storedBody(document.body, previous?.body, index, linkingPath)
        : undefined;
      const record: RecordContent = { fields, ...(body === undefined ? {} : { body }) };
      await this.approve(context.path, record);
      const bytes = Buffer.from(await serializeNote(absolutePath, record));
      const result = await context.replace(sourcePath, bytes);
      sendRecord(request, response, result === "created" ? 201 : 200, index.read(absolutePath));
      return;
    }

    if (!exists) {
      sendError(request, response, 404, "record not found");
      return;
    }
    const current = index.read(absolutePath);
    const fieldPatch = document.fields as Fields | undefined;
    const bodyTouched = Object.hasOwn(document, "body");
    if ((fieldPatch === undefined || Object.keys(fieldPatch).length === 0) && !bodyTouched) {
      sendRecord(request, response, 200, current);
      return;
    }
    const previous = await readRawRecord(absolutePath);
    const fields = fieldPatch === undefined
      ? previous.fields
      : storedFields(mergeFields(current.fields, fieldPatch), previous.fields, index, linkingPath, fieldPatch);
    const body = bodyTouched
      ? typeof document.body === "string"
        ? storedBody(document.body, previous.body, index, linkingPath)
        : undefined
      : previous.body;
    const record: RecordContent = { fields, ...(body === undefined ? {} : { body }) };
    await this.approve(context.path, record);
    const bytes = Buffer.from(await serializeNote(
      absolutePath,
      record,
      fieldPatch ?? {},
      bodyTouched,
      previous.rawBody,
    ));
    await context.replace(sourcePath, bytes);
    sendRecord(request, response, 200, index.read(absolutePath));
  }

  private async approve(path: string, record: RecordContent): Promise<void> {
    if (this.validate === undefined) return;
    try { await this.validate({ path, ...record }); }
    catch (error) { throw new ValidationError(error instanceof Error ? error.message : String(error)); }
  }

  private change(event: FileChangeEvent): Promise<FileChangeEvent | null> {
    this.changeGeneration += 1;
    if (!this.bootstrapComplete) this.bootstrapPathGenerations.set(event.path, this.changeGeneration);
    const previous = this.changesByPath.get(event.path);
    const change = (previous === undefined ? Promise.resolve() : previous.then(() => undefined, () => undefined))
      .then(() => this.refreshChange(event));
    this.changesByPath.set(event.path, change);
    this.activeChanges.add(change);
    const cleanup = (): void => {
      this.activeChanges.delete(change);
      if (this.changesByPath.get(event.path) === change) this.changesByPath.delete(event.path);
    };
    void change.then(cleanup, cleanup);
    return change;
  }

  private async refreshChange(event: FileChangeEvent): Promise<FileChangeEvent | null> {
    await this.indexAvailable;
    const index = this.index as VaultIndex;
    const root = this.root as string;
    const absolutePath = join(root, ...event.path.split("/"));
    try {
      let current: Stats | undefined;
      try { current = await lstat(absolutePath); }
      catch (error) {
        if (!isMissing(error)) throw error;
        const wasDirectory = this.directories.has(event.path) || index.hasDescendant(event.path);
        this.forgetDirectoryTree(event.path);
        index.deleteTree(absolutePath);
        if (wasDirectory) return event;
      }
      if (current?.isDirectory()) {
        this.forgetDirectoryTree(event.path);
        this.directories.add(event.path);
        index.deleteTree(absolutePath);
        await this.refreshTree(absolutePath, index);
        return event;
      }
      if (current?.isFile()) {
        const replacedDirectory = this.directories.has(event.path) || index.hasDescendant(event.path);
        this.forgetDirectoryTree(event.path);
        if (replacedDirectory) index.deleteTree(absolutePath);
        if (event.path.endsWith(".md")) await index.refresh(absolutePath);
        else index.add(absolutePath);
        for (let separator = event.path.lastIndexOf("/"); separator >= 0; separator = event.path.lastIndexOf("/", separator - 1)) {
          this.directories.add(event.path.slice(0, separator));
        }
      }
    } catch (error) {
      if (isDirectoryRead(error)) {
        this.directories.add(event.path);
        index.delete(absolutePath);
        return event;
      }
      if (isMissing(error)) index.deleteTree(absolutePath);
      else {
        console.error("vault-server index refresh error", error);
        // A cache failure must not erase the base protocol's dirty signal.
        // Publishing the literal event lets clients refetch and preserves the
        // extension seam's fail-open guarantee for change hooks.
        return event;
      }
    }

    if (!event.path.endsWith(".md")) return event;
    const recordPath = event.path.slice(0, -3);
    try {
      const exact = await lstat(join(root, ...recordPath.split("/")));
      if (exact.isFile()) return event;
    } catch (error) {
      if (!isMissing(error)) console.error("vault-server shadow inspection error", error);
    }
    return { ...event, path: recordPath };
  }

  private forgetDirectoryTree(path: string): void {
    const prefix = `${path}/`;
    for (const directory of this.directories) {
      if (directory === path || directory.startsWith(prefix)) this.directories.delete(directory);
    }
  }
}

function decorateListing(
  listing: DirectoryListing,
  index: VaultIndex,
): DirectoryListing {
  const exactFiles = new Set(listing.entries.filter(({ type }) => type === "file").map(({ name }) => name));
  const entries = listing.entries.map((entry): DirectoryEntry => {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) return entry;
    const name = entry.name.slice(0, -3);
    if (exactFiles.has(name)) return entry;
    const diskPath = listing.path === "" ? entry.name : `${listing.path}/${entry.name}`;
    const record = index.listingEntry(diskPath);
    if (record === undefined) return entry;
    return {
      name,
      type: "record",
      modified: record.updated,
      fields: record.fields,
      ...(record.body === undefined ? {} : { body: record.body }),
      ...(record.error === undefined ? {} : { error: record.error }),
    } as unknown as DirectoryEntry;
  });
  entries.sort(compareDirectoryEntries);
  return { path: listing.path, entries };
}

function compareDirectoryEntries(left: DirectoryEntry, right: DirectoryEntry): number {
  return left.name < right.name ? -1
    : left.name > right.name ? 1
    : left.type < right.type ? -1
    : left.type > right.type ? 1
    : 0;
}

async function readRecordDocument(
  request: Request,
  maximumBytes: number,
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && Number(declaredLength) > maximumBytes) {
    rejectOversizedBody(request, response);
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > maximumBytes) {
      rejectOversizedBody(request, response);
      return undefined;
    }
    chunks.push(chunk);
  }
  let value: unknown;
  try { value = JSON.parse(utf8Decoder.decode(Buffer.concat(chunks, size))); }
  catch { sendError(request, response, 400, "malformed JSON"); return undefined; }
  if (!isObject(value)) { sendError(request, response, 400, "body must be an object"); return undefined; }
  return value;
}

function rejectOversizedBody(request: Request, response: Response): void {
  request.pause();
  response.shouldKeepAlive = false;
  response.set("Connection", "close");
  response.once("finish", () => setImmediate(() => request.destroy()));
  sendError(request, response, 413, "request body is too large");
}

function sendRecord(request: Request, response: Response, status: number, value: unknown): void {
  sendSerialized(request, response, status, value, recordResponseContentType);
}

function sendSerialized(request: Request, response: Response, status: number, value: unknown, contentType: string): void {
  const body = Buffer.from(JSON.stringify(value));
  response.set({ "Content-Type": contentType, "Content-Length": String(body.length) });
  response.status(status);
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

function sendError(request: Request, response: Response, status: number, message: string): void {
  sendSerialized(request, response, status, { error: message }, jsonContentType);
}

function sendReadinessError(request: Request, response: Response, error: unknown): void {
  const { status, message } = mapReadinessError(error);
  response.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": exposedResponseHeaders,
  });
  sendError(request, response, status, message);
}

async function sendUpgradeReadinessError(socket: Duplex, error: unknown): Promise<void> {
  if (socket.closed) return;
  const { status, message } = mapReadinessError(error);
  const body = Buffer.from(JSON.stringify({ error: message }));
  const response = Buffer.from([
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? "Error"}`,
    `Content-Type: ${jsonContentType}`,
    `Content-Length: ${body.length}`,
    "Connection: close",
    "",
    "",
  ].join("\r\n"));
  await new Promise<void>((resolve) => {
    let settled = false;
    const close = (): void => {
      if (settled) return;
      settled = true;
      socket.removeListener("finish", finish);
      socket.removeListener("close", close);
      socket.removeListener("error", fail);
      resolve();
    };
    const finish = (): void => { socket.destroy(); };
    const fail = (): void => { socket.destroy(); };
    socket.once("finish", finish);
    socket.once("close", close);
    socket.once("error", fail);
    if (!socket.destroyed) socket.end(Buffer.concat([response, body]));
    if (socket.closed) close();
    else if (socket.writableFinished) finish();
  });
}

function mapReadinessError(error: unknown): { status: number; message: string } {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "ENOENT" || code === "ENOTDIR") return { status: 404, message: "not found" };
  if (code === "EACCES" || code === "EPERM") return { status: 403, message: "forbidden" };
  return { status: 500, message: "internal server error" };
}

function isRecordContentType(contentType: string | undefined): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === recordContentType;
}

function parseByteLimit(limit: string | number): number {
  if (typeof limit === "number") {
    if (!Number.isFinite(limit) || limit < 0) throw new Error("jsonLimit must be a non-negative byte count");
    return Math.floor(limit);
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(limit);
  if (match === null) throw new Error("jsonLimit must be a byte count such as 32mb");
  const units: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Math.floor(Number(match[1]) * units[(match[2] ?? "b").toLowerCase()]!);
}

function decodeDirectoryName(name: Buffer): string | undefined {
  try { return utf8Decoder.decode(name); }
  catch { return undefined; }
}

function rejectUnknownOptions(options: object, knownOptions: readonly string[]): void {
  const unknownOption = Object.keys(options).find((key) => !knownOptions.includes(key));
  if (unknownOption) throw new Error(`unknown VaultServer option "${unknownOption}"`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error
    && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isDirectoryRead(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "EISDIR";
}
