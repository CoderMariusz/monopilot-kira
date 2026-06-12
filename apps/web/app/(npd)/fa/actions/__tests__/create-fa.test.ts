/**
 * T-008 — REAL DB-backed integration tests for createFa.
 *
 * Drives the Server Action through the real withOrgContext app_user
 * transaction/RLS path. Owner SQL is used only for seed, cleanup, and
 * persisted-row assertions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

import {
  appUserPassword,
  databaseUrl,
  makeAppUserConnectionString,
  withActionActor,
  withAppOrg,
} from '../../../brief/actions/__tests__/brief-integration-helpers';

const run = databaseUrl ? describe : describe.skip;

const seed: {
  tenantId: string;
  orgAId: string;
  orgBId: string;
  managerUserId: string;
  coreUserId: string;
  viewerUserId: string;
  otherUserId: string;
  managerRoleId: string;
  coreRoleId: string;
  viewerRoleId: string;
  otherRoleId: string;
} = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  managerUserId: randomUUID(),
  coreUserId: randomUUID(),
  viewerUserId: randomUUID(),
  otherUserId: randomUUID(),
  managerRoleId: randomUUID(),
  coreRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
  otherRoleId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-008 IT Tenant', 'eu', 'https://t008.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-008 IT Org A', 'fmcg'),
       ($4, $2, $5, 'T-008 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t008-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t008-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  const roles = await owner.query<{ id: string; org_id: string; code: string }>(
    `select id, org_id, code
       from public.roles
      where (org_id = $1::uuid and code in ('npd_manager', 'core_user', 'viewer'))
         or (org_id = $2::uuid and code = 'npd_manager')`,
    [seed.orgAId, seed.orgBId],
  );
  const roleId = (orgId: string, code: string): string => {
    const found = roles.rows.find((row) => row.org_id === orgId && row.code === code)?.id;
    if (!found) throw new Error(`missing seeded role ${code} for org ${orgId}`);
    return found;
  };
  seed.managerRoleId = roleId(seed.orgAId, 'npd_manager');
  seed.coreRoleId = roleId(seed.orgAId, 'core_user');
  seed.viewerRoleId = roleId(seed.orgAId, 'viewer');
  seed.otherRoleId = roleId(seed.orgBId, 'npd_manager');
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'fg.create'), ($2, 'fg.create'), ($3, 'fg.create')
     on conflict (role_id, permission) do nothing`,
    [seed.managerRoleId, seed.coreRoleId, seed.otherRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-008 Manager', 'T-008 Manager', $4),
       ($5, $2, $6, 'T-008 Core', 'T-008 Core', $7),
       ($8, $2, $9, 'T-008 Viewer', 'T-008 Viewer', $10),
       ($11, $12, $13, 'T-008 Other', 'T-008 Other', $14)
     on conflict (id) do nothing`,
    [
      seed.managerUserId,
      seed.orgAId,
      `t008-manager-${seed.managerUserId}@example.test`,
      seed.managerRoleId,
      seed.coreUserId,
      `t008-core-${seed.coreUserId}@example.test`,
      seed.coreRoleId,
      seed.viewerUserId,
      `t008-viewer-${seed.viewerUserId}@example.test`,
      seed.viewerRoleId,
      seed.otherUserId,
      seed.orgBId,
      `t008-other-${seed.otherUserId}@example.test`,
      seed.otherRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $3), ($8, $9, $10)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.managerUserId,
      seed.managerRoleId,
      seed.orgAId,
      seed.coreUserId,
      seed.coreRoleId,
      seed.viewerUserId,
      seed.viewerRoleId,
      seed.otherUserId,
      seed.otherRoleId,
      seed.orgBId,
    ],
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

function faCode(): string {
  return `FA${Math.floor(Math.random() * 1_000_000_000)}`;
}

run('createFa — REAL DB integration (T-008)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; action uses withOrgContext app_user pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS checks for non-vacuous cross-org isolation proof
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedIdentities();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await app.end();
    await owner.end();
  });

  it('creates product FA5101 and emits one fa.created outbox row for npd_manager', async () => {
    const { createFa } = await import('../create-fa');
    const { DuplicateError } = await import('../errors');

    const result = await withActionActor(seed.managerUserId, seed.orgAId, () =>
      createFa({ productCode: 'FA5101', productName: 'Test' }),
    );

    expect(result).toEqual({ productCode: 'FA5101' });

    const rows = await owner.query<{
      product_code: string;
      product_name: string;
      created_by_user: string;
      event_count: string;
    }>(
      `select p.product_code,
              p.product_name,
              p.created_by_user,
              (select count(*) from public.outbox_events oe
                where oe.org_id = p.org_id
                  and oe.event_type = 'fa.created'
                  and oe.aggregate_id = p.product_code) as event_count
         from public.product p
        where p.org_id = $1::uuid
          and p.product_code = 'FA5101'`,
      [seed.orgAId],
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      product_code: 'FA5101',
      product_name: 'Test',
      created_by_user: seed.managerUserId,
      event_count: '1',
    });

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        createFa({ productCode: 'FA5101', productName: 'Duplicate Test' }),
      ),
    ).rejects.toMatchObject({ name: 'DuplicateError', code: 'DUPLICATE_PRODUCT_CODE' });
    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        createFa({ productCode: 'FA5101', productName: 'Duplicate Test' }),
      ),
    ).rejects.toBeInstanceOf(DuplicateError);

    const duplicateProof = await owner.query<{ product_count: string; event_count: string }>(
      `select
         (select count(*) from public.product where org_id = $1::uuid and product_code = 'FA5101') as product_count,
         (select count(*) from public.outbox_events where org_id = $1::uuid and event_type = 'fa.created' and aggregate_id = 'FA5101') as event_count`,
      [seed.orgAId],
    );
    expect(duplicateProof.rows[0]).toEqual({ product_count: '1', event_count: '1' });

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hidden = await client.query(`select product_code from public.product where product_code = 'FA5101'`);
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.product (org_id, product_code, product_name, created_by_user, app_version)
           values ($1::uuid, $2, $3, $4::uuid, 'rls-cross-org-attempt')`,
          [seed.orgAId, faCode(), 'Cross org', seed.otherUserId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });

  it('throws ValidationError with V01_FORMAT for non-FA product codes before mutating', async () => {
    const { createFa } = await import('../create-fa');
    const { ValidationError } = await import('../errors');

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        createFa({ productCode: 'ZZ123', productName: 'Test' }),
      ),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'V01_FORMAT' });

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        createFa({ productCode: 'ZZ123', productName: 'Test' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const proof = await owner.query<{ product_count: string; event_count: string }>(
      `select
         (select count(*) from public.product where org_id = $1::uuid and product_code = 'ZZ123') as product_count,
         (select count(*) from public.outbox_events where org_id = $1::uuid and aggregate_id = 'ZZ123') as event_count`,
      [seed.orgAId],
    );
    expect(proof.rows[0]).toEqual({ product_count: '0', event_count: '0' });

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        createFa({ productCode: faCode(), productName: '   ' }),
      ),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'V02_REQUIRED' });
  });

  it('allows core_user with fa.create alias and denies viewer before mutation', async () => {
    const { createFa } = await import('../create-fa');
    const { AuthError } = await import('../errors');
    const productCode = faCode();

    await expect(
      withActionActor(seed.coreUserId, seed.orgAId, () =>
        createFa({ productCode, productName: 'Core-created Test' }),
      ),
    ).resolves.toEqual({ productCode });

    await expect(
      withActionActor(seed.viewerUserId, seed.orgAId, () =>
        createFa({ productCode: faCode(), productName: 'Viewer-created Test' }),
      ),
    ).rejects.toMatchObject({ name: 'AuthError', code: 'FORBIDDEN' });

    await expect(
      withActionActor(seed.viewerUserId, seed.orgAId, () =>
        createFa({ productCode: faCode(), productName: 'Viewer-created Test' }),
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
