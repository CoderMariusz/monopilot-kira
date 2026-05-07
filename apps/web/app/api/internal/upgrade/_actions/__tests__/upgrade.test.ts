/**
 * T-039 — Canary upgrade orchestration Server Actions: RED phase tests.
 *
 * Modules under test (do NOT exist yet — RED):
 *   - apps/web/app/api/internal/upgrade/_actions/recordMigrationRun.ts
 *   - apps/web/app/api/internal/upgrade/_actions/advanceCohort.ts
 *
 * RBAC: both Server Actions guarded by system role 'org.platform.admin' (T-014 pattern).
 * Outbox: emits via T-008 helper. Audit: writes via T-009 with retention_class.
 * Tenant FK: T-038 carried no FK to organizations(id); T-039 enforces app-layer.
 *
 * BLOCKER FLAG (documented in T-039.md):
 *   The event types `tenant.migration.run`, `tenant.migration.run.failed`, and
 *   `tenant.cohort.advanced` are NOT in packages/outbox/src/events.enum.ts ALL_EVENTS
 *   nor in the 12-event CHECK constraint of packages/db/migrations/003-outbox.sql.
 *   The implementer MUST extend the EventType enum AND the CHECK constraint
 *   (a new migration adding these event_type values) before these tests can pass.
 *   These tests pin the failure SQLSTATE 23514 path on the current CHECK to prove
 *   the constraint is the gating failure (and to lock in expected event names).
 *
 * Use getOwnerConnection() for setup DDL/seed, getAppConnection() for runtime
 * assertions where applicable. Do not construct raw new Pool(...).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

import { getOwnerConnection } from '../../../../../../../../packages/db/test-utils/test-pool.js';
import {
  EventType,
  ALL_EVENTS,
} from '../../../../../../../../packages/outbox/src/events.enum.js';

// ─── Module-under-test imports (RED — these do NOT exist yet) ───────────────
import { recordMigrationRun } from '../recordMigrationRun.js';
import { advanceCohort } from '../advanceCohort.js';

// ─── env guard ──────────────────────────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

// ─── deterministic IDs ──────────────────────────────────────────────────────
const tenantId       = '11111111-1111-4111-8111-111111111111'; // tenant_migrations.tenant_id (== organization.id app-layer FK)
const platformAdminId = '22222222-2222-4222-8222-222222222222'; // caller WITH org.platform.admin
const nonAdminId     = '33333333-3333-4333-8333-333333333333'; // caller WITHOUT role
const tenantUuidTemplate = (n: number): string =>
  `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;

const COMPONENT = 'rule-engine';

// ─── Helpers ────────────────────────────────────────────────────────────────
function quoteIdentifier(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

async function applyMigrations(owner: pg.Pool): Promise<void> {
  // Ensure app_user exists (test-only password — mirrors existing test fixtures)
  await owner.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password 'app_user_test_password';
      end if;
    end $$;
  `);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, '../../../../../../../../packages/db/migrations');

  const migrations = [
    '001-baseline.sql',
    '002-rls-baseline.sql',
    '003-outbox.sql',
    '004-audit.sql',
    '005-tenant-idp-config.sql',
    '006-app-role.sql',
    '013-tenant-migrations.sql',
    '017-rbac.sql',
  ];

  for (const fname of migrations) {
    const p = resolve(migrationsDir, fname);
    if (existsSync(p)) {
      await owner.query(readFileSync(p, 'utf8'));
    }
  }
}

async function seedOrgAndUsers(owner: pg.Pool): Promise<void> {
  const tenantRowId = '99999999-9999-4999-8999-999999999999';

  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-039 test tenant', 'eu', 'https://t-039.example.test')
     on conflict (id) do nothing`,
    [tenantRowId],
  );

  // tenantId here is BOTH the organization id (app-layer FK target for tenant_migrations)
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-039 Org', 'generic')
     on conflict (id) do nothing`,
    [tenantId, tenantRowId],
  );

  await owner.query(
    `insert into public.users (id, org_id, email) values
       ($1, $2, 'platform-admin@t-039.example'),
       ($3, $2, 'non-admin@t-039.example')
     on conflict (id) do nothing`,
    [platformAdminId, tenantId, nonAdminId],
  );

  // Seed the org.platform.admin system role (T-014 trigger only seeds access/schema admins).
  // This row represents the role the RBAC guard checks; per task spec, the platform-admin
  // role is system-scoped and the guard queries user_roles for it.
  await owner.query(
    `insert into public.roles (org_id, slug, system) values ($1, 'org.platform.admin', true)
     on conflict (org_id, slug) do nothing`,
    [tenantId],
  );

  const { rows } = await owner.query<{ id: string }>(
    `select id from public.roles where org_id = $1 and slug = 'org.platform.admin'`,
    [tenantId],
  );
  const platformRoleId = rows[0]!.id;

  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id) values ($1, $2, $3)
     on conflict do nothing`,
    [platformAdminId, platformRoleId, tenantId],
  );
}

async function resetTenantMigrations(owner: pg.Pool): Promise<void> {
  await owner.query(
    `delete from public.tenant_migrations where component = $1 and tenant_id in (
       select id from public.organizations where id = $2
     )`,
    [COMPONENT, tenantId],
  );
  // Wipe AC3 cohort tenants (they share component=COMPONENT)
  await owner.query(`delete from public.tenant_migrations where component = $1`, [COMPONENT]);
  await owner.query(
    `delete from public.outbox_events where event_type in (
       'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced'
     )`,
  );
  await owner.query(
    `delete from public.audit_events where action in (
       'tenant.migration.run', 'tenant.cohort.advanced'
     )`,
  );
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ AC1 — recordMigrationRun success path                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
runIntegration('AC1 — recordMigrationRun success: bumps current_version + emits outbox', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedOrgAndUsers(owner);
  }, 60_000);

  beforeEach(async () => {
    if (!databaseUrl) return;
    await resetTenantMigrations(owner);
    // Pre-seed: tenant on cohort='canary' status='idle' (per AC1 Given)
    await owner.query(
      `insert into public.tenant_migrations
        (tenant_id, component, current_version, target_version, cohort, status)
       values ($1, $2, 'v1', 'v2', 'canary', 'idle')`,
      [tenantId, COMPONENT],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await owner?.end();
  });

  it('updates tenant_migrations row to current_version=v2, status=succeeded, last_run_at=now()', async () => {
    const before = Date.now();

    const result = await recordMigrationRun({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'succeeded',
    });

    expect(result.success).toBe(true);

    const { rows } = await owner.query<{
      current_version: string;
      status: string;
      last_run_at: Date | null;
      cohort: string;
    }>(
      `select current_version, status, last_run_at, cohort
         from public.tenant_migrations where tenant_id = $1 and component = $2`,
      [tenantId, COMPONENT],
    );

    expect(rows).toHaveLength(1);
    // MUTATION: omit current_version bump → this assertion fails (got 'v1')
    expect(rows[0]!.current_version).toBe('v2');
    expect(rows[0]!.status).toBe('succeeded');
    expect(rows[0]!.cohort).toBe('canary'); // unchanged by recordMigrationRun
    expect(rows[0]!.last_run_at).not.toBeNull();
    expect(rows[0]!.last_run_at!.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('emits outbox tenant.migration.run event with retention_class=operational and payload binding tenant+target', async () => {
    const { rows: before } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where event_type = 'tenant.migration.run'`,
    );
    const beforeCount = parseInt(before[0]!.count, 10);

    await recordMigrationRun({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'succeeded',
    });

    const { rows } = await owner.query<{
      event_type: string;
      org_id: string;
      payload: Record<string, unknown>;
    }>(
      `select event_type, org_id, payload from public.outbox_events
         where event_type = 'tenant.migration.run' order by id desc limit 1`,
    );

    // MUTATION: skip outbox emit → row count delta fails
    const { rows: after } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events where event_type = 'tenant.migration.run'`,
    );
    expect(parseInt(after[0]!.count, 10)).toBe(beforeCount + 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_type).toBe('tenant.migration.run');
    expect(rows[0]!.org_id).toBe(tenantId);
    expect(rows[0]!.payload).toMatchObject({
      component: COMPONENT,
      tenant_id: tenantId,
      target: 'v2',
      status: 'succeeded',
      retention_class: 'operational',
    });
  });

  it('verifies tenant.migration.run is in events.enum.ts ALL_EVENTS (BLOCKER pin)', () => {
    // RED: this fails today — the event is NOT in the 12-event enum.
    // GREEN MUST add EventType.TENANT_MIGRATION_RUN = 'tenant.migration.run' AND extend the
    // CHECK constraint in 003-outbox.sql (or a new migration) before any AC1/AC2/AC3 row can insert.
    expect((ALL_EVENTS as readonly string[])).toContain('tenant.migration.run');
    expect(EventType).toHaveProperty('TENANT_MIGRATION_RUN', 'tenant.migration.run');
  });
});

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ AC2 — recordMigrationRun failure: NO version bump + failure event        ║
// ╚══════════════════════════════════════════════════════════════════════════╝
runIntegration('AC2 — recordMigrationRun failure: NO version bump, failure_reason persisted', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedOrgAndUsers(owner);
  }, 60_000);

  beforeEach(async () => {
    if (!databaseUrl) return;
    await resetTenantMigrations(owner);
    // Pre-record current_version='v1' (canary, idle). Mutation: if the implementer
    // forgets the failure-guard and bumps current_version unconditionally, the
    // 'expect(...current_version).toBe(\'v1\')' line below fails.
    await owner.query(
      `insert into public.tenant_migrations
        (tenant_id, component, current_version, target_version, cohort, status)
       values ($1, $2, 'v1', 'v2', 'canary', 'idle')`,
      [tenantId, COMPONENT],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await owner?.end();
  });

  it('does NOT bump current_version when status=failed', async () => {
    const result = await recordMigrationRun({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'failed',
      failure_reason: 'migration X timeout',
    });

    expect(result.success).toBe(true); // call returned successfully — status persisted

    const { rows } = await owner.query<{
      current_version: string;
      status: string;
      failure_reason: string | null;
    }>(
      `select current_version, status, failure_reason
         from public.tenant_migrations where tenant_id = $1 and component = $2`,
      [tenantId, COMPONENT],
    );

    expect(rows).toHaveLength(1);
    // MUTATION: agent forgets the guard and bumps unconditionally → fails (got 'v2')
    expect(rows[0]!.current_version).toBe('v1');
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.failure_reason).toBe('migration X timeout');
  });

  it('emits outbox tenant.migration.run.failed event carrying failure_reason', async () => {
    await recordMigrationRun({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'failed',
      failure_reason: 'migration X timeout',
    });

    const { rows } = await owner.query<{
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `select event_type, payload from public.outbox_events
         where event_type = 'tenant.migration.run.failed' order by id desc limit 1`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_type).toBe('tenant.migration.run.failed');
    expect(rows[0]!.payload).toMatchObject({
      action: 'tenant.migration.run.failed',
      failure_reason: 'migration X timeout',
      component: COMPONENT,
      tenant_id: tenantId,
    });
  });

  it('outbox CHECK constraint pins SQLSTATE 23514 if event_type is unknown (locks 12-event invariant)', async () => {
    // Verifies the 003-outbox.sql CHECK constraint still rejects unknown event_type values.
    // After GREEN extends the enum + CHECK, this test still passes (the CHECK is broader).
    let captured: { code?: string } | undefined;
    try {
      await owner.query(
        `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1, 'invalid.event.type.never.in.enum', 'tenant', $1, '{}'::jsonb, 'test')`,
        [tenantId],
      );
    } catch (err) {
      captured = err as { code?: string };
    }
    expect(captured?.code).toBe('23514');
  });
});

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ AC3 — advanceCohort: 12 tenants, single-tx atomicity, 15-min window      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
runIntegration('AC3 — advanceCohort: 12 canary→early in one tx, monitor window enforced', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedOrgAndUsers(owner);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await owner?.end();
  });

  async function seedTenants(opts: {
    count: number;
    cohort: string;
    status: string;
    lastRunMinutesAgo: number;
  }): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const tid = tenantUuidTemplate(i + 1);
      ids.push(tid);
      // Every tenant_id must exist in organizations (T-039 app-layer FK).
      // We reuse the tenant row from seedOrgAndUsers and create distinct organizations.
      const tenantRowId = '99999999-9999-4999-8999-999999999999';
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `T-039 Cohort ${i + 1}`],
      );
      await owner.query(
        `insert into public.tenant_migrations
          (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
         values ($1, $2, 'v2', 'v2', $3, $4, now() - ($5 || ' minutes')::interval)
         on conflict (tenant_id, component) do update set
           cohort = excluded.cohort,
           status = excluded.status,
           last_run_at = excluded.last_run_at`,
        [tid, COMPONENT, opts.cohort, opts.status, String(opts.lastRunMinutesAgo)],
      );
    }
    return ids;
  }

  it('flips all 12 canary/succeeded tenants (last_run >16min) to early in ONE transaction + emits 12 outbox events', async () => {
    await resetTenantMigrations(owner);
    const ids = await seedTenants({
      count: 12,
      cohort: 'canary',
      status: 'succeeded',
      lastRunMinutesAgo: 16,
    });

    const result = await advanceCohort({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    expect(result.success).toBe(true);
    expect(result.advancedCount).toBe(12);

    const { rows } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.tenant_migrations
         where component = $1 and cohort = 'early' and tenant_id = any($2::uuid[])`,
      [COMPONENT, ids],
    );
    expect(parseInt(rows[0]!.count, 10)).toBe(12);

    const { rows: outboxRows } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events
         where event_type = 'tenant.cohort.advanced'`,
    );
    expect(parseInt(outboxRows[0]!.count, 10)).toBe(12);

    // MUTATION: skip outbox emit → 0 outbox rows; assertion above fails.
    // MUTATION: skip cohort UPDATE → 0 rows flipped; first assertion fails.
  });

  it('rolls back ALL 12 cohort flips when one update throws (single-transaction atomicity)', async () => {
    await resetTenantMigrations(owner);
    const ids = await seedTenants({
      count: 12,
      cohort: 'canary',
      status: 'succeeded',
      lastRunMinutesAgo: 16,
    });

    // Simulate a poison row: the implementer must wrap all 12 updates in a single
    // BEGIN/COMMIT. We poison via a temporary BEFORE UPDATE trigger that throws on
    // exactly one tenant_id; the trigger is dropped in finally{}.
    const poisonId = ids[5]!;
    await owner.query(`
      create or replace function public.t039_poison_trigger()
      returns trigger language plpgsql as $$
      begin
        if new.tenant_id = '${poisonId}' then
          raise exception 't039 poison row' using errcode = 'P0001';
        end if;
        return new;
      end $$;
    `);
    await owner.query(`
      drop trigger if exists t039_poison_trg on public.tenant_migrations;
      create trigger t039_poison_trg before update on public.tenant_migrations
        for each row execute function public.t039_poison_trigger();
    `);

    let threw = false;
    try {
      await advanceCohort({
        actorUserId: platformAdminId,
        orgId: tenantId,
        component: COMPONENT,
        fromCohort: 'canary',
        toCohort: 'early',
      });
    } catch {
      threw = true;
    } finally {
      await owner.query(`drop trigger if exists t039_poison_trg on public.tenant_migrations;`);
      await owner.query(`drop function if exists public.t039_poison_trigger();`);
    }

    expect(threw).toBe(true);

    // ATOMICITY MUTATION: if implementer wraps each update in its own tx, some flips
    // will have committed → this count > 0 and the assertion fails.
    const { rows } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.tenant_migrations
         where component = $1 and cohort = 'early' and tenant_id = any($2::uuid[])`,
      [COMPONENT, ids],
    );
    expect(parseInt(rows[0]!.count, 10)).toBe(0); // ALL 12 rolled back

    const { rows: outboxRows } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.outbox_events
         where event_type = 'tenant.cohort.advanced'`,
    );
    expect(parseInt(outboxRows[0]!.count, 10)).toBe(0);
  });

  it('does NOT advance tenants whose last_run_at is BELOW the 15-min monitor window (14 min ago)', async () => {
    await resetTenantMigrations(owner);
    // Mix: 5 tenants @ 16 min (eligible), 7 tenants @ 14 min (NOT eligible).
    const eligibleIds: string[] = [];
    const ineligibleIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const tid = tenantUuidTemplate(i + 1);
      eligibleIds.push(tid);
      const tenantRowId = '99999999-9999-4999-8999-999999999999';
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `Eligible ${i + 1}`],
      );
      await owner.query(
        `insert into public.tenant_migrations
          (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
         values ($1, $2, 'v2', 'v2', 'canary', 'succeeded', now() - interval '16 minutes')`,
        [tid, COMPONENT],
      );
    }
    for (let i = 5; i < 12; i++) {
      const tid = tenantUuidTemplate(i + 1);
      ineligibleIds.push(tid);
      const tenantRowId = '99999999-9999-4999-8999-999999999999';
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `Ineligible ${i + 1}`],
      );
      await owner.query(
        `insert into public.tenant_migrations
          (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
         values ($1, $2, 'v2', 'v2', 'canary', 'succeeded', now() - interval '14 minutes')`,
        [tid, COMPONENT],
      );
    }

    const result = await advanceCohort({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    expect(result.advancedCount).toBe(5);

    const { rows: eligible } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.tenant_migrations
         where cohort = 'early' and tenant_id = any($1::uuid[])`,
      [eligibleIds],
    );
    expect(parseInt(eligible[0]!.count, 10)).toBe(5);

    // MUTATION: relax window (`> 15` → `>= 0`) → ineligible flips happen → fails.
    const { rows: ineligible } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.tenant_migrations
         where cohort = 'early' and tenant_id = any($1::uuid[])`,
      [ineligibleIds],
    );
    expect(parseInt(ineligible[0]!.count, 10)).toBe(0);
  });

  it('does NOT advance tenants on canary with status=failed (only succeeded advances)', async () => {
    await resetTenantMigrations(owner);
    // 4 succeeded (eligible), 8 failed (ineligible regardless of window)
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const tid = tenantUuidTemplate(i + 1);
      succeededIds.push(tid);
      const tenantRowId = '99999999-9999-4999-8999-999999999999';
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `Succeeded ${i + 1}`],
      );
      await owner.query(
        `insert into public.tenant_migrations
          (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
         values ($1, $2, 'v2', 'v2', 'canary', 'succeeded', now() - interval '20 minutes')`,
        [tid, COMPONENT],
      );
    }
    for (let i = 4; i < 12; i++) {
      const tid = tenantUuidTemplate(i + 1);
      failedIds.push(tid);
      const tenantRowId = '99999999-9999-4999-8999-999999999999';
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `Failed ${i + 1}`],
      );
      await owner.query(
        `insert into public.tenant_migrations
          (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
         values ($1, $2, 'v2', 'v2', 'canary', 'failed', now() - interval '20 minutes')`,
        [tid, COMPONENT],
      );
    }

    const result = await advanceCohort({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    // MUTATION: drop status filter → 12 advance instead of 4 → fails.
    expect(result.advancedCount).toBe(4);

    const { rows: failedCheck } = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.tenant_migrations
         where cohort = 'early' and tenant_id = any($1::uuid[])`,
      [failedIds],
    );
    expect(parseInt(failedCheck[0]!.count, 10)).toBe(0);
  });

  it('uses fake-timer cutoff @ exactly 15 min boundary (now-14:59 NOT advanced; now-15:00 advanced)', async () => {
    await resetTenantMigrations(owner);
    // Two tenants only — one at 14m59s (NOT advanced), one at 15m1s (advanced).
    const tidNot = tenantUuidTemplate(101);
    const tidYes = tenantUuidTemplate(102);
    const tenantRowId = '99999999-9999-4999-8999-999999999999';
    for (const tid of [tidNot, tidYes]) {
      await owner.query(
        `insert into public.organizations (id, tenant_id, name, industry_code)
         values ($1, $2, $3, 'generic') on conflict (id) do nothing`,
        [tid, tenantRowId, `Boundary ${tid}`],
      );
    }

    // Fixed clock — required by spec to assert deterministic boundary
    const now = new Date('2026-05-07T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await owner.query(
      `insert into public.tenant_migrations
        (tenant_id, component, current_version, target_version, cohort, status, last_run_at)
       values ($1, $2, 'v2', 'v2', 'canary', 'succeeded', now() - interval '14 minutes 59 seconds'),
              ($3, $2, 'v2', 'v2', 'canary', 'succeeded', now() - interval '15 minutes 1 second')`,
      [tidNot, COMPONENT, tidYes],
    );

    const result = await advanceCohort({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    expect(result.advancedCount).toBe(1);

    const { rows: notRows } = await owner.query<{ cohort: string }>(
      `select cohort from public.tenant_migrations where tenant_id = $1 and component = $2`,
      [tidNot, COMPONENT],
    );
    expect(notRows[0]!.cohort).toBe('canary');

    const { rows: yesRows } = await owner.query<{ cohort: string }>(
      `select cohort from public.tenant_migrations where tenant_id = $1 and component = $2`,
      [tidYes, COMPONENT],
    );
    expect(yesRows[0]!.cohort).toBe('early');
  });
});

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ AC4 — RBAC: non-admin caller → 403 + audit_events retention=security     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
runIntegration('AC4 — non-admin caller: 403 + audit row retention_class=security (EXACT MATCH)', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;
    owner = getOwnerConnection();
    await applyMigrations(owner);
    await seedOrgAndUsers(owner);
  }, 60_000);

  beforeEach(async () => {
    if (!databaseUrl) return;
    await resetTenantMigrations(owner);
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    await owner?.end();
  });

  it('recordMigrationRun returns 403 when caller lacks org.platform.admin', async () => {
    const result = await recordMigrationRun({
      actorUserId: nonAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'succeeded',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.error).toBe('forbidden');
  });

  it('recordMigrationRun writes audit_events row with retention_class=security on 403', async () => {
    await recordMigrationRun({
      actorUserId: nonAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'succeeded',
    });

    const { rows } = await owner.query<{
      action: string;
      retention_class: string;
      actor_user_id: string;
      resource_type: string;
    }>(
      `select action, retention_class, actor_user_id, resource_type
         from public.audit_events
         where actor_user_id = $1
           and action in ('tenant.migration.run', 'rbac.denied')
         order by occurred_at desc limit 1`,
      [nonAdminId],
    );

    expect(rows).toHaveLength(1);
    // EXACT MATCH per task spec: retention_class === 'security'
    // MUTATION: writing 'standard'/'operational' → fails the equality check.
    expect(rows[0]!.retention_class).toBe('security');
    expect(rows[0]!.actor_user_id).toBe(nonAdminId);
  });

  it('advanceCohort returns 403 when caller lacks org.platform.admin', async () => {
    const result = await advanceCohort({
      actorUserId: nonAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.error).toBe('forbidden');
  });

  it('advanceCohort writes audit_events row with retention_class=security on 403', async () => {
    await advanceCohort({
      actorUserId: nonAdminId,
      orgId: tenantId,
      component: COMPONENT,
      fromCohort: 'canary',
      toCohort: 'early',
    });

    const { rows } = await owner.query<{ retention_class: string; actor_user_id: string }>(
      `select retention_class, actor_user_id
         from public.audit_events
         where actor_user_id = $1
           and action in ('tenant.cohort.advanced', 'rbac.denied')
         order by occurred_at desc limit 1`,
      [nonAdminId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.retention_class).toBe('security');
    expect(rows[0]!.actor_user_id).toBe(nonAdminId);
  });

  it('grants access for caller WITH org.platform.admin (sanity — RBAC not blocking the happy path)', async () => {
    // Pre-seed a tenant_migrations row so the call path can do real work.
    await owner.query(
      `insert into public.tenant_migrations
        (tenant_id, component, current_version, target_version, cohort, status)
       values ($1, $2, 'v1', 'v2', 'canary', 'idle')
       on conflict (tenant_id, component) do nothing`,
      [tenantId, COMPONENT],
    );

    const result = await recordMigrationRun({
      actorUserId: platformAdminId,
      orgId: tenantId,
      component: COMPONENT,
      tenantId,
      target: 'v2',
      status: 'succeeded',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).not.toBe(403);
  });
});
