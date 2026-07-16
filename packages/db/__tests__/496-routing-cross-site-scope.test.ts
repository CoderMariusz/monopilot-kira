import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/496-routing-cross-site-scope.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '49600000-0000-4000-8000-000000000001';
const orgA = '49600000-0000-4000-8000-0000000000aa';
const orgARole = '49600000-0000-4000-8000-00000000a111';
const orgAUser = '49600000-0000-4000-8000-00000000aaaa';
const siteA = '49600000-0000-4000-8000-00000000a101';
const siteB = '49600000-0000-4000-8000-00000000a102';
const itemA = '49600000-0000-4000-8000-00000000f001';
const lineA = '49600000-0000-4000-8000-00000000f011';
const lineB = '49600000-0000-4000-8000-00000000f012';
const lineNull = '49600000-0000-4000-8000-00000000f013';

function appUserConnectionString() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for app_user integration tests');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function ensureAppUser(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUser(adminPool);
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Routing Scope Tenant', 'eu', 'https://routing-scope.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $2, 'routing-scope-a', 'Routing Scope Org A', 'bakery')
     on conflict (id) do nothing`,
    [orgA, tenantId],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'routing_scope_user', 'Routing Scope Role A', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'routing-scope-a@example.test', 'Routing Scope User A', $3)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole],
  );
  await adminPool.query(
    `insert into public.sites (id, org_id, site_code, name, timezone, created_by)
     values ($1, $2, 'RSA', 'Routing Site A', 'UTC', $3),
            ($4, $2, 'RSB', 'Routing Site B', 'UTC', $3)
     on conflict (id) do nothing`,
    [siteA, orgA, orgAUser, siteB],
  );
  await adminPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'T496-FG', 'fg', 'Routing Scope FG', 'kg')
     on conflict (id) do nothing`,
    [itemA, orgA],
  );
  await adminPool.query(
    `insert into public.production_lines (id, org_id, code, name, site_id)
     values ($1, $2, 'L496-A', 'Line A', $3),
            ($4, $2, 'L496-B', 'Line B', $5),
            ($6, $2, 'L496-N', 'Line Null', null)
     on conflict (id) do nothing`,
    [lineA, orgA, siteA, lineB, siteB, lineNull],
  );
}

async function seedTrustedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool.query(`delete from public.routing_operations where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.routings where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.production_lines where id in ($1, $2, $3)`, [lineA, lineB, lineNull]);
  await adminPool.query(`delete from public.items where id = $1`, [itemA]);
  await adminPool.query(`delete from public.sites where id in ($1, $2)`, [siteA, siteB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id = $1`, [orgA]);
}

describe('496 routing cross-site scope migration file', () => {
  it('defines shared scope check, preview notice, and immutability triggers', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/496-routing-cross-site-scope.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/routing_line_site_scope_violated/i);
    expect(migration).toMatch(/C041 containment preview: demoting routing_id=/i);
    expect(migration).toMatch(/routing_operations_guard_locked_routing/i);
    expect(migration).toMatch(/production_lines_guard_site_while_routing_locked/i);
    expect(migration).toMatch(/count\(\*\) filter \(where pl\.site_id is null\)/i);
    expect(migration).toMatch(/tg_op in \('INSERT', 'UPDATE'\)/i);
    expect(migration).toMatch(/tg_op in \('UPDATE', 'DELETE'\)/i);
    expect(migration).toMatch(/old\.routing_id/i);
    expect(migration).toMatch(/new\.routing_id/i);
  });
});

describe('496 routing cross-site scope triggers', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for C041 P0 integration tests — refusing silent skip');
    }

    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await seedOrgData(adminPool);
    await adminPool.query(readFileSync(migrationPath, 'utf8'));
  });

  afterAll(async () => {
    if (!adminPool) {
      return;
    }
    await cleanupRows(adminPool).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
    if (originalDatabaseUrlApp === undefined) {
      delete process.env.DATABASE_URL_APP;
    } else {
      process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
    }
  });

  it('rejects approving a routing whose operations bind lines from two sites', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status)
         values ($1, $2, 1, 'draft') returning id`,
        [orgA, itemA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3), ($1, $2, 2, 'OP2', 'Pack', $4)`,
        [orgA, routingId, lineA, lineB],
      );

      await expect(
        client.query(`update public.routings set status = 'approved' where id = $1`, [routingId]),
      ).rejects.toThrow(/routing_cross_site_lines|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('rejects approving a routing that mixes site-assigned and org-wide lines', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status)
         values ($1, $2, 2, 'draft') returning id`,
        [orgA, itemA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3), ($1, $2, 2, 'OP2', 'Pack', $4)`,
        [orgA, routingId, lineA, lineNull],
      );

      await expect(
        client.query(`update public.routings set status = 'approved' where id = $1`, [routingId]),
      ).rejects.toThrow(/routing_cross_site_lines|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('blocks routing_operations mutation after a routing becomes active', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status, site_id)
         values ($1, $2, 3, 'draft', $3) returning id`,
        [orgA, itemA, siteA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3)`,
        [orgA, routingId, lineA],
      );
      await client.query(`update public.routings set status = 'active' where id = $1`, [routingId]);

      await expect(
        client.query(
          `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
           values ($1, $2, 2, 'OP2', 'Pack', $3)`,
          [orgA, routingId, lineA],
        ),
      ).rejects.toThrow(/routing_operations_immutable|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('blocks deleting a routing operation from an active routing', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status, site_id)
         values ($1, $2, 5, 'draft', $3) returning id`,
        [orgA, itemA, siteA],
      );
      const routingId = routing.rows[0]!.id;
      const operation = await client.query<{ id: string }>(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3) returning id`,
        [orgA, routingId, lineA],
      );
      const operationId = operation.rows[0]!.id;
      await client.query(`update public.routings set status = 'active' where id = $1`, [routingId]);

      await expect(
        client.query(`delete from public.routing_operations where id = $1`, [operationId]),
      ).rejects.toThrow(/routing_operations_immutable|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('blocks reparenting a routing operation from active to draft routing', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const activeRouting = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status, site_id)
         values ($1, $2, 6, 'draft', $3) returning id`,
        [orgA, itemA, siteA],
      );
      const activeRoutingId = activeRouting.rows[0]!.id;
      const operation = await client.query<{ id: string }>(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3) returning id`,
        [orgA, activeRoutingId, lineA],
      );
      const operationId = operation.rows[0]!.id;
      await client.query(`update public.routings set status = 'active' where id = $1`, [activeRoutingId]);

      const draftRouting = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status, site_id)
         values ($1, $2, 7, 'draft', $3) returning id`,
        [orgA, itemA, siteA],
      );
      const draftRoutingId = draftRouting.rows[0]!.id;

      await expect(
        client.query(`update public.routing_operations set routing_id = $2 where id = $1`, [
          operationId,
          draftRoutingId,
        ]),
      ).rejects.toThrow(/routing_operations_immutable|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('blocks production_lines.site_id changes while the line is on an active routing', async () => {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA);
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
      const routing = await client.query<{ id: string }>(
        `insert into public.routings (org_id, item_id, version, status, site_id)
         values ($1, $2, 4, 'draft', $3) returning id`,
        [orgA, itemA, siteA],
      );
      const routingId = routing.rows[0]!.id;
      await client.query(
        `insert into public.routing_operations (org_id, routing_id, op_no, op_code, op_name, line_id)
         values ($1, $2, 1, 'OP1', 'Mix', $3)`,
        [orgA, routingId, lineA],
      );
      await client.query(`update public.routings set status = 'active' where id = $1`, [routingId]);

      await expect(
        client.query(`update public.production_lines set site_id = $2 where id = $1`, [lineA, siteB]),
      ).rejects.toThrow(/production_line_site_immutable_while_routing_active|V-TEC-64/i);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
