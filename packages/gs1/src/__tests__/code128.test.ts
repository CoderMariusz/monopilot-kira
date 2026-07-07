import { describe, expect, it } from 'vitest';

import { buildGs1Element } from '../build';
import {
  code128Modules,
  encodeCode128,
  encodeCode128B,
  encodeCode128Pattern,
} from '../code128';

/** Known GS1-128 SSCC (00)050123450000000428 symbol sequence (Start C, FNC1, C-pairs, checksum, Stop). */
const SSCC_KNOWN_SYMBOLS = [105, 102, 0, 5, 1, 23, 45, 0, 0, 0, 4, 28, 32, 106] as const;

/** Module pattern for SSCC_KNOWN_SYMBOLS (156 modules; would differ under Set-B per-digit encoding). */
const SSCC_KNOWN_MODULE_PATTERN =
  '110100111001111010111011011001100100010011001100110110011101101110101110110001101100110011011001100110110011001001000110011100110100110001101101100011101011';

describe('encodeCode128B', () => {
  it('encodes a known Code128-B payload with start, checksum, and stop symbols', () => {
    const codes = encodeCode128B('A');
    expect(codes[0]).toBe(104);
    expect(codes[codes.length - 1]).toBe(106);
    expect(codes).toHaveLength(4);
    expect(codes[1]).toBe(33);
    expect(codes[2]).toBe(34);
  });

  it('prepends FNC1 only for GS1-128 encodings', () => {
    const plain = encodeCode128B('1234');
    const gs1 = encodeCode128B('1234', { gs1: true });
    expect(gs1[1]).toBe(102);
    expect(plain[1]).not.toBe(102);
  });
});

describe('encodeCode128', () => {
  it('encodes GS1 SSCC (00)050123450000000428 with Start C, FNC1, and Code C digit pairs', () => {
    const element = buildGs1Element({ sscc: '050123450000000428' });
    const codes = encodeCode128(element.raw, { gs1: true });

    expect(codes).toEqual([...SSCC_KNOWN_SYMBOLS]);
    expect(encodeCode128Pattern(element.raw, { gs1: true })).toBe(SSCC_KNOWN_MODULE_PATTERN);
    expect(encodeCode128Pattern(element.raw, { gs1: true })).toBe(code128Modules(codes));
  });

  it('uses Start C and digit pairs for all-digit GS1 payloads (not Set B per-digit)', () => {
    const element = buildGs1Element({ sscc: '050123450000000428' });
    const setB = encodeCode128B(element.raw, { gs1: true });

    expect(encodeCode128(element.raw, { gs1: true })).not.toEqual(setB);
    expect(setB[0]).toBe(104);
    expect(encodeCode128(element.raw, { gs1: true })[0]).toBe(105);
  });
});
