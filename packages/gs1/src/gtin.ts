/**
 * GTIN-14 check-digit computation, validation, and case-level derivation.
 * Per GS1 General Specifications.
 */

import { computeMod10 } from './check-digit.js';
import { Gs1Error } from './sscc.js';

const GTIN14_LENGTH = 14;
const GTIN13_LENGTH = 13;

function digitsOnly(value: string, fieldName: string): string {
  const digits = value.trim();
  if (!/^\d+$/.test(digits)) {
    throw new Gs1Error(`${fieldName} must contain only digits`);
  }
  return digits;
}

/**
 * Compute the GS1 mod-10 check digit for a GTIN body without its check digit.
 */
export function computeGtinCheckDigit(bodyWithoutCheck: string): string {
  const body = digitsOnly(bodyWithoutCheck, 'GTIN body');
  if (body.length < 1 || body.length > 13) {
    throw new Gs1Error('GTIN body must be 1–13 digits');
  }
  return computeMod10(body);
}

/**
 * Validate a GTIN-14 string (13- or 14-digit inputs accepted; 13-digit EAN is promoted).
 */
export function validateGtin14(input: string): boolean {
  const digits = digitsOnly(input, 'GTIN');
  if (digits.length === GTIN13_LENGTH) {
    return digits.slice(-1) === computeMod10(digits.slice(0, 12));
  }
  if (digits.length !== GTIN14_LENGTH) return false;
  return digits.slice(-1) === computeMod10(digits.slice(0, 13));
}

/**
 * Derive a GTIN-14 (case / trade-unit) from a base GTIN-13 or EAN-13.
 *
 * GTIN-14 = packaging indicator (1–9) + first 12 digits of GTIN-13 + new mod-10 check digit.
 * The packaging indicator `1` is the default case level per GS1 trade-item hierarchy.
 */
export function deriveGtin14FromGtin13(
  gtin13: string,
  packagingIndicator = 1,
): string {
  const digits = digitsOnly(gtin13, 'GTIN-13');
  if (digits.length !== GTIN13_LENGTH) {
    throw new Gs1Error('GTIN-13 must be exactly 13 digits');
  }
  if (digits.slice(-1) !== computeMod10(digits.slice(0, 12))) {
    throw new Gs1Error('GTIN-13 check digit is invalid');
  }

  const indicator = String(packagingIndicator);
  if (!/^[1-9]$/.test(indicator)) {
    throw new Gs1Error('packaging indicator must be an integer 1–9');
  }

  const body = `${indicator}${digits.slice(0, 12)}`;
  return `${body}${computeMod10(body)}`;
}

/**
 * Build GTIN-14 when the 13-digit body (indicator + item reference) is already known.
 */
export function buildGtin14(body13: string): string {
  const body = digitsOnly(body13, 'GTIN-14 body');
  if (body.length !== 13) {
    throw new Gs1Error('GTIN-14 body must be exactly 13 digits');
  }
  return `${body}${computeMod10(body)}`;
}

export { GTIN14_LENGTH, GTIN13_LENGTH };
