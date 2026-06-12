/**
 * T-009 — REAL DB-backed integration test for updateFaCell.
 *
 * Drives the Server Action through real withOrgContext (app_user transaction +
 * RLS via app.current_org_id()). Owner SQL is used only for fixture setup and
 * assertions.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection } from '@monopilot/db/clients.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerQueryWithInferredOrgContext, ownerQueryWithOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const adminUserId = randomUUID();
const planningUserId = randomUUID();
const adminRoleId = randomUUID();
const planningRoleId = randomUUID();
const productCode = `FA${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, data_plane_url)
     values ($1, 'T-009 Tenant', 'https://t009.example.test')`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-009 Org', 'fmcg')`,
    [orgId, tenantId],
  );
  await owner.query(
    `insert into public.roles (id, org_id, code, slug, name, permissions, is_system)
     values
       ($1, $3, 'npd_admin', 'npd_admin', 'NPD Admin', '[]'::jsonb, false),
       ($2, $3, 'planning_manager', 'planning_manager', 'Planning Manager', '[]'::jsonb, false)
     on conflict (org_id, code) do update
       set permissions = excluded.permissions`,
    [adminRoleId, planningRoleId, orgId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values
       ($1, 'npd.core.write'),
       ($1, 'npd.production.write'),
       ($1, 'npd.mrp.write'),
       ($1, 'npd.risk.write'),
       ($2, 'npd.planning.write')
     on conflict (role_id, permission) do nothing`,
    [adminRoleId, planningRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values
       ($1, $3, 't009-admin@example.test', 'T-009 Admin', $4),
       ($2, $3, 't009-planning@example.test', 'T-009 Planning', $5)`,
    [adminUserId, planningUserId, orgId, adminRoleId, planningRoleId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $4), ($3, $5, $4)
     on conflict (user_id, role_id) do nothing`,
    [adminUserId, adminRoleId, planningUserId, orgId, planningRoleId],
  );
  await owner.query(
    `delete from "Reference"."DeptColumns" where org_id = $1`,
    [orgId],
  );
  await owner.query(
    `insert into "Reference"."DeptColumns"
       (org_id, dept_code, column_key, data_type, field_type, required_for_done, schema_version)
     values
       ($1, 'Core', 'product_name', 'text', 'string', false, 1),
       ($1, 'Core', 'pack_size', 'text', 'string', false, 1),
       ($1, 'MRP', 'box', 'text', 'string', false, 1),
       ($1, 'Production', 'line', 'text', 'string', false, 1)
     on conflict (org_id, dept_code, column_key) do update
       set data_type = excluded.data_type,
           field_type = excluded.field_type,
           dropdown_source = null`,
    [orgId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product
       (product_code, org_id, product_name, pack_size, box, line, built, schema_version, created_by_user)
     values ($1, $2, 'Original FG', '100g', 'BOX-1', 'LINE-1', true, 1, $3)`,
    [productCode, orgId, adminUserId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [orgId]);
  await owner.query(`delete from "Reference"."DeptColumns" where org_id = $1`, [orgId]);
  await ownerQueryWithInferredOrgContext(owner,`delete from public.prod_detail where org_id = $1`, [orgId]);
  await owner.query(`delete from public.product where org_id = $1`, [orgId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [orgId]);
  await owner.query(`delete from public.users where org_id = $1`, [orgId]);
  await owner.query(`delete from public.role_permissions where role_id in ($1, $2)`, [adminRoleId, planningRoleId]);
  await owner.query(`delete from public.roles where org_id = $1`, [orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
}

async function useActor(userId: string): Promise<void> {
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
}

run('updateFaCell Server Action — REAL DB integration', () => {
  beforeAll(async () => {
    owner = getOwnerConnection();
    await seed();
  }, 120000);

  afterAll(async () => {
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await cleanup();
    await owner.end();
  });

  it('updates a cell, auto-resets built=false, and emits fa.edit + fa.built_reset', async () => {
    await useActor(adminUserId);
    const { updateFaCell } = await import('../update-fa-cell');

    const result = await updateFaCell(productCode, 'product_name', 'Updated FG');

    expect(result).toEqual({
      previousValue: 'Original FG',
      newValue: 'Updated FG',
      builtReset: true,
    });

    const row = await owner.query<{ product_name: string; built: boolean }>(
      `select product_name, built from public.product where product_code = $1`,
      [productCode],
    );
    expect(row.rows[0]).toEqual({ product_name: 'Updated FG', built: false });

    const events = await owner.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload
         from public.outbox_events
        where org_id = $1 and aggregate_id = $2 and event_type in ('fa.edit', 'fa.built_reset')
        order by id`,
      [orgId, productCode],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual(['fa.built_reset', 'fa.edit']);
    expect(events.rows.find((row) => row.event_type === 'fa.edit')?.payload).toMatchObject({
      diff: { product_name: { prev: 'Original FG', next: 'Updated FG' } },
    });
  });

  it('rejects a planning user editing an MRP-owned column', async () => {
    await useActor(planningUserId);
    const { updateFaCell } = await import('../update-fa-cell');
    const { AuthError } = await import('../errors');

    await expect(updateFaCell(productCode, 'box', 'BOX-2')).rejects.toBeInstanceOf(AuthError);

    const row = await owner.query<{ box: string }>(
      `select box from public.product where product_code = $1`,
      [productCode],
    );
    expect(row.rows[0]?.box).toBe('BOX-1');
  });

  it('emits fa.edit diff for pack_size without built_reset when already unbuilt', async () => {
    await useActor(adminUserId);
    const { updateFaCell } = await import('../update-fa-cell');

    const result = await updateFaCell(productCode, 'pack_size', '120g');

    expect(result).toEqual({
      previousValue: '100g',
      newValue: '120g',
      builtReset: false,
    });

    const event = await owner.query<{ payload: Record<string, unknown> }>(
      `select payload
         from public.outbox_events
        where org_id = $1 and aggregate_id = $2 and event_type = 'fa.edit'
        order by id desc
        limit 1`,
      [orgId, productCode],
    );
    expect(event.rows[0]?.payload).toMatchObject({
      diff: { pack_size: { prev: '100g', next: '120g' } },
    });
  });

  it('auto-resets built when a prod_detail row is edited', async () => {
    await owner.query(`update public.product set built = true where product_code = $1`, [productCode]);
    await ownerQueryWithInferredOrgContext(owner,
      `insert into public.prod_detail
        (org_id, product_code, intermediate_code, component_index, line)
       values ($1, $2, 'PR-T009', 1, 'LINE-1')`,
      [orgId, productCode],
    );

    await ownerQueryWithInferredOrgContext(owner,
      `update public.prod_detail
          set line = 'LINE-2'
        where org_id = $1 and product_code = $2 and component_index = 1`,
      [orgId, productCode],
    );

    const row = await owner.query<{ built: boolean }>(
      `select built from public.product where product_code = $1`,
      [productCode],
    );
    expect(row.rows[0]?.built).toBe(false);

    const event = await owner.query<{ payload: Record<string, unknown> }>(
      `select payload
         from public.outbox_events
        where org_id = $1 and aggregate_id = $2 and event_type = 'fa.built_reset'
        order by id desc
        limit 1`,
      [orgId, productCode],
    );
    expect(event.rows[0]?.payload).toMatchObject({
      product_code: productCode,
      source: 'prod_detail',
    });
  });

  it('still blocks direct built=true to false downgrades outside the audited reset path', async () => {
    await owner.query(`update public.product set built = true where product_code = $1`, [productCode]);

    await expect(
      owner.query(`update public.product set built = false where product_code = $1`, [productCode]),
    ).rejects.toThrow(/V18_BUILT_DOWNGRADE_REQUIRES_AUDIT/);

    await ownerQueryWithOrgContext(owner, orgId,
      `select public.fa_reset_product_built_for_edit($1::uuid, $2, $3::uuid, 'test', '{}'::jsonb)`,
      [orgId, productCode, adminUserId],
    );
  });

  it('still blocks built=false to true while an open High V18 risk exists', async () => {
    await ownerQueryWithOrgContext(owner, orgId,
      `select public.fa_reset_product_built_for_edit($1::uuid, $2, $3::uuid, 'test', '{}'::jsonb)`,
      [orgId, productCode, adminUserId],
    );
    await owner.query(
      `insert into public.risks
        (org_id, product_code, title, description, likelihood, impact, state, created_by_user)
       values ($1, $2, 'High launch risk', 'Open high launch risk blocks V18 built', 3, 2, 'Open', $3)`,
      [orgId, productCode, adminUserId],
    );

    await expect(
      owner.query(`update public.product set built = true where product_code = $1`, [productCode]),
    ).rejects.toThrow(/V18_HIGH_RISK_OPEN/);
  });
});
