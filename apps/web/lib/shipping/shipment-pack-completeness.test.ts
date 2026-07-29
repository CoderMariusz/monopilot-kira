import { describe, expect, it } from 'vitest';

import { assessPackCompleteness, formatShipmentQtyByUom } from './shipment-pack-completeness';

describe('assessPackCompleteness', () => {
  it('flags PF-R18-04 partial pack (1.000 of 3.625 kg) as incomplete', () => {
    const result = assessPackCompleteness(
      [{ lineId: 'line-1', qty: '3.625', uom: 'kg' }],
      [{ lineId: 'line-1', qty: '1.000' }],
    );

    expect(result.complete).toBe(false);
    expect(result.requiredDisplay).toBe('3.625 kg');
    expect(result.packedDisplay).toBe('1.000 kg');
    expect(result.remainingDisplay).toBe('2.625 kg');
  });

  it('accepts a fully packed shipment', () => {
    const result = assessPackCompleteness(
      [{ lineId: 'line-1', qty: '3.625', uom: 'kg' }],
      [{ lineId: 'line-1', qty: '3.625' }],
    );

    expect(result.complete).toBe(true);
    expect(result.remainingDisplay).toBe('0');
  });

  it('rejects a shipment with boxes but no positive quantity_picked lines', () => {
    const result = assessPackCompleteness([], [{ lineId: 'line-orphan', qty: '1.000' }]);

    expect(result.complete).toBe(false);
    expect(result.requiredDisplay).toBe('0');
  });

  it('groups remaining quantity per UoM instead of summing unlike units', () => {
    const result = assessPackCompleteness(
      [
        { lineId: 'line-kg', qty: '1.000', uom: 'kg' },
        { lineId: 'line-ea', qty: '3.000', uom: 'ea' },
      ],
      [
        { lineId: 'line-kg', qty: '1.000' },
        { lineId: 'line-ea', qty: '1.000' },
      ],
    );

    expect(result.complete).toBe(false);
    expect(result.remainingDisplay).toBe('2.000 ea');
    expect(formatShipmentQtyByUom([{ uom: 'kg', qty: '1.000' }, { uom: 'ea', qty: '3.000' }])).toBe(
      '1.000 kg · 3.000 ea',
    );
  });

  it('counts lines missing UoM separately from cross-line totals', () => {
    const result = assessPackCompleteness(
      [
        { lineId: 'line-kg', qty: '1.000', uom: 'kg' },
        { lineId: 'line-missing', qty: '2.000', uom: '—' },
      ],
      [
        { lineId: 'line-kg', qty: '1.000' },
        { lineId: 'line-missing', qty: '1.000' },
      ],
    );

    expect(result.complete).toBe(false);
    expect(result.skippedLineCount).toBe(1);
    expect(result.remainingDisplay).toBe('0');
  });
});
