/** Mutable path-indexed tree; connection listings replace their owned subtree only. */
import { baseName, parentPath } from "./paths";
import { normalizeEntries, type Entry } from "./input";
import type { EntryInput } from "./types";

/** A file or folder and its connection listing state. */
export interface TreeNode extends Entry {
  name: string;
  children: Set<string>;
  listing: "unlisted" | "listing" | "listed" | "failed";
  message?: string;
}

const defaultPatterns = ".* node_modules dist build out coverage target __pycache__ .venv venv vendor";
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The tree's stable nodes, order and dimming policy. */
export class TreeModel {
  private nodes = new Map<string, TreeNode>();
  private patterns: RegExp[] = [];
  private orderCache = new Map<string, TreeNode[]>();

  constructor() {
    this.setDimPatterns(null);
    this.reset();
  }

  /** Clear the tree while keeping its dim patterns. */
  reset(): void {
    this.nodes = new Map([["", { path: "", name: "", type: "folder", children: new Set(), listing: "unlisted" }]]);
    this.orderCache.clear();
  }

  /** Replace the entire set with already available entries. */
  replace(entries: EntryInput[]): void {
    this.reset();
    for (const entry of normalizeEntries(entries)) this.upsert(entry);
    for (const node of this.nodes.values()) if (node.type === "folder") node.listing = "listed";
  }

  /** Get a node by canonical path. */
  get(path: string): TreeNode | undefined { return this.nodes.get(path); }

  /** Get the direct children of a folder in file-tree order. */
  children(path: string): TreeNode[] {
    const cached = this.orderCache.get(path);
    if (cached) return cached;
    const result = [...(this.nodes.get(path)?.children ?? [])].flatMap(child => {
      const node = this.nodes.get(child);
      return node ? [node] : [];
    });
    result.sort((a, b) => Number(b.type === "folder") - Number(a.type === "folder") || collator.compare(a.name, b.name));
    this.orderCache.set(path, result);
    return result;
  }

  /** Iterate all currently known nodes. */
  values(): IterableIterator<TreeNode> { return this.nodes.values(); }

  /** Mark a folder's pending or failed listing while retaining its children. */
  setListing(path: string, state: TreeNode["listing"], message?: string): void {
    const node = this.nodes.get(path);
    if (!node || node.type !== "folder") return;
    node.listing = state;
    node.message = message;
  }

  /** Replace a direct listing, or the entire subtree when a deep path is present. */
  applyListing(folder: string, result: EntryInput[]): void {
    const entries = normalizeEntries(result, folder).filter(entry => entry.path.startsWith(folder ? `${folder}/` : "") && entry.path !== folder);
    const folderDepth = folder ? folder.split("/").length : 0;
    const wholeSubtree = entries.some(entry => entry.path.split("/").length > folderDepth + 1);
    if (wholeSubtree) {
      for (const child of [...(this.nodes.get(folder)?.children ?? [])]) this.removeSubtree(child);
      for (const entry of entries) this.upsert(entry);
      for (const node of this.nodes.values()) {
        if (node.type === "folder" && (node.path === folder || node.path.startsWith(`${folder}/`))) node.listing = "listed";
      }
    } else {
      const incoming = new Set(entries.map(entry => entry.path));
      for (const child of [...(this.nodes.get(folder)?.children ?? [])]) if (!incoming.has(child)) this.removeSubtree(child);
      for (const entry of entries) this.upsert(entry);
      this.setListing(folder, "listed");
    }
    this.orderCache.clear();
  }

  /** Set name patterns; null restores defaults and empty string disables them. */
  setDimPatterns(value: string | null): void {
    this.patterns = (value ?? defaultPatterns).split(/[\s,]+/).filter(Boolean).map(pattern => {
      const expression = pattern.split("*").map(part => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
      return new RegExp(`^${expression}$`);
    });
  }

  /** Explicit `dimmed` wins over inherited and pattern dimming. */
  isDimmed(path: string): boolean {
    const node = this.nodes.get(path);
    if (!node) return false;
    if (node.dimmed !== undefined) return node.dimmed;
    return this.patterns.some(pattern => pattern.test(node.name)) || (path !== "" && this.isDimmed(parentPath(path)));
  }

  private upsert(entry: Entry): void {
    const parent = parentPath(entry.path);
    if (parent && !this.nodes.has(parent)) this.upsert({ path: parent, type: "folder" });
    const old = this.nodes.get(entry.path);
    if (old?.type === "folder" && entry.type === "file") {
      for (const child of [...old.children]) this.removeSubtree(child);
    }
    const node: TreeNode = { ...entry, name: baseName(entry.path), children: old?.children ?? new Set(), listing: old?.listing ?? "unlisted" };
    if (entry.type === "file") node.listing = "listed";
    if (old?.message) node.message = old.message;
    this.nodes.set(entry.path, node);
    this.nodes.get(parent)?.children.add(entry.path);
    this.orderCache.delete(parent);
  }

  private removeSubtree(path: string): void {
    const node = this.nodes.get(path);
    if (!node) return;
    for (const child of node.children) this.removeSubtree(child);
    this.nodes.delete(path);
    this.nodes.get(parentPath(path))?.children.delete(path);
  }
}
