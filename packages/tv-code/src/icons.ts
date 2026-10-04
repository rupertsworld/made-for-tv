/**
 * Inline SVG icons, drawn on a 16 px grid in `currentColor`.
 *
 * Path data follows the regular weight of Phosphor Icons (MIT licence,
 * https://phosphoricons.com), redrawn at 16 px. Each part of the viewer adds
 * the icons it uses here, as one entry per icon, and renders them with
 * `svg()` from `dom.ts`.
 */

const icon = (body: string): string =>
  `<svg class="cv-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** Every icon, by name. */
export const icons = {
  file: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25"/>'),
  folder: icon('<path d="M1.75 4.25c0-.55.45-1 1-1h3.1l1.25 1.5h6.15c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-8Z"/>'),
  folderOpen: icon('<path d="M1.75 4.25c0-.55.45-1 1-1h3.1l1.25 1.5h6.15c.55 0 1 .45 1 1v1.1H4.4c-.5 0-.9.3-1.08.76l-1.57 4.2V4.25Z"/><path d="M4.4 6.85h9.3c.55 0 .94.55.74 1.06l-1.6 4.1c-.22.55-.58.74-1.12.74H1.9l1.42-5.14c.18-.46.58-.76 1.08-.76Z"/>'),
  caret: icon('<path d="m6 4.5 3.5 3.5L6 11.5"/>'),
  sidebar: icon('<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1"/><path d="M5.5 2.5v11"/>'),
  search: icon('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>'),
  retry: icon('<path d="M13 7a5 5 0 1 0-.7 3.2"/><path d="M13 3.5V7H9.5"/>'),
  fileCode: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M6.3 8l-1.5 1.5L6.3 11m3.4-3L11.2 9.5 9.7 11"/>'),
  fileText: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M5.5 8h5m-5 2.25h5"/>'),
  fileImage: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M5.25 11.75l2-2 1.25 1.25 1.25-1.25 1.75 2M6.25 6.75h.01"/>'),
  fileData: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M7 8l-1.25 1.5L7 11m2-3 1.25 1.5L9 11"/>'),
  fileConfig: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M5.5 8h5m-5 2.5h5M7 7v2m2 1v2"/>'),
  fileLock: icon('<path d="M9.5 1.75H4a.75.75 0 0 0-.75.75v11c0 .41.34.75.75.75h8c.41 0 .75-.34.75-.75V5L9.5 1.75Z"/><path d="M9.5 1.75V5h3.25M6 9V8a2 2 0 0 1 4 0v1m-4.5 0h5v3h-5z"/>'),
  preview: icon('<path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4Z"/><circle cx="8" cy="8" r="2"/>'),
  source: icon('<path d="m5.75 4.5-3.5 3.5 3.5 3.5m4.5-7L13.75 8l-3.5 3.5M9 3 7 13"/>'),
  wrap: icon('<path d="M2 3.5h12M2 7.5h9.5a2.5 2.5 0 0 1 0 5H8m1.75-1.75L8 12.5l1.75 1.75M2 12.5h3"/>'),
} as const;

/** The name of an icon. */
export type IconName = keyof typeof icons;

/** Use one file-kind vocabulary in the tree and finder. */
export function iconForFile(path: string): IconName {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf(".") + 1);
  if (name === "dockerfile" || name === "makefile") return "fileCode";
  if (/(?:^|[-.])lock(?:$|\.)/.test(name) || name === "package-lock.json" || name === "yarn.lock") return "fileLock";
  if (/^(?:\.env(?:\..*)?|\.gitignore|\.gitattributes|\.prettierrc|\.eslintrc|tsconfig\.json|vite\.config\..*|.*\.config\..*)$/.test(name)) return "fileConfig";
  if (/^(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/.test(extension)) return "fileImage";
  if (/^(md|markdown|mdx|txt|text|rst|adoc)$/.test(extension)) return "fileText";
  if (/^(json|jsonc|ya?ml|toml|xml|csv|tsv|ini)$/.test(extension)) return "fileData";
  if (/^(tsx?|jsx?|mjs|cjs|css|scss|less|html?|py|rb|rs|go|java|kt|kts|swift|c|cc|cpp|cs|h|hpp|sh|bash|zsh|ps1|psm1|sql|graphql|gql|lua|vue|svelte|diff|patch)$/.test(extension)) return "fileCode";
  return "file";
}
