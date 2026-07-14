import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateApprovalCriteriaWithClientMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../[projectId]/approval/_actions/evaluate-core', () => ({
  evaluateApprovalCriteriaWithClient: (...args: unknown[]) => evaluateApprovalCriteriaWithClientMock(...args),
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const ctx = {
  userId: '22222222-2222-4222-8222-222222222222',
  orgId: '33333333-3333-4333-8333-333333333333',
  handler: (() => ({ rows: [] })) as (sql: string, params?: readonly unknown[]) => { rows: unknown[] },
};

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

describe('advanceProjectGate handoff → launched compliance', () => {
  beforeEach(() => {
    vi.resetModules();
    evaluateApprovalCriteriaWithClientMock.mockReset();
    ctx.handler = () => ({ rows: [] });
  });

  it('returns BLOCKERS_PRESENT 409 when compliance docs are pending', async () => {
    ctx.handler = (sql) => {
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (sql.includes('from public.npd_projects') && sql.includes('for update')) {
        return {
          rows: [{
            id: PROJECT_ID,
            code: 'NPD-HO-001',
            name: 'Handoff project',
            type: 'single',
            current_gate: 'G4',
            current_stage: 'handoff',
            product_code: 'FG-HO-001',
          }],
        };
      }
      return { rows: [] };
    };

    evaluateApprovalCriteriaWithClientMock.mockResolvedValue({
      ok: true,
      data: {
        C1: 'pass',
        C2: 'pass',
        C3: 'pass',
        C4: 'not_required',
        C5: 'pass',
        C6: 'pass',
        C7: 'pending',
      },
    });

    const { advanceProjectGate } = await import('../advance-project-gate');
    const result = await advanceProjectGate({ projectId: PROJECT_ID, targetStage: 'launched' });

    expect(result).toEqual({
      ok: false,
      error: 'BLOCKERS_PRESENT',
      status: 409,
      blockers: [
        expect.objectContaining({
          code: 'LAUNCH_COMPLIANCE_BLOCKED',
          pendingCriteria: 'C7',
        }),
      ],
    });
    expect(evaluateApprovalCriteriaWithClientMock).toHaveBeenCalledWith(expect.anything(), 'FG-HO-001');
  });
});

describe('closeOutLegacyStages RPC removal', () => {
  it('does not export the ungated closeOutLegacyStages server action', async () => {
    const mod = await import('../close-out-legacy-stages');
    expect(mod).not.toHaveProperty('closeOutLegacyStages');
    expect(typeof mod.closeOutLegacyStagesForLaunch).toBe('function');
  });
});
