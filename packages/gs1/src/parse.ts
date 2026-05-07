/**
 * GS1 Identifier parsers and validators.
 * Per GS1 General Specs 24.0
 */

import { computeMod10 } from './check-digit.js';

export interface ParseResult {
  valid: boolean;
  digits: string;
  error?: string;
}

/**
 * Shared parsing logic for all GS1 identifiers.
 *
 * @param input   - raw user input
 * @param lengths - accepted digit-string lengths (after trimming)
 */
function parseGS1(input: string, lengths: number[]): ParseResult {
  if (input === null || input === undefined) {
    throw new TypeError('Input must be a string');
  }

  const trimmed = input.trim();

  // Empty string → length error
  if (trimmed.length === 0) {
    return { valid: false, digits: trimmed, error: 'length' };
  }

  // Must be all digits (no spaces, hyphens, letters)
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, digits: trimmed, error: 'format' };
  }

  // Length check
  if (!lengths.includes(trimmed.length)) {
    return { valid: false, digits: trimmed, error: 'length' };
  }

  // Check digit verification
  const prefix = trimmed.slice(0, -1);
  const providedCheck = trimmed.slice(-1);
  const expectedCheck = computeMod10(prefix);

  if (providedCheck !== expectedCheck) {
    return { valid: false, digits: trimmed, error: 'check_digit_mismatch' };
  }

  return { valid: true, digits: trimmed };
}

/**
 * Parse and validate GTIN (13 or 14 digits).
 */
export function parseGTIN(input: string): ParseResult {
  return parseGS1(input, [13, 14]);
}

/**
 * Parse and validate SSCC-18 (18 digits).
 */
export function parseSSCC(input: string): ParseResult {
  return parseGS1(input, [18]);
}

/**
 * Parse and validate GLN-13 (13 digits).
 */
export function parseGLN(input: string): ParseResult {
  return parseGS1(input, [13]);
}

/**
 * Parse and validate GRAI (14 digits: 1 + 12 item ref + check).
 */
export function parseGRAI(input: string): ParseResult {
  return parseGS1(input, [14]);
}

/**
 * Parse and validate GDTI (14 digits: 1 + 12 doc type + check).
 */
export function parseGDTI(input: string): ParseResult {
  return parseGS1(input, [14]);
}
