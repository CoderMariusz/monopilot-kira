import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  evaluateApprovalCriteria: vi.fn(),
  closeOut: vi.fn(),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '22222222-2222-4222-8222-222222222222',
      orgId: '33333333-3333-4333-8333-333333333333',
      client: { query: mocks.query },
    }),
}));
vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));
vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: '44444444-4444-4444-8444-444444444444',
    signedAt: '2026-07-30T12:00:00.000Z',
  })),
}));
vi.mock('../../[projectId]/approval/_actions/evaluate-core', () => ({
  evaluateApprovalCriteriaWithClient: (...args: unknown[]) =>
    mocks.evaluateApprovalCriteria(...args),
}));
vi.mock('../close-out-legacy-stages', () => ({
  closeOutLegacyStagesForLaunch: (...args: unknown[]) => mocks.closeOut(...args),
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '55555555-5555-4555-8555-555555555555';

const scenario = {
  permission: true,
  validDocs: 1,
  project: {
    id: PROJECT_ID,
    code: 'NPD-NSA',
    name: 'Phase 2 contract',
    type: 'standard',
    current_gate: 'G0',
    current_stage: 'brief',
    product_code: null as string | null,
  },
};

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  vi.clearAllMocks();
  scenario.permission = true;
  scenario.validDocs = 1;
  scenario.project = {
    id: PROJECT_ID,
    code: 'NPD-NSA',
    name: 'Phase 2 contract',
    type: 'standard',
    current_gate: 'G0',
    current_stage: 'brief',
    product_code: null,
  };
  mocks.evaluateApprovalCriteria.mockResolvedValue({
    ok: true,
    data: {
      C1: 'pass',
      C2: 'pass',
      C3: 'pass',
      C4: 'not_required',
      C5: 'pass',
      C6: 'pass',
      C7: 'not_required',
    },
  });
  mocks.closeOut.mockResolvedValue({ id: APPROVAL_ID, fg_product_code: 'FG-NSA' });
  mocks.query.mockImplementation(async (sql: string) => {
    const query = normalized(sql);
    if (query.includes('from public.user_roles')) {
      return { rows: [{ ok: scenario.permission }], rowCount: 1 };
    }
    if (query.includes('from public.npd_projects') && query.includes('for update')) {
      return { rows: [scenario.project], rowCount: 1 };
    }
    if (query.includes('from public.compliance_docs')) {
      return { rows: [{ valid_docs: scenario.validDocs }], rowCount: 1 };
    }
    if (query.includes('insert into public.gate_approvals')) {
      return { rows: [{ id: APPROVAL_ID }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
});

describe('Phase 2 NPD gate contracts', () => {
  it('NSA-007 rejects advance without npd.gate.advance and allows it with the permission', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');

    scenario.permission = false;
    await expect(
      advanceProjectGate({ projectId: PROJECT_ID, targetStage: 'brief' }),
    ).resolves.toMatchObject({ ok: false, error: 'FORBIDDEN', status: 403 });
    expect(mocks.query.mock.calls.some(([sql]) => normalized(sql).includes('for update'))).toBe(false);

    scenario.permission = true;
    await expect(
      advanceProjectGate({ projectId: PROJECT_ID, targetStage: 'brief' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { projectId: PROJECT_ID, currentGate: 'G1', currentStage: 'brief' },
    });
  });

  it('NSA-017 blocks launch with C7 not_required and zero valid docs, but allows a valid doc', async () => {
    const { advanceProjectGate } = await import('../advance-project-gate');
    scenario.project = {
      ...scenario.project,
      current_gate: 'G4',
      current_stage: 'handoff',
      product_code: 'FG-NSA',
    };

    scenario.validDocs = 0;
    await expect(
      advanceProjectGate({ projectId: PROJECT_ID, targetStage: 'launched' }),
    ).resolves.toMatchObject({
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
    expect(mocks.closeOut).not.toHaveBeenCalled();

    scenario.validDocs = 1;
    await expect(
      advanceProjectGate({ projectId: PROJECT_ID, targetStage: 'launched' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { currentGate: 'Launched', currentStage: 'launched', productCode: 'FG-NSA' },
    });
  });

  it('NSA-018 requires a password for approve but not for reject', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');
    scenario.project = {
      ...scenario.project,
      current_gate: 'G3',
      current_stage: 'trial',
    };

    await expect(
      approveProjectGate({
        projectId: PROJECT_ID,
        gateCode: 'G3',
        decision: 'approved',
        notes: 'Approval without password',
      } as never),
    ).resolves.toEqual({ ok: false, error: 'INVALID_INPUT', status: 400 });
    expect(mocks.query).not.toHaveBeenCalled();

    await expect(
      approveProjectGate({
        projectId: PROJECT_ID,
        gateCode: 'G3',
        decision: 'rejected',
        notes: 'Rejected without password',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { decision: 'rejected', currentGate: 'G3', currentStage: 'trial' },
    });
  });

  it('NSA-020 rejects approval without npd.gate.approve and allows it with the permission', async () => {
    const { approveProjectGate } = await import('../approve-project-gate');
    scenario.project = {
      ...scenario.project,
      current_gate: 'G3',
      current_stage: 'trial',
    };
    const input = {
      projectId: PROJECT_ID,
      gateCode: 'G3' as const,
      decision: 'rejected' as const,
      notes: 'Permission boundary',
    };

    scenario.permission = false;
    await expect(approveProjectGate(input)).resolves.toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
      status: 403,
    });

    scenario.permission = true;
    await expect(approveProjectGate(input)).resolves.toMatchObject({
      ok: true,
      data: { decision: 'rejected' },
    });
  });
});
