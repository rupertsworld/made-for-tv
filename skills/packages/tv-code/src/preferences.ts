/**
 * Reader preferences remembered for one page: line wrapping, Markdown and SVG
 * source view, the open file and lines, the open folders, and whether the
 * sidebar is closed.
 *
 * They are kept in `localStorage` under the page address path, so each
 * artifact (each has its own path) remembers its own. Storage can be
 * unavailable in an embedded or private page; every access is guarded, and
 * the viewer then simply starts from its defaults.
 */

/** What the viewer remembers between visits. Every field is optional. */
export interface Preferences {
  wrap?: boolean;
  showSource?: boolean;
  sidebarClosed?: boolean;
  expanded?: string[];
  selected?: string | null;
  lines?: string | null;
}

/** The most folders remembered; enough for any tree a reader keeps open. */
const expandedLimit = 500;

/** Read and write the preferences of the current page. */
export class PreferenceStore {
  private readonly key = `tv-code:preferences:${location.pathname}`;
  private values: Preferences = {};

  constructor() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.key) ?? "{}");
      if (parsed && typeof parsed === "object") this.values = parsed as Preferences;
    } catch { /* Missing or unreadable storage: start from defaults. */ }
  }

  /** The remembered value of one preference, if any. */
  get<K extends keyof Preferences>(name: K): Preferences[K] {
    return this.values[name];
  }

  /** Remember one preference. */
  set<K extends keyof Preferences>(name: K, value: Preferences[K]): void {
    this.values = { ...this.values, [name]: name === "expanded" ? (value as string[]).slice(0, expandedLimit) : value };
    try { localStorage.setItem(this.key, JSON.stringify(this.values)); } catch { /* See the constructor. */ }
  }
}
