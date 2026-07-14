import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({ userId: '11111111-1111-4111-8111-111111111111', client: { query: queryMock } }),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

const projectId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const formulationId = '44444444-4444-4444-8444-444444444444';

const draft = (actualTotalPct: string) => ({
  formulation_id: formulationId,
  version_id: versionId,
  state: 'draft',
  product_code: null,
  actual_total_pct: actualTotalPct,
  missing_cost_count: 0,
  missing_nutrition_target_count: 0,
});

describe('lockVersion validity gate', () => {
  beforeEach(() => queryMock.mockReset());

  it('rejects a draft whose actual mass balance is 100.02%', async () => {
    queryMock.mockResolvedValueOnce({ rows: [draft('100.02')] });
    const { lockVersion } = await import('../lock-version');

    await expect(lockVersion({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'TOTAL_PCT_OUT_OF_RANGE',
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('locks a valid draft', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [draft('100.01')] })
      .mockResolvedValue({ rows: [] });
    const { lockVersion } = await import('../lock-version');

    await expect(lockVersion({ projectId, versionId })).resolves.toMatchObject({
      ok: true,
      data: { formulationId, versionId },
    });
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("state = 'locked'");
  });
});
