/** Image lifecycle and nontext placeholders for the file pane. */
import { h } from "./dom";

/** A decoded image source, either a page URL or bytes owned by this view. */
export type ImageSource = { src: string } | { blob: Blob };

/** Render an image and revoke only URLs this view created. */
export class ImageView {
  readonly element = h("div", { className: "cv-media-image" });
  private objectUrl: string | null = null;
  private image: HTMLImageElement;

  constructor(source: ImageSource) {
    this.image = h("img", { alt: "" });
    this.image.src = "src" in source ? source.src : this.objectUrl = URL.createObjectURL(source.blob);
    this.element.append(this.image);
  }

  /** Free an object URL after the image body is replaced. */
  destroy(): void {
    this.image.removeAttribute("src");
    this.element.replaceChildren();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}

/** Name and size a file that cannot be presented as text or an image. */
export function binaryBody(name: string, size?: number): HTMLElement {
  return h("div", { className: "cv-binary-body" },
    h("strong", { text: name }),
    size === undefined ? null : h("span", { text: formatSize(size) }),
    h("span", { text: "Binary file not shown" }));
}

/** Offer an explicit read for a body larger than the normal limit. */
export function largeBody(size: number, onShow: () => void): HTMLElement {
  return h("div", { className: "cv-large-body cv-pane-empty" },
    h("strong", { text: `File too large · ${formatSize(size)}` }),
    h("button", { className: "cv-button cv-large-action", type: "button", text: "Show anyway", onclick: onShow }));
}

/** Format a byte count for binary and large-file placeholders. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
