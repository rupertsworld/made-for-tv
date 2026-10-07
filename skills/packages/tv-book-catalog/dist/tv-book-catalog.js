var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _status, _message, _region, _statusAnnouncement, _alertAnnouncement, _books, _book;
class BookViewElement extends HTMLElement {
  constructor() {
    super(...arguments);
    __privateAdd(this, _status, "ready");
    __privateAdd(this, _message);
    __privateAdd(this, _region);
    __privateAdd(this, _statusAnnouncement);
    __privateAdd(this, _alertAnnouncement);
  }
  /** The presentation state, initially ready. Assigning it renders immediately. */
  get status() {
    return __privateGet(this, _status);
  }
  set status(value) {
    __privateSet(this, _status, value);
    this.renderView();
  }
  /** Plain text for an empty, loading or error state; blank values use the default. */
  get message() {
    return __privateGet(this, _message);
  }
  set message(value) {
    __privateSet(this, _message, value);
    this.renderView();
  }
  connectedCallback() {
    if (!__privateGet(this, _region) || __privateGet(this, _region).parentNode !== this) this.renderView();
  }
  renderView() {
    if (!__privateGet(this, _region)) {
      __privateSet(this, _region, node("div", "bc-content"));
      __privateSet(this, _statusAnnouncement, node("p", "bc-message"));
      __privateGet(this, _statusAnnouncement).setAttribute("role", "status");
      __privateSet(this, _alertAnnouncement, node("p", "bc-message"));
      __privateGet(this, _alertAnnouncement).setAttribute("role", "alert");
    }
    const expected = [__privateGet(this, _region), __privateGet(this, _statusAnnouncement), __privateGet(this, _alertAnnouncement)];
    if (this.childNodes.length !== expected.length || expected.some((child, index) => this.childNodes[index] !== child)) {
      this.replaceChildren(...expected);
    }
    if (__privateGet(this, _status) === "loading") __privateGet(this, _region).setAttribute("aria-busy", "true");
    else __privateGet(this, _region).removeAttribute("aria-busy");
    const content = __privateGet(this, _status) === "ready" ? this.populatedContent() : null;
    if (content) __privateGet(this, _region).replaceChildren(content);
    else __privateGet(this, _region).replaceChildren();
    const message = content ? "" : suppliedText(__privateGet(this, _message)) ?? this.stateMessage();
    const statusText = __privateGet(this, _status) === "error" ? "" : message;
    const alertText = __privateGet(this, _status) === "error" ? message : "";
    if (__privateGet(this, _statusAnnouncement).textContent !== statusText) __privateGet(this, _statusAnnouncement).textContent = statusText;
    if (__privateGet(this, _alertAnnouncement).textContent !== alertText) __privateGet(this, _alertAnnouncement).textContent = alertText;
    this.dispatchEvent(new Event("render"));
  }
}
_status = new WeakMap();
_message = new WeakMap();
_region = new WeakMap();
_statusAnnouncement = new WeakMap();
_alertAnnouncement = new WeakMap();
class TvBookCatalogElement extends BookViewElement {
  constructor() {
    super(...arguments);
    __privateAdd(this, _books);
  }
  /** Current input in display order. Assignment renders; in-place mutation does not. */
  get books() {
    return __privateGet(this, _books);
  }
  set books(value) {
    __privateSet(this, _books, value);
    this.renderView();
  }
  stateMessage() {
    if (this.status === "loading") return "Loading books…";
    if (this.status === "error") return "Could not load books.";
    return "No books to show.";
  }
  populatedContent() {
    var _a;
    if (!((_a = __privateGet(this, _books)) == null ? void 0 : _a.length)) return null;
    const list = node("ul", "bc-grid");
    for (const book of __privateGet(this, _books)) {
      const item = node("li", "bc-card");
      const button = node("button", "bc-activate");
      button.type = "button";
      button.dataset.bookId = book.id;
      button.setAttribute("aria-label", `${book.title} — ${authorsOf(book)}`);
      button.append(
        coverOf(book),
        node("span", "bc-title", book.title),
        node("span", "bc-authors", authorsOf(book)),
        node("span", "bc-description", book.description)
      );
      for (const [label, value] of [["Genre", book.genre], ["Rating", book.rating]]) {
        if (suppliedText(value)) button.append(node("span", "bc-caption", `${label}: ${value}`));
      }
      button.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("bookactivate", {
          bubbles: true,
          composed: true,
          detail: { id: book.id, book, trigger: button }
        }));
      });
      item.append(button);
      list.append(item);
    }
    return list;
  }
}
_books = new WeakMap();
class TvBookDetailElement extends BookViewElement {
  constructor() {
    super(...arguments);
    __privateAdd(this, _book);
  }
  /** Current input record. Assignment renders or clears immediately. */
  get book() {
    return __privateGet(this, _book);
  }
  set book(value) {
    __privateSet(this, _book, value);
    this.renderView();
  }
  stateMessage() {
    if (this.status === "loading") return "Loading book…";
    if (this.status === "error") return "Could not load book.";
    return "No book selected.";
  }
  populatedContent() {
    const book = __privateGet(this, _book);
    if (!book) return null;
    const record = node("article", "bc-record");
    const text = node("div", "bc-record-text");
    const title = node("h2", "bc-detail-title", book.title);
    title.tabIndex = -1;
    text.append(title, node("p", "bc-authors", authorsOf(book)), node("p", "bc-description", book.description));
    const metadata = node("dl", "bc-metadata");
    const values = [
      ["ID", book.id],
      ["Publication date", book.publicationDate],
      ["Page count", book.pageCount],
      ["Genre", book.genre],
      ["Rating", book.rating]
    ];
    for (const [label, value] of values) {
      if (typeof value === "number" ? !Number.isInteger(value) || value < 0 : !suppliedText(value)) continue;
      const pair = node("div");
      pair.append(node("dt", "", label), node("dd", "", String(value)));
      metadata.append(pair);
    }
    const sourceUrl = safeUrl(book.sourceUrl);
    if (sourceUrl) {
      const pair = node("div");
      const value = node("dd");
      const link = node("a", "bc-source", new URL(sourceUrl).host);
      link.href = sourceUrl;
      value.append(link);
      pair.append(node("dt", "", "URL"), value);
      metadata.append(pair);
    }
    if (metadata.children.length) text.append(metadata);
    record.append(coverOf(book), text);
    return record;
  }
}
_book = new WeakMap();
function node(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== void 0) element.textContent = text;
  return element;
}
function suppliedText(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function authorsOf(book) {
  return book.authors.length ? book.authors.join(", ") : "Unknown author";
}
function safeUrl(value) {
  const source = suppliedText(value);
  if (!source) return null;
  try {
    const url = new URL(source, document.baseURI);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function coverOf(book) {
  const cover = node("div", "bc-cover");
  cover.setAttribute("aria-hidden", "true");
  const hues = [212, 262, 330, 18, 38, 152, 190, 290];
  const hash = [...book.title].reduce((sum, character) => sum + character.codePointAt(0), 0);
  cover.style.setProperty("--_cover-hue", String(hues[hash % hues.length]));
  const fallback = () => {
    cover.replaceChildren(node("span", "bc-cover-title", book.title), node("span", "bc-cover-authors", authorsOf(book)));
  };
  const url = safeUrl(book.cover);
  if (!url) fallback();
  else {
    const image = node("img");
    image.alt = "";
    image.addEventListener("error", fallback, { once: true });
    image.src = url;
    cover.append(image);
  }
  return cover;
}
if (!customElements.get("tv-book-catalog")) customElements.define("tv-book-catalog", TvBookCatalogElement);
if (!customElements.get("tv-book-detail")) customElements.define("tv-book-detail", TvBookDetailElement);
export {
  TvBookCatalogElement,
  TvBookDetailElement
};
