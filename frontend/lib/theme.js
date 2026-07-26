// Theme utility functions
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
};

export const THEME_KEY = 'theme';

/**
 * Gets the initial theme from localStorage or system preference
 * @returns {'light' | 'dark'}
 */
export function getInitialTheme() {
  if (typeof window === 'undefined') return THEMES.LIGHT;

  const stored = localStorage.getItem(THEME_KEY);
  if (stored === THEMES.DARK || stored === THEMES.LIGHT) {
    return stored;
  }

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? THEMES.DARK
      : THEMES.LIGHT;
  } catch {
    return THEMES.LIGHT;
  }
}

/**
 * Applies a theme to the document (DOM only — does not persist)
 * @param {'light' | 'dark'} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
}

/**
 * Persists a theme as the user's manual preference
 * @param {'light' | 'dark'} theme
 */
export function persistTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Toggles between light and dark themes
 * @param {'light' | 'dark'} currentTheme
 * @returns {'light' | 'dark'}
 */
export function toggleTheme(currentTheme) {
  return currentTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
}

/**
 * Checks if system preference is dark mode
 * @returns {boolean}
 */
export function isSystemDark() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
