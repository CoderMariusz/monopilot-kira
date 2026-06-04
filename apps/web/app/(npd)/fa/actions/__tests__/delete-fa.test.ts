/**
 * T-029 — REAL DB-backed integration tests for deleteFa.
 *
 * Drives the Server Action through the real withOrgContext app_user
 * transaction/RLS path. Owner SQL is used only for seed, cleanup, and
 * persisted-row assertions.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import {
  appUserPassword,
  databaseUrl,
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
  coreUserId: randomUUID(),
  otherUserId: randomUUID(),
  managerRoleId: '',
  coreRoleId: '',
  otherRoleId: '',
};

let owner: pg.Pool;
let app: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await owner.query(`
    do $$
    begin
      perform pg_advisory_xact_lock(hashtext('t029:ensure-app-user'));
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedIdentities(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-029 IT Tenant', 'eu', 'https://t029.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-029 IT Org A', 'fmcg'),
       ($4, $2, $5, 'T-029 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t029-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t029-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );

  const roles = await owner.query<{ id: string; org_id: string; code: string }>(
    `select id, org_id, code
       from public.roles
      where (org_id = $1::uuid and code in ('npd_manager', 'core_user'))
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
  seed.otherRoleId = roleId(seed.orgBId, 'npd_manager');

  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'fa.delete'), ($2, 'fa.delete')
     on conflict (role_id, permission) do nothing`,
    [seed.managerRoleId, seed.otherRoleId],
  );
  await owner.query(`delete from public.role_permissions where role_id = $1 and permission = 'fa.delete'`, [
    seed.coreRoleId,
  ]);

  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-029 Manager', 'T-029 Manager', $4),
       ($5, $2, $6, 'T-029 Core', 'T-029 Core', $7),
       ($8, $9, $10, 'T-029 Other', 'T-029 Other', $11)
     on conflict (id) do nothing`,
    [
      seed.managerUserId,
      seed.orgAId,
      `t029-manager-${seed.managerUserId}@example.test`,
      seed.managerRoleId,
      seed.coreUserId,
      `t029-core-${seed.coreUserId}@example.test`,
      seed.coreRoleId,
      seed.otherUserId,
      seed.orgBId,
      `t029-other-${seed.otherUserId}@example.test`,
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
      seed.coreUserId,
      seed.coreRoleId,
      seed.otherUserId,
      seed.otherRoleId,
      seed.orgBId,
    ],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.audit_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

async function insertProduct(productCode: string, orgId = seed.orgAId, userId = seed.managerUserId): Promise<void> {
  await owner.query(
    `insert into public.product
       (org_id, product_code, product_name, department_number, created_by_user, app_version)
     values ($1::uuid, $2, $3, 'NPD', $4::uuid, 'delete-fa-test')
     on conflict (org_id, product_code) do update
       set org_id = excluded.org_id,
           product_name = excluded.product_name,
           department_number = excluded.department_number,
           created_by_user = excluded.created_by_user,
           app_version = excluded.app_version,
           deleted_at = null`,
    [orgId, productCode, `${productCode} product`, userId],
  );
}

function faCode(): string {
  return `FA${Math.floor(Math.random() * 1_000_000_000)}`;
}

run('deleteFa — REAL DB integration (T-029)', () => {
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

  it("soft-deletes an FA, hides it from public.fa, and writes audit + fa.deleted outbox for npd_manager", async () => {
    const { deleteFa } = await import('../delete-fa');
    const productCode = faCode();
    await insertProduct(productCode);

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () =>
        deleteFa(productCode, 'invalid recipe per QA'),
      ),
    ).resolves.toEqual({ productCode, deleted: true });

    const persisted = await owner.query<{
      deleted_at: Date | null;
      fa_count: string;
      audit_count: string;
      outbox_count: string;
      audit_after_state: { actor: string; productCode: string; reason: string };
    }>(
      `select p.deleted_at,
              (select count(*) from public.fa f where f.org_id = p.org_id and f.product_code = p.product_code) as fa_count,
              (select count(*) from public.audit_events ae
                where ae.org_id = p.org_id and ae.action = 'fa.deleted' and ae.resource_id = p.product_code) as audit_count,
              (select count(*) from public.outbox_events oe
                where oe.org_id = p.org_id and oe.event_type = 'fa.deleted' and oe.aggregate_id = p.product_code) as outbox_count,
              (select ae.after_state from public.audit_events ae
                where ae.org_id = p.org_id and ae.action = 'fa.deleted' and ae.resource_id = p.product_code
                order by ae.occurred_at desc limit 1) as audit_after_state
         from public.product p
        where p.org_id = $1::uuid
          and p.product_code = $2`,
      [seed.orgAId, productCode],
    );

    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0]?.deleted_at).toBeInstanceOf(Date);
    expect(persisted.rows[0]).toMatchObject({
      fa_count: '0',
      audit_count: '1',
      outbox_count: '1',
      audit_after_state: {
        actor: seed.managerUserId,
        productCode,
        reason: 'invalid recipe per QA',
      },
    });

    await withAppOrg(owner, app, seed.orgBId, async (client) => {
      const hidden = await client.query(`select product_code from public.product where product_code = $1`, [productCode]);
      expect(hidden.rowCount).toBe(0);

      await expect(
        client.query(
          `update public.product
              set deleted_at = now()
            where org_id = $1::uuid
              and product_code = $2`,
          [seed.orgAId, productCode],
        ),
      ).resolves.toMatchObject({ rowCount: 0 });

      await expect(
        client.query(
          `insert into public.product (org_id, product_code, product_name, created_by_user, app_version)
           values ($1::uuid, $2, 'Cross org', $3::uuid, 'rls-cross-org-attempt')`,
          [seed.orgAId, faCode(), seed.otherUserId],
        ),
      ).rejects.toThrow(/row-level security|violates|permission denied/i);
    });
  });

  it('throws ValidationError for reason shorter than 10 characters before mutating', async () => {
    const { deleteFa } = await import('../delete-fa');
    const { ValidationError } = await import('../errors');
    const productCode = faCode();
    await insertProduct(productCode);

    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () => deleteFa(productCode, 'short')),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'REASON_TOO_SHORT' });
    await expect(
      withActionActor(seed.managerUserId, seed.orgAId, () => deleteFa(productCode, 'short')),
    ).rejects.toBeInstanceOf(ValidationError);

    const proof = await owner.query<{ deleted_at: Date | null; audit_count: string; outbox_count: string }>(
      `select p.deleted_at,
              (select count(*) from public.audit_events ae where ae.org_id = p.org_id and ae.resource_id = p.product_code) as audit_count,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.aggregate_id = p.product_code) as outbox_count
         from public.product p
        where p.org_id = $1::uuid
          and p.product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(proof.rows[0]).toEqual({ deleted_at: null, audit_count: '0', outbox_count: '0' });
  });

  it('throws AuthError for core_user before mutating', async () => {
    const { deleteFa } = await import('../delete-fa');
    const { AuthError } = await import('../errors');
    const productCode = faCode();
    await insertProduct(productCode);

    await expect(
      withActionActor(seed.coreUserId, seed.orgAId, () =>
        deleteFa(productCode, 'invalid recipe per QA'),
      ),
    ).rejects.toMatchObject({ name: 'AuthError', code: 'FORBIDDEN' });
    await expect(
      withActionActor(seed.coreUserId, seed.orgAId, () =>
        deleteFa(productCode, 'invalid recipe per QA'),
      ),
    ).rejects.toBeInstanceOf(AuthError);

    const proof = await owner.query<{ deleted_at: Date | null; audit_count: string; outbox_count: string }>(
      `select p.deleted_at,
              (select count(*) from public.audit_events ae where ae.org_id = p.org_id and ae.resource_id = p.product_code) as audit_count,
              (select count(*) from public.outbox_events oe where oe.org_id = p.org_id and oe.aggregate_id = p.product_code) as outbox_count
         from public.product p
        where p.org_id = $1::uuid
          and p.product_code = $2`,
      [seed.orgAId, productCode],
    );
    expect(proof.rows[0]).toEqual({ deleted_at: null, audit_count: '0', outbox_count: '0' });
  });
});
