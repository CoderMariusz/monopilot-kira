import { describe, expect, it } from 'vitest';

import {
  buildPoLineReceiptAggregates,
  resolveLineReceiptAggregate,
  type GrnLineForAggregate,
} from './grn-line-aggregates';

describe('grn-line-aggregates (C053 multi-receipt)', () => {
  it('sums all receipts for one PO line and shows zero outstanding when over-received', () => {
    const poLineId = 'pol-flour';
    const items: GrnLineForAggregate[] = [
      { poLineId, orderedQty: '13.456', receivedQty: '5.678' },
      { poLineId, orderedQty: '13.456', receivedQty: '7.779' },
    ];

    const aggregates = buildPoLineReceiptAggregates(items);
    const row1 = resolveLineReceiptAggregate(items[0]!, aggregates);
    const row2 = resolveLineReceiptAggregate(items[1]!, aggregates);

    expect(row1.outstanding).toBe('0');
    expect(row2.outstanding).toBe('0');
    expect(row1.state).toBe('over');
    expect(row2.state).toBe('over');
  });

  it('sums partial receipts and shows the remaining PO-line outstanding on every row', () => {
    const poLineId = 'pol-sugar';
    const items: GrnLineForAggregate[] = [
      { poLineId, orderedQty: '13.456', receivedQty: '5.678' },
      { poLineId, orderedQty: '13.456', receivedQty: '2.000' },
    ];

    const aggregates = buildPoLineReceiptAggregates(items);
    const row1 = resolveLineReceiptAggregate(items[0]!, aggregates);
    const row2 = resolveLineReceiptAggregate(items[1]!, aggregates);

    expect(row1.outstanding).toBe('5.778');
    expect(row2.outstanding).toBe('5.778');
    expect(row1.state).toBe('partial');
    expect(row2.state).toBe('partial');
  });
});
