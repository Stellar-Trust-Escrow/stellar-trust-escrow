export const defaultLocale = 'en';
export const locales = ['en', 'es', 'fr', 'de', 'ar', 'zh'];
export const localeNames = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ar: 'العربية',
  zh: '中文',
};
export const rtlLocales = ['ar'];
export const isRTL = (locale) => rtlLocales.includes(locale);
