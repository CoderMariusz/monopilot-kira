import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/489-items-item-code-immutable-trigger.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '48900000-0000-4000-8000-000000000001';
const orgA = '48900000-0000-4000-8000-0000000000aa';
const orgARole = '48900000-0000-4000-8000-00000000a111';
const orgAUser = '48900000-0000-4000-8000-00000000aaaa';
const referencedItemId = '48900000-0000-4000-8000-00000000f001';
const unreferencedItemId = '48900000-0000-4000-8000-00000000f002';
const linkedDraftFgItemId = '48900000-0000-4000-8000-00000000f003';
const woProductId = '48900000-0000-4000-8000-00000000f001';

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
     values ($1, 'Item Code Immutable Tenant', 'eu', 'https://item-code-immutable.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await adminPool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'Item Code Immutable Org A', 'bakery')
     on conflict (id) do nothing`,
    [orgA, tenantId],
  );
  await adminPool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'item_code_immutable_user', 'Item Code Immutable Role A', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [orgARole, orgA],
  );
  await adminPool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'item-code-immutable-a@example.test', 'Item Code Immutable User A', $3)
     on conflict (id) do nothing`,
    [orgAUser, orgA, orgARole],
  );
  await adminPool.query(
    `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base)
     values ($1, $2, 'T489-FG-REF', 'fg', 'Referenced FG', 'active', 'kg'),
            ($3, $2, 'T489-FG-DRAFT', 'fg', 'Draft FG', 'draft', 'kg'),
            ($4, $2, 'T489-FG-LINKED', 'fg', 'Linked draft FG', 'draft', 'kg')
     on conflict (id) do nothing`,
    [referencedItemId, orgA, unreferencedItemId, linkedDraftFgItemId],
  );
  await adminPool.query(
    `insert into public.fg_npd_ext (item_id, org_id)
     values ($1, $2)
     on conflict (item_id) do nothing`,
    [linkedDraftFgItemId, orgA],
  );
  await adminPool.query(
    `insert into public.work_orders (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom)
     values ($1, $2, 'WO-T489-REF', $3, 'fg', 1, 'kg')
     on conflict (id) do nothing`,
    [randomUUID(), orgA, woProductId],
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
  await adminPool.query(`delete from public.work_orders where org_id = $1 and wo_number = 'WO-T489-REF'`, [orgA]);
  await adminPool.query(`delete from public.fg_npd_ext where item_id = $1`, [linkedDraftFgItemId]);
  await adminPool.query(`delete from public.items where id in ($1, $2, $3)`, [referencedItemId, unreferencedItemId, linkedDraftFgItemId]);
  await adminPool.query(`delete from app.session_org_contexts where org_id = $1`, [orgA]);
}

describe('489 items item_code immutable trigger migration file', () => {
  it('exists, defines items_is_item_code_mutable with fg_npd_ext guard, and targets item_code updates only', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/489-items-item-code-immutable-trigger.sql').toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/items_is_item_code_mutable/i);
    expect(migration).toMatch(/fg_npd_ext/i);
    expect(migration).toMatch(/items_is_item_type_mutable/i);
    expect(migration).toMatch(/before update of item_code on public\.items/i);
    expect(migration).toMatch(/is distinct from old\.item_code/i);
    expect(migration).toMatch(/errcode\s*=\s*'23514'/i);
  });
});

runIntegrationTest('489 items item_code immutable trigger', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  const sessionToken = `489-${randomUUID()}`;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedOrgData(adminPool);
    await seedTrustedOrgContext(adminPool, sessionToken, orgA);
  });

  afterAll(async () => {
    await cleanupRows(adminPool);
    await adminPool.end();
    await appPool.end();
  });

  it('rejects item_code UPDATE for a referenced/active item with SQLSTATE 23514', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.session_token', $1, true)`, [sessionToken]);
      await expect(
        client.query(
          `update public.items set item_code = 'T489-FG-REF-NEW' where id = $1::uuid`,
          [referencedItemId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('allows item_code UPDATE for an unreferenced draft item without fg_npd_ext link', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.session_token', $1, true)`, [sessionToken]);
      const updated = await client.query(
        `update public.items set item_code = 'T489-FG-DRAFT-NEW' where id = $1::uuid returning item_code`,
        [unreferencedItemId],
      );
      expect(updated.rows[0]?.item_code).toBe('T489-FG-DRAFT-NEW');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('rejects item_code UPDATE for a linked draft FG (fg_npd_ext) with SQLSTATE 23514', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.session_token', $1, true)`, [sessionToken]);
      await expect(
        client.query(
          `update public.items set item_code = 'T489-FG-LINKED-NEW' where id = $1::uuid`,
          [linkedDraftFgItemId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('allows a no-op item_code UPDATE (unchanged value)', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.session_token', $1, true)`, [sessionToken]);
      const updated = await client.query(
        `update public.items set item_code = item_code, name = name where id = $1::uuid returning item_code`,
        [referencedItemId],
      );
      expect(updated.rows[0]?.item_code).toBe('T489-FG-REF');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
