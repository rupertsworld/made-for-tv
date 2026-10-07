/** Shared host, reset and text rules for book elements and parts. */
export const style = [`/* Shared light-DOM styling for the catalog and inline detail record. */
:where(tv-book-catalog, tv-book-detail) {
  --_text: var(--tv-book-catalog-text, var(--color-text, light-dark(#222222, #eeeeee)));
  --_muted: var(--tv-book-catalog-text-muted, var(--color-text-muted, light-dark(#595959, #bbbbbb)));
  --_link: var(--tv-book-catalog-link, var(--color-link, light-dark(#2459a6, #9bc4ff)));
  --_border: var(--tv-book-catalog-border, var(--color-border, light-dark(#cccccc, #595959)));
  --_surface: var(--tv-book-catalog-surface, var(--color-surface-muted, light-dark(#f2f2f2, #303030)));
  --_focus: var(--tv-book-catalog-focus, var(--outline-focus, 2px solid light-dark(#2459a6, #9bc4ff)));
  --_font: var(--tv-book-catalog-font, var(--font-sans, system-ui, sans-serif));
  --_size: var(--tv-book-catalog-text-size, var(--text-md, 16px));
  --_small: var(--tv-book-catalog-caption-size, var(--text-sm, 13px));
  --_heading: var(--tv-book-catalog-heading-size, var(--text-xl, 24px));
  --_weight: var(--tv-book-catalog-weight, var(--font-weight-medium, 400));
  --_heading-weight: var(--tv-book-catalog-heading-weight, var(--font-weight-semibold, 600));
  --_gap: var(--tv-book-catalog-gap, var(--space-24, 24px));
  --_space: var(--tv-book-catalog-space, var(--space-12, 12px));
  --_radius: var(--tv-book-catalog-radius, var(--control-radius, 6px));
  --_cover-text: var(--tv-book-catalog-cover-text, var(--color-text-on-accent, #ffffff));
  --_cover-font: var(--tv-book-catalog-cover-font, var(--font-serif, ui-serif, Georgia, serif));
  --_cover-title-size: var(--tv-book-catalog-cover-title-size, var(--text-sm, 15px));
  --_cover-author-size: var(--tv-book-catalog-cover-author-size, var(--text-xs, 11px));
  --_cover-padding: var(--tv-book-catalog-cover-padding, var(--space-16, 16px));
  --_control-padding: var(--tv-book-catalog-control-padding, var(--space-6, 6px));
  display: block;
  container-type: inline-size;
  min-width: 0;
  color: var(--_text);
  font: var(--_weight) var(--_size)/1.5 var(--_font);
  overflow-wrap: anywhere;
}

:where(tv-book-catalog, tv-book-detail) :where(*) { box-sizing: border-box; min-width: 0; }
:where(tv-book-catalog, tv-book-detail) :where(button, a) { font: inherit; }
:where(tv-book-catalog, tv-book-detail) :where(button) { color: inherit; cursor: pointer; }
:where(tv-book-catalog, tv-book-detail) :where(button, a, h2):focus-visible { outline: var(--_focus); outline-offset: 4px; }
:where(tv-book-catalog, tv-book-detail) :where(p, h2, dl, dd) { margin: 0; }

:where(tv-book-catalog, tv-book-detail) :where(.bc-authors, .bc-caption) { color: var(--_muted); font-size: var(--_small); }
:where(tv-book-catalog, tv-book-detail) :where(.bc-description) { white-space: pre-wrap; }
`];
