/**
 * T-017 — REAL DB-backed integration tests for closeDeptSection.
 *
 * Drives the Server Action through the real withOrgContext app_user
 * transaction/RLS path. Owner SQL is used only for seed, cleanup, and
 * persisted-row assertions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withActionActor,
  withAppOrg,
} from '../../../brief/actions/__tests__/brief-integration-helpers';
import { ownerQueryWithOrgContext } from '../../../../../tests/helpers/owner-org-context.js';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  coreUserId: randomUUID(),
  planningUserId: randomUUID(),
  otherUserId: randomUUID(),
  planningRoleId: randomUUID(),
  coreRoleId: '',
  otherRoleId: '',
};

let owner: pg.Pool;
let app: pg.Pool;

function faCode(): string {
  return `FA${Math.floor(Math.random() * 1_000_000_000)}`;
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-017 IT Tenant', 'eu', 'https://t017.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-017 IT Org A', 'fmcg'),
       ($4, $2, $5, 'T-017 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t017-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t017-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values ($1, $2, $3, false, $3, 'Planning User', '[]'::jsonb, false, 120)
     on conflict (id) do nothing`,
    [seed.planningRoleId, seed.orgAId, `planning_user_${seed.planningRoleId.slice(0, 8)}`],
  );
  const roles = await owner.query<{ id: string; org_id: string; code: string }>(
    `select id, org_id, code
       from public.roles
      where (org_id = $1::uuid and code in ('core_user', $3))
         or (org_id = $2::uuid and code = 'core_user')`,
    [seed.orgAId, seed.orgBId, `planning_user_${seed.planningRoleId.slice(0, 8)}`],
  );
  seed.coreRoleId = roles.rows.find((row) => row.org_id === seed.orgAId && row.code === 'core_user')?.id ?? '';
  seed.otherRoleId = roles.rows.find((row) => row.org_id === seed.orgBId && row.code === 'core_user')?.id ?? '';
  if (!seed.coreRoleId || !seed.otherRoleId) throw new Error('missing seeded core_user roles');
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.core.write'), ($2, 'npd.planning.write'), ($3, 'npd.core.write')
     on conflict (role_id, permission) do nothing`,
    [seed.coreRoleId, seed.planningRoleId, seed.otherRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-017 Core', 'T-017 Core', $4),
       ($5, $2, $6, 'T-017 Planning', 'T-017 Planning', $7),
       ($8, $9, $10, 'T-017 Other', 'T-017 Other', $11)
     on conflict (id) do nothing`,
    [
      seed.coreUserId,
      seed.orgAId,
      `t017-core-${seed.coreUserId}@example.test`,
      seed.coreRoleId,
      seed.planningUserId,
      `t017-planning-${seed.planningUserId}@example.test`,
      seed.planningRoleId,
      seed.otherUserId,
      seed.orgBId,
      `t017-other-${seed.otherUserId}@example.test`,
      seed.otherRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.coreUserId,
      seed.coreRoleId,
      seed.orgAId,
      seed.planningUserId,
      seed.planningRoleId,
      seed.otherUserId,
      seed.otherRoleId,
      seed.orgBId,
    ],
  );
}

async function seedProduct(productCode: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await ownerQueryWithOrgContext(
    owner,
    seed.orgAId,
    `insert into public.product
       (org_id, product_code, product_name, pack_size, number_of_cases, recipe_components, created_by_user, app_version)
     values ($1::uuid, $2, $3, $4, $5::numeric, $6, $7::uuid, 't017-test')
     on conflict (org_id, product_code) do update
       set product_name = excluded.product_name,
           pack_size = excluded.pack_size,
           number_of_cases = excluded.number_of_cases,
           recipe_components = excluded.recipe_components,
           closed_core = null`,
    [
      seed.orgAId,
      productCode,
      overrides.product_name ?? 'T-017 Product',
      overrides.pack_size ?? 'Case',
      overrides.number_of_cases ?? '12',
      Object.hasOwn(overrides, 'recipe_components') ? overrides.recipe_components : 'Flour;Water',
      seed.coreUserId,
    ],
  );
}

async function seedDynamicCatalog(): Promise<void> {
  await owner.query(
    `insert into public.npd_departments (org_id, code, name, display_order, active)
     values ($1::uuid, 'Core', 'Core', 10, true)
     on conflict (org_id, code) do update
       set name = excluded.name,
           display_order = excluded.display_order,
           active = true`,
    [seed.orgAId],
  );
  await owner.query(
    `with core_dept as (
       select id
         from public.npd_departments
        where org_id = $1::uuid
          and code = 'Core'
     ),
     recipe_field as (
       insert into public.npd_field_catalog (org_id, code, label, data_type, active)
       values ($1::uuid, 'recipe_components', 'Recipe Components', 'text', true)
       on conflict (org_id, code) do update
         set label = excluded.label,
             data_type = excluded.data_type,
             active = true
       returning id
     ),
     reset_core_required as (
       update public.npd_department_field df
          set required = false
         from core_dept d
        where df.org_id = $1::uuid
          and df.department_id = d.id
     )
     insert into public.npd_department_field
       (org_id, department_id, field_id, required, visible, display_order)
     select $1::uuid, core_dept.id, recipe_field.id, true, true, 10
       from core_dept, recipe_field
     on conflict (org_id, department_id, field_id) do update
       set required = true,
           visible = true,
           display_order = excluded.display_order`,
    [seed.orgAId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(
    `delete from public.role_permissions
      where role_id in (select id from public.roles where org_id in ($1, $2))`,
    [seed.orgAId, seed.orgBId],
  );
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('closeDeptSection — REAL DB integration (T-017)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; action uses withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS checks for non-vacuous cross-org isolation proof
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities();
    await seedDynamicCatalog();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('closes Core when all required fields are filled and emits one fa.dept_closed event', async () => {
    const { closeDeptSection } = await import('../close-dept-section');
    const productCode = faCode();
    await seedProduct(productCode);

    const result = await withActionActor(seed.coreUserId, seed.orgAId, () =>
      closeDeptSection(productCode, 'Core'),
    );

    expect(result.dept).toBe('Core');
    expect(new Date(result.closedAt).toString()).not.toBe('Invalid Date');

    const rows = await owner.query<{
      closed_core: string | null;
      event_count: string;
      payload: { dept?: string };
    }>(
      `select p.closed_core,
              count(oe.id)::text as event_count,
              max(oe.payload::text)::jsonb as payload
         from public.product p
         left join public.outbox_events oe
           on oe.org_id = p.org_id
          and oe.event_type = 'fa.dept_closed'
          and oe.aggregate_id = p.product_code
        where p.org_id = $1::uuid
          and p.product_code = $2
        group by p.closed_core`,
      [seed.orgAId, productCode],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].closed_core).toBe('Yes');
    expect(rows.rows[0].event_count).toBe('1');
    expect(rows.rows[0].payload.dept).toBe('Core');

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hidden = await client.query(`select product_code from public.product where product_code = $1`, [productCode]);
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1::uuid, 'fa.dept_closed', 'fa', $2, '{"dept":"Core"}'::jsonb, 't017-cross-org')`,
          [seed.orgAId, productCode],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });

  it('throws DepartmentNotReadyError listing recipe_components when a required Core field is missing', async () => {
    const { closeDeptSection } = await import('../close-dept-section');
    const { DepartmentNotReadyError } = await import('../errors');
    const productCode = faCode();
    await seedProduct(productCode, { recipe_components: null });

    await expect(
      withActionActor(seed.coreUserId, seed.orgAId, () => closeDeptSection(productCode, 'Core')),
    ).rejects.toMatchObject({
      name: 'DepartmentNotReadyError',
      code: 'DEPARTMENT_NOT_READY',
      missingColumns: ['recipe_components'],
    });
    await expect(
      withActionActor(seed.coreUserId, seed.orgAId, () => closeDeptSection(productCode, 'Core')),
    ).rejects.toBeInstanceOf(DepartmentNotReadyError);

    const proof = await owner.query<{ closed_core: string | null; event_count: string }>(
      `select closed_core,
              (select count(*)::text
                 from public.outbox_events
                where org_id = $1::uuid
                  and event_type = 'fa.dept_closed'
                  and aggregate_id = $2) as event_count
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(proof.rows[0]).toEqual({ closed_core: null, event_count: '0' });
  });

  it('throws AuthError when planning_user attempts to close Core', async () => {
    const { closeDeptSection } = await import('../close-dept-section');
    const { AuthError } = await import('../errors');
    const productCode = faCode();
    await seedProduct(productCode);

    await expect(
      withActionActor(seed.planningUserId, seed.orgAId, () => closeDeptSection(productCode, 'Core')),
    ).rejects.toMatchObject({ name: 'AuthError', code: 'FORBIDDEN' });
    await expect(
      withActionActor(seed.planningUserId, seed.orgAId, () => closeDeptSection(productCode, 'Core')),
    ).rejects.toBeInstanceOf(AuthError);

    const proof = await owner.query<{ closed_core: string | null; event_count: string }>(
      `select closed_core,
              (select count(*)::text
                 from public.outbox_events
                where org_id = $1::uuid
                  and event_type = 'fa.dept_closed'
                  and aggregate_id = $2) as event_count
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(proof.rows[0]).toEqual({ closed_core: null, event_count: '0' });
  });
});
