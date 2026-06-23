import { describe, expect, it } from 'vitest';
import { buildGs1Element } from '../build';

const GS = '\x1d';

describe('buildGs1Element', () => {
  it('builds a full LP label with GTIN, lot, expiry, and net weight', () => {
    const result = buildGs1Element({
      gtin: '0061414112345',
      lot: 'BATCH001',
      expiry: '261231',
      netWeightKg: 5,
    });

    expect(result.raw).toBe(`010061414112345210BATCH001${GS}172612313103005000`);
    expect(result.raw).toContain(GS);
    expect(result.human).toBe('(01)00614141123452(10)BATCH001(17)261231(3103)005000');
    expect(result.human).not.toContain(GS);
  });

  it('builds an SSCC-only pallet element without a trailing separator', () => {
    const result = buildGs1Element({
      sscc: '376104250021234569',
    });

    expect(result.raw).toBe('00376104250021234569');
    expect(result.raw.endsWith(GS)).toBe(false);
    expect(result.human).toBe('(00)376104250021234569');
  });

  it('places separators only after variable-length fields that are not last', () => {
    const result = buildGs1Element({
      gtin: '00614141123452',
      lot: 'LOT123',
      expiry: '261231',
    });

    expect(result.raw).toBe(`010061414112345210LOT123${GS}17261231`);
    expect(result.raw).toContain(GS);
    expect(result.raw).not.toContain(`0100614141123452${GS}`);
    expect(result.human).toBe('(01)00614141123452(10)LOT123(17)261231');
    expect(result.human).not.toContain(GS);
  });

  it('throws for invalid GTIN and SSCC check digits', () => {
    expect(() => buildGs1Element({ gtin: '00614141123453' })).toThrow(
      /GTIN check digit/i,
    );
    expect(() => buildGs1Element({ sscc: '376104250021234567' })).toThrow(
      /SSCC check digit/i,
    );
  });

  it('throws for an invalid expiry date', () => {
    expect(() => buildGs1Element({ expiry: '260230' })).toThrow(
      /real calendar date/i,
    );
  });

  it('throws for a negative net weight', () => {
    expect(() => buildGs1Element({ netWeightKg: -0.001 })).toThrow(
      /non-negative/i,
    );
  });
});
