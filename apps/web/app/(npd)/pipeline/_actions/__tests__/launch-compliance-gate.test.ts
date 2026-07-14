import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalCriteriaResult } from '@monopilot/domain';

const evaluateApprovalCriteriaWithClientMock = vi.fn();

vi.mock('../../[projectId]/approval/_actions/evaluate-core', () => ({
  evaluateApprovalCriteriaWithClient: (...args: unknown[]) => evaluateApprovalCriteriaWithClientMock(...args),
}));

const CTX = {
  userId: '22222222-2222-4222-8222-222222222222',
  orgId: '33333333-3333-4333-8333-333333333333',
  client: { query: vi.fn(async () => ({ rows: [] })) },
};

// ctx whose compliance-docs presence query returns `validDocs` valid documents.
function ctxWithDocs(validDocs: number) {
  return {
    ...CTX,
    client: { query: vi.fn(async () => ({ rows: [{ valid_docs: validDocs }] })) },
  };
}

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'NPD-001',
  name: 'Launch test',
  type: 'single',
  current_gate: 'G4' as const,
  current_stage: 'handoff',
  product_code: 'FG-001',
};

async function loadHelpers() {
  return import('../_lib/gate-helpers');
}

describe('launchBlockingCriteria', () => {
  it('blocks only on pending criteria; warns pass through', async () => {
    const { launchBlockingCriteria } = await loadHelpers();
    const criteria: ApprovalCriteriaResult = {
      C1: 'pass',
      C2: 'warn',
      C3: 'warn',
      C4: 'not_required',
      C5: 'pending',
      C6: 'warn',
      C7: 'pending',
    };
    expect(launchBlockingCriteria(criteria)).toEqual(['C5', 'C7']);
  });
});

describe('getLaunchComplianceBlockers', () => {
  beforeEach(() => {
    vi.resetModules();
    evaluateApprovalCriteriaWithClientMock.mockReset();
  });

  it('blocks when C7 compliance docs are pending (no active docs)', async () => {
    const { getLaunchComplianceBlockers } = await loadHelpers();
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

    const blockers = await getLaunchComplianceBlockers(CTX as never, PROJECT);
    expect(evaluateApprovalCriteriaWithClientMock).toHaveBeenCalledWith(CTX.client, 'FG-001');
    expect(blockers).toEqual([
      expect.objectContaining({
        code: 'LAUNCH_COMPLIANCE_BLOCKED',
        pendingCriteria: 'C7',
        message: expect.stringContaining('Compliance documents'),
      }),
    ]);
  });

  it('returns no blockers when all required criteria are satisfied', async () => {
    const { getLaunchComplianceBlockers } = await loadHelpers();
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

    await expect(getLaunchComplianceBlockers(ctxWithDocs(1) as never, PROJECT)).resolves.toEqual([]);
  });

  it('blocks launch when compliance docs are absent even though C7 config is not_required', async () => {
    // Regression: org marks C7 required=false so the evaluator returns not_required,
    // but a launch (dispatch gate) must still require valid compliance docs.
    const { getLaunchComplianceBlockers } = await loadHelpers();
    evaluateApprovalCriteriaWithClientMock.mockResolvedValue({
      ok: true,
      data: { C1: 'pass', C2: 'pass', C3: 'pass', C4: 'not_required', C5: 'pass', C6: 'pass', C7: 'not_required' },
    });
    const blockers = await getLaunchComplianceBlockers(ctxWithDocs(0) as never, PROJECT);
    expect(blockers).toEqual([
      expect.objectContaining({
        code: 'LAUNCH_COMPLIANCE_BLOCKED',
        pendingCriteria: 'C7',
        message: expect.stringContaining('Compliance documents'),
      }),
    ]);
  });

  it('blocks when the project has no mapped FG product code', async () => {
    const { getLaunchComplianceBlockers } = await loadHelpers();
    const blockers = await getLaunchComplianceBlockers(CTX as never, { ...PROJECT, product_code: null });
    expect(blockers).toEqual([
      expect.objectContaining({ code: 'LAUNCH_COMPLIANCE_BLOCKED' }),
    ]);
    expect(evaluateApprovalCriteriaWithClientMock).not.toHaveBeenCalled();
  });
});
