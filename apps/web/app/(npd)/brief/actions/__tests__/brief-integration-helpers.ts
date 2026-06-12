import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

export const databaseUrl = process.env.DATABASE_URL;
export const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

export type IdentitySeed = {
  tenantId: string;
  orgAId: string;
  orgBId: string;
  userAId: string;
  userBId: string;
  roleAId: string;
  roleBId: string;
};

export function makeIdentitySeed(): IdentitySeed {
  return {
    tenantId: randomUUID(),
    orgAId: randomUUID(),
    orgBId: randomUUID(),
    userAId: randomUUID(),
    userBId: randomUUID(),
    roleAId: randomUUID(),
    roleBId: randomUUID(),
  };
}

export function makeAppUserConnectionString(): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests');
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

export async function ensureAppUser(owner: pg.Pool): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

export async function seedIdentities(owner: pg.Pool, seed: IdentitySeed): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-031 IT Tenant', 'eu', 'https://t031.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values
       ($1, $2, $3, 'T-031 IT Org A', 'fmcg'),
       ($4, $2, $5, 'T-031 IT Org B', 'fmcg')
     on conflict (id) do nothing`,
    [
      seed.orgAId,
      seed.tenantId,
      `t031-a-${seed.orgAId.slice(0, 8)}`,
      seed.orgBId,
      `t031-b-${seed.orgBId.slice(0, 8)}`,
    ],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'npd-manager-it', false, 'npd-manager-it', 'NPD Manager IT', '["brief.create"]'::jsonb, false, 10),
       ($3, $4, 'npd-manager-it', false, 'npd-manager-it', 'NPD Manager IT', '["brief.create"]'::jsonb, false, 10)
     on conflict (id) do nothing`,
    [seed.roleAId, seed.orgAId, seed.roleBId, seed.orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'brief.create'), ($2, 'brief.create')
     on conflict (role_id, permission) do nothing`,
    [seed.roleAId, seed.roleBId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'T-031 IT User A', 'T-031 IT User A', $4),
       ($5, $6, $7, 'T-031 IT User B', 'T-031 IT User B', $8)
     on conflict (id) do nothing`,
    [
      seed.userAId,
      seed.orgAId,
      `t031-a-${seed.userAId}@example.test`,
      seed.roleAId,
      seed.userBId,
      seed.orgBId,
      `t031-b-${seed.userBId}@example.test`,
      seed.roleBId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do nothing`,
    [seed.userAId, seed.roleAId, seed.orgAId, seed.userBId, seed.roleBId, seed.orgBId],
  );
}

export async function cleanupIdentities(owner: pg.Pool, seed: IdentitySeed): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [seed.orgAId, seed.orgBId]);
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

export async function withActionActor<T>(userId: string, orgId: string, action: () => Promise<T>): Promise<T> {
  const previousUser = process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  const previousOrg = process.env.NEXT_SERVER_ACTION_ORG_ID;
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  try {
    return await action();
  } finally {
    if (previousUser === undefined) delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    else process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = previousUser;
    if (previousOrg === undefined) delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    else process.env.NEXT_SERVER_ACTION_ORG_ID = previousOrg;
  }
}

export async function withAppOrg<T>(
  owner: pg.Pool,
  app: pg.Pool,
  orgId: string,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await owner.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [sessionToken, orgId],
  );

  const client = await app.connect();
  try {
    await client.query('begin');
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [sessionToken, orgId]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await owner
      .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
      .catch(() => undefined);
  }
}

export function devCode(): string {
  return `DEV26-${Math.floor(Math.random() * 1_000_000_000)}`;
}
