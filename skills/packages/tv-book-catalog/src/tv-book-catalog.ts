/** Dependency-free book views. The page owns data, history and focus; these elements only render and report requests. */

/** A page-adapted record. Identifiers are stable data, never markup or selectors. */
export interface Book {
  readonly id: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly cover?: string;
  /** Required, non-empty plain text. The page validates source records before assignment. */
  readonly description: string;
  readonly publicationDate?: string;
  readonly pageCount?: number;
  readonly genre?: string;
  readonly rating?: string;
  readonly sourceUrl?: string;
}

/** Non-ready states hide retained input until the page sets ready again. */
export type BookStatus = 'ready' | 'loading' | 'error';

/** Shared synchronous rendering and announcement lifecycle for the two views. */
abstract class BookViewElement extends HTMLElement {
  #status: BookStatus = 'ready';
  #message: string | null | undefined;
  #region: HTMLDivElement | undefined;
  #statusAnnouncement: HTMLParagraphElement | undefined;
  #alertAnnouncement: HTMLParagraphElement | undefined;

  /** The presentation state, initially ready. Assigning it renders immediately. */
  get status(): BookStatus { return this.#status; }
  set status(value: BookStatus) {
    this.#status = value;
    this.renderView();
  }

  /** Plain text for an empty, loading or error state; blank values use the default. */
  get message(): string | null | undefined { return this.#message; }
  set message(value: string | null | undefined) {
    this.#message = value;
    this.renderView();
  }

  connectedCallback(): void {
    if (!this.#region || this.#region.parentNode !== this) this.renderView();
  }

  protected abstract populatedContent(): HTMLElement | null;
  protected abstract stateMessage(): string;

  protected renderView(): void {
    if (!this.#region) {
      this.#region = node('div', 'bc-content');
      this.#statusAnnouncement = node('p', 'bc-message');
      this.#statusAnnouncement.setAttribute('role', 'status');
      this.#alertAnnouncement = node('p', 'bc-message');
      this.#alertAnnouncement.setAttribute('role', 'alert');
    }
    // Establish empty live regions before changing their text. Keep them outside
    // busy content so loading announcements are not deferred until loading ends.
    const expected = [this.#region, this.#statusAnnouncement!, this.#alertAnnouncement!];
    if (this.childNodes.length !== expected.length || expected.some((child, index) => this.childNodes[index] !== child)) {
      this.replaceChildren(...expected);
    }
    if (this.#status === 'loading') this.#region.setAttribute('aria-busy', 'true');
    else this.#region.removeAttribute('aria-busy');

    const content = this.#status === 'ready' ? this.populatedContent() : null;
    if (content) this.#region.replaceChildren(content);
    else this.#region.replaceChildren();
    const message = content ? '' : suppliedText(this.#message) ?? this.stateMessage();
    const statusText = this.#status === 'error' ? '' : message;
    const alertText = this.#status === 'error' ? message : '';
    // Repeated property assignments still render, but unchanged live-region text
    // must not be mutated: that could repeat an announcement.
    if (this.#statusAnnouncement!.textContent !== statusText) this.#statusAnnouncement!.textContent = statusText;
    if (this.#alertAnnouncement!.textContent !== alertText) this.#alertAnnouncement!.textContent = alertText;
    this.dispatchEvent(new Event('render'));
  }
}

/** A semantic list of book cards. Each native button requests page-owned navigation. */
export class TvBookCatalogElement extends BookViewElement {
  #books: readonly Book[] | null | undefined;

  /** Current input in display order. Assignment renders; in-place mutation does not. */
  get books(): readonly Book[] | null | undefined { return this.#books; }
  set books(value: readonly Book[] | null | undefined) {
    this.#books = value;
    this.renderView();
  }

  protected stateMessage(): string {
    if (this.status === 'loading') return 'Loading books…';
    if (this.status === 'error') return 'Could not load books.';
    return 'No books to show.';
  }

  protected populatedContent(): HTMLElement | null {
    if (!this.#books?.length) return null;
    const list = node('ul', 'bc-grid');
    for (const book of this.#books) {
      const item = node('li', 'bc-card');
      const button = node('button', 'bc-activate');
      button.type = 'button';
      button.dataset.bookId = book.id;
      button.setAttribute('aria-label', `${book.title} — ${authorsOf(book)}`);
      button.append(coverOf(book), node('span', 'bc-title', book.title), node('span', 'bc-authors', authorsOf(book)),
        node('span', 'bc-description', book.description));
      for (const [label, value] of [['Genre', book.genre], ['Rating', book.rating]]) {
        if (suppliedText(value)) button.append(node('span', 'bc-caption', `${label}: ${value}`));
      }
      button.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('bookactivate', {
          bubbles: true, composed: true, detail: { id: book.id, book, trigger: button },
        }));
      });
      item.append(button);
      list.append(item);
    }
    return list;
  }
}

/** An inline full record view. The surrounding page supplies navigation. */
export class TvBookDetailElement extends BookViewElement {
  #book: Book | null | undefined;

  /** Current input record. Assignment renders or clears immediately. */
  get book(): Book | null | undefined { return this.#book; }
  set book(value: Book | null | undefined) {
    this.#book = value;
    this.renderView();
  }

  protected stateMessage(): string {
    if (this.status === 'loading') return 'Loading book…';
    if (this.status === 'error') return 'Could not load book.';
    return 'No book selected.';
  }

  protected populatedContent(): HTMLElement | null {
    const book = this.#book;
    if (!book) return null;
    const record = node('article', 'bc-record');
    const text = node('div', 'bc-record-text');
    const title = node('h2', 'bc-detail-title', book.title);
    title.tabIndex = -1;
    text.append(title, node('p', 'bc-authors', authorsOf(book)), node('p', 'bc-description', book.description));
    const metadata = node('dl', 'bc-metadata');
    const values: [string, string | number | undefined][] = [
      ['ID', book.id], ['Publication date', book.publicationDate], ['Page count', book.pageCount],
      ['Genre', book.genre], ['Rating', book.rating],
    ];
    for (const [label, value] of values) {
      if (typeof value === 'number' ? !Number.isInteger(value) || value < 0 : !suppliedText(value)) continue;
      const pair = node('div');
      pair.append(node('dt', '', label), node('dd', '', String(value)));
      metadata.append(pair);
    }
    const sourceUrl = safeUrl(book.sourceUrl);
    if (sourceUrl) {
      const pair = node('div');
      const value = node('dd');
      const link = node('a', 'bc-source', new URL(sourceUrl).host);
      link.href = sourceUrl;
      value.append(link);
      pair.append(node('dt', '', 'URL'), value);
      metadata.append(pair);
    }
    if (metadata.children.length) text.append(metadata);
    record.append(coverOf(book), text);
    return record;
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function suppliedText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function authorsOf(book: Book): string {
  return book.authors.length ? book.authors.join(', ') : 'Unknown author';
}

function safeUrl(value: string | undefined): string | null {
  const source = suppliedText(value);
  if (!source) return null;
  try {
    const url = new URL(source, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function coverOf(book: Book): HTMLDivElement {
  const cover = node('div', 'bc-cover');
  cover.setAttribute('aria-hidden', 'true');
  // Only a numeric hue derived by us becomes a style value. Record strings
  // always go through textContent, including on the generated cover.
  const hues = [212, 262, 330, 18, 38, 152, 190, 290];
  const hash = [...book.title].reduce((sum, character) => sum + character.codePointAt(0)!, 0);
  cover.style.setProperty('--_cover-hue', String(hues[hash % hues.length]));
  const fallback = (): void => {
    cover.replaceChildren(node('span', 'bc-cover-title', book.title), node('span', 'bc-cover-authors', authorsOf(book)));
  };
  const url = safeUrl(book.cover);
  if (!url) fallback();
  else {
    const image = node('img');
    image.alt = '';
    image.addEventListener('error', fallback, { once: true });
    image.src = url;
    cover.append(image);
  }
  return cover;
}

// Loading another copy does not redefine elements already registered by a page.
if (!customElements.get('tv-book-catalog')) customElements.define('tv-book-catalog', TvBookCatalogElement);
if (!customElements.get('tv-book-detail')) customElements.define('tv-book-detail', TvBookDetailElement);
