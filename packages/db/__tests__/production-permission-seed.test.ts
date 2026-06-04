import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// 08-Production — migration 185 production.* RBAC seed (recurring-live-bug class 1 P0).
// Verifies the full production.* family is granted to the org-admin role family in BOTH
// role_permissions + legacy jsonb, that operator/supervisor get their subset, and that the
// seed is idempotent. Mirrors 154-technical-permission-seed.test.ts.

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const PRODUCTION_PERMISSIONS = [
  'production.allergen_gate.sign_first',
  'production.allergen_gate.sign_second',
  'production.changeover.write',
  'production.consumption.override_approve',
  'production.consumption.write',
  'production.d365_dlq.replay',
  'production.downtime.taxonomy_edit',
  'production.downtime.write',
  'production.oee.read',
  'production.output.catch_weight_override',
  'production.output.write',
  'production.waste.overthreshold_approve',
  'production.waste.write',
  'production.wo.complete',
  'production.wo.pause',
  'production.wo.resume',
  'production.wo.start',
].sort();

const ADMIN_ROLE_FAMILY = ['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin'];

runIntegrationSuite('185 production permission seed', () => {
  let ownerPool: pg.Pool;
  const tenantId = randomUUID();
  const newOrgId = randomUUID();
  const operatorRoleId = randomUUID();
  const supervisorRoleId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'prod seed tenant', 'eu', 'https://prod-seed.example') on conflict (id) do nothing`,
      [tenantId],
    );
    // New org → AFTER INSERT trigger chain (080 role seed + 185 production seed) fires for the admin family.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Production Seed Org', $3, 'fmcg') on conflict (id) do nothing`,
      [newOrgId, tenantId, `prodseed-${newOrgId.slice(0, 8)}`],
    );
    // Add explicit operator + supervisor roles, then re-run the seed so they get their subset.
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'operator', 'operator', 'Operator', '[]'::jsonb, true, 200),
              ($3, $2, 'supervisor', 'supervisor', 'Supervisor', '[]'::jsonb, true, 210)
       on conflict do nothing`,
      [operatorRoleId, newOrgId, supervisorRoleId],
    );
    await ownerPool.query(`select public.seed_production_permissions_for_org($1)`, [newOrgId]);
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = $1`, [newOrgId])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [newOrgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  runIntegrationTest('AC1 — org-admin family gets the full production.* family in role_permissions', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select distinct rp.permission from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[]))
         and rp.permission like 'production.%' order by rp.permission`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.map((r) => r.permission)).toEqual(PRODUCTION_PERMISSIONS);
  });

  runIntegrationTest('AC2 — the legacy jsonb cache also carries the full production.* family for org-admin roles', async () => {
    const { rows } = await ownerPool.query<{ code: string; perms: string[] }>(
      `select r.code,
              (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
               where p like 'production.%') as perms
       from public.roles r
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[])) order by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.perms ?? []).toEqual(PRODUCTION_PERMISSIONS);
    }
  });

  runIntegrationTest('AC3 — operator gets the operator subset; supervisor gets the full set; SoD preserved', async () => {
    const { rows: op } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'production.%' order by permission`,
      [operatorRoleId],
    );
    const opPerms = op.map((r) => r.permission);
    // operator can write/run but NOT approve/override/second-sign/taxonomy/dlq-replay (SoD).
    expect(opPerms).toContain('production.wo.start');
    expect(opPerms).toContain('production.allergen_gate.sign_first');
    expect(opPerms).not.toContain('production.allergen_gate.sign_second');
    expect(opPerms).not.toContain('production.consumption.override_approve');
    expect(opPerms).not.toContain('production.d365_dlq.replay');

    const { rows: sup } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'production.%' order by permission`,
      [supervisorRoleId],
    );
    expect(sup.map((r) => r.permission)).toEqual(PRODUCTION_PERMISSIONS);
  });

  runIntegrationTest('AC4 — re-running the seed is idempotent (no duplicate rows, stable jsonb)', async () => {
    await ownerPool.query(`select public.seed_production_permissions_for_org($1)`, [newOrgId]);
    await ownerPool.query(`select public.seed_production_permissions_for_org($1)`, [newOrgId]);

    const dupes = await ownerPool.query<{ copies: string }>(
      `select count(*)::text as copies from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'production.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [newOrgId],
    );
    expect(dupes.rows).toEqual([]);

    const jsonbDupes = await ownerPool.query<{ total: string; distinct_count: string }>(
      `select count(*)::text as total, count(distinct p)::text as distinct_count
       from public.roles r
       cross join lateral jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as p
       where r.org_id = $1 and (r.code = any($2::text[]) or r.slug = any($2::text[])) and p like 'production.%'
       group by r.code`,
      [newOrgId, ADMIN_ROLE_FAMILY],
    );
    for (const row of jsonbDupes.rows) {
      expect(row.total).toEqual(row.distinct_count);
    }
  });
});
