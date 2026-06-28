import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../../../../../../..');
const createRiskPath = resolve(
  repoRoot,
  'apps/web/app/(npd)/fa/[productCode]/risks/_actions/create-risk.ts',
);
const updateRiskPath = resolve(
  repoRoot,
  'apps/web/app/(npd)/fa/[productCode]/risks/_actions/update-risk.ts',
);
const listRisksPath = resolve(
  repoRoot,
  'apps/web/app/(npd)/fa/[productCode]/risks/_actions/list-risks.ts',
);

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_CODE = 'FA-T081';
const RISK_ID = '33333333-3333-4333-8333-333333333333';
const RISK_WRITE = 'npd.risk.write';

type RiskState = 'Open' | 'Mitigated' | 'Closed';
type RiskRow = {
  id: string;
  org_id: string;
  product_code: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  bucket: 'Low' | 'Med' | 'High';
  state: RiskState;
  mitigation: string | null;
  owner_user_id: string | null;
  closed_at: string | null;
  closed_by_user: string | null;
};
type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  actorPermissions: Set<string>;
  risks: RiskRow[];
  mutations: string[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};
type CreateRisk = (input: {
  productCode: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  mitigation?: string;
  ownerUserId?: string | null;
}) => Promise<unknown>;
type UpdateRisk = (input: {
  productCode: string;
  riskId: string;
  patch?: {
    title?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    mitigation?: string | null;
    ownerUserId?: string | null;
  };
  transition?: { toState: RiskState; reason: string };
}) => Promise<unknown>;
type ListRisks = (input: { productCode: string }) => Promise<unknown>;

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('T-081 risk Server Actions', () => {
  it('rejects Open to Mitigated when transition reason is shorter than 10 chars', async () => {
    currentClient.actorPermissions.add(RISK_WRITE);
    currentClient.risks.push(makeRisk({ state: 'Open' }));

    const updateRisk = await loadUpdateRisk();
    const result = await updateRisk({
      productCode: PRODUCT_CODE,
      riskId: RISK_ID,
      transition: { toState: 'Mitigated', reason: 'ok' },
    });

    expect(result).toEqual({ ok: false, code: 'REASON_TOO_SHORT' });
    expect(statementIndex('update public.risks')).toBe(-1);
    expect(statementIndex('insert into public.audit_events')).toBe(-1);
  });

  it('rejects createRisk for a caller without npd.risk.write', async () => {
    const createRisk = await loadCreateRisk();
    const result = await createRisk({
      productCode: PRODUCT_CODE,
      title: 'Launch risk',
      description: 'Supplier evidence is not complete',
      likelihood: 2,
      impact: 3,
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(statementIndex('role_permissions')).toBeGreaterThanOrEqual(0);
    expect(statementIndex('insert into public.risks')).toBe(-1);
    expect(currentClient.mutations).toEqual([]);
  });

  it('rejects Open to Closed lifecycle skips as INVALID_TRANSITION', async () => {
    currentClient.actorPermissions.add(RISK_WRITE);
    currentClient.risks.push(makeRisk({ state: 'Open' }));

    const updateRisk = await loadUpdateRisk();
    const result = await updateRisk({
      productCode: PRODUCT_CODE,
      riskId: RISK_ID,
      transition: { toState: 'Closed', reason: 'closing without mitigation' },
    });

    expect(result).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    expect(statementIndex('update public.risks')).toBe(-1);
    expect(statementIndex('insert into public.audit_events')).toBe(-1);
  });

  it('writes risk transition audit_events in the same org-scoped action', async () => {
    currentClient.actorPermissions.add(RISK_WRITE);
    currentClient.risks.push(makeRisk({ state: 'Open' }));

    const updateRisk = await loadUpdateRisk();
    const result = await updateRisk({
      productCode: PRODUCT_CODE,
      riskId: RISK_ID,
      transition: { toState: 'Mitigated', reason: 'supplier evidence attached' },
    });

    expect(result).toEqual({ ok: true, riskId: RISK_ID, state: 'Mitigated' });
    expect(callBlob('from public.risks')).toContain('app.current_org_id()');
    expect(callBlob('update public.risks')).toContain('app.current_org_id()');
    const auditCall = currentClient.calls[statementIndex('insert into public.audit_events')]!;
    expect(auditCall.params).toContain('risk.transitioned');
    expect(auditCall.params).toContain('risk');
    expect(auditCall.params).toContain(RISK_ID);
    expect(JSON.stringify(auditCall.params)).toContain('supplier evidence attached');
    expect(currentClient.mutations).toEqual(['risk_update', 'audit']);
    expect(_revalidatePath).toHaveBeenCalledWith(`/npd/fg/${PRODUCT_CODE}/risks`);
  });

  it('inserts risks and emits risk.created outbox for authorized callers', async () => {
    currentClient.actorPermissions.add(RISK_WRITE);

    const createRisk = await loadCreateRisk();
    const result = await createRisk({
      productCode: PRODUCT_CODE,
      title: 'Packaging claim',
      description: 'Packaging artwork claim needs validation',
      likelihood: 2,
      impact: 2,
      mitigation: 'Review with regulatory',
    });

    expect(result).toEqual({ ok: true, riskId: RISK_ID });
    expect(callBlob('insert into public.risks')).toContain('app.current_org_id()');
    const outboxCall = currentClient.calls[statementIndex('insert into public.outbox_events')]!;
    expect(outboxCall.params).toContain('risk.created');
    expect(outboxCall.params).toContain('risk');
    expect(String(outboxCall.params[4])).toContain(PRODUCT_CODE);
    expect(currentClient.mutations).toEqual(['risk_insert', 'audit', 'outbox']);
  });

  it('lists product risks with Low/Med/High bucket counts', async () => {
    currentClient.risks.push(
      makeRisk({ id: RISK_ID, bucket: 'High' }),
      makeRisk({ id: '44444444-4444-4444-8444-444444444444', bucket: 'Med' }),
    );

    const listRisks = await loadListRisks();
    const result = await listRisks({ productCode: PRODUCT_CODE });

    expect(result).toEqual({
      ok: true,
      risks: expect.arrayContaining([
        expect.objectContaining({ id: RISK_ID, bucket: 'High' }),
        expect.objectContaining({ id: '44444444-4444-4444-8444-444444444444', bucket: 'Med' }),
      ]),
      counts: { Low: 0, Med: 1, High: 1 },
    });
    expect(callBlob('from public.risks')).toContain('app.current_org_id()');
  });
});

async function loadCreateRisk(): Promise<CreateRisk> {
  expect(existsSync(createRiskPath), 'create-risk.ts must exist').toBe(true);
  const mod = (await import(createRiskPath)) as { createRisk?: CreateRisk };
  if (typeof mod.createRisk !== 'function') expect.fail('create-risk.ts must export createRisk(input)');
  return mod.createRisk;
}

async function loadUpdateRisk(): Promise<UpdateRisk> {
  expect(existsSync(updateRiskPath), 'update-risk.ts must exist').toBe(true);
  const mod = (await import(updateRiskPath)) as { updateRisk?: UpdateRisk };
  if (typeof mod.updateRisk !== 'function') expect.fail('update-risk.ts must export updateRisk(input)');
  return mod.updateRisk;
}

async function loadListRisks(): Promise<ListRisks> {
  expect(existsSync(listRisksPath), 'list-risks.ts must exist').toBe(true);
  const mod = (await import(listRisksPath)) as { listRisks?: ListRisks };
  if (typeof mod.listRisks !== 'function') expect.fail('list-risks.ts must export listRisks(input)');
  return mod.listRisks;
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    actorPermissions: new Set<string>(),
    risks: [],
    mutations: [],
    query: async (sql: string, params: readonly unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('role_permissions')) {
        return client.actorPermissions.has(RISK_WRITE)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('select') && normalized.includes('from public.risks')) {
        const riskId = params.find((param): param is string => param === RISK_ID);
        const rows = client.risks.filter((risk) => {
          if (risk.org_id !== ORG_ID || risk.product_code !== PRODUCT_CODE) return false;
          return riskId ? risk.id === riskId : true;
        });
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('insert into public.risks')) {
        const row = makeRisk({
          title: String(params[2]),
          description: String(params[3]),
          likelihood: Number(params[4]),
          impact: Number(params[5]),
          mitigation: typeof params[6] === 'string' ? params[6] : null,
          owner_user_id: typeof params[7] === 'string' ? params[7] : null,
        });
        client.risks.push(row);
        client.mutations.push('risk_insert');
        return { rows: [{ id: RISK_ID }], rowCount: 1 };
      }

      if (normalized.includes('update public.risks')) {
        const risk = client.risks.find((row) => row.id === RISK_ID && row.org_id === ORG_ID);
        if (!risk) return { rows: [], rowCount: 0 };
        risk.state = params.includes('Mitigated') ? 'Mitigated' : params.includes('Closed') ? 'Closed' : risk.state;
        client.mutations.push('risk_update');
        return { rows: [{ ...risk }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.audit_events')) {
        client.mutations.push('audit');
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        client.mutations.push('outbox');
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function makeRisk(overrides: Partial<RiskRow> = {}): RiskRow {
  return {
    id: RISK_ID,
    org_id: ORG_ID,
    product_code: PRODUCT_CODE,
    title: 'Launch risk',
    description: 'Supplier evidence is not complete',
    likelihood: 2,
    impact: 3,
    bucket: 'High',
    state: 'Open',
    mitigation: null,
    owner_user_id: null,
    closed_at: null,
    closed_by_user: null,
    ...overrides,
  };
}

function statementIndex(fragment: string): number {
  return currentClient.calls.findIndex((call) => call.sql.toLowerCase().includes(fragment.toLowerCase()));
}

function callBlob(fragment: string): string {
  const index = statementIndex(fragment);
  if (index < 0) return '';
  return currentClient.calls[index]!.sql.replace(/\s+/g, ' ').toLowerCase();
}
