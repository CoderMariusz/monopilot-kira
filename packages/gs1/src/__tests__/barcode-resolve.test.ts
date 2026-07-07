import { describe, expect, it } from 'vitest';

import { resolveBarcodePayload, resolveSsccBarcode } from '../barcode-resolve';

describe('resolveBarcodePayload', () => {
  it('resolves SSCC field to GS1-128 AI 00 element string', () => {
    const resolved = resolveSsccBarcode('050123450000000428');
    expect(resolved.gs1).toBe(true);
    expect(resolved.value).toBe('00050123450000000428');
    expect(resolved.caption).toContain('(00)');
  });

  it('resolves ean13 symbology for a GTIN-14 body', () => {
    const resolved = resolveBarcodePayload({
      value: '00614141123452',
      field: 'ean',
      symbology: 'ean13',
    });
    expect(resolved.gs1).toBe(true);
    expect(resolved.value.startsWith('01')).toBe(true);
  });
});
