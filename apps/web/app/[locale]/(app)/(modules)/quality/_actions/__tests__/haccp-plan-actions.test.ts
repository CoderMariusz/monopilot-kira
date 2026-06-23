import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateHaccpPlan, listHaccpPlans, newPlanVersion, upsertHaccpPlan } from '../haccp-plan-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const OLD_PLAN_ID = '44444444-4444-4444-8444-444444444444';
const NEW_PLAN_ID = '55555555-5555-4555-8555-555555555555';
const CCP_ID = '66666666-6666-4666-8666-666666666666';
const CLONED_CCP_ID = '77777777-7777-4777-8777-777777777777';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let permissions: Set<string>;

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    signerUserId: USER_ID,
    intent: 'qa.haccp.plan.activate',
    subjectHash: 'h'.repeat(64),
    signedAt: '2026-06-23T10:00:00.000Z',
    auditEventId: 306,
    nonce: 'nonce-haccp-plan',
  })),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    name: 'Cook HACCP',
    scope_type: 'line',
    scope_ref: 'Cook line 1',
    site_id: SITE_ID,
    version: 2,
    status: 'draft',
    approved_by: null,
    approved_at: null,
    created_by: USER_ID,
    created_at: '2026-06-23T09:00:00.000Z',
    updated_at: '2026-06-23T09:00:00.000Z',
    ...overrides,
  };
}

function planWithCcpRow(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: NEW_PLAN_ID,
    plan_name: 'Cook HACCP',
    scope_type: 'line',
    scope_ref: 'Cook line 1',
    site_id: SITE_ID,
    version: 3,
    status: 'draft',
    approved_by: null,
    approved_at: null,
    created_by: USER_ID,
    plan_created_at: '2026-06-23T10:00:00.000Z',
    plan_updated_at: '2026-06-23T10:00:00.000Z',
    ccp_id: CLONED_CCP_ID,
    ccp_code: 'CCP-COOK-v3',
    ccp_name: 'Cook temperature',
    process_step: 'Cook',
    hazard_type: 'biological',
    critical_limit_min: '75.0',
    critical_limit_max: '90.0',
    unit: 'C',
    monitoring_frequency: 'each batch',
    corrective_action: 'Hold and recook',
    line_id: LINE_ID,
    is_active: true,
    ccp_created_at: '2026-06-23T10:01:00.000Z',
    ccp_updated_at: '2026-06-23T10:01:00.000Z',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const allowed = permissions.has(String(params[2]));
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.startsWith('insert into public.haccp_plans') && q.includes("'draft'")) {
        const version = typeof params[4] === 'number' ? params[4] : 1;
        return { rows: [planRow({ id: NEW_PLAN_ID, version, status: 'draft' })], rowCount: 1 };
      }

      if (q.startsWith('select id::text, name, version, status')) {
        return { rows: [{ id: PLAN_ID, name: 'Cook HACCP', version: 2, status: 'draft' }], rowCount: 1 };
      }

      if (q.startsWith('update public.haccp_plans') && q.includes("set status = 'superseded'")) {
        return { rows: [{ id: OLD_PLAN_ID }], rowCount: 1 };
      }

      if (q.startsWith('update public.haccp_plans') && q.includes("set status = 'active'")) {
        return {
          rows: [planRow({ id: PLAN_ID, status: 'active', approved_by: USER_ID, approved_at: '2026-06-23T10:00:00.000Z' })],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text') && q.includes("status = 'active'")) {
        return { rows: [planRow({ id: PLAN_ID, status: 'active', version: 2 })], rowCount: 1 };
      }

      if (q.startsWith('insert into public.haccp_ccps')) {
        return { rows: [{ id: CLONED_CCP_ID }], rowCount: 1 };
      }

      if (q.startsWith('select p.id::text as plan_id') && q.includes('and p.id = $1::uuid')) {
        return { rows: [planWithCcpRow()], rowCount: 1 };
      }

      if (q.startsWith('select p.id::text as plan_id')) {
        return {
          rows: [
            planWithCcpRow({ plan_id: PLAN_ID, version: 2, status: 'active', ccp_id: CCP_ID, ccp_code: 'CCP-COOK' }),
            planWithCcpRow({
              plan_id: PLAN_ID,
              version: 2,
              status: 'active',
              ccp_id: CLONED_CCP_ID,
              ccp_code: 'CCP-COOL',
              ccp_name: 'Cool temperature',
              critical_limit_min: null,
              critical_limit_max: '4.0',
            }),
          ],
          rowCount: 2,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('HACCP plan server actions', () => {
  beforeEach(() => {
    permissions = new Set(['quality.haccp.plan_edit']);
    client = makeClient();
    vi.clearAllMocks();
  });

  it('upsertHaccpPlan writes a draft row', async () => {
    const result = await upsertHaccpPlan({
      name: 'Cook HACCP',
      scopeType: 'line',
      scopeRef: 'Cook line 1',
      siteId: SITE_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan upsert to succeed');
    expect(result.data.status).toBe('draft');
    expect(result.data.version).toBe(1);

    const insert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.haccp_plans'));
    expect(normalize(String(insert?.[0]))).toContain("status, version");
    expect(insert?.[1]).toEqual([SITE_ID, 'line', 'Cook line 1', 'Cook HACCP', USER_ID]);
  });

  it('activateHaccpPlan requires e-sign and flips status while superseding prior active plan with the same name', async () => {
    const result = await activateHaccpPlan(PLAN_ID, { password: 'pin-1234' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan activation to succeed');
    expect(result.data.status).toBe('active');
    expect(result.data.approvedBy).toBe(USER_ID);
    expect(vi.mocked(signEvent)).toHaveBeenCalledWith(
      {
        signerUserId: USER_ID,
        pin: 'pin-1234',
        intent: 'qa.haccp.plan.activate',
        subject: { planId: PLAN_ID, name: 'Cook HACCP', version: 2 },
        reason: 'HACCP plan activation',
      },
      { client },
    );

    const supersede = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes("set status = 'superseded'"));
    expect(supersede?.[1]).toEqual([PLAN_ID, 'Cook HACCP']);

    const activate = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes("set status = 'active'"));
    expect(activate?.[1]).toEqual([PLAN_ID, USER_ID]);
  });

  it('newPlanVersion clones the active plan and linked CCPs with version+1', async () => {
    const result = await newPlanVersion(PLAN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected new plan version to succeed');
    expect(result.data.id).toBe(NEW_PLAN_ID);
    expect(result.data.status).toBe('draft');
    expect(result.data.version).toBe(3);
    expect(result.data.ccps).toHaveLength(1);
    expect(result.data.ccps[0]).toEqual(
      expect.objectContaining({
        ccpCode: 'CCP-COOK-v3',
        criticalLimitMin: '75.0',
        criticalLimitMax: '90.0',
        unit: 'C',
        monitoringFrequency: 'each batch',
        correctiveAction: 'Hold and recook',
      }),
    );

    const clone = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.haccp_ccps'));
    expect(normalize(String(clone?.[0]))).toContain('critical_limit_min');
    expect(normalize(String(clone?.[0]))).toContain('critical_limit_max');
    expect(clone?.[1]).toEqual([PLAN_ID, NEW_PLAN_ID, 3, USER_ID]);
  });

  it('listHaccpPlans returns plans with their linked CCPs', async () => {
    const result = await listHaccpPlans();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected plan list to succeed');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe('Cook HACCP');
    expect(result.data[0]?.ccps.map((ccp) => ccp.ccpCode)).toEqual(['CCP-COOK', 'CCP-COOL']);

    const list = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select p.id::text as plan_id'));
    expect(normalize(String(list?.[0]))).toContain('left join public.haccp_ccps c on c.org_id = p.org_id and c.plan_id = p.id');
  });
});
