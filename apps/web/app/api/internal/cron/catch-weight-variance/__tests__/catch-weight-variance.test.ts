/**
 * T-031 — Catch-weight variance nightly job (migration 188/189 + lib + cron route).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §8.1, §8.5, §8.6.
 *
 *   AC1 — 100 weighings, avg variance 4%, threshold 5% → NO alert emitted.
 *   AC2 — avg variance ~7% → 'catch_weight.variance_exceeded' present in outbox
 *         with item_id + avg.
 *   AC3 — fixed-weight items are skipped (no roll-up rows produced).
 *   AC4 — empty work_order_items → graceful no-op (no rows, no error).
 *
 * Static contract (no DB): the lib exports the registered event string + never
 * mutates work_order_items (read-only red line).
 *
 * Wave0: org_id scope, RLS via app.current_org_id(). DB-gated — skips without
 * DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '@monopilot/db/clients.js';
import { runVarianceForOrg } from '../route';
import { ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../../tests/helpers/owner-org-context.js';
import {
  CATCH_WEIGHT_VARIANCE_EVENT,
  computeCatchWeightVarianceForOrg,
} from '../../../../../../lib/cron/catch-weight-variance';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
// apps/web/app/api/internal/cron/catch-weight-variance/__tests__ → repo root packages/db/migrations
const migrationsDir = resolve(here, '../../../../../../../../packages/db/migrations');
const migration188 = resolve(migrationsDir, '188-catch-weight-variance-daily.sql');
const migration477 = resolve(migrationsDir, '477-catch-weight-variance-site-day-key.sql');
// Stale test contract: migration 189 was consolidated into the full outbox event union filename.
const migration189 = resolve(migrationsDir, '189-outbox-events-full-union.sql');
const libSrc = resolve(here, '../../../../../../lib/cron/catch-weight-variance.ts');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '18800000-0000-4000-8000-000000000001';
const orgA = '18800000-0000-4000-8000-0000000000aa';
const orgRole = '18800000-0000-4000-8000-00000000a111';
const orgUser = '18800000-0000-4000-8000-00000000aaaa';
const catchItem = '18800000-0000-4000-8000-0000000011cc'; // weight_mode='catch'
const fixedItem = '18800000-0000-4000-8000-0000000011ff'; // weight_mode='fixed'
const zeroNominalItem = '18800000-0000-4000-8000-0000000011aa';
const siteA = '18800000-0000-4000-8000-00000000a001';
const siteB = '18800000-0000-4000-8000-00000000b002';
const DAY = '2026-06-01';

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

/** Insert N catch-weight weighings whose abs variance% equals `variancePct` exactly. */
async function insertWeighings(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  itemId: string,
  nominal: number,
  variancePct: number,
  count: number,
  siteId?: string | null,
) {
  const actual = nominal * (1 + variancePct / 100);
  await asOrg(appPool, ownerPool, orgA, async (c) => {
    for (let i = 0; i < count; i += 1) {
      await c.query(
        `insert into public.work_order_items
           (org_id, site_id, item_id, nominal_weight, actual_weight, captured_at)
         values ($1, $2, $3, $4, $5, $6::timestamptz)`,
        [orgA, siteId ?? null, itemId, nominal, actual, `${DAY}T08:00:00Z`],
      );
    }
  });
}

// ── Static contract (no DB) ──────────────────────────────────────────────────
describe('T-031 catch-weight variance — static contract', () => {
  it('migration 188 + 189 exist', () => {
    expect(existsSync(migration188)).toBe(true);
    expect(existsSync(migration189)).toBe(true);
  });

  it('event string is the registered catch_weight.variance_exceeded', () => {
    expect(CATCH_WEIGHT_VARIANCE_EVENT).toBe('catch_weight.variance_exceeded');
  });

  it('lib never writes/modifies work_order_items (read-only red line)', () => {
    const src = readFileSync(libSrc, 'utf8');
    expect(src).not.toMatch(/insert\s+into\s+public\.work_order_items/i);
    expect(src).not.toMatch(/update\s+public\.work_order_items/i);
    expect(src).not.toMatch(/delete\s+from\s+public\.work_order_items/i);
  });

  it('migration 188 uses org_id, not tenant_id, and no current_setting(app.*)', () => {
    const sql = readFileSync(migration188, 'utf8');
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\./i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
  });
});

runIntegrationTest('T-031 catch-weight variance — DB behaviour', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(adminPool);

    // Idempotent re-apply of 188 + 477.
    await adminPool.query(readFileSync(migration188, 'utf8'));
    await adminPool.query(readFileSync(migration477, 'utf8'));

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'CWV T031 Tenant', 'eu', 'https://cwv-t031.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'CWV T031 Org', 'fmcg')
       on conflict (id) do nothing`,
      [orgA, tenantId],
    );
    await adminPool.query(
      `insert into public.roles (id, org_id, code, name, permissions, is_system)
       values ($1, $2, 'cwv_t031_user', 'CWV Role', '[]'::jsonb, true)
       on conflict (org_id, code) do nothing`,
      [orgRole, orgA],
    );
    await adminPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, 'cwv-a@example.test', 'CWV User', $3)
       on conflict (id) do nothing`,
      [orgUser, orgA, orgRole],
    );
    await adminPool.query(`select public.seed_alert_thresholds_for_org($1::uuid)`, [orgA]);

    await asOrg(appPool, adminPool, orgA, async (c) => {
      await c.query(
        `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, nominal_weight)
         values ($1, $2, 'FG-CW-CATCH', 'fg', 'Catch FG', 'kg', 'catch', 200),
                ($3, $2, 'FG-CW-FIXED', 'fg', 'Fixed FG', 'kg', 'fixed', 250),
                ($4, $2, 'FG-CW-ZERO', 'fg', 'Zero nominal FG', 'kg', 'catch', 0)
         on conflict (id) do nothing`,
        [catchItem, orgA, fixedItem, zeroNominalItem],
      );
    });
  }, 60_000);

  afterAll(async () => {
    if (adminPool) {
      await adminPool.query(`delete from public.outbox_events where org_id = $1`, [orgA]).catch(() => undefined);
      await adminPool.query(`delete from public.catch_weight_variance_daily where org_id = $1`, [orgA]).catch(() => undefined);
      await adminPool.query(`delete from public.work_order_items where org_id = $1`, [orgA]).catch(() => undefined);
      await adminPool.end();
    }
    if (appPool) await appPool.end();
  });

  async function cleanup() {
    await adminPool.query(`delete from public.outbox_events where org_id = $1`, [orgA]);
    await adminPool.query(`delete from public.catch_weight_variance_daily where org_id = $1`, [orgA]);
    await adminPool.query(`delete from public.work_order_items where org_id = $1`, [orgA]);
  }

  it('AC4 — empty work_order_items → graceful no-op (no rows, no error)', async () => {
    await cleanup();
    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );
    expect(summary.itemsProcessed).toBe(0);
    expect(summary.rowsWritten).toBe(0);
    expect(summary.alertsEmitted).toBe(0);
  });

  it('AC1 — avg variance 4% under threshold 5% → no alert', async () => {
    await cleanup();
    await insertWeighings(appPool, adminPool, catchItem, 200, 4, 100);

    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );
    expect(summary.rowsWritten).toBe(1);
    expect(summary.rows[0]!.samples).toBe(100);
    expect(summary.rows[0]!.avgVariancePct).toBeCloseTo(4, 4);
    expect(summary.rows[0]!.alerted).toBe(false);
    expect(summary.alertsEmitted).toBe(0);

    const ev = await adminPool.query(
      `select 1 from public.outbox_events where org_id = $1 and event_type = $2`,
      [orgA, CATCH_WEIGHT_VARIANCE_EVENT],
    );
    expect(ev.rowCount).toBe(0);
  });

  it('AC2 — avg variance 7% over threshold → catch_weight.variance_exceeded with item_id + avg', async () => {
    await cleanup();
    await insertWeighings(appPool, adminPool, catchItem, 200, 7, 30);

    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );
    expect(summary.alertsEmitted).toBe(1);
    expect(summary.rows[0]!.avgVariancePct).toBeCloseTo(7, 4);
    expect(summary.rows[0]!.alerted).toBe(true);

    const ev = await adminPool.query<{ payload: Record<string, unknown> }>(
      `select payload from public.outbox_events
        where org_id = $1 and event_type = $2 and aggregate_id = $3`,
      [orgA, CATCH_WEIGHT_VARIANCE_EVENT, catchItem],
    );
    expect(ev.rowCount).toBe(1);
    expect(ev.rows[0]!.payload.item_id).toBe(catchItem);
    expect(Number(ev.rows[0]!.payload.avg_variance_pct)).toBeCloseTo(7, 4);
  });

  it('AC3 — fixed-weight items are skipped (no rows produced)', async () => {
    await cleanup();
    await insertWeighings(appPool, adminPool, fixedItem, 250, 12, 50);

    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );
    expect(summary.itemsProcessed).toBe(0);
    expect(summary.rowsWritten).toBe(0);

    const rows = await adminPool.query(
      `select 1 from public.catch_weight_variance_daily where org_id = $1 and item_id = $2`,
      [orgA, fixedItem],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('two-site catch-weight item produces separate variance rows per site', async () => {
    await cleanup();
    await insertWeighings(appPool, adminPool, catchItem, 200, 4, 10, siteA);
    await insertWeighings(appPool, adminPool, catchItem, 200, 8, 10, siteB);

    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );

    expect(summary.rowsWritten).toBe(2);
    expect(summary.rows.map((row) => row.siteId).sort()).toEqual([siteA, siteB].sort());

    const persisted = await adminPool.query<{ site_id: string | null }>(
      `select site_id from public.catch_weight_variance_daily
        where org_id = $1 and item_id = $2 and day = $3::date
        order by site_id`,
      [orgA, catchItem, DAY],
    );
    expect(persisted.rowCount).toBe(2);
  });

  it('zero-nominal catch-weight weighings are reported as skipped, not silently omitted', async () => {
    await cleanup();
    await asOrg(appPool, adminPool, orgA, async (c) => {
      await c.query(
        `insert into public.work_order_items
           (org_id, item_id, nominal_weight, actual_weight, captured_at)
         values ($1, $2, 0, 210, $3::timestamptz)`,
        [orgA, zeroNominalItem, `${DAY}T08:00:00Z`],
      );
    });

    const summary = await asOrg(appPool, adminPool, orgA, (c) =>
      computeCatchWeightVarianceForOrg(c, orgA, DAY),
    );

    expect(summary.rowsWritten).toBe(0);
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: zeroNominalItem,
          reason: 'zero_nominal',
        }),
      ]),
    );
  });

  it('cron per-org path (runVarianceForOrg) computes + persists for the org', async () => {
    await cleanup();
    await insertWeighings(appPool, adminPool, catchItem, 200, 7, 10);

    const res = await runVarianceForOrg(adminPool, orgA, DAY);
    expect(res.status).toBe('completed');
    if (res.status === 'completed') {
      expect(res.alertsEmitted).toBe(1);
      expect(res.rowsWritten).toBe(1);
    }

    const persisted = await adminPool.query<{ avg_variance_pct: string; alerted: boolean }>(
      `select avg_variance_pct, alerted from public.catch_weight_variance_daily
        where org_id = $1 and item_id = $2 and day = $3::date`,
      [orgA, catchItem, DAY],
    );
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0]!.alerted).toBe(true);
  });
});
