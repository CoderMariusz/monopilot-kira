import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computeGateApprovalSubjectHash } from '../../../../../lib/npd/gate-approval-esign';

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const PROJECT_A = '00000000-0000-4000-8000-0000000000a1';
const PROJECT_B = '00000000-0000-4000-8000-0000000000b2';
const USER = '00000000-0000-4000-8000-0000000000aa';

const ctx = {
  userId: USER,
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
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

import { getProject } from '../get-project';

const HASH_G4_A = computeGateApprovalSubjectHash({
  projectId: PROJECT_A,
  projectCode: 'NPD-A',
  gateCode: 'G4',
  decision: 'approved',
});
const HASH_G4_B = computeGateApprovalSubjectHash({
  projectId: PROJECT_B,
  projectCode: 'NPD-B',
  gateCode: 'G4',
  decision: 'approved',
});

function baseProjectRow(projectId: string, code: string) {
  return {
    id: projectId,
    code,
    name: 'Product',
    type: 'Deli',
    current_gate: 'G4',
    current_stage: 'approval',
    prio: 'normal',
    owner: 'owner',
    target_launch: '2026-06-01',
    notes: null,
    product_code: 'FG-1',
    created_at: '2026-06-01T00:00:00.000Z',
    checklist_total: '0',
    checklist_completed: '0',
    recipe_ingredient_count: 0,
    has_locked_formulation: false,
    linked_bom_count: 0,
  };
}

function approvalRow(input: {
  id: string;
  projectId: string;
  projectCode: string;
  gateCode: 'G3' | 'G4';
  signatureId: string | null;
  receiptHash: string | null;
  esignedAt: string;
}) {
  return {
    id: input.id,
    project_id: input.projectId,
    gate_code: input.gateCode,
    decision: 'approved',
    approver_user_id: USER,
    approver_name: 'Approver',
    notes: 'ok',
    rejection_reason: null,
    esigned_at: input.esignedAt,
    esign_hash: 'legacy-hash',
    signature_id: input.signatureId,
    project_code: input.projectCode,
    receipt_subject_hash: input.receiptHash,
    created_at: input.esignedAt,
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
});

describe('getProject approval e-sign correlation', () => {
  it('does not assign a neighbouring gate/project receipt when two approvals share a signer and timestamp window', async () => {
    const sharedSignedAt = '2026-06-01T10:00:00.000Z';
    ctx.handler = (sql, params) => {
      if (sql.includes('from public.npd_projects p') && sql.includes('group by p.id')) {
        return { rows: [baseProjectRow(PROJECT_A, 'NPD-A')] };
      }
      if (sql.includes('from public.gate_checklist_items')) return { rows: [] };
      if (sql.includes('from public.gate_approvals ga')) {
        expect(params?.[0]).toBe(PROJECT_A);
        return {
          rows: [
            approvalRow({
              id: 'approval-a',
              projectId: PROJECT_A,
              projectCode: 'NPD-A',
              gateCode: 'G4',
              signatureId: null,
              receiptHash: null,
              esignedAt: sharedSignedAt,
            }),
          ],
        };
      }
      if (sql.includes('from public.org_product_code_masks')) return { rows: [{ candidate_code: 'FG-001' }] };
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      return { rows: [] };
    };

    const result = await getProject({ projectId: PROJECT_A });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = result.data.approvalsTimeline[0];
    expect(row.gateCode).toBe('G4');
    expect(row.esignVerification).toBe('hash_unverified');
    expect(row.esignHash).toBeNull();
    expect(row.esignSubjectHash).toBeNull();
    expect(row.esignSubjectHash).not.toBe(HASH_G4_B);
  });

  it('binds the receipt only through signature_id or unambiguous subject_hash', async () => {
    ctx.handler = (sql, params) => {
      if (sql.includes('from public.npd_projects p') && sql.includes('group by p.id')) {
        return { rows: [baseProjectRow(PROJECT_A, 'NPD-A')] };
      }
      if (sql.includes('from public.gate_checklist_items')) return { rows: [] };
      if (sql.includes('from public.gate_approvals ga')) {
        expect(params?.[0]).toBe(PROJECT_A);
        return {
          rows: [
            approvalRow({
              id: 'approval-a',
              projectId: PROJECT_A,
              projectCode: 'NPD-A',
              gateCode: 'G4',
              signatureId: 'sig-a',
              receiptHash: HASH_G4_A,
              esignedAt: '2026-06-01T10:00:00.000Z',
            }),
          ],
        };
      }
      if (sql.includes('from public.org_product_code_masks')) return { rows: [{ candidate_code: 'FG-001' }] };
      if (sql.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      return { rows: [] };
    };

    const result = await getProject({ projectId: PROJECT_A });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = result.data.approvalsTimeline[0];
    expect(row.esignVerification).toBe('verified');
    expect(row.esignHash).toBe(`SHA256:${HASH_G4_A}`);
  });
});
