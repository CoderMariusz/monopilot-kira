/**
 * REAL DB-backed integration tests for the FA Core multi-benchmark Server Actions
 * (migration 241 public.fa_benchmarks):
 *   - listBenchmarks   (read, npd.fa.read)
 *   - upsertBenchmark  (insert + update, npd.core.write)
 *   - deleteBenchmark  (npd.core.write)
 *
 * Drives each action through the real withOrgContext app_user/RLS path. Owner SQL
 * is used only for seed, cleanup and persisted-row assertions. Skips when
 * DATABASE_URL is unset (repo convention — same as the other fa/* action tests).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../../../tests/helpers/owner-org-context.js';

import {
  appUserPassword,
  databaseUrl,
  withActionActor,
} from '../../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  writerUserId: randomUUID(),
  viewerUserId: randomUUID(),
  otherUserId: randomUUID(),
  writerRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
  otherRoleId: randomUUID(),
};

const productCode = `FA${Math.floor(Math.random() * 1_000_000_000)}`;
const crossOrgProductCode = `FB${Math.floor(Math.random() * 1_000_000_000)}`;
let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedAll(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Benchmarks IT Tenant', 'eu', 'https://benchmarks.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'Benchmarks Org A', 'fmcg'), ($4, $2, $5, 'Benchmarks Org B', 'fmcg')
     on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `bm-a-${seed.orgAId.slice(0, 8)}`, seed.orgBId, `bm-b-${seed.orgBId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'bm-writer', false, 'bm-writer', 'BM Writer', '[]'::jsonb, false, 10),
       ($3, $2, 'bm-viewer', false, 'bm-viewer', 'BM Viewer', '[]'::jsonb, false, 11),
       ($4, $5, 'bm-other',  false, 'bm-other',  'BM Other',  '[]'::jsonb, false, 12)
     on conflict (id) do nothing`,
    [seed.writerRoleId, seed.orgAId, seed.viewerRoleId, seed.otherRoleId, seed.orgBId],
  );
  // Writer = npd.core.write + npd.fa.read; viewer = read only; other (org B) = full.
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.core.write'), ($1, 'npd.fa.read'),
            ($2, 'npd.fa.read'),
            ($3, 'npd.core.write'), ($3, 'npd.fa.read')
     on conflict (role_id, permission) do nothing`,
    [seed.writerRoleId, seed.viewerRoleId, seed.otherRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'BM Writer', 'BM Writer', $4),
       ($5, $2, $6, 'BM Viewer', 'BM Viewer', $7),
       ($8, $9, $10, 'BM Other', 'BM Other', $11)
     on conflict (id) do nothing`,
    [
      seed.writerUserId, seed.orgAId, `bm-w-${seed.writerUserId}@example.test`, seed.writerRoleId,
      seed.viewerUserId, `bm-v-${seed.viewerUserId}@example.test`, seed.viewerRoleId,
      seed.otherUserId, seed.orgBId, `bm-o-${seed.otherUserId}@example.test`, seed.otherRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [seed.writerUserId, seed.writerRoleId, seed.orgAId, seed.viewerUserId, seed.viewerRoleId, seed.otherUserId, seed.otherRoleId, seed.orgBId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'Benchmarks Product', 1, $3) on conflict do nothing`,
    [productCode, seed.orgAId, seed.writerUserId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'Benchmarks Org B Product', 1, $3) on conflict do nothing`,
    [crossOrgProductCode, seed.orgBId, seed.otherUserId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.fa_benchmarks where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

run('FA benchmarks — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; actions use withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedAll();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await owner.end();
  });

  it('upsert inserts a row, list returns it, and a NUMERIC non-negative price is stored exactly', async () => {
    const { upsertBenchmark, listBenchmarks } = await import('../benchmarks');

    const created = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      upsertBenchmark({ productCode, label: 'Tesco Finest', price: '2.49' }),
    );
    expect(created).toMatchObject({ productCode, label: 'Tesco Finest', price: '2.49', displayOrder: 0 });

    const persisted = await owner.query<{ price: string; display_order: number }>(
      `select price::text as price, display_order from public.fa_benchmarks where org_id = $1 and id = $2`,
      [seed.orgAId, created.id],
    );
    expect(persisted.rows[0]).toMatchObject({ price: '2.49', display_order: 0 });

    // A blank price → null; display_order auto-increments.
    const second = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      upsertBenchmark({ productCode, label: 'Aldi', price: '' }),
    );
    expect(second).toMatchObject({ label: 'Aldi', price: null, displayOrder: 1 });

    const list = await withActionActor(seed.writerUserId, seed.orgAId, () => listBenchmarks({ productCode }));
    expect(list.map((b) => b.label)).toEqual(['Tesco Finest', 'Aldi']);

    // An outbox audit event was written (fa.edit on the FA aggregate).
    const events = await owner.query<{ count: string }>(
      `select count(*) as count from public.outbox_events
        where org_id = $1 and aggregate_id = $2 and event_type = 'fa.edit'`,
      [seed.orgAId, productCode],
    );
    expect(Number(events.rows[0].count)).toBeGreaterThanOrEqual(2);
  });

  it('upsert updates an existing row in place', async () => {
    const { upsertBenchmark, listBenchmarks } = await import('../benchmarks');
    const created = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      upsertBenchmark({ productCode, label: 'To rename', price: '1.00' }),
    );
    const updated = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      upsertBenchmark({ productCode, id: created.id, label: 'Renamed', price: '1.50' }),
    );
    expect(updated).toMatchObject({ id: created.id, label: 'Renamed', price: '1.50' });

    const list = await withActionActor(seed.writerUserId, seed.orgAId, () => listBenchmarks({ productCode }));
    const found = list.find((b) => b.id === created.id);
    expect(found).toMatchObject({ label: 'Renamed', price: '1.50' });
  });

  it('rejects a negative price (zod guard before the DB CHECK)', async () => {
    const { upsertBenchmark } = await import('../benchmarks');
    await expect(
      withActionActor(seed.writerUserId, seed.orgAId, () =>
        upsertBenchmark({ productCode, label: 'Negative', price: '-1' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('enforces RBAC: viewer cannot write; deletes when permitted', async () => {
    const { upsertBenchmark, deleteBenchmark } = await import('../benchmarks');

    await expect(
      withActionActor(seed.viewerUserId, seed.orgAId, () =>
        upsertBenchmark({ productCode, label: 'Viewer blocked', price: '1.00' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const created = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      upsertBenchmark({ productCode, label: 'To delete', price: '5.00' }),
    );
    const removed = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      deleteBenchmark({ productCode, id: created.id }),
    );
    expect(removed).toEqual({ removed: true });

    const gone = await owner.query<{ count: string }>(
      `select count(*) as count from public.fa_benchmarks where org_id = $1 and id = $2`,
      [seed.orgAId, created.id],
    );
    expect(gone.rows[0].count).toBe('0');
  });

  it('is org-isolated: cannot upsert against a product owned by another org', async () => {
    const { upsertBenchmark, listBenchmarks } = await import('../benchmarks');

    // Writer (org A) cannot see org B's product → PRODUCT_NOT_FOUND.
    await expect(
      withActionActor(seed.writerUserId, seed.orgAId, () =>
        upsertBenchmark({ productCode: crossOrgProductCode, label: 'Cross', price: '1.00' }),
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

    // Org B's writer never sees org A's benchmark rows.
    const otherList = await withActionActor(seed.otherUserId, seed.orgBId, () =>
      listBenchmarks({ productCode: crossOrgProductCode }),
    );
    expect(otherList).toEqual([]);
  });
});
