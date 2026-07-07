/**
 * Wave-shipping — listSoUnits unit test (no DB).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn(
  async (_sql: string, _params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> => ({
    rows: [
      { code: 'kg', name: 'Kilogram', category: 'mass' },
      { code: 'pcs', name: 'Pieces', category: 'count' },
    ],
  }),
);

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u', orgId: 'o', client: { query: queryMock } }),
}));

import { listSoUnits } from '../so-form-data';

afterEach(() => {
  queryMock.mockClear();
});

describe('listSoUnits', () => {
  it('reads active units from public.unit_of_measure (org-scoped)', async () => {
    const units = await listSoUnits();
    expect(units).toEqual([
      { code: 'kg', name: 'Kilogram', category: 'mass' },
      { code: 'pcs', name: 'Pieces', category: 'count' },
    ]);
    expect(queryMock.mock.calls.some(([sql]) => /from public\.unit_of_measure/i.test(sql))).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) => /app\.current_org_id\(\)/i.test(sql))).toBe(true);
  });
});
