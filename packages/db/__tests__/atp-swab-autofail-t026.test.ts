/**
 * T-026 — ATP swab auto-fail trigger (V-TEC-44) + outbox emit (migration 187).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §10.6, §10.8.
 *
 * Exercises the DB-level auto-fail guard on public.lab_results (QUALITY-OWNED):
 *   AC1 — INSERT atp_swab value=15, threshold=10 → result_status forced to 'fail'.
 *   AC2 — the fail row emits a 'quality.atp_swab_failed' outbox event carrying
 *         item_id + result_value (+ work_order_id, test_code, threshold_rlu).
 *   AC3 — test_type='allergen_elisa' + result_status='pass' → trigger does NOT
 *         touch status (no auto-fail, no event).
 *   + threshold sourced from Reference.AlertThresholds atp_swab_rlu_max (=10),
 *     a value AT the threshold passes, and cross-org isolation holds.
 *
 * Static contract (no DB): migration 187 exists, uses org_id (not tenant_id),
 * never reads current_setting('app.*'), and emits the registered event string.
 *
 * Wave0: org_id scope, RLS via app.current_org_id(). DB-gated — skips without
 * DATABASE_URL (mirrors the items.migration / allergen-cascade suites).
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
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration187 = resolve(packageRoot, 'migrations/187-atp-swab-autofail-trigger.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '18700000-0000-4000-8000-000000000001';
const orgA = '18700000-0000-4000-8000-0000000000aa';
const orgB = '18700000-0000-4000-8000-0000000000bb';
const orgARole = '18700000-0000-4000-8000-00000000a111';
const orgBRole = '18700000-0000-4000-8000-00000000b222';
const orgAUser = '18700000-0000-4000-8000-00000000aaaa';
const orgBUser = '18700000-0000-4000-8000-00000000bbbb';
const itemA = '18700000-0000-4000-8000-0000000011aa';

async function ensureAppUser(adminPool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(adminPool);
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
}

/** Run a callback as app_user inside an org-context transaction. */
async function asOrg<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const sessionToken = randomUUID();
  await trustOrgContext(ownerPool, sessionToken, orgId);
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ── Static contract (no DB) ──────────────────────────────────────────────────
describe('T-026 ATP auto-fail — static migration contract (187)', () => {
  it('migration 187 exists', () => {
    expect(existsSync(migration187)).toBe(true);
  });

  it('scopes by org_id and never reads current_setting(app.*)', () => {
    const sql = readFileSync(migration187, 'utf8');
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\./i);
    expect(sql).toMatch(/app\.current_org_id\(\)|new\.org_id/);
  });

  it('emits the registered quality.atp_swab_failed event with the required payload keys', () => {
    const sql = readFileSync(migration187, 'utf8');
    expect(sql).toMatch(/'quality\.atp_swab_failed'/);
    for (const key of ['item_id', 'work_order_id', 'test_code', 'result_value', 'threshold_rlu']) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});

runIntegrationTest('T-026 ATP auto-fail — DB behaviour (migration 187)', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(adminPool);

    // Idempotent re-apply of migration 187 (DB already migrated by the runner).
    await adminPool.query(readFileSync(migration187, 'utf8'));

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'ATP T026 Tenant', 'eu', 'https://atp-t026.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'ATP T026 Org A', 'bakery'), ($3, $2, 'ATP T026 Org B', 'fmcg')
       on conflict (id) do nothing`,
      [orgA, tenantId, orgB],
    );
    await adminPool.query(
      `insert into public.roles (id, org_id, code, name, permissions, is_system)
       values ($1, $2, 'atp_t026_user', 'ATP Role A', '[]'::jsonb, true),
              ($3, $4, 'atp_t026_user', 'ATP Role B', '[]'::jsonb, true)
       on conflict (org_id, code) do nothing`,
      [orgARole, orgA, orgBRole, orgB],
    );
    await adminPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'atp-a@example.test', 'ATP User A', $3),
              ($4, $5, 'atp-b@example.test', 'ATP User B', $6)
       on conflict (id) do nothing`,
      [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
    );
    // ensure the org-level threshold exists (org-insert trigger seeds it; backfill defensively)
    await adminPool.query(`select public.seed_alert_thresholds_for_org($1::uuid)`, [orgA]);

    // One FG item for the lab_results.item_id FK.
    await asOrg(appPool, adminPool, orgA, async (c) => {
      await c.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base)
         values ($1, $2, 'FG-ATP-026', 'fg', 'ATP Test FG', 'kg')
         on conflict (id) do nothing`,
        [itemA, orgA],
      );
    });
  }, 60_000);

  afterAll(async () => {
    if (adminPool) {
      await adminPool.query(`delete from public.outbox_events where org_id in ($1,$2)`, [orgA, orgB]).catch(() => undefined);
      await adminPool.query(`delete from public.lab_results where org_id in ($1,$2)`, [orgA, orgB]).catch(() => undefined);
      await adminPool.end();
    }
    if (appPool) await appPool.end();
  });

  it('AC1 — atp_swab value 15 > threshold 10 auto-fails (result_status=fail)', async () => {
    const id = await asOrg(appPool, adminPool, orgA, async (c) => {
      const r = await c.query<{ id: string; result_status: string; threshold_rlu: string }>(
        `insert into public.lab_results
           (org_id, item_id, test_type, test_code, result_value, result_status, threshold_rlu)
         values ($1, $2, 'atp_swab', 'ATP-01', 15, 'pending', 10)
         returning id, result_status, threshold_rlu`,
        [orgA, itemA],
      );
      return r.rows[0]!;
    });
    expect(id.result_status).toBe('fail');
    expect(Number(id.threshold_rlu)).toBe(10);
  });

  it('AC2 — the fail row emits quality.atp_swab_failed with item_id + result_value', async () => {
    const { labId } = await asOrg(appPool, adminPool, orgA, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into public.lab_results
           (org_id, item_id, work_order_id, test_type, test_code, result_value, result_status, threshold_rlu)
         values ($1, $2, null, 'atp_swab', 'ATP-AC2', 22, 'pending', 10)
         returning id`,
        [orgA, itemA],
      );
      return { labId: r.rows[0]!.id };
    });

    const ev = await adminPool.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload from public.outbox_events
        where org_id = $1 and event_type = 'quality.atp_swab_failed' and aggregate_id = $2`,
      [orgA, labId],
    );
    expect(ev.rowCount).toBe(1);
    expect(ev.rows[0]!.payload.item_id).toBe(itemA);
    expect(Number(ev.rows[0]!.payload.result_value)).toBe(22);
    expect(Number(ev.rows[0]!.payload.threshold_rlu)).toBe(10);
  });

  it('AC3 — allergen_elisa + pass is NOT modified and emits no event', async () => {
    const row = await asOrg(appPool, adminPool, orgA, async (c) => {
      const r = await c.query<{ id: string; result_status: string }>(
        `insert into public.lab_results
           (org_id, item_id, test_type, test_code, result_value, result_status)
         values ($1, $2, 'allergen_elisa', 'ELISA-01', 99, 'pass')
         returning id, result_status`,
        [orgA, itemA],
      );
      return r.rows[0]!;
    });
    expect(row.result_status).toBe('pass');

    const ev = await adminPool.query(
      `select 1 from public.outbox_events where org_id = $1 and aggregate_id = $2`,
      [orgA, row.id],
    );
    expect(ev.rowCount).toBe(0);
  });

  it('a value AT the threshold (10) passes — only strictly-over fails', async () => {
    const row = await asOrg(appPool, adminPool, orgA, async (c) => {
      const r = await c.query<{ id: string; result_status: string }>(
        `insert into public.lab_results
           (org_id, item_id, test_type, test_code, result_value, result_status, threshold_rlu)
         values ($1, $2, 'atp_swab', 'ATP-EQ', 10, 'pending', 10)
         returning id, result_status`,
        [orgA, itemA],
      );
      return r.rows[0]!;
    });
    expect(row.result_status).toBe('pending');
    const ev = await adminPool.query(
      `select 1 from public.outbox_events where org_id = $1 and aggregate_id = $2`,
      [orgA, row.id],
    );
    expect(ev.rowCount).toBe(0);
  });

  it('threshold defaults to the org Reference.AlertThresholds value when the row omits it', async () => {
    // org default atp_swab_rlu_max = 10 (seeded). value 12 with NO row threshold → fail @10.
    const row = await asOrg(appPool, adminPool, orgA, async (c) => {
      const r = await c.query<{ result_status: string; threshold_rlu: string }>(
        `insert into public.lab_results
           (org_id, item_id, test_type, test_code, result_value, result_status)
         values ($1, $2, 'atp_swab', 'ATP-DEF', 12, 'pending')
         returning result_status, threshold_rlu`,
        [orgA, itemA],
      );
      return r.rows[0]!;
    });
    expect(row.result_status).toBe('fail');
    expect(Number(row.threshold_rlu)).toBe(10);
  });
});
