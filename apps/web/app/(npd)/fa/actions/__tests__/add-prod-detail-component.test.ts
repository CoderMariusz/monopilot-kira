/**
 * Lane-B — REAL DB-backed integration tests for the production-component wiring:
 *   - searchItems: org-scoped search over the REAL items master.
 *   - addProdDetailComponent / removeProdDetailComponent: create/remove a
 *     prod_detail row referencing a real item (item_id FK, migration 157).
 *
 * Drives each Server Action through the real withOrgContext app_user/RLS path.
 * Owner SQL is used only for seed, cleanup, and persisted-row assertions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  appUserPassword,
  databaseUrl,
  withActionActor,
} from '../../../brief/actions/__tests__/brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  writerUserId: randomUUID(),
  viewerUserId: randomUUID(),
  writerRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
  otherUserId: randomUUID(),
  otherRoleId: randomUUID(),
};

const productCode = `FA${Math.floor(Math.random() * 1_000_000_000)}`;
let owner: pg.Pool;
let itemAId = '';
let itemBId = '';
let crossOrgItemId = '';

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('laneb:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedAll(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Lane-B IT Tenant', 'eu', 'https://laneb.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Lane-B Org A', 'fmcg'), ($4, $2, $5, 'Lane-B Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `laneb-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `laneb-b-${seed.orgBId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'laneb-writer', false, 'laneb-writer', 'Lane-B Writer', '[]'::jsonb, false, 10),
       ($3, $2, 'laneb-viewer', false, 'laneb-viewer', 'Lane-B Viewer', '[]'::jsonb, false, 11),
       ($4, $5, 'laneb-other',  false, 'laneb-other',  'Lane-B Other',  '[]'::jsonb, false, 12)
     on conflict (id) do nothing`,
    [seed.writerRoleId, seed.orgAId, seed.viewerRoleId, seed.otherRoleId, seed.orgBId],
  );
  // Writer + other org get npd.production.write + npd.fa.read; viewer gets only read.
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.production.write'), ($1, 'npd.fa.read'),
            ($2, 'npd.fa.read'),
            ($3, 'npd.production.write'), ($3, 'npd.fa.read')
     on conflict (role_id, permission) do nothing`,
    [seed.writerRoleId, seed.viewerRoleId, seed.otherRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Lane-B Writer', 'Lane-B Writer', $4),
       ($5, $2, $6, 'Lane-B Viewer', 'Lane-B Viewer', $7),
       ($8, $9, $10, 'Lane-B Other', 'Lane-B Other', $11)
     on conflict (id) do nothing`,
    [
      seed.writerUserId, seed.orgAId, `laneb-w-${seed.writerUserId}@example.test`, seed.writerRoleId,
      seed.viewerUserId, `laneb-v-${seed.viewerUserId}@example.test`, seed.viewerRoleId,
      seed.otherUserId, seed.orgBId, `laneb-o-${seed.otherUserId}@example.test`, seed.otherRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [seed.writerUserId, seed.writerRoleId, seed.orgAId, seed.viewerUserId, seed.viewerRoleId, seed.otherUserId, seed.otherRoleId, seed.orgBId],
  );
  await owner.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'Lane-B Product', 1, $3) on conflict do nothing`,
    [productCode, seed.orgAId, seed.writerUserId],
  );
  // Real items in org A (+ one cross-org item in org B for the isolation check).
  const a = await owner.query<{ id: string }>(
    `insert into public.items (org_id, item_code, item_type, name, uom_base, created_by)
     values ($1, 'PR8801', 'intermediate', 'Prosciutto Crudo', 'kg', $2) returning id`,
    [seed.orgAId, seed.writerUserId],
  );
  itemAId = a.rows[0].id;
  const b = await owner.query<{ id: string }>(
    `insert into public.items (org_id, item_code, item_type, name, uom_base, created_by)
     values ($1, 'RM8802', 'rm', 'Sea Salt', 'kg', $2) returning id`,
    [seed.orgAId, seed.writerUserId],
  );
  itemBId = b.rows[0].id;
  const c = await owner.query<{ id: string }>(
    `insert into public.items (org_id, item_code, item_type, name, uom_base, created_by)
     values ($1, 'PR8899', 'intermediate', 'Cross Org Item', 'kg', $2) returning id`,
    [seed.orgBId, seed.otherUserId],
  );
  crossOrgItemId = c.rows[0].id;
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.prod_detail where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

run('Lane-B production components — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; actions use withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedAll();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await owner.end();
  });

  it('searchItems returns only org-scoped component items, filtered by code/name', async () => {
    const { searchItems } = await import('../search-items');

    const all = await withActionActor(seed.writerUserId, seed.orgAId, () => searchItems({}));
    const codes = all.map((i) => i.itemCode);
    expect(codes).toContain('PR8801');
    expect(codes).toContain('RM8802');
    // Cross-org item is never visible (RLS).
    expect(codes).not.toContain('PR8899');

    const filtered = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      searchItems({ query: 'salt' }),
    );
    expect(filtered.map((i) => i.itemCode)).toEqual(['RM8802']);
  });

  it('addProdDetailComponent creates a prod_detail row referencing the real item + emits outbox', async () => {
    const { addProdDetailComponent } = await import('../add-prod-detail-component');

    const result = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      addProdDetailComponent({ productCode, itemId: itemAId, componentWeight: '70' }),
    );
    expect(result).toMatchObject({ intermediateCode: 'PR8801', componentIndex: 1, itemId: itemAId });

    const row = await owner.query<{ item_id: string; intermediate_code: string; component_weight: string }>(
      `select item_id::text, intermediate_code, component_weight::text
         from public.prod_detail where org_id = $1 and product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]).toMatchObject({ item_id: itemAId, intermediate_code: 'PR8801' });

    const events = await owner.query<{ count: string }>(
      `select count(*) as count from public.outbox_events
        where org_id = $1 and aggregate_id = $2 and event_type = 'fa.recipe_changed'`,
      [seed.orgAId, productCode],
    );
    expect(Number(events.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Idempotent: re-adding the same item returns the existing row (no duplicate).
    await withActionActor(seed.writerUserId, seed.orgAId, () =>
      addProdDetailComponent({ productCode, itemId: itemAId }),
    );
    const after = await owner.query<{ count: string }>(
      `select count(*) as count from public.prod_detail where org_id = $1 and product_code = $2 and item_id = $3`,
      [seed.orgAId, productCode, itemAId],
    );
    expect(after.rows[0].count).toBe('1');
  });

  it('rejects a cross-org item and a non-writer; removes a row when permitted', async () => {
    const { addProdDetailComponent, removeProdDetailComponent } = await import('../add-prod-detail-component');

    // Cross-org item id is not visible → ITEM_NOT_FOUND.
    await expect(
      withActionActor(seed.writerUserId, seed.orgAId, () =>
        addProdDetailComponent({ productCode, itemId: crossOrgItemId }),
      ),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });

    // Viewer lacks npd.production.write → FORBIDDEN.
    await expect(
      withActionActor(seed.viewerUserId, seed.orgAId, () =>
        addProdDetailComponent({ productCode, itemId: itemBId }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Writer adds item B, then removes it.
    const added = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      addProdDetailComponent({ productCode, itemId: itemBId }),
    );
    const removed = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      removeProdDetailComponent({ productCode, prodDetailId: added.id }),
    );
    expect(removed).toEqual({ removed: true });

    const gone = await owner.query<{ count: string }>(
      `select count(*) as count from public.prod_detail where org_id = $1 and id = $2`,
      [seed.orgAId, added.id],
    );
    expect(gone.rows[0].count).toBe('0');
  });
});
