import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

import { listNpdCostParams } from '../list-npd-cost-params';
import { upsertNpdCostParams } from '../upsert-npd-cost-params';

afterEach(() => {
  queryMock.mockReset();
});

beforeEach(() => {
  queryMock.mockImplementation(async (sql: string) => {
    if (/from\s+public\.user_roles/i.test(sql)) return { rows: [{ ok: true }] };
    if (/from\s+public\.org_npd_cost_params/i.test(sql)) {
      return { rows: [{ overhead_per_kg: '0.42', logistics_per_box: '0.18' }] };
    }
    if (/insert\s+into\s+public\.org_npd_cost_params/i.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
});

describe('npd cost params actions', () => {
  it('listNpdCostParams returns org defaults', async () => {
    const result = await listNpdCostParams();
    expect(result).toEqual({
      ok: true,
      data: { overheadPerKg: '0.42', logisticsPerBox: '0.18' },
    });
    expect(String(queryMock.mock.calls[1][0])).toContain('app.current_org_id()');
  });

  it('upsertNpdCostParams upserts a single org row', async () => {
    const result = await upsertNpdCostParams({ overheadPerKg: '0.50', logisticsPerBox: '0.20' });
    expect(result).toEqual({ ok: true });
    const upsertCall = queryMock.mock.calls.find((call) =>
      /insert\s+into\s+public\.org_npd_cost_params/i.test(String(call[0])),
    );
    expect(upsertCall?.[1]).toEqual(['0.50', '0.20']);
    expect(String(upsertCall?.[0])).toContain('on conflict (org_id)');
  });

  it('upsertNpdCostParams rejects negative values', async () => {
    const result = await upsertNpdCostParams({ overheadPerKg: '-1', logisticsPerBox: '0.20' });
    expect(result).toEqual({ ok: false, code: 'invalid_input' });
  });
});
