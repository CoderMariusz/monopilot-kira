import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: { userId: string; orgId: string; client: { query: typeof queryMock } }) => unknown) =>
    action({ userId: '11111111-1111-4111-8111-111111111111', orgId: '22222222-2222-4222-8222-222222222222', client: { query: queryMock } }),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

const projectId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const lockedVersionId = '55555555-5555-4555-8555-555555555555';

describe('submitForTrial lock gate (S19)', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('transitions a locked version to submitted_for_trial on success', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          formulation_id: '66666666-6666-4666-8666-666666666666',
          version_id: lockedVersionId,
          state: 'locked',
          product_code: 'FG-1',
          total_pct: '100.000',
          missing_cost_count: 0,
          missing_nutrition_target_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: lockedVersionId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(submitForTrial({ projectId, versionId: lockedVersionId })).resolves.toEqual({
      ok: true,
      data: { versionId: lockedVersionId, trialCreated: true },
    });

    const stateUpdate = queryMock.mock.calls.find(([sql]) => String(sql).includes("set state = 'submitted_for_trial'"));
    expect(stateUpdate).toBeDefined();
    expect(String(stateUpdate?.[0])).toContain("fv.state = 'locked'");
  });

  it('returns VERSION_NOT_LOCKED for draft versions', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ state: 'draft' }] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'VERSION_NOT_LOCKED',
    });
  });

  it('resolves the current locked version for the same formulation when the client passes a stale draft version id', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          formulation_id: '66666666-6666-4666-8666-666666666666',
          version_id: lockedVersionId,
          state: 'locked',
          product_code: 'FG-1',
          total_pct: '100.000',
          missing_cost_count: 0,
          missing_nutrition_target_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-trial' }] })
      .mockResolvedValueOnce({ rows: [{ id: lockedVersionId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: true,
      data: { versionId: lockedVersionId, trialCreated: false },
    });

    const gateSql = String(queryMock.mock.calls[0]?.[0]);
    expect(gateSql).toContain('cross join lateral');
    expect(gateSql).toContain('where f.id = r.formulation_id');
    expect(gateSql).not.toMatch(/where f\.project_id = \$1::uuid\s+and f\.org_id = app\.current_org_id\(\)\s+and fv\.state = 'locked'/);
  });

  it('scopes stale-version fallback to the requested formulation, not the whole project', async () => {
    const { submitForTrial } = await import('../submit-for-trial');

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ state: 'draft' }] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'VERSION_NOT_LOCKED',
    });

    const gateSql = String(queryMock.mock.calls[0]?.[0]);
    expect(gateSql).toContain('from requested r');
    expect(gateSql).toContain('cross join lateral');
    expect(gateSql).toContain('order by fv.version_number desc');
    expect(gateSql).toContain('group by rv.formulation_id, rv.version_id, rv.state, rv.product_code, rv.rank');
    expect(gateSql).not.toMatch(
      /union all\s+select f\.id, fv\.id[\s\S]*where f\.project_id = \$1::uuid[\s\S]*and fv\.state = 'locked'/i,
    );
  });

  it('derives missing nutrition targets from the flat cached nutrient JSON', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock.mockResolvedValueOnce({
      rows: [{
        formulation_id: '66666666-6666-4666-8666-666666666666',
        version_id: lockedVersionId,
        state: 'locked',
        product_code: 'FG-1',
        total_pct: '100.000',
        missing_cost_count: 0,
        missing_nutrition_target_count: 1,
      }],
    });

    await expect(submitForTrial({ projectId, versionId: lockedVersionId })).resolves.toEqual({
      ok: false,
      error: 'MISSING_NUTRITION_TARGET',
    });

    const gateSql = String(queryMock.mock.calls[0]?.[0]);
    expect(gateSql).toContain('unnest($3::text[])');
    expect(gateSql).not.toContain("nutrition_json->'missingTargets'");
  });
});
