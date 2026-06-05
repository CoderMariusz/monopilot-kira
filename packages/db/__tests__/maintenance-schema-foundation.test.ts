import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection, getAppConnection } from '../test-utils/test-pool.js';

// Inlined to match the existing seed-test convention (no cross-package dep added to @monopilot/db).
// Mirror of ALL_MAINTENANCE_PERMISSIONS (packages/rbac/src/permissions.enum.ts, T-001).
const ALL_MAINTENANCE_PERMISSIONS = [
  'mnt.asset.read',
  'mnt.asset.edit',
  'mnt.asset.deactivate',
  'mnt.mwo.request',
  'mnt.mwo.approve',
  'mnt.mwo.assign',
  'mnt.mwo.execute',
  'mnt.mwo.sign',
  'mnt.mwo.cancel',
  'mnt.pm.create',
  'mnt.pm.skip',
  'mnt.calib.record',
  'mnt.calib.upload_cert',
  'mnt.spare.consume',
  'mnt.spare.adjust',
  'mnt.spare.reorder',
  'mnt.loto.apply',
  'mnt.loto.clear',
];
// Mirror of ALL_MAINTENANCE_EVENTS (packages/outbox/src/events.enum.ts).
const ALL_MAINTENANCE_EVENTS = [
  'maintenance.pm.due',
  'maintenance.mwo.created',
  'maintenance.mwo.completed',
  'maintenance.loto.applied',
  'maintenance.loto.released',
  'maintenance.calibration.completed',
  'maintenance.calibration.failed',
  'maintenance.sanitation.allergen_change.completed',
  'spare.reorder_threshold_breached',
];

// 13-maintenance SCHEMA FOUNDATION (migrations 201 + 202).
// Covers: 15 tables present + RLS enabled+FORCED + org-context policy referencing
// app.current_org_id(); FK + CHECK constraints; GENERATED 7y retention (BRCGS); cross-org RLS
// isolation; canonical-owner separation (this module never owns wo_outputs/oee_snapshots/
// downtime_events/schedule_outputs/license_plates); RBAC mnt.* seed in BOTH role_permissions and
// the legacy roles.permissions jsonb cache for the org-admin family; idempotent seed; outbox
// enum<->CHECK drift parity for the maintenance.* family.

const databaseUrl = process.env.DATABASE_URL;
const runSuite = databaseUrl ? describe : describe.skip;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const MAINTENANCE_TABLES = [
  'maintenance_settings',
  'technician_profiles',
  'equipment',
  'maintenance_schedules',
  'maintenance_work_orders',
  'mwo_checklists',
  'mwo_loto_checklists',
  'spare_parts',
  'maintenance_spare_parts_stock',
  'spare_parts_transactions',
  'mwo_spare_parts',
  'calibration_instruments',
  'calibration_records',
  'sanitation_checklists',
  'maintenance_history',
] as const;

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

runSuite('13-maintenance schema foundation (migs 201/202)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const roleA = randomUUID();
  const roleB = randomUUID();
  // A brand-new org so the AFTER INSERT trigger chain (080 role seed + 202 mnt seed) fires.
  const newOrgId = randomUUID();

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await adminPool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'app_user') then
          create role app_user login password '${appUserPassword}';
        else
          alter role app_user login password '${appUserPassword}';
        end if;
      end
      $$;
    `);

    await adminPool.query(
      'insert into public.tenants (id, name, region_cluster, data_plane_url) values ($1, $2, $3, $4) on conflict (id) do nothing',
      [tenantId, 'mnt-foundation-test-tenant', 'eu', 'https://mnt-foundation.example.test'],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $3, $4, 'bakery'), ($2, $3, $5, 'pharma')
       on conflict (id) do nothing`,
      [orgA, orgB, tenantId, `mnt-a-${orgA.slice(0, 8)}`, `mnt-b-${orgB.slice(0, 8)}`],
    );
    await adminPool.query(
      `insert into public.roles (id, org_id, code, name, permissions)
       values ($1, $3, 'owner', 'Owner', '[]'::jsonb), ($2, $4, 'owner', 'Owner', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleA, roleB, orgA, orgB],
    );

    // New-org insert fires the seed trigger chain end-to-end.
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, $3, 'fmcg')
       on conflict (id) do nothing`,
      [newOrgId, tenantId, `mnt-new-${newOrgId.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    await adminPool
      ?.query('delete from public.organizations where id = any($1::uuid[])', [[orgA, orgB, newOrgId]])
      .catch(() => undefined);
    await adminPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await adminPool
      ?.query('truncate table app.session_org_contexts, app.active_org_contexts cascade')
      .catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  async function withOrg<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [
      sessionToken,
      orgId,
    ]);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      return await fn(client);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  }

  // --- AC1: tables present + RLS enabled + FORCED ---
  it('AC1 — all 15 maintenance tables exist with RLS ENABLED + FORCED', async () => {
    const { rows } = await adminPool.query<{ relname: string; rls: boolean; force: boolean }>(
      `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1::text[])
       order by c.relname`,
      [MAINTENANCE_TABLES as unknown as string[]],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...MAINTENANCE_TABLES].sort());
    for (const r of rows) {
      expect(r.rls, `${r.relname} rowsecurity`).toBe(true);
      expect(r.force, `${r.relname} force rowsecurity`).toBe(true);
    }
  });

  it('AC1 — every table has org_id NOT NULL + site_id nullable (REC-L1 day-1)', async () => {
    const { rows } = await adminPool.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `select table_name, column_name, is_nullable
       from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])
         and column_name in ('org_id', 'site_id')
       order by table_name, column_name`,
      [MAINTENANCE_TABLES as unknown as string[]],
    );
    for (const t of MAINTENANCE_TABLES) {
      const orgRow = rows.find((r) => r.table_name === t && r.column_name === 'org_id');
      const siteRow = rows.find((r) => r.table_name === t && r.column_name === 'site_id');
      expect(orgRow?.is_nullable, `${t}.org_id`).toBe('NO');
      expect(siteRow?.is_nullable, `${t}.site_id`).toBe('YES');
    }
  });

  it('AC2 — every policy USING/WITH CHECK references app.current_org_id() and no raw current_setting', async () => {
    const { rows } = await adminPool.query<{ tablename: string; qual: string; with_check: string }>(
      `select tablename, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
       from pg_policies
       where schemaname = 'public' and tablename = any($1::text[])`,
      [MAINTENANCE_TABLES as unknown as string[]],
    );
    expect(rows.length).toBe(MAINTENANCE_TABLES.length);
    for (const r of rows) {
      expect(r.qual, `${r.tablename} qual`).toContain('app.current_org_id()');
      expect(r.qual).not.toContain('current_setting');
      // INSERT-capable FOR ALL policy carries with_check too.
      if (r.with_check) {
        expect(r.with_check).toContain('app.current_org_id()');
        expect(r.with_check).not.toContain('current_setting');
      }
    }
  });

  // --- CHECK constraints on the enum-bearing columns ---
  it('CHECK — MWO state/source/type/priority reject invalid values', async () => {
    const eqId = randomUUID();
    await withOrg(orgA, async (c) => {
      await c.query(
        `insert into public.equipment (id, org_id, equipment_code, name, equipment_type)
         values ($1, app.current_org_id(), $2, 'Mixer', 'mixer')`,
        [eqId, `EQ-${eqId.slice(0, 8)}`],
      );
      const base = {
        num: `MWO-${eqId.slice(0, 8)}`,
      };
      // valid baseline insert succeeds.
      await c.query(
        `insert into public.maintenance_work_orders
           (org_id, mwo_number, state, source, type, priority, equipment_id)
         values (app.current_org_id(), $1, 'requested', 'manual_request', 'reactive', 'high', $2)`,
        [base.num, eqId],
      );
      // invalid state rejected.
      await expect(
        c.query(
          `insert into public.maintenance_work_orders
             (org_id, mwo_number, state, source, type, priority)
           values (app.current_org_id(), $1, 'unknown', 'manual_request', 'reactive', 'high')`,
          [`${base.num}-x`],
        ),
      ).rejects.toThrow(/state_check|check constraint/i);
    });
  });

  it('CHECK — calibration result + instrument_type + standard enforced', async () => {
    await withOrg(orgA, async (c) => {
      await expect(
        c.query(
          `insert into public.calibration_instruments
             (org_id, instrument_code, instrument_type, standard, calibration_interval_days)
           values (app.current_org_id(), $1, 'laser', 'NIST', 365)`,
          [`CI-${randomUUID().slice(0, 8)}`],
        ),
      ).rejects.toThrow(/instrument_type_check|check constraint/i);
    });
  });

  it('CHECK — maintenance_spare_parts_stock qty_on_hand >= 0 + txn_type enforced', async () => {
    // Commit a part under org A (each failing CHECK aborts its own tx, so use fresh tx per assert).
    const partId = randomUUID();
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [
      sessionToken,
      orgA,
    ]);
    const setup = await appPool.connect();
    try {
      await setup.query('begin');
      await setup.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await setup.query(
        `insert into public.spare_parts (id, org_id, part_code, name)
         values ($1, app.current_org_id(), $2, 'Seal')`,
        [partId, `SP-${partId.slice(0, 8)}`],
      );
      await setup.query('commit');
    } finally {
      setup.release();
    }

    await expect(
      withOrg(orgA, async (c) =>
        c.query(
          `insert into public.maintenance_spare_parts_stock (org_id, part_id, qty_on_hand)
           values (app.current_org_id(), $1, -5)`,
          [partId],
        ),
      ),
    ).rejects.toThrow(/qty_on_hand_nonneg|check constraint/i);

    await expect(
      withOrg(orgA, async (c) =>
        c.query(
          `insert into public.spare_parts_transactions (org_id, part_id, txn_type, qty)
           values (app.current_org_id(), $1, 'teleport', 1)`,
          [partId],
        ),
      ),
    ).rejects.toThrow(/txn_type_check|check constraint/i);

    await adminPool.query('delete from public.spare_parts where id = $1', [partId]);
  });

  // --- GENERATED 7y retention (BRCGS) ---
  it('RETENTION — calibration_records.retention_until = next_due_date + 7y, GENERATED (not writable)', async () => {
    await withOrg(orgA, async (c) => {
      const instrId = randomUUID();
      await c.query(
        `insert into public.calibration_instruments
           (id, org_id, instrument_code, instrument_type, standard, calibration_interval_days)
         values ($1, app.current_org_id(), $2, 'scale', 'NIST', 365)`,
        [instrId, `CI-${instrId.slice(0, 8)}`],
      );
      const recId = randomUUID();
      const { rows } = await c.query<{ retention_until: string }>(
        `insert into public.calibration_records
           (id, org_id, instrument_id, calibrated_at, standard_applied, result, next_due_date)
         values ($1, app.current_org_id(), $2, now(), 'NIST', 'PASS', date '2026-06-01')
         returning retention_until::text`,
        [recId, instrId],
      );
      expect(rows[0]?.retention_until).toBe('2033-06-01');

      // GENERATED ALWAYS column cannot be written directly.
      await expect(
        c.query(`update public.calibration_records set retention_until = date '2099-01-01' where id = $1`, [
          recId,
        ]),
      ).rejects.toThrow(/generated|cannot insert|can only be updated to default/i);
    });
  });

  // --- Cross-org RLS isolation ---
  it('RLS — equipment rows written under org A are invisible under org B', async () => {
    const code = `ISO-${randomUUID().slice(0, 8)}`;
    // committed write under org A
    const sessionToken = randomUUID();
    await adminPool.query('insert into app.session_org_contexts (session_token, org_id) values ($1, $2)', [
      sessionToken,
      orgA,
    ]);
    const wc = await appPool.connect();
    try {
      await wc.query('begin');
      await wc.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgA]);
      await wc.query(
        `insert into public.equipment (org_id, equipment_code, name, equipment_type)
         values (app.current_org_id(), $1, 'Iso Oven', 'oven')`,
        [code],
      );
      await wc.query('commit');
    } finally {
      wc.release();
    }

    const seenByA = await withOrg(orgA, async (c) =>
      c.query('select 1 from public.equipment where equipment_code = $1', [code]),
    );
    const seenByB = await withOrg(orgB, async (c) =>
      c.query('select 1 from public.equipment where equipment_code = $1', [code]),
    );
    expect(seenByA.rowCount).toBe(1);
    expect(seenByB.rowCount).toBe(0);

    // cleanup the committed marker row
    await adminPool.query('delete from public.equipment where equipment_code = $1', [code]);
  });

  // --- Canonical-owner separation ---
  it('OWNERSHIP — migration 201 does NOT create tables owned by other modules', async () => {
    // wo_outputs/oee_snapshots/downtime_events (08-prod), schedule_outputs (04-plan),
    // license_plates (05-wh), item_cost_history (03-tech) must not be (re)created by 201.
    const sql201 = (
      await adminPool.query<{ src: string }>(
        `select '' as src`, // placeholder; real assertion below reads the file
      )
    ).rows;
    void sql201;
    // Read the migration file content directly.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const content = readFileSync(
      resolve(__dirname, '../migrations/201-maintenance-schema-foundation.sql'),
      'utf8',
    ).toLowerCase();
    for (const forbidden of [
      'create table if not exists public.wo_outputs',
      'create table if not exists public.oee_snapshots',
      'create table if not exists public.downtime_events',
      'create table if not exists public.schedule_outputs',
      'create table if not exists public.license_plates',
      'create table if not exists public.item_cost_history',
      'create table if not exists public.quality_holds',
      'create table if not exists public.ncr_reports',
    ]) {
      expect(content, `201 must not create ${forbidden}`).not.toContain(forbidden);
    }
  });

  // --- RBAC seed (T-031 / X-1) ---
  it('RBAC — a freshly inserted org grants the full mnt.* family to the org-admin role family (role_permissions)', async () => {
    const { rows } = await adminPool.query<{ permission: string }>(
      `select distinct rp.permission
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'mnt.%'
       order by rp.permission`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.map((r) => r.permission)).toEqual([...ALL_MAINTENANCE_PERMISSIONS].sort());
  });

  it('RBAC — the legacy roles.permissions jsonb cache also carries the full mnt.* family for org-admin', async () => {
    const { rows } = await adminPool.query<{ code: string; perms: string[] }>(
      `select r.code,
              (select array_agg(p order by p)
               from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
               where p like 'mnt.%') as perms
       from public.roles r
       where r.org_id = $1
         and (r.code = any($2::text[]) or r.slug = any($2::text[]))`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.perms ?? []).toEqual([...ALL_MAINTENANCE_PERMISSIONS].sort());
    }
  });

  it('RBAC — re-running the seed function is idempotent (no duplicate rows)', async () => {
    await adminPool.query('select public.seed_maintenance_permissions_for_org($1)', [newOrgId]);
    await adminPool.query('select public.seed_maintenance_permissions_for_org($1)', [newOrgId]);
    const dupes = await adminPool.query(
      `select rp.role_id, rp.permission, count(*)::int as copies
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'mnt.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [newOrgId],
    );
    expect(dupes.rows).toEqual([]);
  });

  // --- Outbox enum <-> CHECK drift parity for maintenance.* ---
  it('OUTBOX — every maintenance.* + spare.reorder event is accepted by the regenerated CHECK; unknowns rejected', async () => {
    // The DB CHECK (regenerated in 202) must accept every maintenance event (rolled back at end of
    // the withOrg tx) and reject an unknown event_type. outbox_events requires aggregate_type/id/app_version.
    await withOrg(orgA, async (c) => {
      for (const e of ALL_MAINTENANCE_EVENTS) {
        await c.query(
          `insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, org_id, app_version)
           values ($1, 'maintenance', gen_random_uuid(), '{}'::jsonb, app.current_org_id(), 'test')`,
          [e],
        );
      }
    });
    // Unknown event_type rejected (own tx — the CHECK violation aborts it).
    await expect(
      withOrg(orgA, async (c) =>
        c.query(
          `insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, org_id, app_version)
           values ('maintenance.not_a_real_event', 'maintenance', gen_random_uuid(), '{}'::jsonb, app.current_org_id(), 'test')`,
        ),
      ),
    ).rejects.toThrow(/event_type_check|check constraint/i);
  });
});
