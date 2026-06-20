'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const COOKIE_KEY = 'ste-theme';
const THEMES = { dark: 'dark', light: 'light' };

const ThemeContext = createContext({
  theme: THEMES.dark,
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function readCookie() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(theme) {
  document.cookie = `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeProvider({ children, defaultTheme = THEMES.dark }) {
  const [theme, setTheme] = useState(() => readCookie() || defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Apply CSS tokens without flash
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === THEMES.dark);
    writeCookie(theme);
    setMounted(true);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === THEMES.dark ? THEMES.light : THEMES.dark));
  }, []);

  // Prevent FOUC: hide until theme applied
  if (!mounted) return <div style={{ visibility: 'hidden' }}>{children}</div>;

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === THEMES.dark;

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-pressed={isDark}
      className="group relative flex h-8 w-16 items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md transition-all duration-300 hover:border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      style={{ focusRingOffsetColor: 'var(--color-bg-base)' }}
    >
      {/* Track */}
      <span
        className={`absolute inset-0 rounded-full transition-colors duration-300 ${
          isDark ? 'bg-gray-800/80' : 'bg-sky-100/80'
        }`}
      />
      {/* Knob */}
      <span
        className={`relative z-10 flex h-6 w-6 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ${
          isDark ? 'translate-x-0.5 bg-gray-700' : 'translate-x-9 bg-white'
        }`}
      >
        <span className="text-xs leading-none" aria-hidden="true">
          {isDark ? '🌙' : '☀️'}
        </span>
      </span>
    </button>
  );
}
