import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';
const CHANGEOVER_ID = '44444444-4444-4444-8444-444444444444';
const WO_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const FROM_PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const TO_PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const FIRST_ROLE_ID = '99999999-9999-4999-8999-999999999999';
const SECOND_ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_CODE = 'L-01';
const SITE_ID = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';

type ChangeoverState = {
  id: string;
  line_id: string;
  line_code: string | null;
  wo_id: string | null;
  wo_number: string | null;
  from_product_id: string | null;
  from_product_code: string | null;
  from_product_name: string | null;
  to_product_id: string | null;
  to_product_code: string | null;
  to_product_name: string | null;
  allergen_from: string[];
  allergen_to: string[];
  risk_level: string;
  cleaning_completed: boolean;
  atp_result: unknown;
  dual_sign_off_status: string;
  first_signer: string | null;
  first_signer_name: string | null;
  first_signer_email: string | null;
  first_signed_at: string | null;
  second_signer: string | null;
  second_signer_name: string | null;
  second_signer_email: string | null;
  second_signed_at: string | null;
  created_at: string;
  site_id?: string | null;
};

let client: QueryClient;
let queries: Array<{ sql: string; params: readonly unknown[] }>;
let granted: Set<string>;
let roles: Set<string>;
let policy: {
  required_signatures: number;
  first_signer_role_id: string | null;
  second_signer_role_id: string | null;
  allow_same_user: boolean;
};
let changeovers: ChangeoverState[];
let validations: unknown[][];
let currentUserId = USER_ID;
/** startWo gate 3b — the WO snapshot's segregation_required flag (reset false). */
let woSegregationRequired: boolean;
/** changeover_matrix rows surfaced by the mock (active version pre-joined). */
let matrixRows: Array<{ allergen_from: string; allergen_to: string; line_id: string | null; risk_level: string }>;
let listTotal = 1;

/** The single known production_lines row the mock resolves uuid/code keys against. */
function resolveLineKey(key: unknown): { id: string; code: string; site_id: string } | null {
  return key === LINE_ID || key === LINE_CODE ? { id: LINE_ID, code: LINE_CODE, site_id: SITE_ID } : null;
}

const signEventMock = vi.fn();
const createBomSnapshotMock = vi.fn();
const applyTransitionMock = vi.fn();

vi.mock('@monopilot/e-sign', () => ({
  signEvent: (...args: unknown[]) => signEventMock(...args),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: currentUserId, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/technical/bom/snapshot', () => ({
  createBomSnapshot: (...args: unknown[]) => createBomSnapshotMock(...args),
}));

vi.mock('../../../../../../lib/production/wo-state-machine', () => ({
  applyTransition: (...args: unknown[]) => applyTransitionMock(...args),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function row(overrides: Partial<ChangeoverState> = {}): ChangeoverState {
  return {
    id: CHANGEOVER_ID,
    line_id: LINE_ID,
    line_code: 'L-01',
    wo_id: WO_ID,
    wo_number: 'WO-001',
    from_product_id: FROM_PRODUCT_ID,
    from_product_code: 'FG-OLD',
    from_product_name: 'Old product',
    to_product_id: TO_PRODUCT_ID,
    to_product_code: 'FG-NEW',
    to_product_name: 'New product',
    allergen_from: ['milk'],
    allergen_to: ['milk', 'soy'],
    risk_level: 'medium',
    cleaning_completed: true,
    atp_result: { rlu: 4 },
    dual_sign_off_status: 'pending',
    first_signer: null,
    first_signer_name: null,
    first_signer_email: null,
    first_signed_at: null,
    second_signer: null,
    second_signer_name: null,
    second_signer_email: null,
    second_signed_at: null,
    created_at: '2026-06-11T10:00:00.000Z',
    site_id: null,
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles ur') && n.includes('left join public.role_permissions')) {
        const permission = String(params[2]);
        return granted.has(permission) ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.user_roles ur') && n.includes('ur.role_id = $3::uuid')) {
        const roleId = String(params[2]);
        return roles.has(roleId) ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.signoff_policies')) {
        return { rows: [policy], rowCount: 1 };
      }
      // C4/F1 write-side line resolution (uuid OR code → production_lines row).
      if (n.startsWith('select pl.id::text') && n.includes('from public.production_lines pl')) {
        const line = resolveLineKey(params[0]);
        return { rows: line ? [line] : [], rowCount: line ? 1 : 0 };
      }
      // C4/F3c matrix lookup (active version join folded into the mock rows).
      if (n.includes('from public.changeover_matrix cm')) {
        const lineKeys = params[0] as string[];
        const from = params[1] as string[];
        const to = params[2] as string[];
        const rows = matrixRows.filter(
          (entry) =>
            (entry.line_id === null || lineKeys.includes(entry.line_id)) &&
            from.includes(entry.allergen_from) &&
            to.includes(entry.allergen_to),
        );
        return { rows, rowCount: rows.length };
      }
      if (n.includes('from public.items i') && n.includes('jsonb_array_elements_text')) {
        const productId = String(params[0]);
        const allergens = productId === TO_PRODUCT_ID ? ['milk', 'soy'] : ['milk'];
        return { rows: [{ allergens }], rowCount: 1 };
      }
      if (n.startsWith('select production_line_id::text')) {
        return { rows: [{ production_line_id: LINE_ID, product_id: TO_PRODUCT_ID, site_id: null }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.changeover_events')) {
        // Param shape after C4/F1+F5: (site_id, line_id, wo_to_id, allergen_from,
        // allergen_to, risk_level, cleaning, atp_required, atp_result, ext_jsonb).
        const created = row({
          id: CHANGEOVER_ID,
          site_id: params[0] == null ? null : String(params[0]),
          line_id: String(params[1]),
          wo_id: params[2] == null ? null : String(params[2]),
          allergen_from: params[3] as string[],
          allergen_to: params[4] as string[],
          risk_level: String(params[5]),
          cleaning_completed: Boolean(params[6]),
          atp_result: params[8] ? JSON.parse(String(params[8])) : null,
        });
        changeovers = [created];
        return { rows: [{ id: created.id }], rowCount: 1 };
      }
      if (n.includes('from public.changeover_events') && n.includes('for update')) {
        const found = changeovers.find((entry) => entry.id === params[0]);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (n.startsWith('update public.changeover_events') && n.includes('first_signer')) {
        const found = changeovers.find((entry) => entry.id === params[0]);
        if (found) {
          found.first_signer = String(params[1]);
          found.first_signer_name = 'Current User';
          found.first_signer_email = 'current@example.test';
          found.first_signed_at = '2026-06-11T10:01:00.000Z';
          found.dual_sign_off_status = String(params[2]);
        }
        return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
      }
      if (n.startsWith('update public.changeover_events') && n.includes('second_signer')) {
        const found = changeovers.find((entry) => entry.id === params[0]);
        if (found) {
          found.second_signer = String(params[1]);
          found.second_signer_name = 'Current User';
          found.second_signer_email = 'current@example.test';
          found.second_signed_at = '2026-06-11T10:02:00.000Z';
          found.dual_sign_off_status = String(params[2]);
        }
        return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
      }
      if (n.startsWith('insert into public.allergen_changeover_validations')) {
        validations.push([...params]);
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('select id, site_id::text') && n.includes('from public.work_orders')) {
        return {
          rows: [
            {
              id: WO_ID,
              site_id: SITE_ID,
              item_type_at_creation: 'fg',
              active_bom_header_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              active_factory_spec_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              allergen_profile_snapshot: woSegregationRequired ? { segregation_required: true } : {},
              production_line_id: LINE_ID,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.startsWith('select id, active_bom_header_id')) {
        return {
          rows: [
            {
              id: WO_ID,
              active_bom_header_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              active_factory_spec_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              allergen_profile_snapshot: woSegregationRequired ? { segregation_required: true } : {},
              production_line_id: LINE_ID,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('from public.changeover_events ce') && n.includes('dual_sign_off_status not in')) {
        // C4/F1 read-side: the gate joins production_lines so a code-keyed legacy
        // ce.line_id still matches a uuid-keyed start (and vice versa). The mock
        // mirrors that: raw equality OR resolved-line id/code equality.
        const lineKey = String(params[0] ?? params[1] ?? '');
        const pl = resolveLineKey(lineKey);
        const found = changeovers.find(
          (entry) =>
            (entry.line_id === lineKey ||
              (pl !== null && (entry.line_id === pl.id || entry.line_id === pl.code))) &&
            ['medium', 'high', 'segregated'].includes(entry.risk_level) &&
            !['complete', 'completed'].includes(entry.dual_sign_off_status),
        );
        return { rows: found ? [{ id: found.id }] : [], rowCount: found ? 1 : 0 };
      }
      if (n.startsWith('select count(*)::int as total') && n.includes('from public.changeover_events ce')) {
        if (params[1] === 'pending') return { rows: [{ total: 5 }], rowCount: 1 };
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (n.includes('from public.changeover_events ce') && n.includes('limit $3::int offset $4::int')) {
        const status = params[1];
        const offset = Number(params[3] ?? 0);
        const index = offset + 1;
        if (status === 'pending' && index === 51) {
          const entry = row({
            id: `${CHANGEOVER_ID.slice(0, -2)}52`,
            to_product_code: 'FG-PENDING-P2',
            dual_sign_off_status: 'pending',
          });
          return { rows: [entry], rowCount: 1 };
        }
        if (index > listTotal) return { rows: [], rowCount: 0 };
        const entry = row({
          id: index === 1 ? CHANGEOVER_ID : `${CHANGEOVER_ID.slice(0, -2)}${String(index).padStart(2, '0')}`,
          to_product_code: index === 1 ? 'FG-NEW' : `FG-${String(index).padStart(3, '0')}`,
        });
        return { rows: [entry], rowCount: 1 };
      }
      if (n.includes('from public.changeover_events ce') && n.includes('ce.id = $1::uuid')) {
        const id = String(params[0]);
        const found = changeovers.find((entry) => entry.id === id);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (n.includes('from public.bom_headers bh') || n.includes('from public.factory_specs fs')) {
        return {
          rows: [
            {
              bom_exists: true,
              spec_exists: true,
              spec_site_id: SITE_ID,
              spec_bom_header_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_dependencies dep')) {
        return { rows: [], rowCount: 0 };
      }
      if (n.includes('from public.schedule_outputs')) return { rows: [], rowCount: 0 };
      if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

beforeEach(() => {
  queries = [];
  validations = [];
  granted = new Set([
    'production.changeover.write',
    'production.allergen_gate.sign_first',
    'production.allergen_gate.sign_second',
    'production.wo.start',
  ]);
  roles = new Set([FIRST_ROLE_ID, SECOND_ROLE_ID]);
  policy = {
    required_signatures: 2,
    first_signer_role_id: null,
    second_signer_role_id: null,
    allow_same_user: false,
  };
  changeovers = [row()];
  matrixRows = [];
  listTotal = 1;
  currentUserId = USER_ID;
  woSegregationRequired = false;
  client = makeClient();
  signEventMock.mockReset();
  signEventMock.mockResolvedValue({
    signatureId: 'sig-1',
    signerUserId: USER_ID,
    intent: 'production.changeover.signoff',
    subjectHash: 'hash',
    signedAt: '2026-06-11T10:03:00.000Z',
    auditEventId: 1,
    nonce: 'nonce',
  });
  createBomSnapshotMock.mockReset();
  createBomSnapshotMock.mockResolvedValue({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
  applyTransitionMock.mockReset();
  applyTransitionMock.mockResolvedValue({ ok: true, data: { startedAt: '2026-06-11T11:00:00.000Z' } });
});

describe('changeover-actions', () => {
  it('listChangeovers returns rows', async () => {
    const { listChangeovers } = await import('./changeover-actions');
    const result = await listChangeovers({ limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.rows[0]).toMatchObject({
      id: CHANGEOVER_ID,
      lineId: LINE_ID,
      dualSignOffStatus: 'pending',
      toProduct: { code: 'FG-NEW' },
    });
  });

  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;
    const { listChangeovers } = await import('./changeover-actions');
    const result = await listChangeovers({ page: 2 });

    expect(result.ok).toBe(true);
    expect(result.pagination).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.rows[0]).toMatchObject({ toProduct: { code: 'FG-051' } });
    const listQuery = queries.find((q) => normalize(q.sql).includes('limit $3::int offset $4::int'));
    expect(listQuery?.params).toEqual([null, null, 50, 50]);
  });

  it('status filter finds a pending row on page 2 with filtered total', async () => {
    listTotal = 120;
    const { listChangeovers } = await import('./changeover-actions');
    const result = await listChangeovers({ status: 'pending', page: 2 });

    expect(result.ok).toBe(true);
    expect(result.pagination.total).toBe(5);
    expect(result.rows[0]).toMatchObject({ toProduct: { code: 'FG-PENDING-P2' } });
    const countQuery = queries.find((q) => normalize(q.sql).startsWith('select count(*)'));
    expect(countQuery?.params).toEqual([null, 'pending']);
  });

  it('createChangeoverEvent succeeds with production.changeover.write', async () => {
    const { createChangeoverEvent } = await import('./changeover-actions');
    const result = await createChangeoverEvent({
      lineId: LINE_ID,
      woId: WO_ID,
      fromProductId: FROM_PRODUCT_ID,
      toProductId: TO_PRODUCT_ID,
      cleaningCompleted: true,
      atpResult: { rlu: 4 },
    });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.risk_level).toBe('medium');
    expect(queries.some((q) => String(q.params[2]) === 'production.changeover.write')).toBe(true);
  });

  it('createChangeoverEvent resolves a line CODE to the production_lines uuid and persists site_id (F1+F5)', async () => {
    const { createChangeoverEvent } = await import('./changeover-actions');
    const result = await createChangeoverEvent({
      lineId: LINE_CODE,
      fromProductId: FROM_PRODUCT_ID,
      toProductId: TO_PRODUCT_ID,
      cleaningCompleted: true,
    });
    expect(result.ok).toBe(true);
    // line_id must ALWAYS be production_lines.id::text — never the raw code.
    expect(changeovers[0]?.line_id).toBe(LINE_ID);
    expect(changeovers[0]?.site_id).toBe(SITE_ID);
  });

  it('createChangeoverEvent rejects an unresolvable lineId with not_found (F1)', async () => {
    const { createChangeoverEvent } = await import('./changeover-actions');
    const before = changeovers.length;
    const result = await createChangeoverEvent({
      lineId: 'NO-SUCH-LINE',
      toProductId: TO_PRODUCT_ID,
      cleaningCompleted: true,
    });
    expect(result).toMatchObject({ ok: false, error: 'not_found' });
    expect(changeovers).toHaveLength(before);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.changeover_events'))).toBe(false);
  });

  it('createChangeoverEvent prefers the changeover_matrix risk over the heuristic (F3c)', async () => {
    // Heuristic for milk → milk+soy would be 'medium'; the matrix says 'segregated',
    // and a line-specific override beats the org default for the same pair.
    matrixRows = [
      { allergen_from: 'milk', allergen_to: 'soy', line_id: null, risk_level: 'high' },
      { allergen_from: 'milk', allergen_to: 'soy', line_id: LINE_ID, risk_level: 'segregated' },
    ];
    const { createChangeoverEvent } = await import('./changeover-actions');
    const result = await createChangeoverEvent({
      lineId: LINE_ID,
      fromProductId: FROM_PRODUCT_ID,
      toProductId: TO_PRODUCT_ID,
      cleaningCompleted: true,
    });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.risk_level).toBe('segregated');
  });

  it('signChangeover records the first signature', async () => {
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.dual_sign_off_status).toBe('first_signed');
    expect(changeovers[0]?.first_signer).toBe(USER_ID);
    expect(signEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'production.changeover.signoff', signerUserId: USER_ID }),
      expect.any(Object),
    );
  });

  it('signChangeover second signature completes and inserts a validation record', async () => {
    changeovers = [row({ dual_sign_off_status: 'first_signed', first_signer: OTHER_USER_ID, first_signed_at: '2026-06-11T10:01:00.000Z' })];
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.dual_sign_off_status).toBe('complete');
    expect(validations).toHaveLength(1);
    // F3b: validation_result is DERIVED (cleaning true + ATP pass-ish → 'passed'), bound as $3.
    expect(validations[0]?.[2]).toBe('passed');
    expect(JSON.parse(String(validations[0]?.[6]))).toHaveLength(2);
  });

  it('signChangeover rejects a replayed completion with invalid_state and NO duplicate validation row', async () => {
    changeovers = [
      row({
        dual_sign_off_status: 'complete',
        first_signer: OTHER_USER_ID,
        first_signed_at: '2026-06-11T10:01:00.000Z',
        second_signer: USER_ID,
        second_signed_at: '2026-06-11T10:02:00.000Z',
      }),
    ];
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(validations).toHaveLength(0);
    expect(signEventMock).not.toHaveBeenCalled();
  });

  it('signChangeover allows the same user to complete when allow_same_user=true (happy path)', async () => {
    policy = { ...policy, allow_same_user: true };
    changeovers = [row({ dual_sign_off_status: 'first_signed', first_signer: USER_ID, first_signed_at: '2026-06-11T10:01:00.000Z' })];
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.dual_sign_off_status).toBe('complete');
    expect(changeovers[0]?.second_signer).toBe(USER_ID);
    expect(validations).toHaveLength(1);
  });

  it('signChangeover maps a signEvent throw to esign_failed without mutating the row (F-gap)', async () => {
    signEventMock.mockRejectedValueOnce(Object.assign(new Error('pin mismatch'), { name: 'EsignPinMismatch' }));
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: 'bad' } });
    expect(result).toEqual({ ok: false, error: 'esign_failed', message: 'EsignPinMismatch' });
    expect(changeovers[0]?.dual_sign_off_status).toBe('pending');
    expect(changeovers[0]?.first_signer).toBeNull();
    expect(validations).toHaveLength(0);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.changeover_events'))).toBe(false);
  });

  it('signChangeover blocks the COMPLETING signature when cleaning is incomplete (F3a)', async () => {
    changeovers = [
      row({
        dual_sign_off_status: 'first_signed',
        first_signer: OTHER_USER_ID,
        first_signed_at: '2026-06-11T10:01:00.000Z',
        cleaning_completed: false,
      }),
    ];
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result).toMatchObject({ ok: false, error: 'cleaning_incomplete' });
    // No mutation at all: no e-sign, no update, no validation row.
    expect(signEventMock).not.toHaveBeenCalled();
    expect(changeovers[0]?.dual_sign_off_status).toBe('first_signed');
    expect(validations).toHaveLength(0);
  });

  it('signChangeover allows the FIRST signature while cleaning is still incomplete (sign-as-you-go)', async () => {
    changeovers = [row({ cleaning_completed: false })];
    const { signChangeover } = await import('./changeover-actions');
    const result = await signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } });
    expect(result.ok).toBe(true);
    expect(changeovers[0]?.dual_sign_off_status).toBe('first_signed');
  });

  // The pg mock CANNOT model FOR UPDATE row locking: two truly concurrent
  // signChangeover calls would interleave freely on the shared in-memory state
  // and "pass" without proving anything. The race is covered by design (the
  // SELECT ... FOR UPDATE + the mapStatus==='complete' early-return makes the
  // losing transaction read the committed completion and reject invalid_state).
  // Needs a real-Postgres harness (DATABASE_URL) — do NOT unskip on the mock.
  it.skip('concurrent completing signatures: FOR UPDATE serializes, loser gets invalid_state (real PG only)', () => {
    // intentionally empty — see comment above
  });

  it('signChangeover rejects the same second signer when allow_same_user=false', async () => {
    changeovers = [row({ dual_sign_off_status: 'first_signed', first_signer: USER_ID, first_signed_at: '2026-06-11T10:01:00.000Z' })];
    const { signChangeover } = await import('./changeover-actions');
    await expect(signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } })).resolves.toEqual({
      ok: false,
      error: 'same_user_rejected',
    });
    expect(signEventMock).not.toHaveBeenCalled();
  });

  it('signChangeover rejects a signer without the configured role', async () => {
    policy = { ...policy, first_signer_role_id: FIRST_ROLE_ID };
    roles = new Set();
    const { signChangeover } = await import('./changeover-actions');
    await expect(signChangeover({ changeoverId: CHANGEOVER_ID, signature: { password: '1234' } })).resolves.toEqual({
      ok: false,
      error: 'wrong_role',
    });
  });
});

describe('startWo allergen changeover gate', () => {
  it('blocks start when an incomplete allergen-relevant changeover exists', async () => {
    const { startWo } = await import('../../../../../../lib/production/start-wo');
    const result = await startWo({ userId: USER_ID, orgId: ORG_ID, client }, { woId: WO_ID, transactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lineId: LINE_ID });
    expect(result).toMatchObject({
      ok: false,
      // C4/F6: canonical outer code on BOTH desktop and scanner paths.
      error: 'changeover_signoff_required',
      details: {
        code: 'changeover_signoff_required',
        legacyCode: 'allergen_changeover_required',
        changeoverId: CHANGEOVER_ID,
      },
    });
    expect(createBomSnapshotMock).not.toHaveBeenCalled();
  });

  it('blocks a uuid-keyed start against a CODE-keyed legacy changeover row (F1 cross-key gate)', async () => {
    // Legacy write paths stored production_lines.code in changeover_events.line_id;
    // the start passes the line UUID. The gate must still match via production_lines.
    changeovers = [row({ line_id: LINE_CODE })];
    const { startWo } = await import('../../../../../../lib/production/start-wo');
    const result = await startWo({ userId: USER_ID, orgId: ORG_ID, client }, { woId: WO_ID, transactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lineId: LINE_ID });
    expect(result).toMatchObject({
      ok: false,
      error: 'changeover_signoff_required',
      details: { changeoverId: CHANGEOVER_ID },
    });
    expect(createBomSnapshotMock).not.toHaveBeenCalled();
  });

  it('blocks a code-keyed start against a UUID-keyed changeover row (F1 cross-key gate, write side canonical)', async () => {
    changeovers = [row({ line_id: LINE_ID })];
    const { startWo } = await import('../../../../../../lib/production/start-wo');
    const result = await startWo({ userId: USER_ID, orgId: ORG_ID, client }, { woId: WO_ID, transactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lineId: LINE_CODE });
    expect(result).toMatchObject({ ok: false, error: 'changeover_signoff_required' });
  });

  it('hard-blocks start when the WO snapshot demands segregation even with NO changeover row (3b gate)', async () => {
    // The original (pre-C4) snapshot gate must survive the events-gate rewrite:
    // segregation_required=true blocks START even when nobody logged a changeover.
    changeovers = [];
    woSegregationRequired = true;
    const { startWo } = await import('../../../../../../lib/production/start-wo');
    const result = await startWo({ userId: USER_ID, orgId: ORG_ID, client }, { woId: WO_ID, transactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lineId: LINE_ID });
    expect(result).toMatchObject({
      ok: false,
      error: 'changeover_signoff_required',
      details: { code: 'segregation_required', legacyCode: 'allergen_changeover_required' },
    });
    expect(createBomSnapshotMock).not.toHaveBeenCalled();
  });

  it('allows start when no incomplete allergen-relevant changeover exists', async () => {
    changeovers = [row({ dual_sign_off_status: 'complete' })];
    const { startWo } = await import('../../../../../../lib/production/start-wo');
    const result = await startWo({ userId: USER_ID, orgId: ORG_ID, client }, { woId: WO_ID, transactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', lineId: LINE_ID });
    expect(result.ok).toBe(true);
    expect(createBomSnapshotMock).toHaveBeenCalled();
  });
});
