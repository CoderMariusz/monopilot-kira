/**
 * Lane-B — searchItems fan-out unit test (no DB).
 *
 * Mocks withOrgContext so we can assert the item_type[] bound into the query
 * WITHOUT a live Postgres: the audit (m-1) requires 'byproduct' to be both
 * SEARCHABLE (accepted in the itemTypes filter) and part of the DEFAULT
 * component fan-out (a by-product / trim can be reused as a recipe input),
 * while packaging stays explicit-only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn(async () => ({ rows: [] }));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u', orgId: 'o', client: { query: queryMock } }),
}));

import { searchItems } from '../search-items';

/** The item_type[] is bound as the first query param ($1). */
function lastBoundTypes(): string[] {
  const call = queryMock.mock.calls.at(-1);
  const params = call?.[1] as unknown[];
  return params?.[0] as string[];
}

afterEach(() => {
  queryMock.mockClear();
});

describe('searchItems item-type fan-out', () => {
  it('defaults to component types INCLUDING byproduct but EXCLUDING packaging', async () => {
    await searchItems({ query: 'tri' });
    const types = lastBoundTypes();
    expect(types).toEqual(['rm', 'ingredient', 'intermediate', 'co_product', 'byproduct']);
    expect(types).toContain('byproduct');
    expect(types).not.toContain('packaging');
    expect(types).not.toContain('fg');
  });

  it('accepts an explicit byproduct-only filter (byproduct is searchable)', async () => {
    await searchItems({ query: '', itemTypes: ['byproduct'] });
    expect(lastBoundTypes()).toEqual(['byproduct']);
  });

  it('still honours an explicit packaging-only filter', async () => {
    await searchItems({ itemTypes: ['packaging'] });
    expect(lastBoundTypes()).toEqual(['packaging']);
  });

  it('rejects an item type outside the searchable union', async () => {
    // 'service' is not a legal items.item_type — zod enum should reject it.
    await expect(searchItems({ itemTypes: ['service' as never] })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
