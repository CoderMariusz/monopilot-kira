import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateApprovalCriteriaWithClientMock = vi.fn();

vi.mock('../../[projectId]/approval/_actions/evaluate-core', () => ({
  evaluateApprovalCriteriaWithClient: (...args: unknown[]) => evaluateApprovalCriteriaWithClientMock(...args),
}));

const HANDOFF_PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'NPD-HO-001',
  name: 'Handoff project',
  type: 'single',
  current_gate: 'G4' as const,
  current_stage: 'handoff',
  product_code: 'FG-HO-001',
};

const db = {
  userId: '22222222-2222-4222-8222-222222222222',
  orgId: '33333333-3333-4333-8333-333333333333',
  client: {
    query: vi.fn(async () => ({ rows: [] })),
  },
};

async function loadAdvanceGate() {
  return import('../advance-project-gate');
}

describe('evaluateStageGate handoff → launched compliance', () => {
  beforeEach(() => {
    vi.resetModules();
    evaluateApprovalCriteriaWithClientMock.mockReset();
  });

  it('returns HARD_BLOCKED when compliance docs are pending (C7)', async () => {
    const { evaluateStageGate } = await loadAdvanceGate();
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

    const evaluation = await evaluateStageGate(
      HANDOFF_PROJECT.id,
      'handoff',
      'launched',
      db as never,
      HANDOFF_PROJECT,
    );

    expect(evaluation).toEqual({
      status: 'HARD_BLOCKED',
      hardReason: 'LAUNCH_COMPLIANCE_BLOCKED',
      blockers: [
        expect.objectContaining({
          code: 'LAUNCH_COMPLIANCE_BLOCKED',
          pendingCriteria: 'C7',
        }),
      ],
    });
  });

  it('passes when compliance criteria are satisfied', async () => {
    const { evaluateStageGate } = await loadAdvanceGate();
    evaluateApprovalCriteriaWithClientMock.mockResolvedValue({
      ok: true,
      data: {
        C1: 'pass',
        C2: 'warn',
        C3: 'warn',
        C4: 'not_required',
        C5: 'pass',
        C6: 'warn',
        C7: 'pass',
      },
    });

    const evaluation = await evaluateStageGate(
      HANDOFF_PROJECT.id,
      'handoff',
      'launched',
      db as never,
      HANDOFF_PROJECT,
    );

    expect(evaluation).toEqual({ status: 'PASS' });
  });
});
