import { describe, expect, it } from 'vitest';

import { buildGs1Element } from '../build';
import { encodeCode128B, encodeCode128Pattern } from '../code128';

describe('encodeCode128B', () => {
  it('encodes a known Code128-B payload with start, checksum, and stop symbols', () => {
    const codes = encodeCode128B('A');
    expect(codes[0]).toBe(104);
    expect(codes[codes.length - 1]).toBe(106);
    expect(codes).toHaveLength(4);
    expect(codes[1]).toBe(33);
    expect(codes[2]).toBe(34);
  });

  it('produces a stable module pattern for a GS1 SSCC element string', () => {
    const sscc = '050123450000000428';
    const element = buildGs1Element({ sscc });
    const pattern = encodeCode128Pattern(element.raw, { gs1: true });

    expect(pattern.startsWith('1')).toBe(true);
    expect(pattern.length).toBeGreaterThan(100);
    expect(pattern).toMatch(/^[01]+$/);
    expect(encodeCode128Pattern(element.raw, { gs1: true })).toBe(pattern);
  });

  it('prepends FNC1 only for GS1-128 encodings', () => {
    const plain = encodeCode128B('1234');
    const gs1 = encodeCode128B('1234', { gs1: true });
    expect(gs1[1]).toBe(102);
    expect(plain[1]).not.toBe(102);
  });
});
