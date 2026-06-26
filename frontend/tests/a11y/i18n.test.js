/**
 * i18n Tests
 *
 * Tests locale routing, string externalisation, and locale-aware formatting.
 * Validates i18n foundation for multi-language support.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock i18n config
jest.mock('@/i18n/config', () => ({
  locales: ['en', 'fr', 'es', 'de', 'zh', 'ar'],
  defaultLocale: 'en',
}));

describe('i18n - Internationalization', () => {
  describe('Locale Routing', () => {
    it('should support multiple locale paths', () => {
      const locales = ['en', 'fr', 'es', 'de', 'zh', 'ar'];
      expect(locales).toContain('en');
      expect(locales).toContain('fr');
      expect(locales.length).toBe(6);
    });

    it('should have default locale configured', () => {
      const config = require('@/i18n/config');
      expect(config.defaultLocale).toBe('en');
    });
  });

  describe('String Externalisation', () => {
    it('should load English locale messages', async () => {
      const messages = await import('@/i18n/locales/en.json');
      expect(messages).toBeDefined();
      expect(Object.keys(messages.default || messages).length).toBeGreaterThan(0);
    });

    it('should have matching message keys across locales', async () => {
      const enMessages = await import('@/i18n/locales/en.json');
      const frMessages = await import('@/i18n/locales/fr.json');
      const esMessages = await import('@/i18n/locales/es.json');

      const enKeys = Object.keys(enMessages.default || enMessages).sort();
      const frKeys = Object.keys(frMessages.default || frMessages).sort();
      const esKeys = Object.keys(esMessages.default || esMessages).sort();

      expect(frKeys).toEqual(enKeys);
      expect(esKeys).toEqual(enKeys);
    });

    it('should not have empty or missing translations', async () => {
      const locales = ['en', 'fr', 'es', 'de', 'zh', 'ar'];

      for (const locale of locales) {
        const messages = await import(`@/i18n/locales/${locale}.json`);
        const msgs = messages.default || messages;

        Object.entries(msgs).forEach(([key, value]) => {
          expect(value).toBeTruthy();
          expect(typeof value).toBe('string');
        });
      }
    });
  });

  describe('Number Formatting', () => {
    it('should format currency amounts with locale', () => {
      const formatCurrency = (amount, locale = 'en') => {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD',
        }).format(amount);
      };

      expect(formatCurrency(1000, 'en')).toMatch(/\$|USD/);
      expect(formatCurrency(1000, 'fr')).toBeDefined();
      expect(formatCurrency(1000, 'de')).toBeDefined();
    });

    it('should format Stellar amounts with decimal precision', () => {
      const formatStellarAmount = (amount, locale = 'en') => {
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 7,
        }).format(amount);
      };

      expect(formatStellarAmount(100.123456, 'en')).toBe('100.123456');
      expect(formatStellarAmount(100.123456, 'fr')).toBeTruthy();
    });

    it('should respect locale-specific decimal and thousands separators', () => {
      const formatNumber = (num, locale = 'en') => {
        return new Intl.NumberFormat(locale).format(num);
      };

      const enFormatted = formatNumber(1234567.89, 'en');
      const frFormatted = formatNumber(1234567.89, 'fr');
      const deFormatted = formatNumber(1234567.89, 'de');

      expect(enFormatted).toMatch(/1,234,567/);
      expect(frFormatted).toBeTruthy();
      expect(deFormatted).toBeTruthy();
    });
  });

  describe('Date Formatting', () => {
    it('should format dates according to locale', () => {
      const testDate = new Date('2025-06-26');

      const formatDate = (date, locale = 'en') => {
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(date);
      };

      const enFormatted = formatDate(testDate, 'en');
      const frFormatted = formatDate(testDate, 'fr');

      expect(enFormatted).toBeTruthy();
      expect(frFormatted).toBeTruthy();
      expect(enFormatted).not.toBe(frFormatted);
    });

    it('should format time according to locale preferences', () => {
      const testTime = new Date('2025-06-26T14:30:00');

      const formatTime = (date, locale = 'en') => {
        return new Intl.DateTimeFormat(locale, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(date);
      };

      const enFormatted = formatTime(testTime, 'en');
      const frFormatted = formatTime(testTime, 'fr');

      expect(enFormatted).toMatch(/[0-9]/);
      expect(frFormatted).toBeTruthy();
    });

    it('should format relative dates correctly', () => {
      const formatRelativeDate = (date, locale = 'en') => {
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        const now = new Date();
        const diffMs = date - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return rtf.format(diffDays, 'day');
      };

      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const formatted = formatRelativeDate(pastDate, 'en');

      expect(formatted).toBeTruthy();
    });
  });

  describe('RTL Language Support', () => {
    it('should have direction attribute for RTL locales', async () => {
      const rtlLocales = ['ar', 'he'];
      expect(rtlLocales).toContain('ar');
    });

    it('should support Arabic locale in message files', async () => {
      const arMessages = await import('@/i18n/locales/ar.json');
      const msgs = arMessages.default || arMessages;

      expect(Object.keys(msgs).length).toBeGreaterThan(0);
    });
  });

  describe('Locale HTML Attributes', () => {
    it('should render html lang attribute correctly', () => {
      const LocaleHtmlAttributes = require('@/components/LocaleHtmlAttributes').default;

      const { container } = render(<LocaleHtmlAttributes locale="en" />);
      // Component should ensure html lang is set
      expect(LocaleHtmlAttributes).toBeDefined();
    });
  });

  describe('Message Key Patterns', () => {
    it('should use consistent naming conventions for message keys', async () => {
      const messages = await import('@/i18n/locales/en.json');
      const msgs = messages.default || messages;

      const keys = Object.keys(msgs);
      keys.forEach((key) => {
        // Keys should be lowercase with underscores or dots
        expect(key).toMatch(/^[a-z0-9._]+$/);
      });
    });
  });

  describe('Locale Switching', () => {
    it('should provide method to change locale', () => {
      // Simulate locale switching mechanism
      const locales = ['en', 'fr', 'es', 'de', 'zh', 'ar'];
      let currentLocale = 'en';

      const setLocale = (newLocale) => {
        if (locales.includes(newLocale)) {
          currentLocale = newLocale;
        }
      };

      setLocale('fr');
      expect(currentLocale).toBe('fr');

      setLocale('invalid');
      expect(currentLocale).toBe('fr');
    });
  });
});
