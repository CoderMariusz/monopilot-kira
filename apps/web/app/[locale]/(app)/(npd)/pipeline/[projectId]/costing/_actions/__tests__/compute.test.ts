/**
 * T-073 — Integration tests for the costing Server Actions.
 *
 * `withOrgContext` is mocked to run the action body inside a REAL org-scoped
 * transaction on the app-role pool (RLS engaged via app.set_org_context), so
 * these tests prove genuine persistence of costing_breakdowns +
 * costing_waterfall_steps and the V07 warn/fail behaviour end-to-end.
 *
 * Requires DATABASE_URL (clone @102). When absent, the integration suite is
 * skipped but the pure validation tests still run.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import { ownerQueryWithInferredOrgContext } from '../../../../../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

// ── Test identities ───────────────────────────────────────────────────────────
const tenantId = '07300000-0000-4000-8000-000000000000';
const orgA = '07300000-0000-4000-8000-00000000000a';
const orgAUser = '07300000-0000-4000-8000-0000000000aa';
const orgARole = '07300000-0000-4000-8000-0000000001aa';
const projectA = '07300000-0000-4000-8000-0000000000ab';
const productA = 'FA-T073-A';
const revalidatedPaths = vi.hoisted(() => [] as Array<{ path: string; type?: string }>);
const hasPermissionMock = vi.hoisted(() => vi.fn(async () => true));

// Shared mutable context the mocked withOrgContext binds the action to.
const ctxHolder: { orgId: string; userId: string; sessionToken: string; client: pg.PoolClient | null } = {
  orgId: orgA,
  userId: orgAUser,
  sessionToken: '',
  client: null,
};

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) => {
    if (!ctxHolder.client) throw new Error('test client not initialised');
    return action({
      orgId: ctxHolder.orgId,
      userId: ctxHolder.userId,
      sessionToken: ctxHolder.sessionToken,
      client: ctxHolder.client,
    });
  },
}));

vi.mock('../../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => {
    revalidatedPaths.push({ path, type });
  },
}));

let ownerPool: pg.Pool;
let appPool: pg.Pool;
let appClient: pg.PoolClient;

async function seed(pool: pg.Pool) {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T073 Tenant', 'eu', 'https://t073.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T073 Org A', 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name`,
    [orgA, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
       values ($1, $2, 'costing_user', 'T073 Role A', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [orgARole, orgA],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'costing-t073-a@example.test', 'T073 User A', $3)
     on conflict (id) do update set org_id = excluded.org_id, email = excluded.email`,
    [orgAUser, orgA, orgARole],
  );
  await pool.query(
    `insert into public.user_roles (user_id, org_id, role_id)
       values ($1, $2, $3)
     on conflict do nothing`,
    [orgAUser, orgA, orgARole],
  );
  await pool.query(
    `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.formulation.create_draft')
     on conflict (role_id, permission) do nothing`,
    [orgARole],
  );
  await pool.query('delete from public.product where product_code = $1', [productA]);
  await ownerQueryWithInferredOrgContext(pool,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'T073 Product A', 1, $3)`,
    [productA, orgA, orgAUser],
  );
  // Ensure the per-org margin warn threshold exists (15%). Idempotent.
  await pool.query(
    `insert into "Reference"."AlertThresholds" (org_id, threshold_key, value_int, value_text)
       values ($1, 'costing_margin_warn_pct', 15, null)
     on conflict (org_id, threshold_key) do update set value_int = excluded.value_int`,
    [orgA],
  );
}

const baseParams = {
  rawCostEur: '10.00',
  yieldPct: '90',
  processLabourEur: '2.00',
  packagingEur: '1.00',
  overheadEur: '1.50',
  logisticsEur: '0.50',
  marginPct: '20',
  distributorMarkupPct: '15',
  retailMarkupPct: '40',
};

runIntegration('computeCosting (integration)', () => {
  let computeCosting: typeof import('../compute').computeCosting;
  let computeAndSaveInitialBreakdown: typeof import('../compute').computeAndSaveInitialBreakdown;
  let saveCostingScenario: typeof import('../save-scenario').saveCostingScenario;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seed(ownerPool);

    // Register a trusted session token + open an app-role transaction with the
    // org context applied. The action body runs on this same client.
    ctxHolder.sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
         on conflict (session_token) do update set org_id = excluded.org_id`,
      [ctxHolder.sessionToken, orgA],
    );
    appClient = await appPool.connect();
    await appClient.query('begin');
    await appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [ctxHolder.sessionToken, orgA]);
    ctxHolder.client = appClient;

    ({ computeCosting, computeAndSaveInitialBreakdown } = await import('../compute'));
    ({ saveCostingScenario } = await import('../save-scenario'));
  });

  afterAll(async () => {
    if (appClient) {
      await appClient.query('rollback').catch(() => undefined);
      appClient.release();
    }
    await appPool?.end().catch(() => undefined);
    await ownerPool?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    // Clean costing rows for this product between tests (cascade clears steps).
    await appClient.query(
      `delete from public.costing_breakdowns where product_code = $1`,
      [productA],
    );
  });

  it('persists 9 ordered, NUMERIC-exact steps + breakdown (target scenario, margin 20%)', async () => {
    const res = await computeCosting({ productCode: productA, scenario: 'target', params: baseParams });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.status).toBe('ok');
    expect(res.data.warn).toBe(false);
    expect(res.data.targetPriceEur).toBe('32.4236');

    const steps = await appClient.query<{ step_index: number; step_name: string; value_eur: string; delta_pct: string | null }>(
      `select step_index, step_name, value_eur::text, delta_pct::text
         from public.costing_waterfall_steps
        where breakdown_id = $1::uuid
        order by step_index`,
      [res.data.breakdownId],
    );
    expect(steps.rows).toHaveLength(9);
    expect(steps.rows.map((r) => r.step_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(steps.rows.map((r) => r.step_name)).toEqual([
      'Raw materials',
      'Yield loss',
      'Process labour',
      'Packaging',
      'Overhead',
      'Logistics',
      'Margin',
      'Distributor',
      'Retail',
    ]);
    // NUMERIC-exact persisted values (DB ::text never lossy-rounds our 4dp).
    expect(steps.rows[0]!.value_eur).toBe('10.0000');
    expect(steps.rows[1]!.value_eur).toBe('11.1111');
    expect(steps.rows[8]!.value_eur).toBe('32.4236');
    expect(steps.rows[0]!.delta_pct).toBeNull();

    const breakdown = await appClient.query<{ margin_pct: string; target_price_eur: string }>(
      `select margin_pct::text, target_price_eur::text
         from public.costing_breakdowns where id = $1::uuid`,
      [res.data.breakdownId],
    );
    expect(breakdown.rows[0]!.margin_pct).toBe('20.0000');
    expect(breakdown.rows[0]!.target_price_eur).toBe('32.4236');
  });

  it('flags WARN when scenario margin (10%) is below the Reference.AlertThresholds threshold (15%)', async () => {
    const res = await computeCosting({
      productCode: productA,
      scenario: 'pessimistic',
      params: { ...baseParams, marginPct: '10' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('warn');
    expect(res.data.warn).toBe(true);

    // Persisted (warn does not block commit).
    const cnt = await appClient.query<{ n: string }>(
      `select count(*) as n from public.costing_breakdowns where id = $1::uuid`,
      [res.data.breakdownId],
    );
    expect(cnt.rows[0]!.n).toBe('1');
  });

  it('HARD FAILs and refuses to commit when scenario margin (-5%) < 0%', async () => {
    const res = await computeCosting({
      productCode: productA,
      scenario: 'broken',
      params: { ...baseParams, marginPct: '-5' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('margin_hard_fail');

    // Nothing persisted for the failing scenario.
    const cnt = await appClient.query<{ n: string }>(
      `select count(*) as n from public.costing_breakdowns where product_code = $1 and scenario = 'broken'`,
      [productA],
    );
    expect(cnt.rows[0]!.n).toBe('0');
  });

  it('recompute is idempotent: UPSERT keeps one breakdown + replaces (still 9) steps', async () => {
    await computeCosting({ productCode: productA, scenario: 'target', params: baseParams });
    const second = await computeCosting({
      productCode: productA,
      scenario: 'target',
      params: { ...baseParams, marginPct: '25' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const breakdowns = await appClient.query<{ n: string }>(
      `select count(*) as n from public.costing_breakdowns where product_code = $1 and scenario = 'target'`,
      [productA],
    );
    expect(breakdowns.rows[0]!.n).toBe('1');

    const steps = await appClient.query<{ n: string }>(
      `select count(*) as n from public.costing_waterfall_steps where breakdown_id = $1::uuid`,
      [second.data.breakdownId],
    );
    expect(steps.rows[0]!.n).toBe('9');
    // Updated margin reflected.
    const margin = await appClient.query<{ margin_pct: string }>(
      `select margin_pct::text from public.costing_breakdowns where id = $1::uuid`,
      [second.data.breakdownId],
    );
    expect(margin.rows[0]!.margin_pct).toBe('25.0000');
  });

  it('saveCostingScenario UPSERTs a named what-if idempotently', async () => {
    revalidatedPaths.length = 0;
    const first = await saveCostingScenario({
      projectId: projectA,
      productCode: productA,
      scenario: 'optimistic',
      params: { ...baseParams, marginPct: '30' },
    });
    expect(first.ok).toBe(true);
    const second = await saveCostingScenario({
      projectId: projectA,
      productCode: productA,
      scenario: 'optimistic',
      params: { ...baseParams, marginPct: '35' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const rows = await appClient.query<{ n: string; margin_pct: string }>(
      `select count(*) over () as n, margin_pct::text
         from public.costing_breakdowns where product_code = $1 and scenario = 'optimistic'`,
      [productA],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.n).toBe('1');
    expect(rows.rows[0]!.margin_pct).toBe('35.0000');
    expect(revalidatedPaths).toContainEqual({
      path: `/[locale]/pipeline/${projectA}/costing`,
      type: 'page',
    });
  });

  it('saveCostingScenario PERSISTS the exact what-if PARAMETERS and they are retrievable by name (rework finding 2)', async () => {
    const params = {
      rawCostEur: '12.34',
      yieldPct: '88.5',
      processLabourEur: '2.10',
      packagingEur: '1.05',
      overheadEur: '1.55',
      logisticsEur: '0.45',
      marginPct: '22.5',
      distributorMarkupPct: '12',
      retailMarkupPct: '38',
    };
    const res = await saveCostingScenario({ projectId: projectA, productCode: productA, scenario: 'with-params', params });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Action echoes the params it saved.
    expect(res.data.params).toEqual(params);

    // Retrievable by scenario NAME from the DB — exact decimal strings (no floats).
    const row = await appClient.query<{ params: Record<string, string> }>(
      `select params from public.costing_breakdowns
        where product_code = $1 and scenario = 'with-params'`,
      [productA],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.params).toEqual(params);
    // Crucially: the slider values survived verbatim (e.g. fractional yield/margin).
    expect(row.rows[0]!.params.yieldPct).toBe('88.5');
    expect(row.rows[0]!.params.marginPct).toBe('22.5');
  });

  it('saveCostingScenario idempotent OVERWRITE by name replaces persisted params (rework finding 2)', async () => {
    const p1 = { ...baseParams, marginPct: '30', yieldPct: '90' };
    const p2 = { ...baseParams, marginPct: '31', yieldPct: '85' };
    await saveCostingScenario({ projectId: projectA, productCode: productA, scenario: 'overwrite-me', params: p1 });
    const second = await saveCostingScenario({ projectId: projectA, productCode: productA, scenario: 'overwrite-me', params: p2 });
    expect(second.ok).toBe(true);

    const rows = await appClient.query<{ n: string; params: Record<string, string> }>(
      `select count(*) over () as n, params
         from public.costing_breakdowns where product_code = $1 and scenario = 'overwrite-me'`,
      [productA],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.n).toBe('1'); // single row — no duplicate
    expect(rows.rows[0]!.params).toEqual(p2); // latest params win
  });

  it('computeCosting also persists params, retrievable by scenario name (rework finding 2)', async () => {
    const res = await computeCosting({ productCode: productA, scenario: 'computed-params', params: baseParams });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = await appClient.query<{ params: Record<string, string> }>(
      `select params from public.costing_breakdowns where id = $1::uuid`,
      [res.data.breakdownId],
    );
    expect(row.rows[0]!.params).toEqual(baseParams);
  });

  it('W9-L6: a LOCKED formulation without an FG mapping returns fg_not_mapped (not the "no formulation" lie)', async () => {
    const projectId = randomUUID();
    const formulationId = randomUUID();
    const versionId = randomUUID();
    // Project WITHOUT product_code (pre-packaging) + locked current version.
    await ownerPool.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
       values
         ($1::uuid, $2::uuid, $3, 'W9L6 Locked NoFG', 'Recipe Standard', 'G2', 'recipe', 'normal', null, $4::uuid)`,
      [projectId, orgA, `NPD-W9L6-${randomUUID().slice(0, 8)}`, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1::uuid, $2::uuid, $3::uuid, null, $4::uuid)`,
      [formulationId, orgA, projectId, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulation_versions
         (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur, created_by_user)
       values ($1::uuid, $2::uuid, 1, 'locked', 10.000, 90.000, 5.0000, $3::uuid)`,
      [versionId, formulationId, orgAUser],
    );
    await ownerPool.query(
      `update public.formulations set current_version_id = $2::uuid where id = $1::uuid`,
      [formulationId, versionId],
    );
    await ownerPool.query(
      `insert into public.formulation_ingredients
         (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
       values ($1::uuid, 'RM-W9L6-A', 10.000, 100.000, 2.5000, 1)`,
      [versionId],
    );

    const res = await computeAndSaveInitialBreakdown({ projectId });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('fg_not_mapped');
  });

  it('W9-L6: COALESCEs the FG from npd_projects when only the project row carries it (locked v1 computes)', async () => {
    const projectId = randomUUID();
    const formulationId = randomUUID();
    const versionId = randomUUID();
    // Project HAS the FG; the formulation row predates nothing and was never
    // backfilled (product_code null) — the exact live-clickthrough shape.
    await ownerPool.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
       values
         ($1::uuid, $2::uuid, $3, 'W9L6 Coalesce FG', 'Recipe Standard', 'G3', 'packaging', 'normal', $4, $5::uuid)`,
      [projectId, orgA, `NPD-W9L6-${randomUUID().slice(0, 8)}`, productA, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1::uuid, $2::uuid, $3::uuid, null, $4::uuid)`,
      [formulationId, orgA, projectId, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulation_versions
         (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur, created_by_user)
       values ($1::uuid, $2::uuid, 1, 'locked', 10.000, 90.000, 5.0000, $3::uuid)`,
      [versionId, formulationId, orgAUser],
    );
    await ownerPool.query(
      `update public.formulations set current_version_id = $2::uuid where id = $1::uuid`,
      [formulationId, versionId],
    );
    await ownerPool.query(
      `insert into public.formulation_ingredients
         (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
       values
         ($1::uuid, 'RM-W9L6-B', 6.000, 60.000, 2.5000, 1),
         ($1::uuid, 'RM-W9L6-C', 4.000, 40.000, 3.7500, 2)`,
      [versionId],
    );

    const res = await computeAndSaveInitialBreakdown({ projectId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.productCode).toBe(productA);
    expect(res.data.scenario).toBe('target');
  });

  it('computeAndSaveInitialBreakdown bootstraps the first target breakdown from the current formulation', async () => {
    const projectId = randomUUID();
    const formulationId = randomUUID();
    const versionId = randomUUID();
    await ownerPool.query(
      `insert into public.npd_projects
         (id, org_id, code, name, type, current_gate, current_stage, prio, product_code, created_by_user)
       values
         ($1::uuid, $2::uuid, $3, 'T073 Initial Costing', 'Recipe Standard', 'G2', 'costing', 'normal', $4, $5::uuid)`,
      [projectId, orgA, `NPD-T073-${randomUUID().slice(0, 8)}`, productA, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulations (id, org_id, project_id, product_code, created_by_user)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
      [formulationId, orgA, projectId, productA, orgAUser],
    );
    await ownerPool.query(
      `insert into public.formulation_versions
         (id, formulation_id, version_number, state, batch_size_kg, target_yield_pct, target_price_eur, created_by_user)
       values ($1::uuid, $2::uuid, 1, 'draft', 10.000, 90.000, 5.0000, $3::uuid)`,
      [versionId, formulationId, orgAUser],
    );
    await ownerPool.query(
      `update public.formulations set current_version_id = $2::uuid where id = $1::uuid`,
      [formulationId, versionId],
    );
    await ownerPool.query(
      `insert into public.formulation_ingredients
         (version_id, rm_code, qty_kg, pct, cost_per_kg_eur, sequence)
       values
         ($1::uuid, 'RM-T073-A', 6.000, 60.000, 2.5000, 1),
         ($1::uuid, 'RM-T073-B', 4.000, 40.000, 3.7500, 2)`,
      [versionId],
    );

    const res = await computeAndSaveInitialBreakdown({ projectId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.productCode).toBe(productA);
    expect(res.data.scenario).toBe('target');
    expect(res.data.rawCostEur).toBe('3.0000');
    expect(res.data.targetPriceEur).toBe('5.0000');

    const persisted = await appClient.query<{ breakdowns: string; steps: string }>(
      `select
         (select count(*)::text from public.costing_breakdowns where product_code = $1 and scenario = 'target') as breakdowns,
         (select count(*)::text from public.costing_waterfall_steps where breakdown_id = $2::uuid) as steps`,
      [productA, res.data.breakdownId],
    );
    expect(persisted.rows[0]).toEqual({ breakdowns: '1', steps: '9' });
  });
});

// ── Pure validation path (always runs, no DB) ─────────────────────────────────
describe('computeCosting (input validation)', () => {
  beforeEach(() => {
    // No DB client bound — validation must reject BEFORE withOrgContext is hit.
    ctxHolder.client = null;
    hasPermissionMock.mockReset();
    hasPermissionMock.mockResolvedValue(true);
  });

  it('rejects an invalid payload with invalid_input and never touches the DB', async () => {
    const { computeCosting } = await import('../compute');
    const res = await computeCosting({ productCode: '', scenario: 'x', params: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('invalid_input');
  });

  it('rejects a non-decimal monetary input', async () => {
    const { computeCosting } = await import('../compute');
    const res = await computeCosting({
      productCode: 'FA-X',
      scenario: 'target',
      params: { ...baseParams, rawCostEur: '10,00' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('invalid_input');
  });

  it('returns forbidden before any DB access when npd.costing is denied', async () => {
    hasPermissionMock.mockResolvedValue(false);
    const querySpy = vi.fn(async () => ({ rows: [] }));
    ctxHolder.client = { query: querySpy } as unknown as pg.PoolClient;

    const { computeCosting } = await import('../compute');
    const res = await computeCosting({ productCode: productA, scenario: 'target', params: baseParams });

    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(querySpy).not.toHaveBeenCalled();
  });

  // Rework finding 3: out-of-bounds inputs must return invalid_input (NOT
  // persistence_failed) and must never reach the DB.
  it('rejects yieldPct > 100 with invalid_input (not persistence_failed)', async () => {
    const { computeCosting } = await import('../compute');
    const res = await computeCosting({
      productCode: 'FA-X',
      scenario: 'target',
      params: { ...baseParams, yieldPct: '120' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('invalid_input');
  });

  it('rejects yieldPct = 0 with invalid_input', async () => {
    const { computeCosting } = await import('../compute');
    const res = await computeCosting({
      productCode: 'FA-X',
      scenario: 'target',
      params: { ...baseParams, yieldPct: '0' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('invalid_input');
  });

  it('rejects marginPct >= 100 with invalid_input (not persistence_failed / div-by-zero)', async () => {
    const { computeCosting } = await import('../compute');
    const res = await computeCosting({
      productCode: 'FA-X',
      scenario: 'target',
      params: { ...baseParams, marginPct: '100' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('invalid_input');
  });

  it('computeAndSaveInitialBreakdown rejects invalid projectId before DB access', async () => {
    const { computeAndSaveInitialBreakdown } = await import('../compute');
    const res = await computeAndSaveInitialBreakdown({ projectId: 'not-a-uuid' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_input');
  });

  it('saveCostingScenario also rejects out-of-bounds inputs with invalid_input', async () => {
    const { saveCostingScenario } = await import('../save-scenario');
    const tooHighYield = await saveCostingScenario({
      projectId: projectA,
      productCode: 'FA-X',
      scenario: 'bad',
      params: { ...baseParams, yieldPct: '101' },
    });
    expect(tooHighYield.ok).toBe(false);
    if (!tooHighYield.ok) expect(tooHighYield.error).toBe('invalid_input');

    const tooHighMargin = await saveCostingScenario({
      projectId: projectA,
      productCode: 'FA-X',
      scenario: 'bad',
      params: { ...baseParams, marginPct: '100' },
    });
    expect(tooHighMargin.ok).toBe(false);
    if (!tooHighMargin.ok) expect(tooHighMargin.error).toBe('invalid_input');
  });
});

// ── W9-L6: bootstrap-lookup honesty (always runs, no DB — fake client) ─────────
//
// Root cause of the live "No formulation available" on a project WITH a locked v1:
// the bootstrap read formulations.product_code only. lockVersion writes
// formulation_versions.state — never product_code (the FG mapping is written by
// createFgCandidate when the project enters packaging, and only backfilled onto
// formulations existing at that moment). A real, locked formulation without an FG
// mapping therefore collapsed into `not_found` and the UI lied.
describe('computeAndSaveInitialBreakdown — lookup honesty (W9-L6, fake client)', () => {
  type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };
  let handler: Handler = () => ({ rows: [] });

  /** Bootstrap row exactly as the CTE projects it (LOCKED v1 fixture). */
  function lockedFormulationRow(productCode: string | null) {
    return {
      product_code: productCode,
      ingredient_count: '2',
      missing_cost_count: '0',
      raw_cost_eur: '2.5000',
      yield_pct: '95',
      margin_pct: '20',
    };
  }

  beforeEach(() => {
    handler = () => ({ rows: [] });
    ctxHolder.client = {
      query: async (sql: string, params?: readonly unknown[]) => handler(sql, params),
    } as unknown as pg.PoolClient;
  });

  it('no formulation/current version at all → not_found', async () => {
    const { computeAndSaveInitialBreakdown } = await import('../compute');
    handler = () => ({ rows: [] });
    const res = await computeAndSaveInitialBreakdown({ projectId: randomUUID() });
    expect(res).toEqual({ ok: false, error: 'not_found' });
  });

  it('LOCKED formulation, no FG anywhere → fg_not_mapped (NOT not_found)', async () => {
    const { computeAndSaveInitialBreakdown } = await import('../compute');
    handler = (sql) => {
      if (sql.includes('with current_recipe')) return { rows: [lockedFormulationRow(null)] };
      return { rows: [] };
    };
    const res = await computeAndSaveInitialBreakdown({ projectId: randomUUID() });
    expect(res).toEqual({ ok: false, error: 'fg_not_mapped' });
  });

  it('bootstrap SQL coalesces the FG from the project row (joins npd_projects)', async () => {
    const { computeAndSaveInitialBreakdown } = await import('../compute');
    const seen: string[] = [];
    handler = (sql) => {
      seen.push(sql);
      if (sql.includes('with current_recipe')) {
        expect(sql).toContain('coalesce(f.product_code, p.product_code)');
        expect(sql).toContain('join public.npd_projects p');
        return { rows: [lockedFormulationRow('FG-W9L6-007')] };
      }
      if (sql.includes('"Reference"."AlertThresholds"')) {
        return { rows: [{ value_int: 15, value_text: null }] };
      }
      if (sql.includes('insert into public.costing_breakdowns')) {
        return { rows: [{ id: randomUUID() }] };
      }
      return { rows: [] };
    };

    const res = await computeAndSaveInitialBreakdown({ projectId: randomUUID() });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.productCode).toBe('FG-W9L6-007');
      expect(res.data.scenario).toBe('target');
      expect(res.data.steps).toHaveLength(9);
    }
    expect(seen.filter((sql) => sql.includes('insert into public.costing_waterfall_steps'))).toHaveLength(9);
  });

  it('missing ingredient costs still report invalid_input (contract unchanged)', async () => {
    const { computeAndSaveInitialBreakdown } = await import('../compute');
    handler = (sql) => {
      if (sql.includes('with current_recipe')) {
        return { rows: [{ ...lockedFormulationRow('FG-W9L6-007'), missing_cost_count: '1' }] };
      }
      return { rows: [] };
    };
    const res = await computeAndSaveInitialBreakdown({ projectId: randomUUID() });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});
