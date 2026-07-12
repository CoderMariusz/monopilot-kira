import { describe, expect, it } from 'vitest';

import {
  fetchNonBlockedSupplierIds,
  pickProcurementSupplierId,
  resolveProcurementSuppliersForItems,
  type ItemSupplierResolution,
} from './resolve-item-supplier';

const ITEM_A = '33333333-3333-4333-8333-333333333333';
const ITEM_B = '44444444-4444-4444-8444-444444444444';
const SUP_OPEN_PO = '88888888-8888-4888-8888-888888888888';
const SUP_SPEC = '99999999-9999-4999-8999-999999999999';
const SUP_BLOCKED = '77777777-7777-4777-8777-777777777777';

describe('resolveProcurementSuppliersForItems (S13)', () => {
  it('prefers the most recent open PO supplier, then falls back to supplier_specs', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string, params?: readonly unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        calls.push(normalized);
        if (normalized.includes('distinct on (l.item_id)')) {
          expect(params?.[0]).toEqual([ITEM_A, ITEM_B]);
          expect(normalized).toContain("s.status <> 'blocked'");
          return {
            rows: [{ item_id: ITEM_A, supplier_id: SUP_OPEN_PO }],
            rowCount: 1,
          };
        }
        if (normalized.includes('distinct on (ss.item_id)')) {
          expect(params?.[0]).toEqual([ITEM_B]);
          expect(normalized).toContain('ss.supplier_id');
          expect(normalized).toContain('s_by_code');
          return {
            rows: [{ item_id: ITEM_B, supplier_id: SUP_SPEC }],
            rowCount: 1,
          };
        }
        throw new Error(`unexpected sql: ${normalized}`);
      },
    };

    const resolved = await resolveProcurementSuppliersForItems(client, [ITEM_A, ITEM_B], [
      'sent',
      'confirmed',
      'partially_received',
    ]);

    expect(resolved.get(ITEM_A)).toEqual({
      itemId: ITEM_A,
      supplierId: SUP_OPEN_PO,
      source: 'open_po',
    } satisfies ItemSupplierResolution);
    expect(resolved.get(ITEM_B)).toEqual({
      itemId: ITEM_B,
      supplierId: SUP_SPEC,
      source: 'supplier_spec',
    });
    expect(calls.some((sql) => sql.includes('distinct on (l.item_id)'))).toBe(true);
    expect(calls.some((sql) => sql.includes('distinct on (ss.item_id)'))).toBe(true);
  });

  it('skips blocked open-PO suppliers and falls back to an active supplier_spec link', async () => {
    const client = {
      query: async (sql: string, params?: readonly unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (normalized.includes('distinct on (l.item_id)')) {
          expect(params?.[0]).toEqual([ITEM_A]);
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('distinct on (ss.item_id)')) {
          return {
            rows: [{ item_id: ITEM_A, supplier_id: SUP_SPEC }],
            rowCount: 1,
          };
        }
        throw new Error(`unexpected sql: ${normalized}`);
      },
    };

    const resolved = await resolveProcurementSuppliersForItems(client, [ITEM_A], ['sent']);
    expect(resolved.get(ITEM_A)).toEqual({
      itemId: ITEM_A,
      supplierId: SUP_SPEC,
      source: 'supplier_spec',
    });
  });
});

describe('pickProcurementSupplierId', () => {
  it('keeps the threshold preferred supplier when set and eligible', () => {
    const map = new Map<string, ItemSupplierResolution>([
      [ITEM_A, { itemId: ITEM_A, supplierId: SUP_OPEN_PO, source: 'open_po' }],
    ]);
    expect(pickProcurementSupplierId(ITEM_A, SUP_SPEC, map)).toBe(SUP_SPEC);
  });

  it('falls back to resolved supplier when preferred is null', () => {
    const map = new Map<string, ItemSupplierResolution>([
      [ITEM_A, { itemId: ITEM_A, supplierId: SUP_OPEN_PO, source: 'open_po' }],
    ]);
    expect(pickProcurementSupplierId(ITEM_A, null, map)).toBe(SUP_OPEN_PO);
  });

  it('skips blocked preferred suppliers and uses the resolved open-PO supplier', () => {
    const map = new Map<string, ItemSupplierResolution>([
      [ITEM_A, { itemId: ITEM_A, supplierId: SUP_OPEN_PO, source: 'open_po' }],
    ]);
    const eligible = new Set([SUP_OPEN_PO]);
    expect(pickProcurementSupplierId(ITEM_A, SUP_BLOCKED, map, eligible)).toBe(SUP_OPEN_PO);
  });
});

describe('fetchNonBlockedSupplierIds', () => {
  it('returns only suppliers that are not blocked', async () => {
    const client = {
      query: async () => ({
        rows: [{ id: SUP_OPEN_PO }],
        rowCount: 1,
      }),
    };
    const eligible = await fetchNonBlockedSupplierIds(client, [SUP_OPEN_PO, SUP_BLOCKED]);
    expect(eligible).toEqual(new Set([SUP_OPEN_PO]));
  });
});
