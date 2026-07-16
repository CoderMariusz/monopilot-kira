/**
 * C047 — FG net_qty_per_each must stay an exact decimal string through zod parse
 * (never z.coerce.number float drift before ::numeric bind).
 */
import { describe, expect, it } from 'vitest';

import { CreateItemInput, NetQtyPerEachInput, UpdateItemInput } from '../shared';

describe('net_qty_per_each numeric precision (C047)', () => {
  it('NetQtyPerEachInput preserves six-decimal input as an exact string', () => {
    const parsed = NetQtyPerEachInput.parse('0.333333');
    expect(parsed).toBe('0.333333');
    expect(typeof parsed).toBe('string');
  });

  it('CreateItemInput keeps netQtyPerEach as a string (not a JS float)', () => {
    const parsed = CreateItemInput.parse({
      itemCode: 'FG-PREC',
      name: 'Precision FG',
      itemType: 'fg',
      uomBase: 'kg',
      outputUom: 'each',
      netQtyPerEach: '0.333333',
    });
    expect(parsed.netQtyPerEach).toBe('0.333333');
    expect(typeof parsed.netQtyPerEach).toBe('string');
  });

  it('NetQtyPerEachInput rejects more than 6 decimal places', () => {
    expect(() => NetQtyPerEachInput.parse('0.1234567')).toThrow();
  });

  it('UpdateItemInput keeps netQtyPerEach as a string through edit payloads', () => {
    const parsed = UpdateItemInput.parse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Precision FG',
      itemType: 'fg',
      status: 'active',
      uomBase: 'kg',
      weightMode: 'fixed',
      outputUom: 'each',
      netQtyPerEach: '0.123456',
    });
    expect(parsed.netQtyPerEach).toBe('0.123456');
    expect(typeof parsed.netQtyPerEach).toBe('string');
  });
});
