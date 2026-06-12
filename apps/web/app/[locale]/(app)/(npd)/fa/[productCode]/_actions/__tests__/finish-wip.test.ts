/**
 * Finish-WIP Server Actions — zod + RBAC + add/remove.
 *
 * Two layers:
 *   1. zod-validation layer (ALWAYS runs, no DB): invalid input is rejected
 *      BEFORE withOrgContext, so it executes without a database connection.
 *   2. REAL DB integration layer (DATABASE_URL-gated, skips without it):
 *      RBAC (npd.core.write enforced server-side), add/remove against the real
 *      prod_detail table through the withOrgContext app_user/RLS path.
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
import {
  FINISH_WIP_READ_PERMISSION,
  FINISH_WIP_WRITE_PERMISSION,
} from '../finish-wip-types';

// ---------------------------------------------------------------------------
// Layer 1 — zod validation (no DB; always runs).
// ---------------------------------------------------------------------------

describe('finish-wip actions — zod validation (no DB)', () => {
  it('uses the exact seeded permission strings', () => {
    expect(FINISH_WIP_READ_PERMISSION).toBe('npd.fa.read');
    expect(FINISH_WIP_WRITE_PERMISSION).toBe('npd.core.write');
  });

  it('rejects an empty productCode on add', async () => {
    const { addProdDetailRow } = await import('../finish-wip');
    await expect(
      addProdDetailRow({ productCode: '', intermediateCode: 'PR1' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a blank component code on add', async () => {
    const { addProdDetailRow } = await import('../finish-wip');
    await expect(
      addProdDetailRow({ productCode: 'FA1', intermediateCode: '   ' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a non-uuid prodDetailId on remove', async () => {
    const { removeProdDetailRow } = await import('../finish-wip');
    await expect(
      removeProdDetailRow({ productCode: 'FA1', prodDetailId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a non-uuid prodDetailId on update', async () => {
    const { updateProdDetailRow } = await import('../finish-wip');
    await expect(
      updateProdDetailRow({ productCode: 'FA1', prodDetailId: 'nope', intermediateCode: 'PR1' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — REAL DB integration (DATABASE_URL-gated).
// ---------------------------------------------------------------------------

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  writerUserId: randomUUID(),
  viewerUserId: randomUUID(),
  writerRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
};
const productCode = `FA${Math.floor(Math.random() * 1_000_000_000)}`;
let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedAll(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'FinishWip IT Tenant', 'eu', 'https://fw.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, $3, 'FinishWip Org A', 'fmcg') on conflict (id) do nothing`,
    [seed.orgAId, seed.tenantId, `fw-a-${seed.orgAId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'fw-writer', false, 'fw-writer', 'FW Writer', '[]'::jsonb, false, 10),
       ($3, $2, 'fw-viewer', false, 'fw-viewer', 'FW Viewer', '[]'::jsonb, false, 11)
     on conflict (id) do nothing`,
    [seed.writerRoleId, seed.orgAId, seed.viewerRoleId],
  );
  // Writer gets npd.core.write + npd.fa.read; viewer gets only the read perm.
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.core.write'), ($1, 'npd.fa.read'), ($2, 'npd.fa.read')
     on conflict (role_id, permission) do nothing`,
    [seed.writerRoleId, seed.viewerRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'FW Writer', 'FW Writer', $4),
       ($5, $2, $6, 'FW Viewer', 'FW Viewer', $7)
     on conflict (id) do nothing`,
    [
      seed.writerUserId, seed.orgAId, `fw-w-${seed.writerUserId}@example.test`, seed.writerRoleId,
      seed.viewerUserId, `fw-v-${seed.viewerUserId}@example.test`, seed.viewerRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3)
     on conflict (user_id, role_id) do nothing`,
    [seed.writerUserId, seed.writerRoleId, seed.orgAId, seed.viewerUserId, seed.viewerRoleId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'FinishWip Product', 1, $3) on conflict do nothing`,
    [productCode, seed.orgAId, seed.writerUserId],
  );
}

async function cleanup(): Promise<void> {
  await ownerQueryWithInferredOrgContext(owner,`delete from public.prod_detail where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.product where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgAId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id = $1)`,
    [seed.orgAId],
  );
  await owner.query(`delete from public.users where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.roles where org_id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.organizations where id = $1`, [seed.orgAId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('finish-wip actions — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; actions use withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedAll();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await owner.end();
  });

  it('writer adds + removes finish-WIP rows (auto code derived, list reads them)', async () => {
    const { addProdDetailRow, removeProdDetailRow, listProdDetail } = await import('../finish-wip');

    const added = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      addProdDetailRow({ productCode, intermediateCode: 'PR8801' }),
    );
    expect(added.intermediateCode).toBe('PR8801');
    expect(added.ingredientCode).toBe('RM8801'); // chain-3 derived, not hardcoded suffix

    const listed = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      listProdDetail({ productCode }),
    );
    expect(listed.rows.map((r) => r.intermediateCode)).toContain('PR8801');

    const row = await owner.query<{ id: string }>(
      `select id from public.prod_detail where org_id = $1 and product_code = $2 and intermediate_code = 'PR8801'`,
      [seed.orgAId, productCode],
    );
    expect(row.rowCount).toBe(1);

    const removed = await withActionActor(seed.writerUserId, seed.orgAId, () =>
      removeProdDetailRow({ productCode, prodDetailId: row.rows[0].id }),
    );
    expect(removed).toEqual({ removed: true });

    const gone = await owner.query<{ count: string }>(
      `select count(*) as count from public.prod_detail where org_id = $1 and id = $2`,
      [seed.orgAId, row.rows[0].id],
    );
    expect(gone.rows[0].count).toBe('0');
  });

  it('viewer without npd.core.write is FORBIDDEN to add', async () => {
    const { addProdDetailRow } = await import('../finish-wip');
    await expect(
      withActionActor(seed.viewerUserId, seed.orgAId, () =>
        addProdDetailRow({ productCode, intermediateCode: 'PR9999' }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
