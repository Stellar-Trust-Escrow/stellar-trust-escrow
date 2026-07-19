'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  getInitialTheme,
  applyTheme,
  toggleTheme as toggleThemeUtil,
  THEMES,
  THEME_KEY,
} from '../lib/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  // Track whether the user has explicitly chosen a theme (vs system-derived)
  const hasManualPreference = useRef(
    typeof window !== 'undefined' && !!localStorage.getItem(THEME_KEY),
  );

  useEffect(() => {
    // Apply CSS — write to localStorage only if user had a stored preference
    if (hasManualPreference.current) {
      applyTheme(theme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }

    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transitions');
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!hasManualPreference.current) {
        setTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (hasManualPreference.current) {
      applyTheme(theme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    hasManualPreference.current = true;
    const newTheme = toggleThemeUtil(theme);
    localStorage.setItem(THEME_KEY, newTheme);
    setTheme(newTheme);
    // persistTheme(newTheme); // manual user choice — persist as override
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
