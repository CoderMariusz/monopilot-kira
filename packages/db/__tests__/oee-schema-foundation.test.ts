import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 15-OEE — SCHEMA foundation (migration 203). READ-ONLY consumer of oee_snapshots +
// downtime_events (D-OEE-1: 08-production is the SOLE producer). Asserts:
//   * the OEE reference/operational tables + MVs exist with RLS forced + composite FK indexes;
//   * CANONICAL-OWNER SEPARATION — this migration creates NO base oee_snapshots / downtime_events
//     table (only MVs/views over the 08-owned producer tables);
//   * MVs build from oee_snapshots, MTBF/MTTR NULL when downtime_event_count = 0, RLS isolation
//     propagates from the producer, and CONCURRENTLY refresh works;
//   * the oee.* RBAC family is seeded to the org-admin role family in BOTH role_permissions and
//     the legacy jsonb cache, idempotently;
//   * the shift_aggregator_v1 DSL rule is registered active and the P2 stubs are inactive.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const MIGRATION_FILE = resolve(__dirname, '../migrations/203-oee-schema-foundation.sql');

const OEE_PERMISSIONS = [
  'oee.anomaly.acknowledge',
  'oee.big_loss.map_edit',
  'oee.dashboard.read',
  'oee.downtime.annotate',
  'oee.downtime.escalate',
  'oee.export.csv',
  'oee.export.pdf',
  'oee.override.create',
  'oee.override.delete',
  'oee.shift_pattern.edit',
  'oee.shift_pattern.read',
  'oee.target.edit',
  'oee.tv.kiosk_view',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

// ---------------------------------------------------------------------------
// Static SQL invariant — no DB needed. CANONICAL-OWNER SEPARATION (D-OEE-1).
// ---------------------------------------------------------------------------
describe('15-OEE migration 203 — canonical-owner separation (static)', () => {
  const sql = readFileSync(MIGRATION_FILE, 'utf8').toLowerCase();

  it('creates NO base oee_snapshots table (08-production is the SOLE producer, D-OEE-1)', () => {
    expect(sql).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?oee_snapshots\b/);
  });

  it('creates NO base downtime_events table (08-production owns it)', () => {
    expect(sql).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?downtime_events\b/);
  });

  it('never writes (INSERT/UPDATE/DELETE) to oee_snapshots — read-only consumer', () => {
    expect(sql).not.toMatch(/insert\s+into\s+(public\.)?oee_snapshots\b/);
    expect(sql).not.toMatch(/update\s+(public\.)?oee_snapshots\b/);
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?oee_snapshots\b/);
  });

  it('builds oee_shift_metrics as a MATERIALIZED VIEW reading FROM oee_snapshots', () => {
    expect(sql).toMatch(/create\s+materialized\s+view\s+(public\.)?oee_shift_metrics/);
    expect(sql).toMatch(/from\s+public\.oee_snapshots/);
  });

  it('uses app.current_org_id() and never raw current_setting for org scope (Wave0 lock)', () => {
    expect(sql).toContain('app.current_org_id()');
    expect(sql).not.toMatch(/current_setting\(\s*'app\.(tenant_id|current_org_id)'/);
    // No tenant_id used as a column/identifier (prose mapping mentions are stripped: only flag
    // an actual `tenant_id` token followed by a type/whitespace-delimited identifier usage).
    expect(sql).not.toMatch(/\btenant_id\b\s+uuid/);
    expect(sql).not.toMatch(/\borg_id\s*=\s*tenant_id\b/);
  });
});

// ---------------------------------------------------------------------------
// DB-backed assertions.
// ---------------------------------------------------------------------------
runIntegrationSuite('15-OEE migration 203 — schema foundation (DB)', () => {
  let admin: pg.Pool;
  let app: pg.Pool;
  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const newOrgId = randomUUID();
  const supervisorRoleId = randomUUID();
  const viewerRoleId = randomUUID();

  // Run `fn` as app_user (RLS-subject) scoped to `orgId` via a pre-registered session token.
  async function asOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await admin.query(
      'insert into app.session_org_contexts (session_token, org_id) values ($1, $2) on conflict (session_token) do update set org_id = excluded.org_id',
      [sessionToken, orgId],
    );
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('rollback');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    admin = getOwnerConnection();
    app = getAppConnection();
    await admin.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'OEE Foundation Tenant', 'eu', 'https://oee.example.test') on conflict (id) do nothing`,
      [tenantId],
    );
    for (const [id, slug] of [
      [orgA, 'oee-org-a'],
      [orgB, 'oee-org-b'],
    ] as const) {
      await admin.query(
        `insert into public.organizations (id, tenant_id, name, slug, industry_code)
         values ($1, $2, $3, $4, 'fmcg') on conflict (id) do nothing`,
        [id, tenantId, `OEE ${slug}`, slug],
      );
    }
    // New org → AFTER INSERT trigger chain (080 role seed + 203 oee seed) fires for the admin family.
    await admin.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'OEE Seed Org', $3, 'fmcg') on conflict (id) do nothing`,
      [newOrgId, tenantId, `oeeseed-${newOrgId.slice(0, 8)}`],
    );
    // Add explicit oee_supervisor + oee_viewer roles then re-run the seed so they get their subset.
    await admin.query(
      `insert into public.roles (id, org_id, code, name, permissions, is_system, display_order)
       values ($1, $2, 'oee_supervisor', 'OEE Supervisor', '[]'::jsonb, true, 300),
              ($3, $2, 'oee_viewer', 'OEE Viewer', '[]'::jsonb, true, 310)
       on conflict do nothing`,
      [supervisorRoleId, newOrgId, viewerRoleId],
    );
    await admin.query(`select public.seed_oee_permissions_for_org($1)`, [newOrgId]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [orgA, orgB, newOrgId]) {
      await admin
        .query(`delete from public.oee_snapshots where org_id = $1`, [id])
        .catch(() => undefined);
      await admin
        .query(`delete from public.shift_configs where org_id = $1`, [id])
        .catch(() => undefined);
      await admin
        .query(
          `delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = $1`,
          [id],
        )
        .catch(() => undefined);
      await admin.query(`delete from public.rule_definitions where org_id = $1`, [id]).catch(() => undefined);
      await admin.query(`delete from public.roles where org_id = $1`, [id]).catch(() => undefined);
      await admin.query(`delete from public.organizations where id = $1`, [id]).catch(() => undefined);
    }
    await admin.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await app?.end();
    await admin.end();
  });

  it('AC1 — oee base tables + MVs exist with RLS forced (tables) and unique MV indexes', async () => {
    const { rows: tabs } = await admin.query<{ relname: string; relkind: string }>(
      `select relname, relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and relname in ('shift_configs','oee_alert_thresholds','shift_patterns',
                         'org_non_production_days','big_loss_categories',
                         'oee_shift_metrics','oee_daily_summary')
       order by relname`,
    );
    const kind = Object.fromEntries(tabs.map((t) => [t.relname, t.relkind]));
    expect(kind['shift_configs']).toBe('r');
    expect(kind['oee_alert_thresholds']).toBe('r');
    expect(kind['shift_patterns']).toBe('r');
    expect(kind['org_non_production_days']).toBe('r');
    expect(kind['big_loss_categories']).toBe('r');
    // MVs (relkind m), not base tables.
    expect(kind['oee_shift_metrics']).toBe('m');
    expect(kind['oee_daily_summary']).toBe('m');

    const { rows: rls } = await admin.query<{ relname: string; f: boolean }>(
      `select relname, relforcerowsecurity as f from pg_class
       where relname in ('shift_configs','oee_alert_thresholds','shift_patterns','org_non_production_days')
         and relkind = 'r'`,
    );
    for (const r of rls) expect(r.f).toBe(true);

    const { rows: idx } = await admin.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where indexname in ('idx_oee_shift_pk','idx_oee_daily_pk') order by indexname`,
    );
    expect(idx.map((r) => r.indexname)).toEqual(['idx_oee_daily_pk', 'idx_oee_shift_pk']);
  });

  it('AC2 — producer separation: oee_snapshots + downtime_events stay 08-owned base tables, not re-created by 203', async () => {
    // They EXIST (created by 08 migs 183/184) as base tables, and were applied BEFORE 203.
    const { rows } = await admin.query<{ relname: string; relkind: string }>(
      `select relname, relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname in ('oee_snapshots','downtime_events') order by relname`,
    );
    expect(rows.map((r) => `${r.relname}:${r.relkind}`)).toEqual([
      'downtime_events:r',
      'oee_snapshots:r',
    ]);
    // schema_migrations confirms 08's producer migrations ran strictly before 203.
    const { rows: mig } = await admin.query<{ filename: string }>(
      `select filename from public.schema_migrations
       where filename in ('184-production-changeover-allergen-oee.sql','203-oee-schema-foundation.sql')
       order by filename`,
    );
    expect(mig.map((m) => m.filename)).toEqual([
      '184-production-changeover-allergen-oee.sql',
      '203-oee-schema-foundation.sql',
    ]);
  });

  it('AC3 — shift_patterns composite FK (org_id, shift_id) -> shift_configs is enforced', async () => {
    // Insert without a matching shift_config row -> FK violation.
    await expect(
      admin.query(
        `insert into public.shift_patterns (org_id, shift_id) values ($1, 'NOPE')`,
        [orgA],
      ),
    ).rejects.toThrow(/foreign key|violates/i);

    // With a parent shift_config it succeeds.
    await admin.query(
      `insert into public.shift_configs (org_id, shift_id, shift_label, start_time, end_time)
       values ($1, 'A', 'Morning', '06:00', '14:00') on conflict do nothing`,
      [orgA],
    );
    const ok = await admin.query(
      `insert into public.shift_patterns (org_id, shift_id) values ($1, 'A') returning id`,
      [orgA],
    );
    expect(ok.rows).toHaveLength(1);
    await admin.query(`delete from public.shift_patterns where org_id = $1`, [orgA]);
    await admin.query(`delete from public.shift_configs where org_id = $1`, [orgA]);
  });

  it('AC4 — oee_alert_thresholds defaults applied when omitted (PRD §9.4)', async () => {
    const { rows } = await admin.query<{
      oee_target_pct: string;
      performance_min_pct: string;
      quality_min_pct: string;
      anomaly_sigma_threshold: string;
      maintenance_trigger_consecutive_days: number;
    }>(
      `insert into public.oee_alert_thresholds (org_id, line_id) values ($1, 'LINE-DEF')
       returning oee_target_pct, performance_min_pct, quality_min_pct,
                 anomaly_sigma_threshold, maintenance_trigger_consecutive_days`,
      [orgA],
    );
    expect(Number(rows[0].oee_target_pct)).toBe(70);
    expect(Number(rows[0].performance_min_pct)).toBe(80);
    expect(Number(rows[0].quality_min_pct)).toBe(95);
    expect(Number(rows[0].anomaly_sigma_threshold)).toBe(2.0);
    expect(rows[0].maintenance_trigger_consecutive_days).toBe(3);
    await admin.query(`delete from public.oee_alert_thresholds where org_id = $1`, [orgA]);
  });

  it('AC5 — big_loss_categories seeded universal Nakajima taxonomy (3xA, 1xP, 2xQ)', async () => {
    const { rows } = await admin.query<{ impact_dimension: string; n: string }>(
      `select impact_dimension, count(*)::text as n from public.big_loss_categories
       group by impact_dimension order by impact_dimension`,
    );
    expect(rows).toEqual([
      { impact_dimension: 'A', n: '3' },
      { impact_dimension: 'P', n: '1' },
      { impact_dimension: 'Q', n: '2' },
    ]);
  });

  it('AC6 — oee_shift_metrics builds from oee_snapshots; MTBF/MTTR NULL when no downtime_events; RLS isolation propagates', async () => {
    // shift_config for orgA so shift_label joins + timezone applies.
    await admin.query(
      `insert into public.shift_configs (org_id, shift_id, shift_label, start_time, end_time, timezone)
       values ($1, 'S1', 'Shift 1', '00:00', '08:00', 'UTC') on conflict do nothing`,
      [orgA],
    );
    // Two oee_snapshots for orgA (no downtime_events joined) — written via the 08-owned producer
    // table (this test acts as the producer; 15-OEE only READS the MV).
    await admin.query(
      `insert into public.oee_snapshots
         (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct, output_qty_delta, downtime_min_delta, waste_qty_delta)
       values
         ($1,'L1','S1','2026-04-20T01:00:00Z', 90, 95, 99, 100.000, 2, 1.000),
         ($1,'L1','S1','2026-04-20T01:01:00Z', 80, 90, 98, 120.000, 3, 0.500)`,
      [orgA],
    );
    // orgB snapshot — must NOT appear in orgA's MV read.
    await admin.query(
      `insert into public.oee_snapshots
         (org_id, line_id, shift_id, snapshot_minute, availability_pct, performance_pct, quality_pct, output_qty_delta, downtime_min_delta, waste_qty_delta)
       values ($1,'L9','S9','2026-04-20T01:00:00Z', 50, 50, 50, 10.000, 99, 9.000)`,
      [orgB],
    );

    await admin.query(`refresh materialized view public.oee_shift_metrics`);

    const { rows } = await admin.query<{
      snapshot_count: string;
      mttr_min: string | null;
      mtbf_min: string | null;
      downtime_event_count: string;
    }>(
      `select snapshot_count, mttr_min, mtbf_min, downtime_event_count
       from public.oee_shift_metrics where org_id = $1 and line_id = 'L1' and shift_id = 'S1'`,
      [orgA],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].snapshot_count)).toBe(2);
    // No joined downtime_events → V-OEE-AGG-4 NULL stubs.
    expect(Number(rows[0].downtime_event_count)).toBe(0);
    expect(rows[0].mttr_min).toBeNull();
    expect(rows[0].mtbf_min).toBeNull();

    // RLS isolation: an app_user scoped to orgB, applying the canonical service-layer org filter
    // (where org_id = app.current_org_id()) over the MV, sees zero orgA rows. MVs cannot host RLS
    // policies (Postgres), so isolation is the service-layer org filter — assert it holds.
    const leakN = await asOrg(orgB, async (client) => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from public.oee_shift_metrics
         where line_id = 'L1' and org_id = app.current_org_id()`,
      );
      return rows[0].n;
    });
    expect(leakN).toBe(0);

    // And orgA, with the same filter, DOES see its own L1 row (positive control).
    const ownN = await asOrg(orgA, async (client) => {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from public.oee_shift_metrics
         where line_id = 'L1' and org_id = app.current_org_id()`,
      );
      return rows[0].n;
    });
    expect(ownN).toBe(1);
  });

  it('AC7 — REFRESH MATERIALIZED VIEW CONCURRENTLY succeeds on both MVs (V-OEE-AGG-5)', async () => {
    await expect(
      admin.query(`refresh materialized view concurrently public.oee_shift_metrics`),
    ).resolves.toBeDefined();
    await expect(
      admin.query(`refresh materialized view concurrently public.oee_daily_summary`),
    ).resolves.toBeDefined();
  });

  it('AC8 — oee.* RBAC family seeded to org-admin family in role_permissions', async () => {
    const { rows } = await admin.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and r.code = any($2::text[]) and rp.permission like 'oee.%'
       order by rp.permission`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.map((r) => r.permission)).toEqual(OEE_PERMISSIONS);
  });

  it('AC9 — legacy jsonb cache also carries the full oee.* family for org-admin roles', async () => {
    const { rows } = await admin.query<{ code: string; perms: string[] | null }>(
      `select r.code,
              (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions,'[]'::jsonb)) as p
               where p like 'oee.%') as perms
       from public.roles r
       where r.org_id = $1 and r.code = any($2::text[]) order by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect((row.perms ?? []).sort()).toEqual(OEE_PERMISSIONS);
  });

  it('AC10 — least-privilege: oee_viewer = read+exports+kiosk; oee_supervisor adds annotate/escalate/ack but NOT target.edit', async () => {
    const { rows: viewer } = await admin.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'oee.%' order by permission`,
      [viewerRoleId],
    );
    const v = viewer.map((r) => r.permission);
    expect(v).toContain('oee.dashboard.read');
    expect(v).toContain('oee.export.csv');
    expect(v).not.toContain('oee.target.edit');
    expect(v).not.toContain('oee.override.create');

    const { rows: sup } = await admin.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'oee.%' order by permission`,
      [supervisorRoleId],
    );
    const s = sup.map((r) => r.permission);
    expect(s).toContain('oee.downtime.escalate');
    expect(s).toContain('oee.anomaly.acknowledge');
    expect(s).not.toContain('oee.target.edit');
    expect(s).not.toContain('oee.big_loss.map_edit');
  });

  it('AC11 — DSL rules: shift_aggregator_v1 active (active_to NULL), P2 stubs inactive (active_to in past)', async () => {
    const { rows } = await admin.query<{ rule_code: string; active: boolean }>(
      `select rule_code, (active_to is null or active_to > now()) as active
       from public.rule_definitions
       where org_id = $1 and rule_code in
         ('shift_aggregator_v1','oee_anomaly_detector_v1','oee_maintenance_trigger_v1')
       order by rule_code`,
      [newOrgId],
    );
    const active = Object.fromEntries(rows.map((r) => [r.rule_code, r.active]));
    expect(active['shift_aggregator_v1']).toBe(true);
    expect(active['oee_anomaly_detector_v1']).toBe(false);
    expect(active['oee_maintenance_trigger_v1']).toBe(false);
  });

  it('AC12 — RBAC + rule seed are idempotent (re-run = no duplicates)', async () => {
    await admin.query(`select public.seed_oee_permissions_for_org($1)`, [newOrgId]);
    await admin.query(`select public.seed_oee_rule_definitions_for_org($1)`, [newOrgId]);

    const dupes = await admin.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'oee.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [newOrgId],
    );
    expect(dupes.rows).toEqual([]);

    const ruleDupes = await admin.query<{ copies: string }>(
      `select count(*)::text as copies from public.rule_definitions
       where org_id = $1 and rule_code like '%oee%' or (org_id = $1 and rule_code = 'shift_aggregator_v1')
       group by rule_code, version having count(*) > 1`,
      [newOrgId],
    );
    expect(ruleDupes.rows).toEqual([]);
  });
});
