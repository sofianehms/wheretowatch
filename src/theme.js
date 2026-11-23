// Live theme change. Mirrors src/theme-boot.js, the classic script that sets the stored theme before first paint.
export const THEME_KEY = 'wtw.theme';
export const THEMES = ['dark', 'light', 'auto'];
export const DEFAULT_THEME = 'dark';

let stopFollowing = null;

function syncThemeColor(doc) {
  const root = doc.documentElement;
  const view = doc.defaultView;
  const bg = view?.getComputedStyle(root).getPropertyValue('--color-bg').trim();
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (bg && meta) meta.setAttribute('content', bg);
}

/**
 * Apply a theme: set `data-theme` on the root and fill `theme-color` from `--color-bg`.
 * In Auto mode the page follows `prefers-color-scheme` as it changes. An unknown value falls back to dark.
 * @param {string} value `dark`, `light` or `auto`.
 * @param {Document} [doc]
 */
export function applyTheme(value, doc = document) {
  const theme = THEMES.includes(value) ? value : DEFAULT_THEME;
  stopFollowing?.();
  stopFollowing = null;
  doc.documentElement.setAttribute('data-theme', theme);
  syncThemeColor(doc);

  const query = theme === 'auto' ? doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)') : null;
  if (query?.addEventListener) {
    const onChange = () => syncThemeColor(doc);
    query.addEventListener('change', onChange);
    stopFollowing = () => query.removeEventListener('change', onChange);
  }
}
