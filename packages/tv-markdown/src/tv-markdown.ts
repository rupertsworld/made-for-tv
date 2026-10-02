/** The light DOM custom element and its link activation event. */
import { normalizeInlineMarkdown, renderMarkdown } from './markdown';

/** A cancellable link activation that keeps the originating pointer or key modifiers. */
export class LinkClickEvent extends MouseEvent {
  readonly #href: string | null;
  readonly #wikilink: string | null;
  readonly #anchor: HTMLAnchorElement;

  constructor(anchor: HTMLAnchorElement, original: MouseEvent | KeyboardEvent) {
    super('linkclick', {
      bubbles: true,
      cancelable: true,
      button: original instanceof MouseEvent ? original.button : 0,
      clientX: original instanceof MouseEvent ? original.clientX : 0,
      clientY: original instanceof MouseEvent ? original.clientY : 0,
      screenX: original instanceof MouseEvent ? original.screenX : 0,
      screenY: original instanceof MouseEvent ? original.screenY : 0,
      metaKey: original.metaKey,
      ctrlKey: original.ctrlKey,
      shiftKey: original.shiftKey,
      altKey: original.altKey,
    });
    this.#href = anchor.getAttribute('href');
    this.#wikilink = anchor.getAttribute('data-wikilink');
    this.#anchor = anchor;
  }

  /** The link address as authored, or null for an addressless wikilink. */
  get href(): string | null { return this.#href; }

  /** The wikilink target as authored, or null for an ordinary link. */
  get wikilink(): string | null { return this.#wikilink; }

  /** The activated anchor. */
  get anchor(): HTMLAnchorElement { return this.#anchor; }
}

/** Render Markdown supplied as a property or a child text/markdown script. */
export class TvMarkdownElement extends HTMLElement {
  #source = '';
  #propertyAssigned = false;
  #waitingForParse = false;
  #renderedNodes: Node[] = [];

  constructor() {
    super();
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /** The current Markdown source; assigning it renders or clears the element. */
  get markdown(): string { return this.#source; }

  set markdown(value: string | null | undefined) {
    this.#propertyAssigned = true;
    this.#source = value == null ? '' : String(value);
    this.#render();
  }

  connectedCallback(): void {
    if (!this.#propertyAssigned) this.#readInlineScript();
    if (document.readyState === 'loading' && !this.#waitingForParse) {
      this.#waitingForParse = true;
      document.addEventListener('DOMContentLoaded', this.#onParsed, { once: true });
    }
  }

  disconnectedCallback(): void {
    document.removeEventListener('DOMContentLoaded', this.#onParsed);
    this.#waitingForParse = false;
  }

  #onParsed = (): void => {
    this.#waitingForParse = false;
    if (!this.isConnected) return;
    if (this.#propertyAssigned) {
      // The parser may append children after a property assignment. Replace
      // those children while avoiding an unnecessary second render event.
      const currentNodes = [...this.childNodes];
      if (currentNodes.length !== this.#renderedNodes.length ||
          currentNodes.some((node, index) => node !== this.#renderedNodes[index])) {
        this.#render();
      }
    } else {
      this.#readInlineScript();
    }
  };

  #readInlineScript(): void {
    const script = [...this.children].find(child =>
      child.localName === 'script' && (child as HTMLScriptElement).type.toLowerCase() === 'text/markdown');
    if (!script) return;
    this.#source = normalizeInlineMarkdown(script.textContent ?? '');
    this.#render();
  }

  #render(): void {
    if (this.#source) this.replaceChildren(renderMarkdown(this.#source));
    else this.replaceChildren();
    this.#renderedNodes = [...this.childNodes];
    this.dispatchEvent(new Event('render'));
  }

  #onClick = (original: MouseEvent): void => {
    if (original.button !== 0) return;
    const anchor = this.#anchorFrom(original.target);
    if (!anchor) return;
    const wikilink = anchor.hasAttribute('data-wikilink');
    const href = anchor.getAttribute('href');
    if (href?.startsWith('#') || (!wikilink && href === null)) return;
    if (!this.dispatchEvent(new LinkClickEvent(anchor, original))) original.preventDefault();
  };

  #onKeyDown = (original: KeyboardEvent): void => {
    if (original.key !== 'Enter') return;
    const anchor = this.#anchorFrom(original.target);
    if (!anchor?.hasAttribute('data-wikilink') || anchor.hasAttribute('href')) return;
    original.preventDefault();
    this.dispatchEvent(new LinkClickEvent(anchor, original));
  };

  #anchorFrom(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;
    const anchor = target.closest('a');
    return anchor instanceof HTMLAnchorElement && this.contains(anchor) ? anchor : null;
  }
}

// A page may load more than one copy, for example when another skill bundles this
// element; the first definition stays and later copies leave it in place.
if (!customElements.get('tv-markdown')) customElements.define('tv-markdown', TvMarkdownElement);
