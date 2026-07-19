'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getInitialTheme, applyTheme, toggleTheme as toggleThemeUtil, THEMES, THEME_KEY } from '../lib/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Initialize theme on mount and listen for system changes
  useEffect(() => {
    applyTheme(theme);
    
    // Remove no-transitions class after hydration
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transitions');
    });

    // Listen for system preference changes (only if no manual preference stored)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const stored = localStorage.getItem(THEME_KEY);
      if (!stored) {
        const newTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
        setTheme(newTheme);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Whenever theme changes, apply it
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const newTheme = toggleThemeUtil(theme);
    setTheme(newTheme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
