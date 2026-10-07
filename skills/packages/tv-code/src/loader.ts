/** Connection access: deduplicated reads/listings, refresh rounds and finder discovery. */
import { decodeRead, maximumBytes, readFailure, type DecodedRead } from "./input";
import { parentPath } from "./paths";
import { TreeModel } from "./tree-model";
import type { Connection, ReadResult } from "./types";
import { fileKind } from "./languages";

/** Calls a connection and applies responses only while they still belong to this input. */
export class Loader {
  private connection: Connection | null = null;
  private generation = 0;
  private openFile: string | null = null;
  private openEpoch = 0;
  private lists = new Map<string, Promise<void>>();
  private forcedLists = new Map<string, Promise<void>>();
  private reads = new Map<string, { pending: Promise<ReadResult>; openEpoch: number }>();
  private refreshPaths = new Set<string>();
  private refreshAll = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshing = false;
  /** True while a coalesced refresh is applying listings and reads. */
  get isRefreshing(): boolean { return this.refreshing; }
  /** Called after a refresh read of the current open file. */
  onRefreshRead?: (path: string, result: DecodedRead) => void;
  /** Called after a refresh round has applied its folder listings. */
  onRefreshComplete?: (paths: string[], all: boolean) => void;

  constructor(private model: TreeModel, private onChange: () => void) {}

  /** Replace the active connection and invalidate all outstanding results. */
  setConnection(connection: Connection | null): void {
    this.generation++;
    this.connection = connection;
    this.lists.clear();
    this.forcedLists.clear();
    this.reads.clear();
    this.refreshPaths.clear();
    this.refreshAll = false;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.refreshing = false;
    this.model.reset();
    this.onChange();
  }

  /** Tell the loader which file may receive a read response. */
  setOpenFile(path: string | null): void {
    if (path !== this.openFile) {
      this.openFile = path;
      this.openEpoch++;
    }
  }

  /** List a folder once unless forced; await a newer listing queued before the current one finishes. */
  list(path: string, force = false): Promise<void> {
    const existing = this.lists.get(path);
    if (existing) {
      if (!force) return existing.then(() => this.forcedLists.get(path) ?? undefined);
      const queued = this.forcedLists.get(path);
      if (queued) return queued;
      const generation = this.generation;
      const next = existing.then(() => generation === this.generation ? this.list(path, true) : undefined);
      this.forcedLists.set(path, next);
      void next.finally(() => { if (this.forcedLists.get(path) === next) this.forcedLists.delete(path); }).catch(() => undefined);
      return next;
    }
    const folder = this.model.get(path);
    if (!this.connection?.list || !folder || folder.type !== "folder") return Promise.resolve();
    if (!force && folder.listing === "listed") return Promise.resolve();
    const generation = this.generation;
    const listedFolder = folder;
    if (!force || folder.listing !== "listed") this.model.setListing(path, "listing");
    this.onChange();
    const list = this.connection.list;
    const pending = Promise.resolve().then(() => list(path)).then(entries => {
      if (this.generation !== generation || this.model.get(path) !== listedFolder) return;
      this.model.applyListing(path, entries);
      this.onChange();
    }, error => {
      if (this.generation !== generation || this.model.get(path) !== listedFolder) return;
      this.model.setListing(path, "failed", readFailure(error).message);
      this.onChange();
    }).finally(() => { if (this.lists.get(path) === pending) this.lists.delete(path); });
    this.lists.set(path, pending);
    return force ? pending : pending.then(() => this.forcedLists.get(path) ?? undefined);
  }

  /** Read a file at most once concurrently; stale open-file responses are ignored. */
  async read(path: string, wanted: "text" | "bytes" = "text", showAnyway = false, force = false): Promise<DecodedRead | null> {
    const connection = this.connection;
    if (!connection) return null;
    const size = this.model.get(path)?.size;
    if (!showAnyway && size !== undefined && size > maximumBytes) return { kind: "large", size };
    const generation = this.generation;
    const openEpoch = this.openEpoch;
    const wasOpen = path === this.openFile;
    let request = this.reads.get(path);
    if (request && (request.openEpoch !== openEpoch || force)) {
      // The prior request cannot be canceled, and a second read of this path
      // would break the one-in-flight limit. Wait, then fetch a fresh version.
      await request.pending.catch(() => undefined);
      if (generation !== this.generation || (wasOpen && openEpoch !== this.openEpoch)) return null;
      return this.read(path, wanted, showAnyway);
    }
    if (!request) {
      const pending = Promise.resolve().then(() => connection.read(path));
      request = { pending, openEpoch };
      this.reads.set(path, request);
      const currentRequest = request;
      void pending.finally(() => { if (this.reads.get(path) === currentRequest) this.reads.delete(path); }).catch(() => undefined);
    }
    try {
      const result = await request.pending;
      if (generation !== this.generation || (wasOpen && openEpoch !== this.openEpoch)) return null;
      // A single in-flight Response may have multiple readers. Each gets a
      // clone because consuming its body is a one-shot operation.
      const decoded = await decodeRead(result instanceof Response ? result.clone() : result, wanted, this.model.get(path)?.size, showAnyway);
      return generation === this.generation && (!wasOpen || openEpoch === this.openEpoch) ? decoded : null;
    } catch (error) {
      if (generation !== this.generation || (wasOpen && openEpoch !== this.openEpoch)) return null;
      return readFailure(error);
    }
  }

  /** Queue a coalesced 100 ms refresh, with a further round after in-flight work. */
  refresh(path?: string): void {
    if (!this.connection) return;
    if (path === undefined) this.refreshAll = true;
    else this.refreshPaths.add(path);
    if (!this.refreshing) {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        void this.runRefresh();
      }, 100);
    }
  }

  private async runRefresh(): Promise<void> {
    if (this.refreshing || !this.connection) return;
    const generation = this.generation;
    this.refreshing = true;
    try {
      do {
        if (generation !== this.generation) return;
        const all = this.refreshAll;
        const paths = [...this.refreshPaths];
        this.refreshAll = false;
        this.refreshPaths.clear();
        const listed = new Set<string>();
        let readOpen = all;
        const missingOpen = !!this.openFile && !this.model.get(this.openFile);
        if (all && this.connection.list) {
          for (const node of this.model.values()) {
            if (node.type === "folder" && node.listing !== "unlisted") listed.add(node.path);
          }
        } else {
          for (const path of paths) {
            if (this.connection.list) {
              let folder = parentPath(path);
              while (folder && this.model.get(folder)?.type !== "folder") folder = parentPath(folder);
              const folderNode = this.model.get(folder);
              if (folderNode?.type === "folder" && ["listing", "listed", "failed"].includes(folderNode.listing)) listed.add(folder);
              if (this.model.get(path)?.type === "folder" && ["listing", "listed", "failed"].includes(this.model.get(path)?.listing ?? "")) listed.add(path);
            }
            if (path === this.openFile) readOpen = true;
          }
        }
        // Parent listings are applied first so removed children cannot be queried.
        for (const folder of [...listed].sort((a, b) => a.split("/").length - b.split("/").length)) {
          if (generation !== this.generation) return;
          if (folder && this.model.get(parentPath(folder))?.children.has(folder) !== true) continue;
          if (this.model.get(folder)?.type === "folder") await this.list(folder, true);
        }
        if (generation !== this.generation) return;
        const path = this.openFile;
        if (missingOpen && path && this.model.get(path)?.type === "file") readOpen = true;
        if (readOpen && path && this.model.get(path)?.type === "file") {
          const kind = fileKind(path);
          const result = kind === "image" && this.model.get(path)?.src ? { kind: "binary" } as DecodedRead :
            await this.read(path, kind === "image" ? "bytes" : "text", false, true);
          if (result && generation === this.generation && this.openFile === path) this.onRefreshRead?.(path, result);
        }
        if (generation === this.generation) this.onRefreshComplete?.(paths, all);
      } while (generation === this.generation && (this.refreshAll || this.refreshPaths.size > 0));
    } finally { if (generation === this.generation) this.refreshing = false; }
  }

  /** Discover every non-dimmed unlisted folder, with at most four requests running. */
  async listAllUndimmed(onPending: (count: number) => void): Promise<void> {
    const generation = this.generation;
    const active = new Set<Promise<void>>();
    const attempted = new Set<string>();
    while (this.connection && generation === this.generation) {
      const candidates = [...this.model.values()].filter(node => node.type === "folder" && node.listing === "unlisted" && !this.model.isDimmed(node.path) && !attempted.has(node.path));
      onPending(candidates.length + active.size);
      for (const node of candidates.slice(0, Math.max(0, 4 - active.size))) {
        attempted.add(node.path);
        const request = this.list(node.path).finally(() => active.delete(request));
        active.add(request);
      }
      if (!active.size) break;
      await Promise.race(active);
    }
    if (generation === this.generation) onPending(0);
  }
}
