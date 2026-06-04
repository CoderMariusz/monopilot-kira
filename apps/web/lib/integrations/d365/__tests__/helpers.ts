/**
 * Shared integration-test helpers for the D365 worker/gate suites.
 *
 * Real-DB only: every suite that imports this is `describe.skip`-ed when
 * `DATABASE_URL` is unset (see each test file). Fixtures are created per-org with
 * a random uuid so suites never collide; cleanup deletes by org.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getAppConnection, getOwnerConnection } from '../../../../../../packages/db/test-utils/test-pool.js';

export type AppRunner = <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;

export type TestOrg = {
  orgId: string;
  userId: string;
  roleId: string;
  /** Runs `fn` inside a committed app-role transaction with org context set. */
  runAsApp: AppRunner;
};

export type Harness = {
  owner: pg.Pool;
  app: pg.Pool;
  createOrg(options?: { grantSyncTrigger?: boolean }): Promise<TestOrg>;
  cleanup(): Promise<void>;
};

/**
 * Build a fresh harness. The owner pool (DATABASE_URL → superuser in local test
 * env) handles privileged setup; the app pool (rewritten to app_user) runs the
 * RLS-scoped assertions.
 */
export function makeHarness(): Harness {
  const owner = getOwnerConnection();
  const app = getAppConnection();
  const createdOrgs: string[] = [];

  async function createOrg(options: { grantSyncTrigger?: boolean } = {}): Promise<TestOrg> {
    const grantSyncTrigger = options.grantSyncTrigger ?? true;
    const orgId = randomUUID();
    const userId = randomUUID();
    const roleId = randomUUID();
    createdOrgs.push(orgId);

    await owner.query(
      `insert into public.tenants (id, name, data_plane_url)
       values ($1::uuid, $2, 'postgres://test')
       on conflict (id) do nothing`,
      [orgId, `d365-tenant-${orgId.slice(0, 8)}`],
    );
    await owner.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1::uuid, $1::uuid, $2, $3, 'generic')
       on conflict (id) do nothing`,
      [orgId, `d365-test-${orgId.slice(0, 8)}`, `d365-${orgId.slice(0, 8)}`],
    );
    await owner.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1::uuid, $2::uuid, 'd365_test_admin', 'd365_test_admin', 'D365 Test Admin', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await owner.query(
      `insert into public.users (id, org_id, email, name, display_name, role_id)
       values ($1::uuid, $2::uuid, $3, $4, $4, $5::uuid)
       on conflict (id) do nothing`,
      [userId, orgId, `d365-${userId.slice(0, 8)}@test.local`, `D365 Tester ${userId.slice(0, 8)}`, roleId],
    );
    await owner.query(
      `insert into public.user_roles (user_id, org_id, role_id) values ($1::uuid, $2::uuid, $3::uuid)
       on conflict do nothing`,
      [userId, orgId, roleId],
    );
    if (grantSyncTrigger) {
      await owner.query(
        `insert into public.role_permissions (role_id, permission) values ($1::uuid, 'technical.d365.sync_trigger')
         on conflict do nothing`,
        [roleId],
      );
    }

    async function runAsApp<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
      const sessionToken = randomUUID();
      await owner.query(
        `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)
         on conflict (session_token) do update set org_id = excluded.org_id`,
        [sessionToken, orgId],
      );
      const client = await app.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
        const result = await fn(client);
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
        await owner
          .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
          .catch(() => undefined);
      }
    }

    return { orgId, userId, roleId, runAsApp };
  }

  async function cleanup(): Promise<void> {
    for (const orgId of createdOrgs) {
      // organizations cascade covers most child rows; the soft d365 tables and
      // audit_log are org-scoped and cascade via FK on delete cascade. The
      // tenant row (tenant_id = orgId) is removed afterwards.
      await owner
        .query('delete from public.organizations where id = $1::uuid', [orgId])
        .catch(() => undefined);
      await owner
        .query('delete from public.tenants where id = $1::uuid', [orgId])
        .catch(() => undefined);
    }
    await app.end().catch(() => undefined);
    await owner.end().catch(() => undefined);
  }

  return { owner, app, createOrg, cleanup };
}

/** Enable the integration.d365.enabled flag for an org (owner-level upsert). */
export async function enableD365Flag(owner: pg.Pool, orgId: string, enabled: boolean): Promise<void> {
  await owner.query(
    `insert into public.feature_flags_core (org_id, flag_code, is_enabled)
     values ($1::uuid, 'integration.d365.enabled', $2)
     on conflict (org_id, flag_code) do update set is_enabled = excluded.is_enabled`,
    [orgId, enabled],
  );
}

/** Seed the five required D365 constants for an org (owner-level). */
export async function seedD365Constants(
  owner: pg.Pool,
  orgId: string,
  overrides: Partial<Record<string, string | null>> = {},
): Promise<void> {
  const values: Record<string, string | null> = {
    PRODUCTIONSITEID: 'FNOR',
    APPROVERPERSONNELNUMBER: 'APX100048',
    CONSUMPTIONWAREHOUSEID: 'ApexDG',
    PRODUCTGROUPID_FG: 'FinGoods',
    COSTINGOPERATIONRESOURCEID_DEFAULT: 'APXProd01',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    await owner.query(
      `insert into "Reference"."D365_Constants" (org_id, constant_key, constant_value, description)
       values ($1::uuid, $2, $3, 'test')
       on conflict (org_id, constant_key) do update set constant_value = excluded.constant_value`,
      [orgId, key, value],
    );
  }
}
