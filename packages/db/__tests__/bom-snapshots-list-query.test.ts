import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';
import {
  LIST_SNAPSHOTS_SQL,
  mapSnapshotRow,
  type SnapshotQueryRow,
} from '../../../apps/web/app/[locale]/(app)/(modules)/technical/boms/snapshots/_actions/shared';

/**
 * TEC-025 BOM Snapshots Viewer — list query (Gate-5 live regression).
 *
 * The deployed preview showed "Unable to load BOM snapshots. Please try again."
 * because list-snapshots.ts selected `p.name` from public.product, whose display
 * column is `product_name` (NOT `name`) — a column-mismatch the live read hit but
 * the existing RTL/pure-diff tests never exercised. This test runs the LITERAL
 * production query (LIST_SNAPSHOTS_SQL, the single source of truth shared by the
 * server action) against a real Postgres + RLS (`app.current_org_id()`) for BOTH:
 *   - the EMPTY state (org with no snapshots) and
 *   - a SEEDED snapshot row (joins bom_headers + product, derived status).
 *
 * RED (pre-fix, `p.name`): the query throws `column p.name does not exist`.
 * GREEN (post-fix, `p.product_name`): both states load and map correctly.
 *
 * Requires DATABASE_URL — integration block is skipped otherwise.
 */
const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '25500000-0000-4000-8000-000000000001';
const orgList = '25500000-0000-4000-8000-0000000000aa';
const orgEmpty = '25500000-0000-4000-8000-0000000000bb';
const roleList = '25500000-0000-4000-8000-00000000a111';
const roleEmpty = '25500000-0000-4000-8000-00000000b222';
const userList = '25500000-0000-4000-8000-00000000aaaa';
const userEmpty = '25500000-0000-4000-8000-00000000bbbb';
// Unique per run: bom_snapshots is immutable (rows persist across runs and block
// header cleanup), so we never collide on bom_headers_org_product_version_unique.
const runTag = randomUUID().slice(0, 8);
const productCode = `FG-TEC025-${runTag}`;
const productName = `TEC-025 Snapshot FG ${runTag}`;
const headerVersion = 1 + (parseInt(runTag, 16) % 100000);

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'TEC-025 List Tenant', 'eu', 'https://tec025-list.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'TEC-025 List Org', 'bakery'),
            ($3, $2, 'TEC-025 Empty Org', 'fmcg')
     on conflict (id) do nothing`,
    [orgList, tenantId, orgEmpty],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'tec025_list_user', 'TEC-025 List Role', '[]'::jsonb, true),
            ($3, $4, 'tec025_list_user', 'TEC-025 Empty Role', '[]'::jsonb, true)
     on conflict (org_id, code) do nothing`,
    [roleList, orgList, roleEmpty, orgEmpty],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'tec025-list@example.test', 'TEC-025 List User', $3),
            ($4, $5, 'tec025-empty@example.test', 'TEC-025 Empty User', $6)
     on conflict (id) do nothing`,
    [userList, orgList, roleList, userEmpty, orgEmpty, roleEmpty],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, $3, 1, $4)
     on conflict (org_id, product_code) do nothing`,
    [productCode, orgList, productName, userList],
  );
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

/** Run LIST_SNAPSHOTS_SQL as app_user with the given org bound (mirrors the server action). */
async function runListAs(appPool: pg.Pool, ownerPool: pg.Pool, orgId: string): Promise<SnapshotQueryRow[]> {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const { rows } = await client.query<SnapshotQueryRow>(LIST_SNAPSHOTS_SQL);
    return rows;
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

runIntegrationTest('TEC-025 listBomSnapshots query (live regression: product_name join)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let headerId: string;
  let snapshotId: string;
  const workOrderId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await seedBaseRows(ownerPool);

    headerId = randomUUID();
    await ownerPool.query(
      `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version, created_by_user)
       values ($1, $2, $3, 'technical', 'draft', $4, $5)`,
      [headerId, orgList, productCode, headerVersion, userList],
    );

    snapshotId = randomUUID();
    await ownerPool.query(
      `insert into public.bom_snapshots (id, org_id, work_order_id, bom_header_id, snapshot_json)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        snapshotId,
        orgList,
        workOrderId,
        headerId,
        JSON.stringify({ header: { version: 7 }, lines: [{ code: 'RM-1' }, { code: 'RM-2' }] }),
      ],
    );
  });

  afterAll(async () => {
    // bom_snapshots is immutable (DELETE blocked) — leave the row; clean only the header is
    // also blocked by the snapshot FK, so we leave the seeded fixtures (idempotent re-seeds).
    await appPool?.end();
    await ownerPool?.end();
  });

  it('returns the EMPTY state for an org with no snapshots (query executes — no column error)', async () => {
    const rows = await runListAs(appPool, ownerPool, orgEmpty);
    expect(rows).toEqual([]);
    expect(rows.map(mapSnapshotRow)).toEqual([]);
  });

  it('loads a seeded snapshot row: resolves product_name, version, line_count and derived status', async () => {
    const rows = await runListAs(appPool, ownerPool, orgList);
    const row = rows.find((r) => String(r.id) === snapshotId);
    expect(row, 'seeded snapshot row must be returned by the live query').toBeTruthy();

    // The bug was `p.name` (does not exist). Post-fix `p.product_name` resolves the FG name.
    expect(row!.product_name).toBe(productName);
    expect(Number(row!.bom_version)).toBe(headerVersion);
    expect(Number(row!.line_count)).toBe(2);
    expect(row!.header_exists).toBe(true);
    expect(row!.is_latest).toBe(true);
    expect(String(row!.work_order_id)).toBe(workOrderId);

    const mapped = mapSnapshotRow(row!);
    expect(mapped).toMatchObject({
      id: snapshotId,
      workOrderId,
      bomHeaderId: headerId,
      bomVersion: headerVersion,
      productId: productCode,
      productName,
      lineCount: 2,
      status: 'in_use',
    });
  });

  it('isolates snapshots by org via RLS — the empty org never sees the seeded row', async () => {
    const rows = await runListAs(appPool, ownerPool, orgEmpty);
    expect(rows.some((r) => String(r.id) === snapshotId)).toBe(false);
  });
});
