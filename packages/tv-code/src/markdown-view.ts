/** Rendered Markdown body: bundled element, fenced-code syntax and local images. */
import { TvMarkdownElement } from "tv-markdown";
import { highlightElement } from "./highlight";
import { decodeAddress, parentPath, resolvePath } from "./paths";
import type { ImageSource } from "./media-view";
import { detectLanguage } from "./languages";

/** A rendered document that owns its asynchronous highlights and object URLs. */
export class MarkdownView {
  readonly element: TvMarkdownElement;
  private controller = new AbortController();
  private imageUrls = new Map<HTMLImageElement, string>();
  private imageVersions = new WeakMap<HTMLImageElement, number>();
  private images = new Map<string, Set<HTMLImageElement>>();

  constructor(private path: string, text: string, private resolveImage: (path: string, force: boolean) => Promise<ImageSource | null>, private hasImage: (path: string, signal: AbortSignal) => boolean | Promise<boolean>) {
    // Keep the workspace package as a runtime import in the single-file build.
    // Its own registration guard handles a page that loaded tv-markdown first.
    if (!customElements.get("tv-markdown")) customElements.define("tv-markdown", TvMarkdownElement);
    this.element = document.createElement("tv-markdown") as TvMarkdownElement;
    this.element.classList.add("cv-markdown-view");
    this.element.setAttribute("show-frontmatter", "");
    this.update(text);
  }

  /** Update rendered content without moving the surrounding scroll container. */
  update(text: string): void {
    this.controller.abort();
    this.controller = new AbortController();
    this.revokeUrls();
    this.images.clear();
    const scroll = this.element.parentElement;
    const top = scroll?.scrollTop ?? 0;
    this.element.markdown = text;
    if (scroll) scroll.scrollTop = top;
    const signal = this.controller.signal;
    const sourceBlocks = codeBlocks(text);
    let nextBlock = 0;
    this.element.querySelectorAll<HTMLElement>("pre code").forEach(code => {
      // tv-markdown sanitizes authored classes, including Marked's language
      // class. Match every source code block in order, including unlabelled
      // indented blocks, so duplicate text cannot take a later fence's label.
      const renderedText = code.textContent?.replace(/\n+$/, "") ?? "";
      const match = sourceBlocks.findIndex((block, index) =>
        index >= nextBlock && block.text.replace(/\n+$/, "") === renderedText);
      if (match < 0) return;
      nextBlock = match + 1;
      const block = sourceBlocks[match];
      const language = block?.language;
      const id = language ? detectLanguage("", language)?.id : null;
      if (id) void highlightElement(code, id, signal).catch(error => {
        if (!signal.aborted) console.error("Markdown code highlighting failed", error);
      });
    });
    for (const image of this.element.querySelectorAll<HTMLImageElement>("img[src]")) {
      const address = image.getAttribute("src") ?? "";
      if (!address || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(address)) continue;
      const path = resolvePath(parentPath(this.path), decodeAddress(address.split(/[?#]/)[0]));
      const available = this.hasImage(path, signal);
      if (typeof available === "boolean") {
        if (!available) continue;
        this.registerImage(image, path);
        this.loadImage(image, path, false, signal, true);
        continue;
      }
      const version = (this.imageVersions.get(image) ?? 0) + 1;
      this.imageVersions.set(image, version);
      image.removeAttribute("src");
      void available.then(exists => {
        if (signal.aborted || version !== this.imageVersions.get(image)) return;
        if (!exists) { image.setAttribute("src", address); return; }
        this.registerImage(image, path);
        this.loadImage(image, path, false, signal, true);
      }).catch(() => {
        if (!signal.aborted && version === this.imageVersions.get(image)) image.setAttribute("src", address);
      });
    }
    for (const anchor of this.element.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = anchor.getAttribute("href") ?? "";
      if (/^(?:[a-z][a-z\d+.-]*:|\/|\/\/)/i.test(href)) {
        anchor.target = "_blank";
        anchor.rel = "noopener";
      }
    }
  }

  /** Whether a changed path supplies a local image in this document. */
  referencesImage(path: string): boolean { return this.images.has(path); }

  /** Refresh one referenced image after its folder listing has been applied. */
  reloadImage(path: string): void {
    for (const image of this.images.get(path) ?? []) this.loadImage(image, path, true, this.controller.signal);
  }

  private registerImage(image: HTMLImageElement, path: string): void {
    const group = this.images.get(path) ?? new Set<HTMLImageElement>();
    group.add(image);
    this.images.set(path, group);
  }

  private loadImage(image: HTMLImageElement, path: string, force: boolean, signal: AbortSignal, available: boolean | Promise<boolean> = this.hasImage(path, signal)): void {
    const version = (this.imageVersions.get(image) ?? 0) + 1;
    this.imageVersions.set(image, version);
    const previousUrl = this.imageUrls.get(image);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    this.imageUrls.delete(image);
    // Remove the unresolved relative address before the browser can fetch it.
    image.removeAttribute("src");
    void Promise.resolve(available).then(exists => exists ? this.resolveImage(path, force) : null).then(source => {
      if (signal.aborted || version !== this.imageVersions.get(image) || !source) return;
      if ("src" in source) image.src = source.src;
      else {
        const url = URL.createObjectURL(source.blob);
        this.imageUrls.set(image, url);
        image.src = url;
      }
    }).catch(() => { /* Keep the alt text when the file cannot be read. */ });
  }

  /** Release any generated image URLs and cancel obsolete highlighting. */
  destroy(): void {
    this.controller.abort();
    this.revokeUrls();
    this.element.remove();
  }

  private revokeUrls(): void {
    for (const url of this.imageUrls.values()) URL.revokeObjectURL(url);
    this.imageUrls.clear();
  }
}

function codeBlocks(source: string): Array<{ language: string | null; text: string }> {
  const result: Array<{ language: string | null; text: string }> = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const opening = /^( {0,3})(`{3,}|~{3,})([^\s`~]*)/.exec(lines[index]);
    if (opening) {
      const content: string[] = [];
      const indentation = opening[1].length;
      const marker = opening[2][0];
      const length = opening[2].length;
      const closing = new RegExp(`^ {0,3}${marker === "`" ? "`" : "~"}{${length},}\\s*$`);
      while (++index < lines.length && !closing.test(lines[index]))
        content.push(lines[index].replace(new RegExp(`^ {0,${indentation}}`), ""));
      result.push({ language: opening[3] || null, text: content.join("\n") });
      continue;
    }
    if (index > 0 && lines[index - 1].trim() !== "") continue;
    if (!/^(?: {4}|\t)/.test(lines[index])) continue;
    const content: string[] = [];
    while (index < lines.length) {
      if (/^(?: {4}|\t)/.test(lines[index])) content.push(lines[index].replace(/^(?: {4}|\t)/, ""));
      else if (lines[index].trim() === "") content.push("");
      else break;
      index++;
    }
    while (content.at(-1) === "") content.pop();
    result.push({ language: null, text: content.join("\n") });
    index--;
  }
  return result;
}
