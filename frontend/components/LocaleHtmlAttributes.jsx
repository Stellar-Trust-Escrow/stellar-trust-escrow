'use client';

import { useEffect } from 'react';
import { useI18n } from '../i18n/index.jsx';

export default function LocaleHtmlAttributes() {
  const { locale, isRTL } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [locale, isRTL]);
  return null;
}
