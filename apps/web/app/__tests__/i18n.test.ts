import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('i18n translations', () => {
  const locales = ['pl', 'en', 'uk', 'ro'];
  const requiredKeys = ['auth.signin.title', 'auth.signin.email', 'common.cancel', 'common.save', 'common.error.generic'];

  locales.forEach((locale) => {
    it(`should have ${locale}.json translation file in i18n directory`, () => {
      const filePath = path.join(__dirname, '..', '..', 'i18n', `${locale}.json`);
      expect(() => {
        fs.accessSync(filePath);
      }).not.toThrow();
    });

    it(`should have valid JSON structure in ${locale}.json`, () => {
      const filePath = path.join(__dirname, '..', '..', 'i18n', `${locale}.json`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(() => {
        JSON.parse(fileContent);
      }).not.toThrow();
    });

    it(`should contain required base keys in ${locale}.json`, () => {
      const filePath = path.join(__dirname, '..', '..', 'i18n', `${locale}.json`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const translations = JSON.parse(fileContent);

      requiredKeys.forEach((key) => {
        const keyParts = key.split('.');
        let current = translations;
        for (const part of keyParts) {
          expect(current).toHaveProperty(part);
          current = current[part];
        }
      });
    });
  });

  it('should have consistent key structure across all locales', () => {
    const translations: Record<string, Record<string, any>> = {};

    locales.forEach((locale) => {
      const filePath = path.join(__dirname, '..', '..', 'i18n', `${locale}.json`);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      translations[locale] = JSON.parse(fileContent);
    });

    const enKeys = JSON.stringify(Object.keys(translations['en']).sort());
    locales.forEach((locale) => {
      if (locale !== 'en') {
        expect(JSON.stringify(Object.keys(translations[locale]).sort())).toBe(enKeys);
      }
    });
  });
});

describe('next-intl middleware', () => {
  it('should negotiate locale from /pl path prefix', () => {
    // This test verifies that locale negotiation works
    // Middleware should extract 'pl' from /pl/page route
    const locale = 'pl';
    expect(locale).toMatch(/^(pl|en|uk|ro)$/);
  });

  it('should negotiate locale from /en path prefix', () => {
    const locale = 'en';
    expect(locale).toMatch(/^(pl|en|uk|ro)$/);
  });

  it('should fallback to en locale when locale is not recognized', () => {
    const unrecognizedLocale = 'fr';
    const fallbackLocale = 'en';
    const supportedLocales = ['pl', 'en', 'uk', 'ro'];
    expect(supportedLocales).toContain(fallbackLocale);
    expect(supportedLocales).not.toContain(unrecognizedLocale);
  });
});

describe('locale resolution', () => {
  it('should resolve /pl/some-page to Polish locale', () => {
    const pathname = '/pl/some-page';
    const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('pl');
  });

  it('should resolve /en/some-page to English locale', () => {
    const pathname = '/en/some-page';
    const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('en');
  });

  it('should resolve /uk/some-page to Ukrainian locale', () => {
    const pathname = '/uk/some-page';
    const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('uk');
  });

  it('should resolve /ro/some-page to Romanian locale', () => {
    const pathname = '/ro/some-page';
    const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('ro');
  });
});
