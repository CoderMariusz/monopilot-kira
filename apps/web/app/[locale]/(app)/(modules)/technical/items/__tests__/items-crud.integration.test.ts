/**
 * Lane A — 03-technical Items Master: REAL DB-backed integration tests.
 *
 * Drives createItem / listItems / deactivateItem through the real
 * withOrgContext app_user transaction (RLS via app.current_org_id()). Owner SQL
 * is used only for seed, cleanup, and persisted-row assertions. Proves:
 *   - create/list/deactivate succeed for a user holding the technical.items.*
 *     family (granted in role_permissions, the same shape migration 154 seeds
 *     to the org-admin role family);
 *   - org isolation — Org B's user never sees / mutates Org A's items;
 *   - RBAC gate — a viewer without the permission is forbidden.
 *
 * Skips automatically when DATABASE_URL is unset (mirrors create-fa.test.ts).
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { createItem } from '../_actions/create-item';
import { deactivateItem } from '../_actions/deactivate-item';
import { listItems } from '../_actions/list-items';

const run = databaseUrl ? describe : describe.skip;

const TECHNICAL_PERMS = ['technical.items.create', 'technical.items.edit', 'technical.items.deactivate'];

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  adminAUserId: randomUUID(),
  viewerAUserId: randomUUID(),
  adminBUserId: randomUUID(),
  adminRoleAId: randomUUID(),
  viewerRoleAId: randomUUID(),
  adminRoleBId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('technical-items:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedFixtures(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Items IT Tenant', 'eu', 'https://items-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Items IT Org A', 'fmcg'), ($4, $2, $5, 'Items IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `items-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `items-b-${seed.orgBId.slice(0, 8)}`],
  );

  // Use test-unique role codes (the org-insert trigger already seeds the
  // canonical org.access.admin role; we grant the technical.items.* family to a
  // dedicated test role assigned to the user, which is all the RBAC gate checks).
  const permsJson = JSON.stringify(TECHNICAL_PERMS);
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'tech-items-admin-it', false, 'tech-items-admin-it', 'Tech Items Admin IT', $3::jsonb, false, 30),
       ($4, $5, 'tech-items-viewer-it', false, 'tech-items-viewer-it', 'Tech Items Viewer IT', '[]'::jsonb, false, 31),
       ($6, $7, 'tech-items-admin-it', false, 'tech-items-admin-it', 'Tech Items Admin IT B', $3::jsonb, false, 30)
     on conflict (id) do nothing`,
    [seed.adminRoleAId, seed.orgAId, permsJson, seed.viewerRoleAId, seed.orgAId, seed.adminRoleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     select r.id, p.permission
       from (values ($1::uuid), ($2::uuid)) r(id)
       cross join unnest($3::text[]) as p(permission)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleAId, seed.adminRoleBId, TECHNICAL_PERMS],
  );

  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Items Admin A', 'Items Admin A', $4),
       ($5, $2, $6, 'Items Viewer A', 'Items Viewer A', $7),
       ($8, $9, $10, 'Items Admin B', 'Items Admin B', $11)
     on conflict (id) do nothing`,
    [
      seed.adminAUserId,
      seed.orgAId,
      `items-admin-a-${seed.adminAUserId}@example.test`,
      seed.adminRoleAId,
      seed.viewerAUserId,
      `items-viewer-a-${seed.viewerAUserId}@example.test`,
      seed.viewerRoleAId,
      seed.adminBUserId,
      seed.orgBId,
      `items-admin-b-${seed.adminBUserId}@example.test`,
      seed.adminRoleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.adminAUserId,
      seed.adminRoleAId,
      seed.orgAId,
      seed.viewerAUserId,
      seed.viewerRoleAId,
      seed.adminBUserId,
      seed.adminRoleBId,
      seed.orgBId,
    ],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.audit_log where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

run('03-technical items CRUD (RLS + RBAC, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; the action uses the withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS pool for cross-org isolation assertions
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedFixtures();
  });

  afterAll(async () => {
    if (owner) {
      await cleanup().catch(() => undefined);
      await owner.end();
    }
    if (app) await app.end();
  });

  it('create → list → deactivate succeeds for an org-admin holding technical.items.* (org-scoped)', async () => {
    const code = `RM-${randomUUID().slice(0, 8)}`;

    const created = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createItem({ itemCode: code, name: 'Pork shoulder', itemType: 'rm', uomBase: 'kg', costPerKg: 12.5 }),
    );
    expect(created.ok).toBe(true);

    // Owner-side assertion: the row landed in Org A only.
    const persisted = await owner.query(
      `select org_id, item_code, status, cost_per_kg from public.items where org_id = $1 and item_code = $2`,
      [seed.orgAId, code],
    );
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0]?.status).toBe('active');

    // List via the action (RLS-scoped) sees it.
    const listed = await withActionActor(seed.adminAUserId, seed.orgAId, () => listItems());
    expect(listed.state).not.toBe('error');
    expect(listed.canCreate).toBe(true);
    expect(listed.items.some((i) => i.itemCode === code)).toBe(true);

    // Deactivate → status becomes 'blocked'.
    const idRow = await owner.query<{ id: string }>(
      `select id from public.items where org_id = $1 and item_code = $2`,
      [seed.orgAId, code],
    );
    const deactivated = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      deactivateItem({ id: idRow.rows[0]!.id }),
    );
    expect(deactivated.ok).toBe(true);

    const after = await owner.query(`select status from public.items where org_id = $1 and item_code = $2`, [
      seed.orgAId,
      code,
    ]);
    expect(after.rows[0]?.status).toBe('blocked');
  });

  it('forbids create for a user WITHOUT technical.items.create', async () => {
    const code = `RM-${randomUUID().slice(0, 8)}`;
    const result = await withActionActor(seed.viewerAUserId, seed.orgAId, () =>
      createItem({ itemCode: code, name: 'Should not persist', itemType: 'rm', uomBase: 'kg' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');

    const persisted = await owner.query(`select 1 from public.items where org_id = $1 and item_code = $2`, [
      seed.orgAId,
      code,
    ]);
    expect(persisted.rowCount).toBe(0);
  });

  it('enforces org isolation — Org B does not see Org A items, and listItems is org-scoped', async () => {
    const code = `RM-${randomUUID().slice(0, 8)}`;
    await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createItem({ itemCode: code, name: 'Org A only', itemType: 'rm', uomBase: 'kg' }),
    );

    const listedFromB = await withActionActor(seed.adminBUserId, seed.orgBId, () => listItems());
    expect(listedFromB.items.some((i) => i.itemCode === code)).toBe(false);

    // Org B may reuse the same item_code (unique is per-org).
    const dupInB = await withActionActor(seed.adminBUserId, seed.orgBId, () =>
      createItem({ itemCode: code, name: 'Org B same code', itemType: 'rm', uomBase: 'kg' }),
    );
    expect(dupInB.ok).toBe(true);
  });

  it('rejects a duplicate item_code within the same org (items_org_item_code_unique)', async () => {
    const code = `RM-${randomUUID().slice(0, 8)}`;
    const first = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createItem({ itemCode: code, name: 'First', itemType: 'rm', uomBase: 'kg' }),
    );
    expect(first.ok).toBe(true);
    const second = await withActionActor(seed.adminAUserId, seed.orgAId, () =>
      createItem({ itemCode: code, name: 'Duplicate', itemType: 'rm', uomBase: 'kg' }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_exists');
  });
});
