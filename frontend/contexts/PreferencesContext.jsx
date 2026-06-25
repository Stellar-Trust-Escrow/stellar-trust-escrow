'use client';

/**
 * PreferencesContext
 *
 * Persists user preferences to localStorage and applies them immediately
 * without a page reload. Preferences:
 *   - theme:    'light' | 'dark' | 'system'
 *   - language: BCP 47 tag, e.g. 'en', 'es', 'fr'
 *   - density:  'compact' | 'comfortable'
 *   - notifications: { email, push, inApp } booleans
 *
 * Falls back to defaults silently when localStorage is unavailable
 * (e.g. private browsing).
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'user_preferences';

const DEFAULTS = {
  theme: 'system',
  language: 'en',
  density: 'comfortable',
  notifications: {
    email: true,
    push: false,
    inApp: true,
  },
};

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function writeStorage(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable — operate in-memory only
  }
}

function resolvedTheme(theme) {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

function applyTheme(theme) {
  const effective = resolvedTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', effective === 'dark');
  }
}

function applyDensity(density) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = density;
  }
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULTS);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = readStorage();
    setPrefs(stored);
    applyTheme(stored.theme);
    applyDensity(stored.density);
  }, []);

  // Re-apply theme whenever system scheme changes while pref is 'system'
  useEffect(() => {
    if (prefs.theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [prefs.theme]);

  const update = useCallback((partial) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      writeStorage(next);

      if (partial.theme !== undefined) applyTheme(partial.theme);
      if (partial.density !== undefined) applyDensity(partial.density);

      return next;
    });
  }, []);

  const setTheme = useCallback((theme) => update({ theme }), [update]);
  const setLanguage = useCallback((language) => update({ language }), [update]);
  const setDensity = useCallback((density) => update({ density }), [update]);
  const setNotifications = useCallback(
    (notifications) =>
      update({ notifications: { ...prefs.notifications, ...notifications } }),
    [update, prefs.notifications],
  );

  return (
    <PreferencesContext.Provider
      value={{ prefs, setTheme, setLanguage, setDensity, setNotifications, update }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
