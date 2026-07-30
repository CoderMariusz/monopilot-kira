/**
 * Org isolation in hasPermission / hasAnyPermission — NO mocks.
 *
 * The sibling `has-permission.test.ts` drives a `FakePermissionClient` that
 * reimplements the grant logic, org filter included. Deleting `ur.org_id = $2::uuid`
 * from the production SQL left all 12 of its tests green: the real statement never
 * runs there, and its "SQL tokens" assertion does not mention org_id.
 *
 * So this file hands the real functions a real Postgres connection. Both directions
 * are asserted: the permission must be GRANTED in the org that owns it, and DENIED
 * for the same user in the other org. A file that only asserted the denial would
 * also pass if the function always returned false.
 *
 * Everything runs inside one transaction that is always rolled back.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/clients.js';

import { hasAnyPermission, hasPermission } from '../has-permission';

const runPg = process.env.DATABASE_URL || process.env.DATABASE_URL_OWNER ? describe : describe.skip;

const PERMISSION = 'production.wo.release';

runPg('hasPermission — real SQL, real database, two organizations', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const roleA = randomUUID();
  const roleB = randomUUID();
  const userId = randomUUID();

  const inOrg = (orgId: string) => ({ userId, orgId, client });

  beforeAll(async () => {
    pool = getOwnerConnection();
    client = await pool.connect();
    await client.query('begin');

    await client.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1::uuid, 'has-permission pg fixture', 'eu', 'https://has-permission.example.test')`,
      [tenantId],
    );
    await client.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1::uuid, $3::uuid, 'Org A', $2, 'fmcg'),
              ($4::uuid, $3::uuid, 'Org B', $5, 'fmcg')`,
      [orgA, `org-a-${orgA.slice(0, 8)}`, tenantId, orgB, `org-b-${orgB.slice(0, 8)}`],
    );
    // Same non-privileged role code in both orgs: nothing but the org filter separates them.
    await client.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1::uuid, $2::uuid, $3, false, 'operator', 'Operator A', '[]'::jsonb, false, 900),
              ($4::uuid, $5::uuid, $6, false, 'operator', 'Operator B', '[]'::jsonb, false, 900)`,
      [roleA, orgA, `op-a-${roleA.slice(0, 8)}`, roleB, orgB, `op-b-${roleB.slice(0, 8)}`],
    );
    await client.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1::uuid, $2::uuid, $3, 'PG Fixture User', 'PG Fixture User', $4::uuid)`,
      [userId, orgA, `has-permission-${userId}@example.test`, roleA],
    );
    // The permission is granted in org A only.
    await client.query(
      `insert into public.role_permissions (role_id, permission) values ($1::uuid, $2)`,
      [roleA, PERMISSION],
    );
    // The same person is a member of org B too, with a role that carries no permission.
    // This is the case that matters: denial must come from the org filter, not from
    // the user simply having no rows in org B.
    await client.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1::uuid, $2::uuid, $3::uuid), ($1::uuid, $4::uuid, $5::uuid)`,
      [userId, roleA, orgA, roleB, orgB],
    );
  });

  afterAll(async () => {
    await client?.query('rollback').catch(() => undefined);
    client?.release();
    await pool?.end();
  });

  it('grants the permission in the organization that owns the grant', async () => {
    await expect(hasPermission(inOrg(orgA), PERMISSION)).resolves.toBe(true);
  });

  it('denies the same user the same permission in the other organization', async () => {
    await expect(hasPermission(inOrg(orgB), PERMISSION)).resolves.toBe(false);
  });

  it('denies a permission nobody was granted, in either organization', async () => {
    await expect(hasPermission(inOrg(orgA), 'warehouse.lp.adjust')).resolves.toBe(false);
    await expect(hasPermission(inOrg(orgB), 'warehouse.lp.adjust')).resolves.toBe(false);
  });

  it('hasAnyPermission grants in org A and denies in org B (separate statement)', async () => {
    const permissions = ['production.wo.cancel', PERMISSION];

    await expect(hasAnyPermission(inOrg(orgA), permissions)).resolves.toBe(true);
    await expect(hasAnyPermission(inOrg(orgB), permissions)).resolves.toBe(false);
  });
});
