/**
 * T-089 (cross-review HIGH-2) — REAL DB RBAC test for gdpr.erasure.execute.
 *
 * The redact-user Server Action gates on the canonical permission
 * 'gdpr.erasure.execute'. Before migration 116 the string existed nowhere in the
 * seeds, so real admins were rejected (the action's unit test only passed because
 * it mocked the DB client). This suite uses the REAL database (no mock): it
 * applies migration 116, seeds an admin user and a non-admin user, then runs the
 * EXACT permission-check query the action runs under an app_user transaction with
 * org context set via app.set_org_context — asserting admin is allowed and the
 * non-admin is forbidden.
 *
 * Integration test: requires DATABASE_URL (clone migrated to @109+).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/116-gdpr-erasure-permission-seed.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const REQUIRED_PERMISSION = 'gdpr.erasure.execute';

const tenantId = '89300000-0000-4000-8000-000000000000';
const orgId = '89300000-0000-4000-8000-00000000000a';
const adminRoleId = '89300000-0000-4000-8000-0000000001aa';
const viewerRoleId = '89300000-0000-4000-8000-0000000001bb';
const adminUser = '89300000-0000-4000-8000-0000000000aa';
const nonAdminUser = '89300000-0000-4000-8000-0000000000bb';

async function ensureAppUser(pool: pg.Pool): Promise<void> {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function applyMigration116(pool: pg.Pool): Promise<void> {
  const sql = readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(778900116)');
    await client.query(sql);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mirrors hasGdprErasurePermission() in
 * apps/web/app/(admin)/gdpr/_actions/redact-user.ts — the EXACT query the action
 * uses, executed here against the real DB (not a mock client).
 */
async function hasGdprErasurePermission(
  client: pg.PoolClient,
  userId: string,
  org: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, org, REQUIRED_PERMISSION],
  );
  return rows.length > 0;
}

/** Run a callback inside an app_user transaction with org context set (as the action does). */
async function withAppOrgContext<T>(
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  org: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`,
    [sessionToken, org],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, org]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await ownerPool
      .query(`delete from app.session_org_contexts where session_token = $1`, [sessionToken])
      .catch(() => undefined);
  }
}

runIntegrationTest('gdpr.erasure.execute RBAC seed (T-089 HIGH-2, real DB)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);

    // Seed tenant/org. The 080 + 116 org-insert triggers seed the canonical roles
    // (incl. 'admin' with gdpr.erasure.execute) for a brand-new org.
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'GDPR RBAC Tenant', 'eu', 'https://gdpr-rbac.example.test')
       on conflict (id) do update set name = excluded.name`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'GDPR RBAC Org', 'bakery')
       on conflict (id) do update set tenant_id = excluded.tenant_id`,
      [orgId, tenantId],
    );

    // Apply 116 and backfill (covers the case where the org pre-existed the migration).
    await applyMigration116(ownerPool);

    // Ensure deterministic admin + non-admin (viewer) roles regardless of trigger order.
    await ownerPool.query(
      `insert into public.roles (id, org_id, code, slug, name, permissions, is_system)
       values ($1, $2, 'admin', 'admin', 'GDPR RBAC Admin', '[]'::jsonb, true)
       on conflict (org_id, code) do update set name = excluded.name`,
      [adminRoleId, orgId],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, code, slug, name, permissions, is_system)
       values ($1, $2, 'viewer', 'viewer', 'GDPR RBAC Viewer', '[]'::jsonb, true)
       on conflict (org_id, code) do update set name = excluded.name`,
      [viewerRoleId, orgId],
    );
    // Re-run the seed so the explicitly-pinned admin role row above is granted too.
    await ownerPool.query(`select public.seed_gdpr_erasure_permission_for_org($1)`, [orgId]);

    // Resolve the actual admin/viewer role ids (trigger may have created its own).
    const adminRow = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and code = 'admin' limit 1`,
      [orgId],
    );
    const viewerRow = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and code = 'viewer' limit 1`,
      [orgId],
    );
    const resolvedAdminRole = adminRow.rows[0]!.id;
    const resolvedViewerRole = viewerRow.rows[0]!.id;

    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'gdpr-rbac-admin@example.test', 'GDPR RBAC Admin', $3),
              ($4, $2, 'gdpr-rbac-viewer@example.test', 'GDPR RBAC Viewer', $5)
       on conflict (id) do update set org_id = excluded.org_id, role_id = excluded.role_id`,
      [adminUser, orgId, resolvedAdminRole, nonAdminUser, resolvedViewerRole],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3), ($4, $5, $3)
       on conflict do nothing`,
      [adminUser, resolvedAdminRole, orgId, nonAdminUser, resolvedViewerRole],
    );
  });

  afterAll(async () => {
    await ownerPool.query(`delete from public.user_roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.users where id = any($1::uuid[])`, [[adminUser, nonAdminUser]]).catch(() => undefined);
    await ownerPool.query(`delete from public.role_permissions rp using public.roles r where r.id = rp.role_id and r.org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('seeds gdpr.erasure.execute on the admin role_permissions row (normalized storage)', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select rp.permission
         from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
        where r.org_id = $1 and r.code = 'admin' and rp.permission = $2`,
      [orgId, REQUIRED_PERMISSION],
    );
    expect(rows).toHaveLength(1);
  });

  it('admin user IS allowed (real hasPermission query under app context)', async () => {
    const allowed = await withAppOrgContext(ownerPool, appPool, orgId, (client) =>
      hasGdprErasurePermission(client, adminUser, orgId),
    );
    expect(allowed).toBe(true);
  });

  it('non-admin (viewer) user is FORBIDDEN (real hasPermission query under app context)', async () => {
    const allowed = await withAppOrgContext(ownerPool, appPool, orgId, (client) =>
      hasGdprErasurePermission(client, nonAdminUser, orgId),
    );
    expect(allowed).toBe(false);
  });
});
