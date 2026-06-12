/**
 * T-020 — Technical lab-results read model + Quality write bridge.
 *
 * Two layers:
 *  1. PURE unit tests for the read-model filter/projection + the Quality bridge
 *     (no DB) — always run.
 *  2. REAL DB-backed integration tests that drive the Route Handler GET/POST
 *     through withOrgContext (RLS via app.current_org_id()). Owner SQL is used
 *     only to seed fixtures + assert no Technical write happened. Skips when
 *     DATABASE_URL is unset.
 *
 * Proves:
 *   - GET ?test_type=allergen_elisa&result_status=fail returns ONLY matching,
 *     org-scoped read-model rows (AC1);
 *   - Technical POST with no Quality bridge → 501 QUALITY_BRIDGE_MISSING and NO
 *     lab_results row authored by Technical (AC2);
 *   - a registered bridge delegates the write and the row reads back (AC3);
 *   - ATP swab result_status + threshold_rlu are surfaced verbatim, not
 *     recomputed (AC4);
 *   - org isolation — Org B never sees Org A lab rows.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
import {
  buildLabResultsQuery,
  parseLabResultsFilter,
  toLabResultReadRow,
  type LabResultDbRow,
} from '../../lib/technical/lab/read-model';
import {
  QUALITY_BRIDGE_MISSING,
  registerQualityLabBridge,
  resolveQualityLabBridge,
  submitLabResultViaBridge,
  type QualityLabBridge,
} from '../../lib/technical/lab/quality-bridge-client';
import { GET, POST } from '../../app/api/technical/lab-results/route';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../helpers/owner-org-context.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PURE unit tests (no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe('T-020 read-model filter contract (pure)', () => {
  it('rejects an unknown test_type with a typed invalid_filter error', () => {
    const r = parseLabResultsFilter({ test_type: 'not_a_test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('test_type');
  });

  it('rejects an unknown result_status', () => {
    const r = parseLabResultsFilter({ result_status: 'green' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('result_status');
  });

  it('rejects a non-uuid item_id', () => {
    const r = parseLabResultsFilter({ item_id: '123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('item_id');
  });

  it('accepts allergen_elisa + fail and builds an org-scoped parameterised query', () => {
    const r = parseLabResultsFilter({ test_type: 'allergen_elisa', result_status: 'fail' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = buildLabResultsQuery(r.filter);
    expect(q.text).toContain('org_id = app.current_org_id()');
    expect(q.text).toContain('from public.lab_results');
    expect(q.values).toContain('allergen_elisa');
    expect(q.values).toContain('fail');
    // No raw interpolation of the filter values into the SQL text.
    expect(q.text).not.toContain('allergen_elisa');
  });
});

describe('T-020 read-model projection (pure)', () => {
  it('surfaces the Quality-calculated atp_swab status + threshold verbatim (AC4)', () => {
    const row: LabResultDbRow = {
      id: randomUUID(),
      item_id: randomUUID(),
      site_id: null,
      work_order_id: null,
      quality_result_id: randomUUID(),
      test_type: 'atp_swab',
      test_code: 'ATP-1',
      result_value: '42.0000',
      result_unit: 'RLU',
      result_status: 'fail',
      threshold_rlu: '10.00',
      tested_at: '2026-06-01T00:00:00.000Z',
      lab_provider: 'InternalLab',
      notes: null,
      created_at: '2026-06-01T00:00:00.000Z',
    };
    const mapped = toLabResultReadRow(row);
    expect(mapped).not.toBeNull();
    expect(mapped!.resultStatus).toBe('fail');
    expect(mapped!.thresholdRlu).toBe('10.00');
    // NUMERIC stays a string — never coerced to float.
    expect(typeof mapped!.resultValue).toBe('string');
  });

  it('drops a row whose status falls outside the canonical set', () => {
    const row = {
      id: randomUUID(),
      item_id: null,
      site_id: null,
      work_order_id: null,
      quality_result_id: null,
      test_type: 'atp_swab',
      test_code: null,
      result_value: null,
      result_unit: null,
      result_status: 'WEIRD',
      threshold_rlu: null,
      tested_at: null,
      lab_provider: null,
      notes: null,
      created_at: new Date(),
    } as unknown as LabResultDbRow;
    expect(toLabResultReadRow(row)).toBeNull();
  });
});

describe('T-020 Quality bridge (pure)', () => {
  afterEach(() => registerQualityLabBridge(null));

  it('returns QUALITY_BRIDGE_MISSING when no bridge is registered (AC2)', async () => {
    registerQualityLabBridge(null);
    expect(resolveQualityLabBridge()).toBeNull();
    const r = await submitLabResultViaBridge({
      orgId: randomUUID(),
      actorUserId: randomUUID(),
      testType: 'allergen_elisa',
      resultStatus: 'pass',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(QUALITY_BRIDGE_MISSING);
  });

  it('delegates to a registered bridge and returns its id (AC3)', async () => {
    const id = randomUUID();
    const bridge: QualityLabBridge = {
      submitLabResult: async () => ({ ok: true, labResultId: id }),
    };
    registerQualityLabBridge(bridge);
    const r = await submitLabResultViaBridge({
      orgId: randomUUID(),
      actorUserId: randomUUID(),
      testType: 'allergen_elisa',
      resultStatus: 'pass',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.labResultId).toBe(id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. REAL DB integration — Route Handler GET/POST under RLS
// ─────────────────────────────────────────────────────────────────────────────

const run = databaseUrl ? describe : describe.skip;

const TECH_PERMS = ['technical.items.create', 'technical.items.edit', 'technical.items.deactivate'];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  techAUserId: randomUUID(),
  noPermAUserId: randomUUID(),
  techBUserId: randomUUID(),
  techRoleAId: randomUUID(),
  viewerRoleAId: randomUUID(),
  techRoleBId: randomUUID(),
  itemAId: randomUUID(),
  itemBId: randomUUID(),
};

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Lab IT Tenant', 'eu', 'https://lab-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Lab IT Org A', 'fmcg'), ($4, $2, $5, 'Lab IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `lab-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `lab-b-${seed.orgBId.slice(0, 8)}`],
  );
  const permsJson = JSON.stringify(TECH_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-lab-it', false, 'tech-lab-it', 'Tech Lab IT', $3::jsonb, false, 30),
       ($4, $5, 'tech-lab-viewer-it', false, 'tech-lab-viewer-it', 'Tech Lab Viewer IT', '[]'::jsonb, false, 31),
       ($6, $7, 'tech-lab-it', false, 'tech-lab-it', 'Tech Lab IT B', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.techRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.techRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.techRoleAId, seed.techRoleBId, TECH_PERMS],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Tech A', 'Tech A', $4),
       ($5, $2, $6, 'NoPerm A', 'NoPerm A', $7),
       ($8, $9, $10, 'Tech B', 'Tech B', $11)
     on conflict (id) do nothing`,
    [
      seed.techAUserId, seed.orgAId, `lab-tech-a-${seed.techAUserId}@example.test`, seed.techRoleAId,
      seed.noPermAUserId, `lab-noperm-a-${seed.noPermAUserId}@example.test`, seed.viewerRoleAId,
      seed.techBUserId, seed.orgBId, `lab-tech-b-${seed.techBUserId}@example.test`, seed.techRoleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.techAUserId, seed.techRoleAId, seed.orgAId,
      seed.noPermAUserId, seed.viewerRoleAId,
      seed.techBUserId, seed.techRoleBId, seed.orgBId,
    ],
  );
  // Items (lab rows FK item_id → items).
  await owner.query(
    `insert into public.items (id, org_id, item_code, name, item_type, status, uom_base)
     values ($1, $2, $3, 'RM A', 'rm', 'active', 'kg'), ($4, $5, $6, 'RM B', 'rm', 'active', 'kg')
     on conflict (id) do nothing`,
    [seed.itemAId, seed.orgAId, `RM-A-${seed.itemAId.slice(0, 6)}`, seed.itemBId, seed.orgBId, `RM-B-${seed.itemBId.slice(0, 6)}`],
  );
  // Quality-owned lab rows (seeded by owner as the Quality bridge would).
  await owner.query(
    `insert into public.lab_results
       (org_id, item_id, test_type, test_code, result_value, result_unit, result_status, threshold_rlu, tested_at, lab_provider)
     values
       ($1, $2, 'allergen_elisa', 'EL-1', 5.0, 'ppm', 'fail', null, now(), 'Lab'),
       ($1, $2, 'allergen_elisa', 'EL-2', 0.0, 'ppm', 'pass', null, now(), 'Lab'),
       ($1, $2, 'atp_swab', 'ATP-1', 42.0, 'RLU', 'fail', 10.00, now(), 'Lab')`,
    [seed.orgAId, seed.itemAId],
  );
  await owner.query(
    `insert into public.lab_results
       (org_id, item_id, test_type, test_code, result_status, tested_at, lab_provider)
     values ($1, $2, 'allergen_elisa', 'EL-B', 'fail', now(), 'Lab')`,
    [seed.orgBId, seed.itemBId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.lab_results where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.items where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id in ($1, $2))`,
    [seed.orgAId, seed.orgBId],
  );
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('T-020 lab-results route (RLS read-only, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    // Force the withOrgContext app pool onto app_user for RLS.
    process.env.DATABASE_URL_APP = makeAppUserConnectionString();
    await seedFixtures();
  });

  afterAll(async () => {
    registerQualityLabBridge(null);
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
    delete process.env.DATABASE_URL_APP;
  });

  it('GET ?test_type=allergen_elisa&result_status=fail returns only matching org-scoped rows (AC1)', async () => {
    const res = await withActionActor(seed.techAUserId, seed.orgAId, () =>
      GET(new Request('http://t/api/technical/lab-results?test_type=allergen_elisa&result_status=fail')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ testType: string; resultStatus: string }>; count: number };
    expect(body.count).toBe(1);
    expect(body.data.every((r) => r.testType === 'allergen_elisa' && r.resultStatus === 'fail')).toBe(true);
  });

  it('GET surfaces the atp_swab Quality status + threshold verbatim (AC4)', async () => {
    const res = await withActionActor(seed.techAUserId, seed.orgAId, () =>
      GET(new Request('http://t/api/technical/lab-results?test_type=atp_swab')),
    );
    const body = (await res.json()) as { data: Array<{ resultStatus: string; thresholdRlu: string | null }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.resultStatus).toBe('fail');
    expect(body.data[0]!.thresholdRlu).toBe('10.00');
  });

  it('GET is org-isolated — Org B never sees Org A lab rows', async () => {
    const res = await withActionActor(seed.techBUserId, seed.orgBId, () =>
      GET(new Request('http://t/api/technical/lab-results')),
    );
    const body = (await res.json()) as { data: Array<{ testCode: string | null }> };
    // Org B has exactly its own one fail row, none of Org A's three.
    expect(body.data.every((r) => r.testCode === 'EL-B')).toBe(true);
  });

  it('GET forbids a caller with no Technical permission', async () => {
    const res = await withActionActor(seed.noPermAUserId, seed.orgAId, () =>
      GET(new Request('http://t/api/technical/lab-results')),
    );
    expect(res.status).toBe(403);
  });

  it('POST with no Quality bridge → 501 QUALITY_BRIDGE_MISSING and NO Technical-authored row (AC2)', async () => {
    registerQualityLabBridge(null);
    const before = await owner.query(`select count(*)::int as n from public.lab_results where org_id = $1`, [seed.orgAId]);
    const res = await withActionActor(seed.techAUserId, seed.orgAId, () =>
      POST(
        new Request('http://t/api/technical/lab-results', {
          method: 'POST',
          body: JSON.stringify({ item_id: seed.itemAId, test_type: 'allergen_elisa', result_status: 'pass' }),
        }),
      ),
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(QUALITY_BRIDGE_MISSING);
    const after = await owner.query(`select count(*)::int as n from public.lab_results where org_id = $1`, [seed.orgAId]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('POST with a registered bridge delegates the write and the row reads back (AC3)', async () => {
    // The bridge stands in for the 09-quality write service: it performs the
    // INSERT owner-side (Quality-owned) and returns the new id.
    const bridge: QualityLabBridge = {
      submitLabResult: async (reqBody) => {
        const ins = await owner.query<{ id: string }>(
          `insert into public.lab_results (org_id, item_id, test_type, result_status, lab_provider)
           values ($1, $2, $3, $4, 'BridgeLab') returning id`,
          [reqBody.orgId, reqBody.itemId, reqBody.testType, reqBody.resultStatus],
        );
        return { ok: true, labResultId: ins.rows[0]!.id };
      },
    };
    registerQualityLabBridge(bridge);
    const res = await withActionActor(seed.techAUserId, seed.orgAId, () =>
      POST(
        new Request('http://t/api/technical/lab-results', {
          method: 'POST',
          body: JSON.stringify({ item_id: seed.itemAId, test_type: 'micro_apc', result_status: 'pass' }),
        }),
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const readBack = await owner.query(`select test_type from public.lab_results where id = $1`, [body.data.id]);
    expect(readBack.rows[0]!.test_type).toBe('micro_apc');
    registerQualityLabBridge(null);
  });
});
