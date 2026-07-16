import { describe, expect, it } from 'vitest';

import { GRN_LINE_EXPIRY_SQL, parseGrnItemCount } from './grn-read-model';

describe('grn-read-model (C054/C055)', () => {
  it('parseGrnItemCount accepts pg count shapes without float coercion', () => {
    expect(parseGrnItemCount(3)).toBe(3);
    expect(parseGrnItemCount('3')).toBe(3);
    expect(parseGrnItemCount(3n)).toBe(3);
    expect(parseGrnItemCount(null)).toBe(0);
    expect(parseGrnItemCount(undefined)).toBe(0);
    expect(parseGrnItemCount('')).toBe(0);
  });

  it('GRN_LINE_EXPIRY_SQL coalesces line + LP civil/expiry columns', () => {
    expect(GRN_LINE_EXPIRY_SQL).toContain('gi.expiry_date');
    expect(GRN_LINE_EXPIRY_SQL).toContain('lp.expiry_date');
    expect(GRN_LINE_EXPIRY_SQL).toContain('gi.best_before_date');
    expect(GRN_LINE_EXPIRY_SQL).toContain('lp.best_before_date');
  });
});
