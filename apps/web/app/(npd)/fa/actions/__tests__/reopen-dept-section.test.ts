/**
 * T-018 — REAL DB-backed integration tests for reopenDeptSection.
 *
 * Drives the Server Action through real withOrgContext/app_user/RLS. Owner SQL
 * is used only for seed, cleanup, and persisted-row assertions.
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

const run = databaseUrl ? describe : describe.skip;

const seed = {
  tenantId: randomUUID(),
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  managerUserId: randomUUID(),
  deniedUserId: randomUUID(),
  otherUserId: randomUUID(),
  managerRoleId: randomUUID(),
  deniedRoleId: randomUUID(),
  otherRoleId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

function faCode(): string {
  return `T018-FA-${Math.floor(Math.random() * 1_000_000_000)}`;
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-018 IT Tenant', 'eu', 'https://t018.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-018 IT Org A', 'fmcg'),
       ($4, $2, $5, 'T-018 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t018-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t018-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, $6, false, $6, 'NPD Manager', '[]'::jsonb, false, 10),
       ($3, $2, $7, false, $7, 'NPD Denied', '[]'::jsonb, false, 20),
       ($4, $5, $8, false, $8, 'NPD Manager', '[]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [
      seed.managerRoleId,
      seed.orgAId,
      seed.deniedRoleId,
      seed.otherRoleId,
      seed.orgBId,
      `npd_manager_${seed.managerRoleId.slice(0, 8)}`,
      `npd_denied_${seed.deniedRoleId.slice(0, 8)}`,
      `npd_manager_${seed.otherRoleId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.closed_flag.unset'), ($2, 'npd.closed_flag.unset')
     on conflict (role_id, permission) do nothing`,
    [seed.managerRoleId, seed.otherRoleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-018 Manager', 'T-018 Manager', $4),
       ($5, $2, $6, 'T-018 Denied', 'T-018 Denied', $7),
       ($8, $9, $10, 'T-018 Other', 'T-018 Other', $11)
     on conflict (id) do nothing`,
    [
      seed.managerUserId,
      seed.orgAId,
      `t018-manager-${seed.managerUserId}@example.test`,
      seed.managerRoleId,
      seed.deniedUserId,
      `t018-denied-${seed.deniedUserId}@example.test`,
      seed.deniedRoleId,
      seed.otherUserId,
      seed.orgBId,
      `t018-other-${seed.otherUserId}@example.test`,
      seed.otherRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)
     on conflict (user_id, role_id) do nothing`,
    [
      seed.managerUserId,
      seed.managerRoleId,
      seed.orgAId,
      seed.deniedUserId,
      seed.deniedRoleId,
      seed.otherUserId,
      seed.otherRoleId,
      seed.orgBId,
    ],
  );
}

async function seedProduct(orgId: string, userId: string, productCode: string): Promise<void> {
  await owner.query(
    `insert into public.product
       (org_id, product_code, product_name, pack_size, number_of_cases, recipe_components, closed_core, created_by_user, app_version)
     values ($1::uuid, $2, $3, 'Case', 12, 'Flour;Water', 'Yes', $4::uuid, 't018-reopen-test')`,
    [orgId, productCode, `T-018 ${productCode}`, userId],
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

run('reopenDeptSection — REAL DB integration (T-018)', () => {
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

  it('allows npd_manager with closed_flag.unset to reopen Core and emits fa.dept_reopened', async () => {
    const { reopenDeptSection } = await import('../reopen-dept-section');
    const productCode = faCode();
    await seedProduct(seed.orgAId, seed.managerUserId, productCode);

    const result = await withActionActor(seed.managerUserId, seed.orgAId, () =>
      reopenDeptSection(productCode, 'Core'),
    );

    expect(result).toMatchObject({ dept: 'Core' });
    expect(new Date(result.reopenedAt).toString()).not.toBe('Invalid Date');

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
          and oe.event_type = 'fa.dept_reopened'
          and oe.aggregate_id = p.product_code
        where p.org_id = $1::uuid
          and p.product_code = $2
        group by p.closed_core`,
      [seed.orgAId, productCode],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].closed_core).toBe('');
    expect(rows.rows[0].event_count).toBe('1');
    expect(rows.rows[0].payload.dept).toBe('Core');
  });

  it('rejects users without closed_flag.unset and leaves the row closed without an event', async () => {
    const { reopenDeptSection } = await import('../reopen-dept-section');
    const { AuthError } = await import('../errors');
    const productCode = faCode();
    await seedProduct(seed.orgAId, seed.managerUserId, productCode);

    await expect(
      withActionActor(seed.deniedUserId, seed.orgAId, () => reopenDeptSection(productCode, 'Core')),
    ).rejects.toMatchObject({ name: 'AuthError', code: 'FORBIDDEN' });
    await expect(
      withActionActor(seed.deniedUserId, seed.orgAId, () => reopenDeptSection(productCode, 'Core')),
    ).rejects.toBeInstanceOf(AuthError);

    const proof = await owner.query<{ closed_core: string | null; event_count: string }>(
      `select closed_core,
              (select count(*)::text
                 from public.outbox_events
                where org_id = $1::uuid
                  and event_type = 'fa.dept_reopened'
                  and aggregate_id = $2) as event_count
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(proof.rows[0]).toEqual({ closed_core: 'Yes', event_count: '0' });
  });

  it('keeps cross-org rows invisible and rejects cross-org WITH CHECK inserts as app_user', async () => {
    const productCode = faCode();
    await seedProduct(seed.orgAId, seed.managerUserId, productCode);

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hidden = await client.query(`select product_code from public.product where product_code = $1`, [productCode]);
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `insert into public.product
             (org_id, product_code, product_name, pack_size, number_of_cases, recipe_components, closed_core, created_by_user, app_version)
           values ($1::uuid, $2, 'Cross Org Bad Insert', 'Case', 12, 'Flour;Water', 'Yes', $3::uuid, 't018-cross-org')`,
          [seed.orgAId, `T018-FA-BAD-${randomUUID().slice(0, 8)}`, seed.managerUserId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });
});
