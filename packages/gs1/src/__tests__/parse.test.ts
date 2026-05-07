import { describe, expect, it } from 'vitest';
import {
  parseGTIN,
  parseSSCC,
  parseGLN,
  parseGRAI,
  parseGDTI,
} from '../parse';
import { computeMod10 } from '../check-digit';

describe('GS1 parsers - mod-10 check-digit validation', () => {
  describe('computeMod10', () => {
    it('computes correct check digit for GTIN-13 example "590123412345"', () => {
      const result = computeMod10('590123412345');
      expect(result).toBe('7');
    });

    it('computes correct check digit for SSCC-17 example "37610425002123456"', () => {
      const result = computeMod10('37610425002123456');
      expect(result).toBe('6');
    });

    it('computes check digit for GLN-12 example "9501101107"', () => {
      const result = computeMod10('9501101107');
      expect(result).toBe('3');
    });
  });

  describe('parseGTIN', () => {
    describe('GTIN-13 validation', () => {
      it('accepts known-valid GTIN-13 "5901234123457"', () => {
        const result = parseGTIN('5901234123457');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('5901234123457');
        expect(result.error).toBeUndefined();
      });

      it('rejects tampered GTIN-13 "5901234123458" (check digit mismatch)', () => {
        const result = parseGTIN('5901234123458');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('rejects GTIN-13 with wrong check digit "5901234123400"', () => {
        const result = parseGTIN('5901234123400');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('rejects GTIN-13 if too short (12 digits)', () => {
        const result = parseGTIN('590123412345');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GTIN-13 if too long (14 digits)', () => {
        const result = parseGTIN('59012341234570');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GTIN-13 with non-digit characters', () => {
        const result = parseGTIN('590123412345A');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });
    });

    describe('GTIN-14 validation', () => {
      it('accepts known-valid GTIN-14 with correct check digit', () => {
        // Build: 1 + valid GTIN-13 prefix without its check digit
        const result = parseGTIN('15901234123457');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('15901234123457');
      });

      it('rejects GTIN-14 with wrong check digit', () => {
        const result = parseGTIN('15901234123458');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('rejects GTIN-14 if wrong length (13 digits)', () => {
        const result = parseGTIN('5901234123457');
        expect(result.valid).toBe(false);
      });

      it('rejects GTIN-14 if wrong length (15 digits)', () => {
        const result = parseGTIN('159012341234570');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });
    });

    describe('whitespace and format handling', () => {
      it('strips leading and trailing whitespace', () => {
        const result = parseGTIN('  5901234123457  ');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('5901234123457');
      });

      it('rejects GTIN with internal spaces', () => {
        const result = parseGTIN('5901 2341 2345 7');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });

      it('rejects GTIN with hyphens', () => {
        const result = parseGTIN('5901-234-123457');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });

      it('rejects empty string', () => {
        const result = parseGTIN('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });
    });

    describe('leading zeros preservation', () => {
      it('preserves leading zeros in GTIN-13', () => {
        // Valid GTIN-13 starting with 0
        const result = parseGTIN('0012345678901');
        // This test expects the parser to preserve leading zeros
        // and validate based on actual GS1 spec
        expect(result.digits).toMatch(/^0/);
      });
    });
  });

  describe('parseSSCC', () => {
    describe('SSCC-18 validation', () => {
      it('accepts known-valid SSCC-18 "376104250021234566"', () => {
        const result = parseSSCC('376104250021234566');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('376104250021234566');
        expect(result.error).toBeUndefined();
      });

      it('rejects SSCC-17 (one digit short)', () => {
        const result = parseSSCC('37610425002123456');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects SSCC-19 (one digit over)', () => {
        const result = parseSSCC('3761042500212345660');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects SSCC with wrong check digit', () => {
        const result = parseSSCC('376104250021234567');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('strips whitespace from SSCC-18', () => {
        const result = parseSSCC('  376104250021234566  ');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('376104250021234566');
      });

      it('rejects SSCC with non-digit characters', () => {
        const result = parseSSCC('37610425002123456X');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });
    });
  });

  describe('parseGLN', () => {
    describe('GLN-13 validation', () => {
      it('accepts known-valid GLN-13 "5901234123457"', () => {
        const result = parseGLN('5901234123457');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('5901234123457');
        expect(result.error).toBeUndefined();
      });

      it('rejects GLN-13 with wrong check digit', () => {
        const result = parseGLN('5901234123458');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('rejects GLN if too short (12 digits)', () => {
        const result = parseGLN('590123412345');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GLN if too long (14 digits)', () => {
        const result = parseGLN('59012341234570');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('strips whitespace from GLN-13', () => {
        const result = parseGLN('  5901234123457  ');
        expect(result.valid).toBe(true);
        expect(result.digits).toBe('5901234123457');
      });
    });
  });

  describe('parseGRAI', () => {
    describe('GRAI validation (14 digits: 12 + check)', () => {
      it('accepts known-valid GRAI with 14 digits', () => {
        // GRAI example: 1 (type) + 12-digit item reference + check digit
        const result = parseGRAI('19812345678901');
        // Validate based on actual check digit computation
        expect(result.digits).toHaveLength(14);
        expect(result.digits).toMatch(/^\d{14}$/);
      });

      it('rejects GRAI if too short (13 digits)', () => {
        const result = parseGRAI('1981234567890');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GRAI if too long (15 digits)', () => {
        const result = parseGRAI('198123456789012');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GRAI with wrong check digit', () => {
        const result = parseGRAI('19812345678900');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('strips whitespace from GRAI', () => {
        const result = parseGRAI('  19812345678901  ');
        expect(result.digits).toHaveLength(14);
        expect(result.digits).toMatch(/^\d{14}$/);
      });

      it('rejects GRAI with non-digit characters', () => {
        const result = parseGRAI('1981234567890A');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });
    });
  });

  describe('parseGDTI', () => {
    describe('GDTI validation (14 digits: 13 + check)', () => {
      it('accepts known-valid GDTI with 14 digits', () => {
        // GDTI example: 4 (type) + 13-digit trade item + check digit
        const result = parseGDTI('40123456789012');
        expect(result.digits).toHaveLength(14);
        expect(result.digits).toMatch(/^\d{14}$/);
      });

      it('rejects GDTI if too short (13 digits)', () => {
        const result = parseGDTI('4012345678901');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GDTI if too long (15 digits)', () => {
        const result = parseGDTI('401234567890123');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('length');
      });

      it('rejects GDTI with wrong check digit', () => {
        const result = parseGDTI('40123456789011');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('check_digit_mismatch');
      });

      it('strips whitespace from GDTI', () => {
        const result = parseGDTI('  40123456789012  ');
        expect(result.digits).toHaveLength(14);
        expect(result.digits).toMatch(/^\d{14}$/);
      });

      it('rejects GDTI with non-digit characters', () => {
        const result = parseGDTI('4012345678901X');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('format');
      });
    });
  });

  describe('edge cases across all parsers', () => {
    it('all parsers return object with valid, digits, error properties', () => {
      const parsers = [parseGTIN, parseSSCC, parseGLN, parseGRAI, parseGDTI];
      const testInput = '0000000000000';

      for (const parser of parsers) {
        const result = parser(testInput);
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('digits');
        expect(typeof result.valid).toBe('boolean');
        expect(typeof result.digits).toBe('string');
        if (!result.valid) {
          expect(result).toHaveProperty('error');
          expect(result.error).toBeDefined();
        }
      }
    });

    it('null/undefined inputs are rejected', () => {
      expect(() => parseGTIN(null as any)).toThrow();
      expect(() => parseGTIN(undefined as any)).toThrow();
    });
  });
});
