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

const searchItemsMock = vi.fn(async () => []);

vi.mock('../../suppliers/_actions/actions', () => ({
  listSuppliers: vi.fn(async () => ({ ok: false })),
}));

vi.mock('../../../../../../(npd)/fa/actions/search-items', () => ({
  searchItems: (input: unknown) => searchItemsMock(input),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u', orgId: 'o', client: { query: vi.fn(async () => ({ rows: [] })) } }),
}));

import { searchPoItems } from './po-form-data';

afterEach(() => {
  searchItemsMock.mockClear();
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
});
