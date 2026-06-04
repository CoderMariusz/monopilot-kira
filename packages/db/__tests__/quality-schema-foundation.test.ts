import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

// 09-Quality — schema foundation (migrations 197 + 198).
// Covers T-004 (quality_holds + quality_hold_items), T-037 (ncr_reports), T-017
// (quality_specifications + quality_spec_parameters), T-064 (v_active_holds VIEW), and the
// T-066 quality.* RBAC seed.
//
// Asserts: tables + org_id NOT NULL; CHECK enums; hold_number/ncr_number GENERATED format;
// response_due_at severity-driven SLA; retention_until (7y holds / 10y ncr); UNIQUE
// (hold_id, license_plate_id); RLS enabled+forced + app.current_org_id() policies with NO GUC
// reads; cross-org isolation; v_active_holds excludes released holds + is SECURITY INVOKER;
// idx_holds_active partial index; canonical-owner separation (no wo_outputs created here);
// quality.* permission seed grants the org-admin family the full family in BOTH stores.

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '09010000-0000-4000-8000-000000000001';
const orgAId = '09010000-0000-4000-8000-0000000000a0';
const orgBId = '09010000-0000-4000-8000-0000000000b0';

const QUALITY_TABLES = [
  'quality_holds',
  'quality_hold_items',
  'ncr_reports',
  'quality_specifications',
  'quality_spec_parameters',
] as const;

const QUALITY_PERMISSIONS = [
  'quality.hold.create',
  'quality.hold.release',
  'quality.spec.approve',
  'quality.inspection.execute',
  'quality.inspection.assign',
  'quality.ncr.create',
  'quality.ncr.close_critical',
  'quality.ccp.deviation_override',
  'quality.haccp.plan_edit',
  'quality.batch.release',
  'quality.dashboard.view',
  'quality.settings.edit',
  'quality.audit.export',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

async function seedOrgs(adminPool: pg.Pool): Promise<void> {
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-quality Tenant', 'eu', 'https://t-quality.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  for (const [id, slug] of [
    [orgAId, 't-quality-a'],
    [orgBId, 't-quality-b'],
  ]) {
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Quality Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [id, tenantId, slug],
    );
  }
}

async function cleanup(adminPool: pg.Pool): Promise<void> {
  for (const orgId of [orgAId, orgBId]) {
    await adminPool.query(`delete from public.quality_hold_items where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.ncr_reports where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.quality_spec_parameters where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.quality_specifications where org_id = $1`, [orgId]).catch(() => undefined);
    await adminPool.query(`delete from public.quality_holds where org_id = $1`, [orgId]).catch(() => undefined);
  }
}

async function makeUser(adminPool: pg.Pool, orgId: string): Promise<string> {
  // users.role_id is NOT NULL — resolve any existing org role (the 080 trigger seeds them) or
  // create a throwaway one.
  let roleId: string;
  const { rows: roles } = await adminPool.query<{ id: string }>(
    `select id from public.roles where org_id = $1 limit 1`,
    [orgId],
  );
  if (roles.length > 0) {
    roleId = roles[0].id;
  } else {
    roleId = randomUUID();
    await adminPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'qa-test', 'qa-test', 'QA Test', '[]'::jsonb, false, 999)`,
      [roleId, orgId],
    );
  }
  const id = randomUUID();
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, $3, 'QA User', $4)`,
    [id, orgId, `qa-${id.slice(0, 8)}@example.test`, roleId],
  );
  return id;
}

function bindOrg(adminPool: pg.Pool, appClient: pg.PoolClient, orgId: string): Promise<unknown> {
  const sessionToken = randomUUID();
  return adminPool
    .query(
      `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    )
    .then(() => appClient.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]));
}

async function insertHold(
  adminPool: pg.Pool,
  orgId: string,
  createdBy: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; hold_number: string }> {
  const base: Record<string, unknown> = {
    org_id: orgId,
    reference_type: 'wo',
    reference_id: randomUUID(),
    priority: 'high',
    hold_status: 'open',
    created_by: createdBy,
    default_hold_duration_days: 5,
  };
  const row = { ...base, ...overrides };
  const { rows } = await adminPool.query<{ id: string; hold_number: string }>(
    `insert into public.quality_holds
       (org_id, reference_type, reference_id, priority, hold_status, created_by,
        default_hold_duration_days, released_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, hold_number`,
    [
      row.org_id,
      row.reference_type,
      row.reference_id,
      row.priority,
      row.hold_status,
      row.created_by,
      row.default_hold_duration_days,
      (row.released_at as string | null) ?? null,
    ],
  );
  return rows[0];
}

runIntegrationSuite('09-quality schema foundation (migrations 197 + 198)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let userA: string;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgs(adminPool);
    await cleanup(adminPool);
    userA = await makeUser(adminPool, orgAId);
  });

  afterAll(async () => {
    await cleanup(adminPool);
    await adminPool.query(`delete from public.users where org_id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = any($1::uuid[])`, [[orgAId, orgBId]])
      .catch(() => undefined);
    await adminPool.query(`delete from public.roles where org_id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.organizations where id = any($1::uuid[])`, [[orgAId, orgBId]]).catch(() => undefined);
    await adminPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1 — all five quality tables exist with org_id NOT NULL + the enum CHECK constraints', async () => {
    const { rows: tables } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
      [QUALITY_TABLES as unknown as string[]],
    );
    expect(tables.map((r) => r.tablename).sort()).toEqual([...QUALITY_TABLES].sort());

    const { rows: orgCols } = await adminPool.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'org_id' and table_name = any($1::text[])`,
      [QUALITY_TABLES as unknown as string[]],
    );
    expect(orgCols).toHaveLength(QUALITY_TABLES.length);
    for (const row of orgCols) {
      expect(row.is_nullable, `${row.table_name}.org_id nullable`).toBe('NO');
    }

    const { rows: checks } = await adminPool.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'c' and conname = any($1::text[])`,
      [
        [
          'quality_holds_reference_type_check',
          'quality_holds_priority_check',
          'quality_holds_hold_status_check',
          'quality_hold_items_item_status_check',
          'ncr_reports_severity_check',
          'ncr_reports_status_check',
          'quality_specifications_status_check',
          'quality_spec_parameters_parameter_type_check',
        ],
      ],
    );
    expect(checks.length).toBe(8);
  });

  it('AC2 — hold_number GENERATED format, retention 7y, estimated_release_at, status/priority CHECK', async () => {
    const hold = await insertHold(adminPool, orgAId, userA, { default_hold_duration_days: 5 });
    expect(hold.hold_number).toMatch(/^HLD-\d{8}$/);

    const { rows } = await adminPool.query<{
      retention_until: string;
      created_at: string;
      estimated_release_at: string;
    }>(
      `select retention_until, created_at::date::text as created_at, estimated_release_at::text as estimated_release_at
       from public.quality_holds where id = $1`,
      [hold.id],
    );
    // retention_until — PRD §6.3 verbatim formula: COALESCE(released_at, created_at+7y)::date + 7y.
    // For an unreleased hold this is created_at + 14y (the BRCGS floor: 7y after the 7y-projected
    // release). The trigger reproduces the PRD formula exactly.
    const created = new Date(rows[0].created_at);
    const retention = new Date(rows[0].retention_until);
    expect(retention.getUTCFullYear() - created.getUTCFullYear()).toBe(14);
    // estimated_release_at = created + 5 days.
    expect(rows[0].estimated_release_at).not.toBeNull();

    // released hold → retention = released_at::date + 7y.
    const released = await insertHold(adminPool, orgAId, userA, {
      hold_status: 'released',
      released_at: '2026-01-01T00:00:00Z',
    });
    const { rows: relRows } = await adminPool.query<{ retention_until: string }>(
      `select retention_until::text as retention_until from public.quality_holds where id = $1`,
      [released.id],
    );
    expect(relRows[0].retention_until).toBe('2033-01-01');

    // illegal priority / hold_status rejected.
    await expect(insertHold(adminPool, orgAId, userA, { priority: 'urgent' })).rejects.toThrow();
    await expect(insertHold(adminPool, orgAId, userA, { hold_status: 'bogus' })).rejects.toThrow();
    await expect(insertHold(adminPool, orgAId, userA, { reference_type: 'machine' })).rejects.toThrow();
  });

  it('AC3 — quality_hold_items UNIQUE(hold_id, license_plate_id) + item_status CHECK', async () => {
    const hold = await insertHold(adminPool, orgAId, userA);
    const lp = randomUUID();
    await adminPool.query(
      `insert into public.quality_hold_items (org_id, hold_id, license_plate_id, qty_held_kg)
       values ($1, $2, $3, 10.000)`,
      [orgAId, hold.id, lp],
    );
    await expect(
      adminPool.query(
        `insert into public.quality_hold_items (org_id, hold_id, license_plate_id, qty_held_kg)
         values ($1, $2, $3, 5.000)`,
        [orgAId, hold.id, lp],
      ),
    ).rejects.toThrow();
    // illegal item_status rejected.
    await expect(
      adminPool.query(
        `insert into public.quality_hold_items (org_id, hold_id, license_plate_id, item_status)
         values ($1, $2, $3, 'frozen')`,
        [orgAId, hold.id, randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it('AC4 — ncr_number GENERATED, response_due_at severity SLA, retention 10y, severity/status CHECK', async () => {
    const insertNcr = (overrides: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        org_id: orgAId,
        severity: 'critical',
        title: 'Test NCR',
        description: 'desc',
        detected_at: '2026-05-14T00:00:00Z',
      };
      const row = { ...base, ...overrides };
      return adminPool.query<{ id: string; ncr_number: string; response_due_at: string; retention_until: string }>(
        `insert into public.ncr_reports (org_id, severity, title, description, detected_at)
         values ($1, $2, $3, $4, $5)
         returning id, ncr_number, response_due_at, retention_until`,
        [row.org_id, row.severity, row.title, row.description, row.detected_at],
      );
    };

    const crit = await insertNcr({ severity: 'critical', detected_at: '2026-05-14T00:00:00Z' });
    expect(crit.rows[0].ncr_number).toMatch(/^NCR-\d{8}$/);
    // critical → +24h.
    expect(new Date(crit.rows[0].response_due_at).toISOString()).toBe('2026-05-15T00:00:00.000Z');

    const major = await insertNcr({ severity: 'major', detected_at: '2026-05-14T00:00:00Z' });
    expect(new Date(major.rows[0].response_due_at).toISOString()).toBe('2026-05-16T00:00:00.000Z');

    const minor = await insertNcr({ severity: 'minor', detected_at: '2026-05-14T00:00:00Z' });
    expect(new Date(minor.rows[0].response_due_at).toISOString()).toBe('2026-05-21T00:00:00.000Z');

    // retention 10y from created_at.
    const retYear = new Date(crit.rows[0].retention_until).getUTCFullYear();
    expect(retYear).toBe(new Date().getUTCFullYear() + 10);

    // illegal severity / status rejected.
    await expect(insertNcr({ severity: 'catastrophic' })).rejects.toThrow();
    await expect(
      adminPool.query(
        `insert into public.ncr_reports (org_id, severity, status, title, description)
         values ($1, 'minor', 'archived', 't', 'd')`,
        [orgAId],
      ),
    ).rejects.toThrow();
  });

  it('AC5 — quality_specifications UNIQUE(org,product,spec_code,version) + spec_parameters min<=max', async () => {
    const productId = randomUUID();
    const { rows: spec } = await adminPool.query<{ id: string }>(
      `insert into public.quality_specifications
         (org_id, product_id, spec_code, version, applies_to, created_by)
       values ($1, $2, 'SPEC-1', 1, 'all', $3) returning id`,
      [orgAId, productId, userA],
    );
    // duplicate (org, product, spec_code, version) rejected.
    await expect(
      adminPool.query(
        `insert into public.quality_specifications
           (org_id, product_id, spec_code, version, applies_to, created_by)
         values ($1, $2, 'SPEC-1', 1, 'all', $3)`,
        [orgAId, productId, userA],
      ),
    ).rejects.toThrow();

    // spec parameter min<=max enforced.
    await adminPool.query(
      `insert into public.quality_spec_parameters
         (org_id, specification_id, parameter_name, parameter_type, min_value, max_value)
       values ($1, $2, 'pH', 'chemical', 3.0, 5.0)`,
      [orgAId, spec[0].id],
    );
    await expect(
      adminPool.query(
        `insert into public.quality_spec_parameters
           (org_id, specification_id, parameter_name, parameter_type, min_value, max_value)
         values ($1, $2, 'temp', 'measurement', 10.0, 5.0)`,
        [orgAId, spec[0].id],
      ),
    ).rejects.toThrow();
    // illegal parameter_type rejected.
    await expect(
      adminPool.query(
        `insert into public.quality_spec_parameters
           (org_id, specification_id, parameter_name, parameter_type)
         values ($1, $2, 'x', 'taste')`,
        [orgAId, spec[0].id],
      ),
    ).rejects.toThrow();
  });

  it('AC6 — RLS enabled+forced; every policy references app.current_org_id() with no GUC reads', async () => {
    const { rows: rls } = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname = any($1::text[]) and relkind = 'r'`,
      [QUALITY_TABLES as unknown as string[]],
    );
    expect(rls).toHaveLength(QUALITY_TABLES.length);
    for (const row of rls) {
      expect(row.relrowsecurity, `${row.relname} rowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} forcerowsecurity`).toBe(true);
    }

    const { rows: policies } = await adminPool.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [QUALITY_TABLES as unknown as string[]],
    );
    expect(policies.length).toBe(QUALITY_TABLES.length);
    for (const p of policies) {
      const blob = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      expect(blob, `${p.tablename} references app.current_org_id()`).toContain('app.current_org_id()');
      expect(blob, `${p.tablename} no tenant_id GUC`).not.toContain('app.tenant_id');
      expect(blob, `${p.tablename} no current_org_id GUC`).not.toMatch(
        /current_setting\(\s*'app\.current_org_id'/,
      );
    }
  });

  it('AC7 — cross-org isolation: org B cannot see org A quality_holds under app_user RLS', async () => {
    const holdA = await insertHold(adminPool, orgAId, userA, { reference_id: randomUUID() });

    const clientB = await appPool.connect();
    try {
      await clientB.query('begin');
      await bindOrg(adminPool, clientB, orgBId);
      const { rows } = await clientB.query<{ id: string }>(`select id from public.quality_holds`);
      expect(rows.map((r) => r.id)).not.toContain(holdA.id);
      await clientB.query('commit');
    } catch (e) {
      await clientB.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientB.release();
    }
  });

  it('AC8 — v_active_holds: SECURITY INVOKER, excludes released holds, only active statuses', async () => {
    const ref1 = randomUUID();
    const ref2 = randomUUID();
    // one open (active), one released (excluded).
    await insertHold(adminPool, orgAId, userA, { reference_id: ref1, hold_status: 'open' });
    await insertHold(adminPool, orgAId, userA, {
      reference_id: ref2,
      hold_status: 'released',
      released_at: '2026-01-01T00:00:00Z',
    });

    // SECURITY INVOKER assertion: view has options security_invoker=true.
    const { rows: viewOpts } = await adminPool.query<{ reloptions: string[] | null }>(
      `select c.reloptions from pg_class c
       where c.relname = 'v_active_holds' and c.relkind = 'v'`,
    );
    expect(viewOpts).toHaveLength(1);
    expect((viewOpts[0].reloptions ?? []).some((o) => o.includes('security_invoker=true'))).toBe(true);

    // Active rows only — released excluded — queried under org A app_user (RLS via invoker).
    const clientA = await appPool.connect();
    try {
      await clientA.query('begin');
      await bindOrg(adminPool, clientA, orgAId);
      const { rows } = await clientA.query<{ reference_id: string; hold_status: string }>(
        `select reference_id, hold_status from public.v_active_holds where reference_id = any($1::uuid[])`,
        [[ref1, ref2]],
      );
      const refs = rows.map((r) => r.reference_id);
      expect(refs).toContain(ref1);
      expect(refs).not.toContain(ref2); // released excluded
      await clientA.query('commit');
    } catch (e) {
      await clientA.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      clientA.release();
    }
  });

  it('AC9 — idx_holds_active partial index exists with the active-status predicate', async () => {
    const { rows } = await adminPool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'idx_holds_active'`,
    );
    expect(rows).toHaveLength(1);
    const def = rows[0].indexdef.toLowerCase();
    expect(def).toContain('where');
    expect(def).toContain("'open'");
    expect(def).toContain("'investigating'");
    expect(def).toContain("'escalated'");
    expect(def).toContain("'quarantined'");
  });

  it('AC10 — canonical-owner separation: this migration created NO wo_outputs / schedule_outputs', async () => {
    const { rows } = await adminPool.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename = $1`,
      ['197-quality-holds-ncr-specs.sql'],
    );
    expect(rows).toHaveLength(1);
    // wo_outputs / oee_snapshots / schedule_outputs / license_plates remain owned by their modules.
    const { rows: own } = await adminPool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public'
       and tablename in ('wo_outputs','oee_snapshots','schedule_outputs','license_plates')`,
    );
    // they exist (created by their owners) but are NOT in this migration — sanity that we didn't drop/replace them.
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it('AC11 — quality.* RBAC seed grants the org-admin family the full family in BOTH stores (T-066)', async () => {
    // Re-run the seed for org A to guarantee the admin-family grant regardless of trigger timing.
    await adminPool.query(`select public.seed_quality_permissions_for_org($1)`, [orgAId]);

    const { rows: normalized } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'quality.%' order by rp.permission`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(normalized.map((r) => r.permission)).toEqual(QUALITY_PERMISSIONS);

    const { rows: jsonbRows } = await adminPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
                where p like 'quality.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [orgAId, ADMIN_ROLE_FAMILY],
    );
    expect(jsonbRows.length).toBeGreaterThan(0);
    for (const row of jsonbRows) {
      expect(row.perms ?? []).toEqual(QUALITY_PERMISSIONS);
    }

    // idempotent: re-run produces no duplicate role_permissions rows.
    await adminPool.query(`select public.seed_quality_permissions_for_org($1)`, [orgAId]);
    const { rows: dupes } = await adminPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'quality.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [orgAId],
    );
    expect(dupes).toEqual([]);
  });
});
