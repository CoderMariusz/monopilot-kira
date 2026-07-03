import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

import { saveCostingInputs } from '../save-costing-inputs';

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => {
  queryMock.mockReset();
});

beforeEach(() => {
  queryMock.mockImplementation(async (sql: string) => {
    if (/from\s+public\.user_roles/i.test(sql)) return { rows: [{ ok: true }] };
    if (/update\s+public\.npd_projects/i.test(sql)) return { rows: [{ id: projectId }], rowCount: 1 };
    return { rows: [] };
  });
});

describe('saveCostingInputs', () => {
  it('persists avg batch qty and override columns org-scoped', async () => {
    const result = await saveCostingInputs({
      projectId,
      avgBatchQty: '120',
      overheadPerKgOverride: '0.55',
      logisticsPerBoxOverride: null,
    });

    expect(result).toEqual({ ok: true });
    const updateCall = queryMock.mock.calls.find((call) =>
      /update\s+public\.npd_projects/i.test(String(call[0])),
    );
    expect(updateCall?.[1]).toEqual([projectId, '120', '0.55', null]);
    expect(String(updateCall?.[0])).toContain('app.current_org_id()');
  });

  it('returns not_found when the project is invisible', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/from\s+public\.user_roles/i.test(sql)) return { rows: [{ ok: true }] };
      if (/update\s+public\.npd_projects/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const result = await saveCostingInputs({
      projectId,
      avgBatchQty: '1',
      overheadPerKgOverride: null,
      logisticsPerBoxOverride: null,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Project not found in this organisation',
      code: 'not_found',
    });
  });

  it('rejects invalid numeric input', async () => {
    const result = await saveCostingInputs({
      projectId,
      avgBatchQty: 'not-a-number',
      overheadPerKgOverride: null,
      logisticsPerBoxOverride: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_input');
    }
  });
});
