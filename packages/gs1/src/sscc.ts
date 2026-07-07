/**
 * SSCC-18 generation, validation, and human formatting.
 * Per GS1 General Specifications — extension + company prefix + serial + mod-10.
 */

import { computeMod10 } from './check-digit.js';

export class Gs1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Gs1Error';
  }
}

export interface GenerateSscc18Input {
  /** Assignment-authority extension digit (0–9). */
  extensionDigit: number;
  /** GS1 company prefix issued to the org (7–10 digits). */
  companyPrefix: string;
  /** Org-controlled serial reference (padded to fill the 17-digit body). */
  serialReference: number | string;
}

const SSCC_BODY_LENGTH = 17;
const SSCC_TOTAL_LENGTH = 18;
const PREFIX_MIN = 7;
const PREFIX_MAX = 10;

function normalizePrefix(prefix: string): string {
  const digits = prefix.trim();
  if (!/^\d+$/.test(digits)) {
    throw new Gs1Error('GS1 company prefix must contain only digits');
  }
  if (digits.length < PREFIX_MIN || digits.length > PREFIX_MAX) {
    throw new Gs1Error(
      `GS1 company prefix must be ${PREFIX_MIN}–${PREFIX_MAX} digits (got ${digits.length})`,
    );
  }
  return digits;
}

function normalizeExtension(extensionDigit: number): string {
  if (!Number.isInteger(extensionDigit) || extensionDigit < 0 || extensionDigit > 9) {
    throw new Gs1Error('SSCC extension digit must be an integer 0–9');
  }
  return String(extensionDigit);
}

function normalizeSerial(serialReference: number | string, serialLength: number): string {
  const raw = String(serialReference).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Gs1Error('SSCC serial reference must contain only digits');
  }
  if (raw.length > serialLength) {
    throw new Gs1Error(
      `SSCC serial reference exceeds ${serialLength} digits for the given company prefix`,
    );
  }
  return raw.padStart(serialLength, '0');
}

/**
 * Build a valid SSCC-18 from its component parts.
 *
 * Body layout: extension (1) + company prefix (7–10) + serial reference (remainder) = 17 digits,
 * then GS1 mod-10 check digit.
 */
export function generateSscc18(input: GenerateSscc18Input): string {
  const extension = normalizeExtension(input.extensionDigit);
  const prefix = normalizePrefix(input.companyPrefix);
  const serialLength = SSCC_BODY_LENGTH - extension.length - prefix.length;
  const serial = normalizeSerial(input.serialReference, serialLength);
  const body = `${extension}${prefix}${serial}`;

  if (body.length !== SSCC_BODY_LENGTH) {
    throw new Gs1Error('SSCC body must be exactly 17 digits');
  }

  return `${body}${computeMod10(body)}`;
}

/**
 * Validate an SSCC-18 string (optional internal whitespace stripped).
 */
export function validateSscc18(input: string): boolean {
  const digits = input.trim().replace(/\s+/g, '');
  if (!/^\d{18}$/.test(digits)) return false;
  return digits.slice(-1) === computeMod10(digits.slice(0, 17));
}

/**
 * Format an SSCC-18 for human display: `ext prefix serial check`.
 * Example: `0 5012345 00000042 5`
 */
export function formatSscc18(input: string): string {
  const digits = input.trim().replace(/\s+/g, '');
  if (!validateSscc18(digits)) {
    throw new Gs1Error('Cannot format invalid SSCC-18');
  }

  const extension = digits.slice(0, 1);
  const check = digits.slice(17);
  const middle = digits.slice(1, 17);
  const prefixLen = Math.min(7, middle.length - 1);
  const prefix = middle.slice(0, prefixLen);
  const serial = middle.slice(prefixLen);
  return `${extension} ${prefix} ${serial} ${check}`;
}

/**
 * Strip whitespace and return canonical 18-digit SSCC, or throw when invalid.
 */
export function normalizeSscc18(input: string): string {
  const digits = input.trim().replace(/\s+/g, '');
  if (!validateSscc18(digits)) {
    throw new Gs1Error('Invalid SSCC-18');
  }
  return digits;
}

export const SSCC_LENGTH = SSCC_TOTAL_LENGTH;
