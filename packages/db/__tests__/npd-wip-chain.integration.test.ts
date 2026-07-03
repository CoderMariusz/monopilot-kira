import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const runIntegrationSuite = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '43090000-0000-4000-8000-000000000001';
const orgId = '43090000-0000-4000-8000-000000000009';
const userId = '43090000-0000-4000-8000-0000000000aa';

runIntegrationSuite('NPD WIP chain regulatory invariants (migrations 430+)', () => {
  let pool: pg.Pool;
  let hasWipTables = false;

  beforeAll(async () => {
    pool = getOwnerConnection();
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [[
        'wip_definitions',
        'wip_definition_ingredients',
        'wip_definition_processes',
        'wip_definition_roles',
        'wo_dependencies',
        'bom_headers',
        'bom_lines',
      ]],
    );
    hasWipTables = tables.rows.length === 7;
    if (!hasWipTables) return;

    await pool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'W3 L9 Tenant', 'eu', 'https://w3-l9.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await pool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'W3 L9 Org', 'generic')
       on conflict (id) do update set name = excluded.name`,
      [orgId, tenantId],
    );
    const roleId = '43090000-0000-4000-8000-0000000000bb';
    await pool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions, is_system, display_order)
       values ($1, $2, 'w3-l9-test', 'w3-l9-test', 'W3 L9 Test', '[]'::jsonb, false, 999)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await pool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'w3-l9@example.test', 'W3 L9', $3)
       on conflict (id) do update set org_id = excluded.org_id`,
      [userId, orgId, roleId],
    );
  });

  afterAll(async () => {
    if (hasWipTables) {
      await pool.query(`delete from public.wo_dependencies where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.wo_materials where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.schedule_outputs where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.work_orders where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.bom_lines where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.bom_headers where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.wip_definition_ingredients where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.wip_definitions where org_id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.items where org_id = $1 and item_code like 'W3L9-%'`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
      await pool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    }
    await pool?.end().catch(() => undefined);
  });

  it('materializes two BOM levels and preserves the WIP genealogy item invariant', async () => {
    if (!hasWipTables) {
      expect.soft(hasWipTables, 'WIP platform tables from L8 are not present in this checkout').toBe(false);
      return;
    }

    const rm1 = randomUUID();
    const rm2 = randomUUID();
    const pm = randomUUID();
    const wip = randomUUID();
    const fg = randomUUID();
    const wipDef = randomUUID();
    const wipBom = randomUUID();
    const fgBom = randomUUID();
    const wipWo = randomUUID();
    const fgWo = randomUUID();
    const fgMaterial = randomUUID();

    await pool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, origin_module, created_by)
       values
         ($1, $6, 'W3L9-RM1', 'rm', 'W3L9 RM1', 'active', 'kg', 'npd', $7),
         ($2, $6, 'W3L9-RM2', 'rm', 'W3L9 RM2', 'active', 'kg', 'npd', $7),
         ($3, $6, 'W3L9-PM', 'packaging', 'W3L9 PM', 'active', 'each', 'npd', $7),
         ($4, $6, 'W3L9-WIP', 'intermediate', 'W3L9 WIP', 'active', 'kg', 'npd', $7),
         ($5, $6, 'W3L9-FG', 'fg', 'W3L9 FG', 'active', 'kg', 'npd', $7)
       on conflict (org_id, item_code) do nothing`,
      [rm1, rm2, pm, wip, fg, orgId, userId],
    );
    // public.product is a view whose INSTEAD OF trigger needs app org context; the
    // owner pool has none, so seed the base table directly (bom_headers FK target).
    await pool.query(
      `insert into public.product_legacy (product_code, org_id, product_name, created_by_user)
       select v.code, $1, v.name, $2
         from (values ('W3L9-WIP', 'W3L9 WIP'), ('W3L9-FG', 'W3L9 FG')) as v(code, name)
        where not exists (
          select 1 from public.product_legacy p where p.org_id = $1 and p.product_code = v.code
        )`,
      [orgId, userId],
    );
    await pool.query(
      `insert into public.wip_definitions (id, org_id, item_id, name, base_uom, yield_pct, version, status, reusable, created_by)
       values ($1, $2, $3, 'W3L9 WIP def', 'kg', 92.500, 1, 'active', true, $4)`,
      [wipDef, orgId, wip, userId],
    );
    await pool.query(
      `insert into public.wip_definition_ingredients (org_id, wip_definition_id, item_id, qty_per_unit, uom, sequence)
       values ($1, $2, $3, 0.250000, 'kg', 1), ($1, $2, $4, 0.100000, 'kg', 2)`,
      [orgId, wipDef, rm1, rm2],
    );

    // Real lifecycle: headers start draft, lines are added, then the header activates
    // (line content on an active header is immutable by trigger — as in production).
    await pool.query(
      `insert into public.bom_headers (id, org_id, product_id, item_id, origin_module, status, version, yield_pct, line_basis)
       values
         ($1, $3, 'W3L9-WIP', $4, 'npd', 'draft', 1, 92.500, 'per_base'),
         ($2, $3, 'W3L9-FG', $5, 'npd', 'draft', 1, 98.000, 'per_box')`,
      [wipBom, fgBom, orgId, wip, fg],
    );
    await pool.query(
      `insert into public.bom_lines (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom, sequence)
       values
         ($1, $2, 1, $4, 'W3L9-RM1', 'RM', 0.250000, 'kg', 1),
         ($1, $2, 2, $5, 'W3L9-RM2', 'RM', 0.100000, 'kg', 2),
         ($1, $3, 1, $5, 'W3L9-RM2', 'RM', 1.000000, 'kg', 1),
         ($1, $3, 2, $6, 'W3L9-PM', 'PM', 10.000000, 'each', 2),
         ($1, $3, 3, $7, 'W3L9-WIP', 'WIP', 2.000000, 'kg', 3)`,
      [orgId, wipBom, fgBom, rm1, rm2, pm, wip],
    );
    await pool.query(
      `update public.bom_headers
          set status = 'active', approved_by = $2, approved_at = now()
        where org_id = $1 and id = any($3::uuid[])`,
      [orgId, userId, [wipBom, fgBom]],
    );

    const bomRows = await pool.query<{ wip_lines: string; fg_lines: string; fg_wip_qty: string }>(
      `select
         (select count(*)::text from public.bom_lines where org_id = $1 and bom_header_id = $2 and component_type = 'RM') as wip_lines,
         (select count(*)::text from public.bom_lines where org_id = $1 and bom_header_id = $3) as fg_lines,
         (select quantity::text from public.bom_lines where org_id = $1 and bom_header_id = $3 and component_type = 'WIP') as fg_wip_qty`,
      [orgId, wipBom, fgBom],
    );
    expect(bomRows.rows[0]).toEqual({ wip_lines: '2', fg_lines: '3', fg_wip_qty: '2.000000' });

    await pool.query(
      `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, active_bom_header_id, planned_quantity, uom)
       values
         ($1, $3, 'W3L9-WIP-WO', $4, 'intermediate', $6, 20.000, 'kg'),
         ($2, $3, 'W3L9-FG-WO', $5, 'fg', $7, 10.000, 'kg')`,
      [wipWo, fgWo, orgId, wip, fg, wipBom, fgBom],
    );
    await pool.query(
      `insert into public.wo_materials (id, org_id, wo_id, product_id, material_name, required_qty, uom, sequence, material_source)
       values ($1, $2, $3, $4, 'W3L9-WIP', 20.000, 'kg', 3, 'stock')`,
      [fgMaterial, orgId, fgWo, wip],
    );
    await pool.query(
      `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id, material_link, required_qty)
       values ($1, $2, $3, $4, 20.000)
       on conflict (org_id, parent_wo_id, child_wo_id) do nothing`,
      [orgId, fgWo, wipWo, fgMaterial],
    );
    await pool.query(
      `insert into public.wo_dependencies (org_id, parent_wo_id, child_wo_id, material_link, required_qty)
       values ($1, $2, $3, $4, 20.000)
       on conflict (org_id, parent_wo_id, child_wo_id) do nothing`,
      [orgId, fgWo, wipWo, fgMaterial],
    );

    const invariant = await pool.query<{ deps: string; material_item: string; wip_output: string }>(
      `select count(*)::text as deps,
              max(wm.product_id::text) as material_item,
              max(wip.product_id::text) as wip_output
         from public.wo_dependencies dep
         join public.wo_materials wm on wm.id = dep.material_link
         join public.work_orders wip on wip.id = dep.child_wo_id
        where dep.org_id = $1 and dep.parent_wo_id = $2 and dep.child_wo_id = $3`,
      [orgId, fgWo, wipWo],
    );
    expect(invariant.rows[0]).toEqual({ deps: '1', material_item: wip, wip_output: wip });
  });
});
