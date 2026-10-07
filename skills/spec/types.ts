/** The small contract shared by element specifications. */
export type Option = string | number | boolean;
export type Options = Record<string, readonly [Option, ...Option[]]>;

/** A pure HTML renderer with ordered CSS and optional Storybook settings. */
export interface Template<Args> {
  options: Options;           // Select and boolean settings; first value is the default.
  style: readonly string[];   // Child styles precede the template's own CSS.
  render(args: Args): string; // Element HTML.
}

/** Join a style list into one stylesheet, keeping the first copy of any repeated CSS. */
export function stylesheet(style: readonly string[]): string {
  return [...new Set(style)].join('\n');
}
