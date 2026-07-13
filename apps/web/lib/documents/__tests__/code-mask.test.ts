import { describe, expect, it } from 'vitest';

import {
  codeMaskToLenientRegExp,
  codeMaskToRegExp,
  exampleCodeMask,
  matchesCodeMask,
  renderCodeMask,
} from '../code-mask';

describe('codeMaskToLenientRegExp', () => {
  it("accepts the org's separator/count variants of the same FG scheme", () => {
    const re = codeMaskToLenientRegExp('FGxxxx'); // strict would be /^FG\d{4}$/
    // Both real org-0002 schemes must pass V01:
    expect(re.test('FG0016')).toBe(true); // no separator, 4 digits
    expect(re.test('FG-016')).toBe(true); // hyphen, 3 digits
    expect(re.test('FG-0014')).toBe(true);
    expect(re.test('fg0016')).toBe(true); // case-insensitive
  });

  it('still rejects codes that are not the org FG scheme', () => {
    const re = codeMaskToLenientRegExp('FGxxxx');
    expect(re.test('XY123')).toBe(false); // wrong prefix
    expect(re.test('FGABC')).toBe(false); // non-digit body
    expect(re.test('FG')).toBe(false); // no digits
    expect(re.test('')).toBe(false);
  });

  it('keeps literal separators in the mask required and stays anchored', () => {
    const re = codeMaskToLenientRegExp('WIP-xxxx');
    expect(re.test('WIP-0003')).toBe(true);
    expect(re.test('WIP-3')).toBe(true); // digit count tolerant
    expect(re.test('WIP0003')).toBe(false); // the mask's LITERAL '-' is still required
    expect(re.test('ZWIP-0003')).toBe(false); // anchored start
  });
});

describe('renderCodeMask', () => {
  it('left-pads x runs to the run width', () => {
    expect(renderCodeMask('FGxxxx', { seq: 1 })).toBe('FG0001');
  });

  it('renders the full date token as yyyymmdd', () => {
    expect(renderCodeMask('WIP-[DATE]-xxxx', { seq: 3, date: new Date('2026-06-26T00:00:00Z') })).toBe(
      'WIP-20260626-0003',
    );
  });

  it('renders the two-digit year token', () => {
    expect(renderCodeMask('[YY]', { seq: 1, date: new Date('2026-06-26T00:00:00Z') })).toBe('26');
  });

  it('renders the site token from siteCode', () => {
    expect(renderCodeMask('[SITE]', { seq: 1, siteCode: 'S1' })).toBe('S1');
  });

  it('renders the site token as empty for null siteCode', () => {
    expect(renderCodeMask('[SITE]', { seq: 1, siteCode: null })).toBe('');
  });

  it('passes literal content through unchanged', () => {
    expect(renderCodeMask('FIXED-CODE', { seq: 99 })).toBe('FIXED-CODE');
  });

  it('does not truncate sequences wider than the x run', () => {
    expect(renderCodeMask('xxxx', { seq: 12345 })).toBe('12345');
  });
});

describe('matchesCodeMask', () => {
  it('accepts codes that fit the org FG mask', () => {
    expect(matchesCodeMask('FG0001', 'FGxxxx')).toBe(true);
    expect(matchesCodeMask('fg0001', 'FGxxxx')).toBe(true);
  });

  it('rejects codes that do not fit the org FG mask', () => {
    expect(matchesCodeMask('FA5609', 'FGxxxx')).toBe(false);
    expect(matchesCodeMask('ZZ123', 'FGxxxx')).toBe(false);
  });

  it('builds a regex that mirrors renderCodeMask literals and digit runs', () => {
    expect(codeMaskToRegExp('FGxxxx').test('FG0042')).toBe(true);
    expect(exampleCodeMask('FGxxxx')).toBe('FG0001');
  });
});
