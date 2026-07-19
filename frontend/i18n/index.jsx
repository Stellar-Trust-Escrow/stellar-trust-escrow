'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { defaultLocale, locales, isRTL } from './config.js';

// Only the default locale is bundled up-front. Other locales are code-split
// into their own chunks and fetched on demand when the user switches language.
import en from './locales/en.json';

const STORAGE_KEY = 'ste_locale';

async function loadLocaleMessages(l) {
  switch (l) {
    case 'es':
      return (await import('./locales/es.json')).default;
    case 'fr':
      return (await import('./locales/fr.json')).default;
    case 'de':
      return (await import('./locales/de.json')).default;
    case 'ar':
      return (await import('./locales/ar.json')).default;
    case 'zh':
      return (await import('./locales/zh.json')).default;
    default:
      return en;
  }
}

const I18nContext = createContext(null);

function resolve(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj) ?? key;
}

function getInitialLocale(fallback) {
  if (typeof window === 'undefined') return fallback;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && locales.includes(saved)) return saved;
  // Auto-detect from browser
  const browser = navigator.language?.split('-')[0];
  return locales.includes(browser) ? browser : fallback;
}

export function I18nProvider({ children, initialLocale = defaultLocale }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState({ en });

  // Hydrate from localStorage after mount
  useEffect(() => {
    const detected = getInitialLocale(initialLocale);
    if (detected !== locale) setLocaleState(detected);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the active locale's messages if they haven't been loaded yet
  useEffect(() => {
    let cancelled = false;
    if (!messages[locale]) {
      loadLocaleMessages(locale).then((m) => {
        if (!cancelled) setMessages((prev) => ({ ...prev, [locale]: m }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [locale, messages]);

  const setLocale = useCallback((l) => {
    if (!locales.includes(l)) return;
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key) => resolve(messages[locale] ?? messages[defaultLocale], key),
    [locale, messages],
  );

  const formatDate = useCallback(
    (date, options = { dateStyle: 'medium' }) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(date)),
    [locale],
  );

  const formatNumber = useCallback(
    (num, options = {}) => new Intl.NumberFormat(locale, options).format(num),
    [locale],
  );

  const formatCurrency = useCallback(
    (amount, currency = 'USD') =>
      new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount),
    [locale],
  );

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatDate,
        formatNumber,
        formatCurrency,
        isRTL: isRTL(locale),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
