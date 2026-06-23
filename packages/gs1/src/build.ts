/**
 * GS1-128 Application Identifier element-string builder.
 * Produces barcode data only; image rendering is intentionally out of scope.
 */

import { computeMod10 } from './check-digit.js';

const GROUP_SEPARATOR = '\x1d';

export interface Gs1BuildInput {
  sscc?: string;
  gtin?: string;
  lot?: string;
  expiry?: string;
  netWeightKg?: number;
}

export interface Gs1ElementResult {
  raw: string;
  human: string;
}

interface ElementPart {
  ai: string;
  value: string;
  separatorWhenNotLast: boolean;
}

function normalizeDigits(
  value: string,
  fieldName: string,
  acceptedLengths: number[],
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`);
  }

  const digits = value.trim();
  const expectedLength = acceptedLengths.join(' or ');

  if (!/^\d+$/.test(digits)) {
    throw new Error(`Invalid ${fieldName}: expected ${expectedLength} digits`);
  }

  if (!acceptedLengths.includes(digits.length)) {
    throw new Error(`Invalid ${fieldName}: expected ${expectedLength} digits`);
  }

  return digits;
}

function assertValidCheckDigit(digits: string, fieldName: string): void {
  const body = digits.slice(0, -1);
  const provided = digits.slice(-1);
  const expected = computeMod10(body);

  if (provided !== expected) {
    throw new Error(
      `Invalid ${fieldName} check digit: expected ${expected}, got ${provided}`,
    );
  }
}

function normalizeSSCC(value: string): string {
  const digits = normalizeDigits(value, 'SSCC', [18]);
  assertValidCheckDigit(digits, 'SSCC');
  return digits;
}

function normalizeGTIN(value: string): string {
  const digits = normalizeDigits(value, 'GTIN', [13, 14]);

  if (digits.length === 13) {
    return `${digits}${computeMod10(digits)}`;
  }

  assertValidCheckDigit(digits, 'GTIN');
  return digits;
}

function normalizeLot(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError('lot must be a string');
  }

  const lot = value.trim();

  if (lot.length > 20) {
    throw new Error('Invalid lot: lot too long, maximum is 20 characters');
  }

  if (!/^[A-Za-z0-9]+$/.test(lot)) {
    throw new Error('Invalid lot: expected 1 to 20 alphanumeric characters');
  }

  return lot;
}

function normalizeExpiry(value: string): string {
  const expiry = normalizeDigits(value, 'expiry', [6]);
  const year = 2000 + Number(expiry.slice(0, 2));
  const month = Number(expiry.slice(2, 4));
  const day = Number(expiry.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid expiry date: ${expiry} is not a real calendar date`);
  }

  return expiry;
}

function normalizeNetWeightKg(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid netWeightKg: expected a finite number');
  }

  if (value < 0) {
    throw new Error('Invalid netWeightKg: weight must be non-negative');
  }

  const encoded = Math.round((value + Number.EPSILON) * 1000);

  if (encoded > 999999) {
    throw new Error('Invalid netWeightKg: maximum encodable value is 999.999 kg');
  }

  return String(encoded).padStart(6, '0');
}

function appendPart(
  part: ElementPart,
  index: number,
  parts: ElementPart[],
  bracketed: boolean,
): string {
  const prefix = bracketed ? `(${part.ai})` : part.ai;
  const separator =
    part.separatorWhenNotLast && index < parts.length - 1 ? GROUP_SEPARATOR : '';

  return `${prefix}${part.value}${separator}`;
}

export function buildGs1Element(input: Gs1BuildInput): Gs1ElementResult {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('input must be an object');
  }

  const parts: ElementPart[] = [];

  if (input.sscc !== undefined) {
    parts.push({
      ai: '00',
      value: normalizeSSCC(input.sscc),
      separatorWhenNotLast: true,
    });
  }

  if (input.gtin !== undefined) {
    parts.push({
      ai: '01',
      value: normalizeGTIN(input.gtin),
      separatorWhenNotLast: false,
    });
  }

  if (input.lot !== undefined) {
    parts.push({
      ai: '10',
      value: normalizeLot(input.lot),
      separatorWhenNotLast: true,
    });
  }

  if (input.expiry !== undefined) {
    parts.push({
      ai: '17',
      value: normalizeExpiry(input.expiry),
      separatorWhenNotLast: false,
    });
  }

  if (input.netWeightKg !== undefined) {
    parts.push({
      ai: '3103',
      value: normalizeNetWeightKg(input.netWeightKg),
      separatorWhenNotLast: false,
    });
  }

  if (parts.length === 0) {
    throw new Error('At least one GS1 data field must be provided');
  }

  return {
    raw: parts.map((part, index) => appendPart(part, index, parts, false)).join(''),
    human: parts
      .map((part, index) => appendPart(part, index, parts, true))
      .join(''),
  };
}
