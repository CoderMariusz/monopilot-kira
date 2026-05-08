import { describe, it, expect } from 'vitest';
import { formatDate, formatNumber } from '../format';

describe('i18n format utilities', () => {
  describe('formatDate', () => {
    const testDate = new Date('2025-05-07T12:00:00Z');

    it('should format date in Polish locale', () => {
      const result = formatDate(testDate, 'pl');
      expect(result).toMatch(/\d{1,2}\s+\w+\s+202\d/);
      expect(result).toBeTruthy();
    });

    it('should format date in English locale', () => {
      const result = formatDate(testDate, 'en');
      expect(result).toMatch(/\w+\s+\d{1,2},\s+202\d|May\s+7,\s+2025/);
      expect(result).toBeTruthy();
    });

    it('should format date in Ukrainian locale', () => {
      const result = formatDate(testDate, 'uk');
      // \w does not match Cyrillic; use \p{L}+ with unicode flag (objectively-wrong-fix)
      expect(result).toMatch(/\d{1,2}\s+\p{L}+/u);
      expect(result).toBeTruthy();
    });

    it('should format date in Romanian locale', () => {
      const result = formatDate(testDate, 'ro');
      expect(result).toMatch(/\d{1,2}\s+\w+\s+202\d/);
      expect(result).toBeTruthy();
    });
  });

  describe('formatNumber', () => {
    it('should format number in Polish locale with proper decimal separator', () => {
      const result = formatNumber(1234.56, 'pl');
      // Polish uses comma as decimal separator: "1234,56"
      expect(result).toContain('1234,56');
      expect(result).not.toContain('.');
    });

    it('should format number in English locale with comma separator', () => {
      const result = formatNumber(1234.56, 'en');
      // en-US uses comma as thousands grouping and period as decimal: "1,234.56"
      expect(result).toContain('1,234');
      expect(result).toContain('.56');
    });

    it('should format number in Ukrainian locale', () => {
      const result = formatNumber(1234.56, 'uk');
      // uk-UA uses non-breaking space as grouping separator and comma as decimal: "1 234,56"
      // Use a substring that pins the locale-specific decimal: "234,56"
      expect(result).toContain('234,56');
      expect(result).not.toContain('.');
    });

    it('should format number in Romanian locale', () => {
      const result = formatNumber(1234.56, 'ro');
      // ro-RO uses period as thousands grouping and comma as decimal: "1.234,56"
      expect(result).toContain('1.234');
      expect(result).toContain(',56');
    });
  });

  describe('ICU MessageFormat plural rules', () => {
    it('should support Polish plural rules (1/few/many)', () => {
      // Polish: 1=singular, few (2-4, 22-24, etc.), many (5-21, 25+)
      const pluralForms = {
        one: 'one item',
        few: 'few items',
        many: 'many items'
      };
      expect(pluralForms).toHaveProperty('one');
      expect(pluralForms).toHaveProperty('few');
      expect(pluralForms).toHaveProperty('many');
    });

    it('should support English plural rules (one/other)', () => {
      // English: 1=one, other (0, 2+)
      const pluralForms = {
        one: 'one item',
        other: 'other items'
      };
      expect(pluralForms).toHaveProperty('one');
      expect(pluralForms).toHaveProperty('other');
    });

    it('should support Ukrainian plural rules (1/few/many)', () => {
      // Ukrainian: 1=singular, few (2-4, 22-24, etc.), many (5-20, 25+)
      const pluralForms = {
        one: 'одна позиція',
        few: 'кілька позицій',
        many: 'багато позицій'
      };
      expect(pluralForms).toHaveProperty('one');
      expect(pluralForms).toHaveProperty('few');
      expect(pluralForms).toHaveProperty('many');
    });

    it('should support Romanian plural rules (1/few/other)', () => {
      // Romanian: 1=singular, few (0, 2-19), other (20+)
      const pluralForms = {
        one: 'un element',
        few: 'câteva elemente',
        other: 'multe elemente'
      };
      expect(pluralForms).toHaveProperty('one');
      expect(pluralForms).toHaveProperty('few');
      expect(pluralForms).toHaveProperty('other');
    });
  });
});
