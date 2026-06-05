import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({ userId: '11111111-1111-4111-8111-111111111111', orgId: '22222222-2222-4222-8222-222222222222', client: { query: queryMock } }),
}));

const projectId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';

describe('submitForTrial nutrition gate', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('derives missing nutrition targets from the flat cached nutrient JSON', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [{
          formulation_id: '55555555-5555-4555-8555-555555555555',
          version_id: versionId,
          state: 'draft',
          product_code: 'FG-1',
          total_pct: '100.000',
          missing_cost_count: 0,
          missing_nutrition_target_count: 1,
        }],
      });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'MISSING_NUTRITION_TARGET',
    });

    const gateSql = String(queryMock.mock.calls[1]?.[0]);
    expect(gateSql).toContain('unnest($3::text[])');
    expect(gateSql).not.toContain("nutrition_json->'missingTargets'");
    expect(queryMock.mock.calls[1]?.[1]).toEqual([
      projectId,
      versionId,
      ['energy_kj', 'fat_g', 'saturates_g', 'carbs_g', 'sugars_g', 'protein_g', 'salt_g'],
    ]);
  });
});
