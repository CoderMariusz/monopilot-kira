import { describe, expect, it } from 'vitest';

import { parseImportRows } from '../po-import-parser';
import { validateImportRows } from '../po-import-validator';

const lookups = {
  suppliers: new Map([['SUP-1', '11111111-1111-4111-8111-111111111111']]),
  items: new Map([['ITEM-1', '22222222-2222-4222-8222-222222222222']]),
};

describe('PO import parser', () => {
  it('parses a 3-row in-memory CSV string to records', async () => {
    const csv = [
      'supplier_code,item_code,qty,uom,notes',
      'SUP-1,ITEM-1,10,kg,first',
      'SUP-1,ITEM-1,20,kg,"quoted, note"',
      'SUP-1,ITEM-1,30,ea,third',
    ].join('\n');

    const rows = await parseImportRows(new File([csv], 'purchase-orders.csv', { type: 'text/csv' }));

    expect(rows).toEqual([
      { supplier_code: 'SUP-1', item_code: 'ITEM-1', qty: '10', uom: 'kg', notes: 'first' },
      { supplier_code: 'SUP-1', item_code: 'ITEM-1', qty: '20', uom: 'kg', notes: 'quoted, note' },
      { supplier_code: 'SUP-1', item_code: 'ITEM-1', qty: '30', uom: 'ea', notes: 'third' },
    ]);
  });
});

describe('PO import validator', () => {
  it('passes a valid row', () => {
    const result = validateImportRows([{ supplier_code: 'SUP-1', item_code: 'ITEM-1', qty: '10', uom: 'kg' }], lookups);

    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      expect.objectContaining({
        rowNumber: 1,
        supplierId: '11111111-1111-4111-8111-111111111111',
        itemId: '22222222-2222-4222-8222-222222222222',
        qty: '10',
        uom: 'kg',
      }),
    ]);
  });

  it('reports bad supplier, bad item, qty=0, and missing uom errors', () => {
    const result = validateImportRows(
      [{ supplier_code: 'SUP-MISSING', item_code: 'ITEM-MISSING', qty: '0', uom: '' }],
      lookups,
    );

    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ rowNumber: 1, column: 'supplier_code' }),
      expect.objectContaining({ rowNumber: 1, column: 'item_code' }),
      expect.objectContaining({ rowNumber: 1, column: 'qty' }),
      expect.objectContaining({ rowNumber: 1, column: 'uom' }),
    ]);
  });
});
