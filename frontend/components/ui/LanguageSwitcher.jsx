'use client';

import { useI18n } from '../../i18n/index.jsx';
import { locales, localeNames } from '../../i18n/config.js';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      className="bg-gray-900 text-gray-300 text-xs border border-gray-700 rounded px-2 py-1 cursor-pointer hover:border-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      aria-label="Select language"
    >
      {locales.map((l) => (
        <option key={l} value={l}>{localeNames[l]}</option>
      ))}
    </select>
  );
}
