/**
 * What the RM-usability QC gate does when `lab_results` is empty.
 *
 * `validateRmUsability` is a pure function: it honours the `qcRelease.required`
 * it is HANDED. The fail-open this file was written to document lived in who
 * did the handing — shared.ts hardcoded `required:false` and validate-component
 * took it from the client. Both now resolve it from org policy
 * (lib/technical/qc-release-policy.ts), so `required:true` below is a state
 * production can genuinely be in; the assertions themselves are unchanged
 * because the decision function was never the defect.
 *
 * Still true, and still not a defect of this function: `lab_results` is empty
 * in practice because no Quality lab write bridge exists
 * (`registerQualityLabBridge` is called only from tests, so
 * POST /api/technical/lab-results always returns 501 QUALITY_BRIDGE_MISSING) —
 * so with the org policy ON, `factory_spec_approval` will block until Quality
 * can actually record a release.
 */

import { describe, expect, it } from 'vitest';
import { validateRmUsability, type RmUsabilityRequest } from './rm-usability';

const ACTIVE_ITEM = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'active' };
const GOOD_SPEC = {
  supplierCode: 'SUP-1',
  supplierStatus: 'approved',
  lifecycleStatus: 'active',
  reviewStatus: 'approved',
  effectiveFrom: '2020-01-01',
  expiryDate: null,
  costReviewBlocked: false,
  specReviewBlocked: false,
};

function base(over: Partial<RmUsabilityRequest> = {}): RmUsabilityRequest {
  return {
    context: 'bom_edit',
    item: ACTIVE_ITEM,
    supplier: GOOD_SPEC,
    rmAllergens: [],
    targetFgForbiddenAllergens: [],
    // What resolveQcRelease returns when the org has NOT enabled the policy.
    qcRelease: { required: false },
    ...over,
  };
}

const qcRow = (v: ReturnType<typeof validateRmUsability>) =>
  v.checks.find((c) => c.source === 'quality.lab_results (read model)')!;

describe('QC-release gate vs an empty lab_results table', () => {
  it('policy OFF (bom-edit-dialog → validateBomComponent): green QC row, table never queried', () => {
    const v = validateRmUsability(base());
    expect(v.usable).toBe(true);
    expect(v.blockingReasons).toEqual([]);
    expect(v.warnings).toEqual([]);
    // A PASS row citing lab_results as its source — with zero evidence behind it.
    expect(qcRow(v)).toMatchObject({ code: 'OK', label: 'QC release present', severity: 'pass' });
    expect(qcRow(v).evidenceAt).toBeNull();
  });

  it('policy OFF via bom/_actions/shared.ts — same green row in the RELEASE-CRITICAL context', () => {
    const v = validateRmUsability(base({ context: 'factory_spec_approval' }));
    expect(v.usable).toBe(true);
    expect(qcRow(v)).toMatchObject({ code: 'OK', severity: 'pass' });
  });

  it('policy ON + empty table only WARNS in bom_edit (draft authoring stays editable)', () => {
    // resolveQcRelease with zero lab_results rows → status null, evidenceAt null.
    const v = validateRmUsability(base({ qcRelease: { required: true, status: null, evidenceAt: null } }));
    expect(v.warnings).toContain('QC_RELEASE_MISSING');
    expect(v.blockingReasons).toEqual([]);
    expect(v.usable).toBe(true); // deliberate: bom_edit warns, release-critical blocks
  });

  it('policy ON — the gate BLOCKS in the release-critical context (reachable now)', () => {
    const v = validateRmUsability(
      base({ context: 'factory_spec_approval', qcRelease: { required: true, status: null, evidenceAt: null } }),
    );
    expect(v.blockingReasons).toContain('QC_RELEASE_MISSING');
    expect(v.usable).toBe(false);
  });

  it('CONTROL — bad input is still rejected (blocked item blocks in every context)', () => {
    const v = validateRmUsability(base({ item: { id: ACTIVE_ITEM.id, status: 'blocked' } }));
    expect(v.blockingReasons).toContain('ITEM_NOT_ACTIVE');
    expect(v.usable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The QC-required flag itself, against a REAL database.
//
// The defect was never in validateRmUsability — it was that nobody asked the
// org. `validateBomComponent` asked the CALLER (`raw.requireQcRelease`), and
// bom/_actions/shared.ts asked nobody at all (`{ required: false }` literal).
// These drive the real Server Action and prove all three directions: policy OFF
// passes, policy ON + no lab release warns/blocks, policy ON + a passing lab
// release passes again — and that a client posting `requireQcRelease:false` no
// longer switches the check off.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import type pgQc from 'pg';
import { afterAll, beforeAll, vi } from 'vitest';

import { getOwnerConnection } from '../../../../packages/db/src/clients.js';
import { createPgTestFixture, type PgTestFixture } from '../../tests/helpers/owner-org-context.js';

let qcRunAction: <T>(action: (ctx: { userId: string; orgId: string; client: pgQc.PoolClient }) => Promise<T>) => Promise<T> =
  async () => {
    throw new Error('qc org context is not initialized');
  };
vi.mock('../auth/with-org-context', () => ({
  withOrgContext: vi.fn((action: never) => qcRunAction(action)),
}));

const runQcPg = process.env.DATABASE_URL ? describe : describe.skip;

runQcPg('QC-required is org policy, not caller input — real database', () => {
  let ownerPool: pgQc.Pool;
  let client: pgQc.PoolClient;
  let fixture: PgTestFixture;
  const itemId = randomUUID();
  const sessionToken = randomUUID();
  let validateBomComponent: typeof import('../../actions/technical/boms/validate-component').validateBomComponent;

  async function setPolicy(enabled: boolean): Promise<void> {
    await client.query(
      `insert into public.tenant_variations (org_id, feature_flags)
       values ($1::uuid, jsonb_build_object('require_grn_qc_inspection', $2::boolean))
       on conflict (org_id) do update
          set feature_flags = coalesce(public.tenant_variations.feature_flags, '{}'::jsonb)
              || jsonb_build_object('require_grn_qc_inspection', $2::boolean)`,
      [fixture.orgId, enabled],
    );
  }

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    fixture = await createPgTestFixture(ownerPool, { permissions: ['technical.bom.create'] });
    client = await ownerPool.connect();
    await client.query('begin');
    await client.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [sessionToken, fixture.orgId, fixture.userId],
    );
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, fixture.orgId]);
    await client.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
       values ($1::uuid, $2::uuid, $3, 'rm', 'QC Policy RM', 'kg')`,
      [itemId, fixture.orgId, `QCP-${itemId.slice(0, 8)}`],
    );
    qcRunAction = (action) => action({ userId: fixture.userId, orgId: fixture.orgId, client });
    ({ validateBomComponent } = await import('../../actions/technical/boms/validate-component'));
  });

  afterAll(async () => {
    await client?.query('rollback').catch(() => undefined);
    await ownerPool
      ?.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
    client?.release();
    await fixture?.cleanup().catch(() => undefined);
    await ownerPool?.end();
  });

  function qcReasons(verdict: { warnings: string[]; blockingReasons: string[] }): string[] {
    return [...verdict.warnings, ...verdict.blockingReasons];
  }

  it('policy OFF → QC release is not required (the check stays quiet)', async () => {
    await setPolicy(false);
    const res = await validateBomComponent({ itemId });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(qcReasons(res.verdict)).not.toContain('QC_RELEASE_MISSING');
  });

  it('policy ON + no lab release → QC_RELEASE_MISSING is raised', async () => {
    await setPolicy(true);
    const res = await validateBomComponent({ itemId });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(qcReasons(res.verdict)).toContain('QC_RELEASE_MISSING');
  });

  it('a client posting requireQcRelease:false can NO LONGER switch the check off', async () => {
    await setPolicy(true);
    // Exactly the payload that used to disable the food-safety check.
    const res = await validateBomComponent({ itemId, requireQcRelease: false } as never);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(qcReasons(res.verdict)).toContain('QC_RELEASE_MISSING');
  });

  it('policy ON + a passing lab result → the check clears again (no over-blocking)', async () => {
    await setPolicy(true);
    await client.query(
      `insert into public.lab_results (org_id, item_id, test_type, result_status, tested_at, created_by)
       values ($1::uuid, $2::uuid, 'micro_apc', 'pass', now(), $3::uuid)`,
      [fixture.orgId, itemId, fixture.userId],
    );
    const res = await validateBomComponent({ itemId });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(qcReasons(res.verdict)).not.toContain('QC_RELEASE_MISSING');
  });
});
