import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

// 03-technical Gate-4 corrective migrations 206 / 207 / 208. Proves:
//   206 — supplier_spec_resolved_lifecycle(text,date) is now STABLE (pg_proc.provolatile = 's').
//   207 — the technical operator/lead role family carries the technical.* subset in BOTH the
//          normalized role_permissions table and the legacy roles.permissions jsonb cache.
//   208 — the BOM state-machine guard REJECTS technical_approved -> in_review (in-place re-open).

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const OPERATOR_SUBSET = [
  'technical.allergens.edit',
  'technical.bom.create',
  'technical.cost.edit',
  'technical.items.create',
  'technical.items.edit',
].sort();

const LEAD_FULL = [
  'technical.allergens.edit',
  'technical.bom.approve',
  'technical.bom.create',
  'technical.bom.generate_batch',
  'technical.bom.version_publish',
  'technical.cost.edit',
  'technical.d365.sync_trigger',
  'technical.items.create',
  'technical.items.deactivate',
  'technical.items.edit',
  'technical.product_spec.approve',
].sort();

runIntegrationSuite('03-technical Gate-4 corrective migrations 206/207/208', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId = randomUUID();
  const operatorRoleId = randomUUID();
  const leadRoleId = randomUUID();
  const userId = randomUUID();
  const fgItemId = randomUUID();
  const rmItemId = randomUUID();
  const bomId = randomUUID();
  const productCode = `FG-CFIX-${orgId.slice(0, 8)}`;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'cfix tenant', 'eu', 'https://cfix.example') on conflict (id) do nothing`,
      [tenantId],
    );
    // New org → AFTER INSERT trigger chain fires (080 role seed + 154 admin seed +
    // 207 operator seed). The operator/lead roles below are added explicitly afterwards.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'CFix Org', $3, 'fmcg') on conflict (id) do nothing`,
      [orgId, tenantId, `cfix-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'technical', 'technical', 'Technical', '[]'::jsonb, true, 300),
              ($3, $2, 'technical_lead', 'technical_lead', 'Technical Lead', '[]'::jsonb, true, 310)
       on conflict do nothing`,
      [operatorRoleId, orgId, leadRoleId],
    );
    // Re-run the 207 seed now that the operator/lead roles exist.
    await ownerPool.query(`select public.seed_technical_operator_permissions_for_org($1)`, [orgId]);

    // Fixtures for the 208 BOM transition test.
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'cfix@example.test', 'CFix User', $3) on conflict (id) do nothing`,
      [userId, orgId, operatorRoleId],
    );
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
       values ($1, $2, 'CFIX-FG', 'fg', 'CFix FG', 'kg'),
              ($3, $2, 'CFIX-RM', 'rm', 'CFix RM', 'kg') on conflict (id) do nothing`,
      [fgItemId, orgId, rmItemId],
    );
    await ownerPool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, 'CFix FG', 1, $3) on conflict (org_id, product_code) do nothing`,
      [productCode, orgId, userId],
    );
    // Build a version up to technical_approved (NOT active) for the re-open test.
    await ownerPool.query(
      `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'draft', 1, $4)`,
      [bomId, orgId, productCode, userId],
    );
    await ownerPool.query(`update public.bom_headers set status = 'in_review' where id = $1`, [bomId]);
    await ownerPool.query(
      `update public.bom_headers set status = 'technical_approved', approved_by = $2, approved_at = now() where id = $1`,
      [bomId, userId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool.query(`delete from public.bom_headers where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.product where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.users where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.items where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool
      .query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id = $1`, [orgId])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  // ---- 206 ----
  runIntegrationTest('206 — supplier_spec_resolved_lifecycle(text,date) is STABLE (provolatile = s)', async () => {
    const { rows } = await ownerPool.query<{ provolatile: string }>(
      `select p.provolatile
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'supplier_spec_resolved_lifecycle'
         and pg_get_function_arguments(p.oid) like '%text%date%'`,
    );
    expect(rows).toHaveLength(1);
    // provolatile: 'i' = immutable, 's' = stable, 'v' = volatile.
    expect(rows[0]?.provolatile).toBe('s');
  });

  // ---- 207 ----
  runIntegrationTest('207 — technical operator role gets the operator subset in role_permissions', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'technical.%' order by permission`,
      [operatorRoleId],
    );
    expect(rows.map((r) => r.permission)).toEqual(OPERATOR_SUBSET);
  });

  runIntegrationTest('207 — technical lead role gets the full technical.* family in role_permissions', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'technical.%' order by permission`,
      [leadRoleId],
    );
    expect(rows.map((r) => r.permission)).toEqual(LEAD_FULL);
  });

  runIntegrationTest('207 — the legacy roles.permissions jsonb cache carries the same subsets', async () => {
    const { rows: op } = await ownerPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
               where p like 'technical.%') as perms
       from public.roles where id = $1`,
      [operatorRoleId],
    );
    expect(op[0]?.perms ?? []).toEqual(OPERATOR_SUBSET);

    const { rows: lead } = await ownerPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p) from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
               where p like 'technical.%') as perms
       from public.roles where id = $1`,
      [leadRoleId],
    );
    expect(lead[0]?.perms ?? []).toEqual(LEAD_FULL);
  });

  runIntegrationTest('207 — operator does NOT get governance/approval strings (SoD)', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 and permission like 'technical.%'`,
      [operatorRoleId],
    );
    const perms = rows.map((r) => r.permission);
    expect(perms).not.toContain('technical.bom.approve');
    expect(perms).not.toContain('technical.product_spec.approve');
    expect(perms).not.toContain('technical.d365.sync_trigger');
    expect(perms).not.toContain('technical.items.deactivate');
  });

  runIntegrationTest('207 — re-running the seed is idempotent (no duplicate rows)', async () => {
    await ownerPool.query(`select public.seed_technical_operator_permissions_for_org($1)`, [orgId]);
    await ownerPool.query(`select public.seed_technical_operator_permissions_for_org($1)`, [orgId]);
    const dupes = await ownerPool.query(
      `select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
       where r.org_id = $1 and rp.permission like 'technical.%'
       group by rp.role_id, rp.permission having count(*) > 1`,
      [orgId],
    );
    expect(dupes.rows).toEqual([]);
  });

  // ---- 208 ----
  runIntegrationTest('208 — state machine REJECTS technical_approved -> in_review (in-place re-open)', async () => {
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'in_review' where id = $1`, [bomId]),
    ).rejects.toThrow(/invalid BOM version status transition/i);
  });

  runIntegrationTest('208 — technical_approved -> active and -> superseded remain allowed', async () => {
    // -> active
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'active' where id = $1`, [bomId]),
    ).resolves.toBeTruthy();
    // active -> superseded (terminalize)
    await expect(
      ownerPool.query(`update public.bom_headers set status = 'superseded' where id = $1`, [bomId]),
    ).resolves.toBeTruthy();
  });
});
