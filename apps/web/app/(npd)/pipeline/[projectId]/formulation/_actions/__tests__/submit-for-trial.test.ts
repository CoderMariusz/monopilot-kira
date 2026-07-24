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
          actual_total_pct: '100.000',
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
    queryMock.mockResolvedValueOnce({ rows: [{
      formulation_id: '66666666-6666-4666-8666-666666666666',
      version_id: versionId,
      state: 'draft',
      product_code: 'FG-1',
      actual_total_pct: '100.000',
      missing_cost_count: 0,
      missing_nutrition_target_count: 0,
    }] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'VERSION_NOT_LOCKED',
    });
  });

  it('does not substitute another locked version when the requested version is a stale draft', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock.mockResolvedValueOnce({ rows: [{
      formulation_id: '66666666-6666-4666-8666-666666666666',
      version_id: versionId,
      state: 'draft',
      product_code: 'FG-1',
      actual_total_pct: '100.000',
      missing_cost_count: 0,
      missing_nutrition_target_count: 0,
    }] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'VERSION_NOT_LOCKED',
    });

    const gateSql = String(queryMock.mock.calls[0]?.[0]);
    expect(gateSql).not.toContain('cross join lateral');
    expect(gateSql).toContain('and fv.id = $2::uuid');
  });

  it('returns not_found when the requested version does not exist', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(submitForTrial({ projectId, versionId })).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });

    const gateSql = String(queryMock.mock.calls[0]?.[0]);
    expect(gateSql).toContain('and fv.id = $2::uuid');
  });

  it('derives missing nutrition targets from the flat cached nutrient JSON', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock.mockResolvedValueOnce({
      rows: [{
        formulation_id: '66666666-6666-4666-8666-666666666666',
        version_id: lockedVersionId,
        state: 'locked',
        product_code: 'FG-1',
        actual_total_pct: '100.000',
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

  // PF-R04-12 review: a project whose only trial was VOIDED must get a real new
  // trial on resubmission — otherwise the version flips to submitted_for_trial
  // and reports success with nothing behind it. The voided row keeps its number
  // under the (org_id, project_id, trial_no) unique index, so the new trial must
  // take the next free sequence rather than reusing 'T-1'.
  it('creates a fresh trial when the only existing one was voided', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          formulation_id: '66666666-6666-4666-8666-666666666666',
          version_id: lockedVersionId,
          state: 'locked',
          product_code: 'FG-1',
          actual_total_pct: '100.000',
          missing_cost_count: 0,
          missing_nutrition_target_count: 0,
        }],
      })
      // Only trial is voided → no ACTIVE trial, next free number is T-2.
      .mockResolvedValueOnce({ rows: [{ has_active_trial: false, next_trial_no: 'T-2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: lockedVersionId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(submitForTrial({ projectId, versionId: lockedVersionId })).resolves.toEqual({
      ok: true,
      data: { versionId: lockedVersionId, trialCreated: true },
    });

    const existsProbe = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('has_active_trial'),
    );
    // Voided rows must not count as an existing trial.
    expect(String(existsProbe?.[0])).toContain('voided_at is null');

    const insert = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('insert into public.trial_batches'),
    );
    expect(insert).toBeDefined();
    expect(insert?.[1]).toContain('T-2');
  });

  it('does not create a second trial when an active one already exists', async () => {
    const { submitForTrial } = await import('../submit-for-trial');
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          formulation_id: '66666666-6666-4666-8666-666666666666',
          version_id: lockedVersionId,
          state: 'locked',
          product_code: 'FG-1',
          actual_total_pct: '100.000',
          missing_cost_count: 0,
          missing_nutrition_target_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ has_active_trial: true, next_trial_no: 'T-2' }] })
      .mockResolvedValueOnce({ rows: [{ id: lockedVersionId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(submitForTrial({ projectId, versionId: lockedVersionId })).resolves.toEqual({
      ok: true,
      data: { versionId: lockedVersionId, trialCreated: false },
    });

    expect(
      queryMock.mock.calls.some(([sql]) => String(sql).includes('insert into public.trial_batches')),
    ).toBe(false);
  });
});
