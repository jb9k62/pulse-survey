/**
 * The light and dark theme. The choice lives on `<html data-theme>` so the
 * colour tokens in `tokens.css` switch in one place. A small inline script in
 * `index.html` sets it before the first paint (stored choice, else the system
 * preference), so this module only reads and changes it.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pulse-theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Storage can throw (private mode, blocked site data). The theme still
  // applies for this visit, it is just not remembered.
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignored on purpose, see above.
  }
}
