/** A small helper for building DOM elements, shared by every part of the viewer. */

/** Properties accepted by `h`: attributes, `className`, `text`, and `on<event>` listeners. */
export type Props = Record<string, string | number | boolean | null | undefined | EventListener>;

/** A child of `h`: a node, text, or nothing (skipped). */
export type Child = Node | string | null | undefined | false;

/**
 * Create an element with properties and children.
 *
 * - `className` sets the class attribute and `text` sets the text content.
 * - A key `on<event>` with a function adds that listener, such as `onclick`.
 * - `true` sets an empty attribute; `false`, `null` and `undefined` leave it unset.
 * - Any other value is set as an attribute with its string form.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (typeof value === "function") {
      element.addEventListener(key.slice(2), value);
    } else if (key === "className") {
      element.className = String(value);
    } else if (key === "text") {
      element.textContent = String(value);
    } else {
      element.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/** Parse a trusted SVG string from `icons.ts` into an element. */
export function svg(markup: string): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGSVGElement;
}
