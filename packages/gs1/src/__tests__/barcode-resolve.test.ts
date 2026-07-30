import { describe, expect, it } from 'vitest';

import { resolveBarcodePayload, resolveSsccBarcode } from '../barcode-resolve';

describe('resolveBarcodePayload', () => {
  it('resolves SSCC field to GS1-128 AI 00 element string', () => {
    const resolved = resolveSsccBarcode('050123450000000428');
    expect(resolved.gs1).toBe(true);
    expect(resolved.value).toBe('00050123450000000428');
    expect(resolved.caption).toContain('(00)');
  });

  it.each([
    ['GTIN-8', '96385074', '00000096385074'],
    ['GTIN-12', '614141123452', '00614141123452'],
    ['GTIN-13', '5901234123457', '05901234123457'],
    ['GTIN-14', '05901234123457', '05901234123457'],
  ])('resolves ean13 symbology for a valid %s', (_format, input, gtin14) => {
    const resolved = resolveBarcodePayload({
      value: input,
      field: 'ean',
      symbology: 'ean13',
    });
    expect(resolved.gs1).toBe(true);
    expect(resolved.value).toBe(`01${gtin14}`);
    expect(resolved.caption).toBe(`(01)${gtin14}`);
  });
});
