/**
 * P2-PLANNING — searchPoItems default fan-out unit test (no DB).
 *
 * Audit (m-2): a packaging PO line was impossible because searchPoItems passed
 * the caller input straight through, so the items search fell back to its
 * recipe/component default which EXCLUDES packaging. Purchasing buys ALL
 * physical goods, so when the caller passes no itemTypes the PO picker must
 * widen the search to every purchasable type (packaging included); explicit
 * caller filters must still be preserved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const searchItemsMock = vi.fn(async (_input?: unknown): Promise<unknown[]> => []);
const queryMock = vi.fn(
  async (_sql: string, _params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> => ({ rows: [] }),
);

vi.mock('../../suppliers/_actions/actions', () => ({
  listSuppliers: vi.fn(async () => ({ ok: false })),
}));

vi.mock('../../../../../../(npd)/fa/actions/search-items', () => ({
  searchItems: (input: unknown) => searchItemsMock(input),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u', orgId: 'o', client: { query: queryMock } }),
}));

import { getItemSupplierPrice, searchPoItems } from './po-form-data';

afterEach(() => {
  searchItemsMock.mockClear();
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('searchPoItems default fan-out', () => {
  it('defaults to ALL purchasable types (packaging included) when no itemTypes given', async () => {
    await searchPoItems({ query: 'box' });
    const passed = searchItemsMock.mock.calls.at(-1)?.[0] as { itemTypes?: string[] };
    expect(passed.itemTypes).toEqual([
      'rm',
      'ingredient',
      'intermediate',
      'co_product',
      'byproduct',
      'packaging',
    ]);
    expect(passed.itemTypes).toContain('packaging');
  });

  it('preserves an explicit caller filter', async () => {
    await searchPoItems({ query: 'x', itemTypes: ['packaging'] });
    const passed = searchItemsMock.mock.calls.at(-1)?.[0] as { itemTypes?: string[] };
    expect(passed.itemTypes).toEqual(['packaging']);
  });

  it('widens an empty itemTypes array to the full purchasable set', async () => {
    await searchPoItems({ itemTypes: [] });
    const passed = searchItemsMock.mock.calls.at(-1)?.[0] as { itemTypes?: string[] };
    expect(passed.itemTypes).toContain('packaging');
    expect(passed.itemTypes).toContain('rm');
  });

  it('returns [] when the underlying search throws', async () => {
    searchItemsMock.mockRejectedValueOnce(new Error('boom'));
    await expect(searchPoItems({ query: 'x' })).resolves.toEqual([]);
  });

  it('resolves supplier code and passes supplierCode through when supplierId is given', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: 'SUP-001' }] });
    searchItemsMock.mockResolvedValueOnce([
      {
        id: 'item-1',
        itemCode: 'RM-SALT',
        name: 'Salt',
        itemType: 'rm',
        status: 'active',
        costPerKgEur: null,
        listPriceGbp: '1.4500',
        uomBase: 'kg',
      },
    ]);

    const result = await searchPoItems({ query: 'salt', supplierId: 'supplier-1' });
    const passed = searchItemsMock.mock.calls.at(-1)?.[0] as { supplierCode?: string };

    expect(queryMock.mock.calls.at(-1)?.[0]).toContain('from public.suppliers');
    expect(queryMock.mock.calls.at(-1)?.[1]).toEqual(['supplier-1']);
    expect(passed.supplierCode).toBe('SUP-001');
    expect(result[0]?.listPriceGbp).toBe('1.4500');
  });
});

describe('getItemSupplierPrice', () => {
  it('returns spec price with supplier currency fallback and date-window predicates', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ code: 'SUP-001', currency: 'EUR' }] })
      .mockResolvedValueOnce({ rows: [{ unit_price: '6.2500', currency: 'EUR' }] });

    const result = await getItemSupplierPrice({
      itemId: 'item-1',
      supplierId: 'supplier-1',
      date: '2026-06-30',
    });

    expect(result).toEqual({ ok: true, data: { unitPrice: '6.2500', currency: 'EUR', source: 'spec' } });
    const specSql = String(queryMock.mock.calls[1]?.[0] ?? '');
    expect(specSql).toContain('ss.effective_from <= coalesce($4::date, current_date)');
    expect(specSql).toContain('ss.expiry_date is null or ss.expiry_date >= coalesce($4::date, current_date)');
    expect(queryMock.mock.calls[1]?.[1]).toEqual(['item-1', 'SUP-001', 'EUR', '2026-06-30']);
  });

  it('falls back to items.list_price_gbp when supplier currency is GBP', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ code: 'SUP-001', currency: 'GBP' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ unit_price: '4.9900' }] });

    const result = await getItemSupplierPrice({ itemId: 'item-1', supplierId: 'supplier-1' });

    expect(result).toEqual({ ok: true, data: { unitPrice: '4.9900', currency: 'GBP', source: 'list_price' } });
    expect(String(queryMock.mock.calls[2]?.[0] ?? '')).toContain('list_price_gbp::text as unit_price');
  });

  it('does not prefill list_price_gbp for non-GBP supplier — leaves price empty', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ code: 'SUP-001', currency: 'EUR' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getItemSupplierPrice({ itemId: 'item-1', supplierId: 'supplier-1' });

    expect(result).toEqual({ ok: true, data: { unitPrice: null, currency: null, source: 'none' } });
    expect(queryMock.mock.calls.some((call) => String(call[0]).includes('list_price_gbp'))).toBe(false);
  });

  it('returns none when neither supplier spec nor list price exists', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ code: 'SUP-001', currency: 'EUR' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ unit_price: null }] });

    const result = await getItemSupplierPrice({ itemId: 'item-1', supplierId: 'supplier-1' });

    expect(result).toEqual({ ok: true, data: { unitPrice: null, currency: null, source: 'none' } });
  });
});
