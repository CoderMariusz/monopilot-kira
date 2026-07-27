/**
 * R-6 / R-7 — the routing delete guard must not be blinded by site RLS, and must
 * not race the ECO write path.
 *
 * R-6: public.work_orders carries the RESTRICTIVE `work_orders_site_visibility`
 * policy (migration 383) while public.routings only has org-level RLS. Counting
 * references as `app_user` therefore returned 0 for a work order in a site the
 * caller is not assigned to — and the routing was deleted out from under it.
 * public.routing_reference_counts (migration 525, SECURITY DEFINER) counts past
 * that policy while taking its org exclusively from app.current_org_id().
 *
 * R-7: `for update` on the routing header only serializes against a writer that
 * takes a conflicting lock. The ECO line insert now takes `for key share` on the
 * routing first, so the two flows can no longer interleave into an orphan.
 */
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
const migrationPath = resolve(packageRoot, 'migrations/525-routing-reference-counts-security-definer.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '52500000-0000-4000-8000-000000000001';
const orgA = '52500000-0000-4000-8000-0000000000aa';
const orgB = '52500000-0000-4000-8000-0000000000bb';
const orgARole = '52500000-0000-4000-8000-00000000a111';
const orgBRole = '52500000-0000-4000-8000-00000000b111';
const orgAUser = '52500000-0000-4000-8000-00000000aaaa';
const orgBUser = '52500000-0000-4000-8000-00000000bbbb';
const siteA = '52500000-0000-4000-8000-00000000a101';
const siteB = '52500000-0000-4000-8000-00000000a102';
const itemA = '52500000-0000-4000-8000-00000000f001';
const itemB = '52500000-0000-4000-8000-00000000f002';
const routingWithWo = '52500000-0000-4000-8000-00000000e001';
const routingRaceDelete = '52500000-0000-4000-8000-00000000e002';
const routingRaceEco = '52500000-0000-4000-8000-00000000e003';
const woInSiteB = '52500000-0000-4000-8000-00000000d001';
const woInOrgB = '52500000-0000-4000-8000-00000000d002';
const ecoOrder = '52500000-0000-4000-8000-00000000c001';

function appUserConnectionString() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for app_user integration tests');
  }
  const url = new URL(databaseUrl);
  url.username = 'app_user';
  url.password = appUserPassword;
  return url.toString();
}

async function seedOrgData(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
  await adminPool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Routing Guard Tenant', 'eu', 'https://routing-guard.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
     values ($1, $3, 'routing-guard-a', 'Routing Guard Org A', 'bakery'),
            ($2, $3, 'routing-guard-b', 'Routing Guard Org B', 'bakery')
     on conflict (id) do nothing`,
    [orgA, orgB, tenantId],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'routing_guard_user', 'Routing Guard Role A', '[]'::jsonb, true),
            ($3, $4, 'routing_guard_user', 'Routing Guard Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA, orgBRole, orgB],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'routing-guard-a@example.test', 'Routing Guard User A', $3),
            ($4, $5, 'routing-guard-b@example.test', 'Routing Guard User B', $6)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await adminPool.query(
    `insert into public.sites (id, org_id, site_code, name, timezone, created_by)
     values ($1, $2, 'RGA', 'Routing Guard Site A', 'UTC', $3),
            ($4, $2, 'RGB', 'Routing Guard Site B', 'UTC', $3)
     on conflict (id) do nothing`,
    [siteA, orgA, orgAUser, siteB],
  );
  // The caller is assigned to site A ONLY — this is what switches
  // app.user_can_see_site() from "unrestricted" to real site filtering.
  await adminPool.query(
    `insert into public.user_sites (user_id, site_id, org_id)
     values ($1, $2, $3)
     on conflict (user_id, site_id) do nothing`,
    [orgAUser, siteA, orgA],
  );
  await adminPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
     values ($1, $2, 'T525-FG', 'fg', 'Routing Guard FG', 'kg'),
            ($3, $4, 'T525-FG-B', 'fg', 'Routing Guard FG B', 'kg')
     on conflict (id) do nothing`,
    [itemA, orgA, itemB, orgB],
  );
  await adminPool.query(
    `insert into public.routings (id, org_id, item_id, version, status)
     values ($1, $2, $3, 901, 'draft'),
            ($4, $2, $3, 902, 'draft'),
            ($5, $2, $3, 903, 'draft')
     on conflict (id) do nothing`,
    [routingWithWo, orgA, itemA, routingRaceDelete, routingRaceEco],
  );
  // The work order the caller must NOT be able to see: same org, other site.
  await adminPool.query(
    `insert into public.work_orders
       (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
        planned_quantity, uom, status, routing_id)
     values ($1, $2, $3, 'WO-T525-B', $4, 'fg', 100, 'kg', 'DRAFT', $5)
     on conflict (id) do nothing`,
    [woInSiteB, orgA, siteB, itemA, routingWithWo],
  );
  // A work order in ANOTHER org pointing at the same routing id: the SECURITY
  // DEFINER function must never count it (org comes from app.current_org_id()).
  await adminPool.query(
    `insert into public.work_orders
       (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
        planned_quantity, uom, status, routing_id)
     values ($1, $2, null, 'WO-T525-OTHERORG', $3, 'fg', 100, 'kg', 'DRAFT', $4)
     on conflict (id) do nothing`,
    [woInOrgB, orgB, itemB, routingWithWo],
  );
  await adminPool.query(
    `insert into public.technical_change_orders (id, org_id, code, title, target_item_id, created_by)
     values ($1, $2, 'ECO-T525', 'Routing guard ECO', $3, $4)
     on conflict (id) do nothing`,
    [ecoOrder, orgA, itemA, orgAUser],
  );
}

async function seedTrustedOrgContext(
  adminPool: pg.Pool,
  sessionToken: string,
  orgId: string,
  userId: string,
) {
  await adminPool.query(
    `insert into app.session_org_contexts (session_token, org_id, user_id)
     values ($1, $2, $3)
     on conflict (session_token) do update set org_id = excluded.org_id, user_id = excluded.user_id`,
    [sessionToken, orgId, userId],
  );
}

async function cleanupRows(adminPool: pg.Pool) {
  await adminPool.query(`delete from public.technical_change_order_lines where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.technical_change_orders where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.work_orders where org_id in ($1, $2)`, [orgA, orgB]);
  await adminPool.query(`delete from public.routing_operations where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.routings where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.user_sites where org_id = $1`, [orgA]);
  await adminPool.query(`delete from public.items where id in ($1, $2)`, [itemA, itemB]);
  await adminPool.query(`delete from public.sites where id in ($1, $2)`, [siteA, siteB]);
  await adminPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [orgA, orgB]);
}

describe('525 routing reference guard migration file', () => {
  it('defines a hardened SECURITY DEFINER function and a post-check that CALLS it', () => {
    expect(
      existsSync(migrationPath),
      'expected packages/db/migrations/525-routing-reference-counts-security-definer.sql',
    ).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create or replace function public\.routing_reference_counts\(p_routing_id uuid\)/i);
    expect(migration).toMatch(/security definer/i);
    // SECURITY DEFINER without a pinned search_path is the classic escalation hole.
    expect(migration).toMatch(/set search_path = pg_catalog, public, pg_temp/i);
    expect(migration).toMatch(/revoke all on function public\.routing_reference_counts\(uuid\) from public/i);
    expect(migration).toMatch(/grant execute on function public\.routing_reference_counts\(uuid\) to app_user/i);
    // Org scope comes from the session, never from a parameter.
    expect(migration).toMatch(/wo\.org_id = app\.current_org_id\(\)/i);
    expect(migration).toMatch(/ecol\.org_id = app\.current_org_id\(\)/i);
    // The post-check must EXECUTE the function, not merely assert it exists.
    expect(migration).toMatch(/from public\.routing_reference_counts\(gen_random_uuid\(\)\)/i);
  });
});

describe('525 routing_reference_counts behaviour', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for the R-6/R-7 routing guard tests — refusing silent skip');
    }

    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appUserConnectionString();
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await cleanupRows(adminPool).catch(() => undefined);
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

  async function beginAsOrgA(client: pg.PoolClient) {
    const session = randomUUID();
    await seedTrustedOrgContext(adminPool, session, orgA, orgAUser);
    await client.query('begin');
    await client.query(`set local lock_timeout = '15s'`);
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [session, orgA]);
  }

  it('R-6: counts a work order the caller cannot see through site RLS', async () => {
    const client = await appPool.connect();
    try {
      await beginAsOrgA(client);

      // The blindness the guard used to inherit: the caller is assigned to site A,
      // the work order lives in site B, so the RESTRICTIVE policy hides it.
      const direct = await client.query<{ visible: string }>(
        `select count(*)::text as visible
           from public.work_orders wo
          where wo.org_id = app.current_org_id()
            and wo.routing_id = $1::uuid`,
        [routingWithWo],
      );
      expect(direct.rows[0]!.visible).toBe('0');

      // ...and the fix: the guard counts it anyway.
      const guarded = await client.query<{ work_order_count: number; change_order_line_count: number }>(
        `select work_order_count, change_order_line_count from public.routing_reference_counts($1::uuid)`,
        [routingWithWo],
      );
      expect(Number(guarded.rows[0]!.work_order_count)).toBe(1);
      expect(Number(guarded.rows[0]!.change_order_line_count)).toBe(0);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('R-6: never counts another org — SECURITY DEFINER is not a cross-org window', async () => {
    const client = await appPool.connect();
    try {
      await beginAsOrgA(client);
      // A work order in org B points at the same routing id. Seeing past site RLS
      // must not mean seeing past ORG RLS.
      const guarded = await client.query<{ work_order_count: number }>(
        `select work_order_count from public.routing_reference_counts($1::uuid)`,
        [routingWithWo],
      );
      expect(Number(guarded.rows[0]!.work_order_count)).toBe(1);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('R-7: an ECO line insert waits for a delete that holds the routing header', async () => {
    const deleter = await appPool.connect();
    const ecoWriter = await appPool.connect();
    try {
      await beginAsOrgA(deleter);
      const locked = await deleter.query(
        `select r.id from public.routings r
          where r.org_id = app.current_org_id() and r.id = $1::uuid
          for update`,
        [routingRaceDelete],
      );
      expect(locked.rowCount).toBe(1);

      // The ECO write path takes `for key share` BEFORE inserting its line, so it
      // blocks here instead of slipping a reference past the guard.
      await beginAsOrgA(ecoWriter);
      let settled = false;
      const ecoLock = ecoWriter
        .query(
          `select r.id from public.routings r
            where r.org_id = app.current_org_id() and r.id = $1::uuid
            for key share`,
          [routingRaceDelete],
        )
        .then((result) => {
          settled = true;
          return result;
        });
      await new Promise((resolve_) => setTimeout(resolve_, 300));
      expect(settled, 'the ECO writer must block on the deleter’s row lock').toBe(false);

      const counts = await deleter.query<{ change_order_line_count: number }>(
        `select change_order_line_count from public.routing_reference_counts($1::uuid)`,
        [routingRaceDelete],
      );
      expect(Number(counts.rows[0]!.change_order_line_count)).toBe(0);
      await deleter.query(
        `delete from public.routings
          where org_id = app.current_org_id() and id = $1::uuid and status = 'draft'`,
        [routingRaceDelete],
      );
      await deleter.query('commit');

      // The routing is gone, so the lock returns NO row — replaceEcoLines refuses
      // instead of inserting a line that is an orphan the moment it is written.
      const ecoLockResult = await ecoLock;
      expect(ecoLockResult.rowCount).toBe(0);
    } finally {
      await deleter.query('rollback').catch(() => undefined);
      await ecoWriter.query('rollback').catch(() => undefined);
      deleter.release();
      ecoWriter.release();
    }
  });

  it('R-7: a delete waits for an in-flight ECO line and then sees it', async () => {
    const deleter = await appPool.connect();
    const ecoWriter = await appPool.connect();
    try {
      await beginAsOrgA(ecoWriter);
      const keyShare = await ecoWriter.query(
        `select r.id from public.routings r
          where r.org_id = app.current_org_id() and r.id = $1::uuid
          for key share`,
        [routingRaceEco],
      );
      expect(keyShare.rowCount).toBe(1);
      await ecoWriter.query(
        `insert into public.technical_change_order_lines
           (org_id, change_order_id, line_no, action, target_type, target_id, created_by)
         values (app.current_org_id(), $1::uuid, 1, 'change', 'routing', $2::uuid, $3::uuid)`,
        [ecoOrder, routingRaceEco, orgAUser],
      );

      await beginAsOrgA(deleter);
      let settled = false;
      const forUpdate = deleter
        .query(
          `select r.id from public.routings r
            where r.org_id = app.current_org_id() and r.id = $1::uuid
            for update`,
          [routingRaceEco],
        )
        .then((result) => {
          settled = true;
          return result;
        });
      await new Promise((resolve_) => setTimeout(resolve_, 300));
      expect(settled, 'the deleter must block on the ECO writer’s key-share lock').toBe(false);

      await ecoWriter.query('commit');
      const forUpdateResult = await forUpdate;
      expect(forUpdateResult.rowCount).toBe(1);

      // Serialized, so the guard now counts the line that was in flight and the
      // delete is refused (`version_referenced`) instead of orphaning it.
      const counts = await deleter.query<{ change_order_line_count: number }>(
        `select change_order_line_count from public.routing_reference_counts($1::uuid)`,
        [routingRaceEco],
      );
      expect(Number(counts.rows[0]!.change_order_line_count)).toBe(1);
    } finally {
      await deleter.query('rollback').catch(() => undefined);
      await ecoWriter.query('rollback').catch(() => undefined);
      deleter.release();
      ecoWriter.release();
    }
  });
});
