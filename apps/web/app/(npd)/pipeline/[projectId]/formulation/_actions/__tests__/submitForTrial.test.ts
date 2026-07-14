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

const locked = (actualTotalPct: string) => ({
  formulation_id: formulationId,
  version_id: versionId,
  state: 'locked',
  product_code: null,
  actual_total_pct: actualTotalPct,
  missing_cost_count: 0,
  missing_nutrition_target_count: 0,
});

describe('submitForTrial validity gate', () => {
  beforeEach(() => queryMock.mockReset());

  it('rejects a locked version whose actual mass balance is 100.02%', async () => {
    queryMock.mockResolvedValueOnce({ rows: [locked('100.02')] });
    const { submitForTrial } = await import('../submit-for-trial');

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'TOTAL_PCT_OUT_OF_RANGE',
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('submits the requested validly locked version', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [locked('99.99')] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: versionId }] })
      .mockResolvedValue({ rows: [] });
    const { submitForTrial } = await import('../submit-for-trial');

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: true,
      data: { versionId, trialCreated: true },
    });
    expect(String(queryMock.mock.calls[3]?.[0])).toContain("fv.state = 'locked'");
  });
});
