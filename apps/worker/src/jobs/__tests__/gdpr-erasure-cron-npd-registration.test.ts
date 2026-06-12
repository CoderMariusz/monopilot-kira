/**
 * T-089 (cross-review HIGH-1) — production-boot registration proof.
 *
 * The foundation `runErasure` dispatcher only invokes handlers present in its
 * in-process registry. This suite proves that the REAL production cron path
 * registers the `npd` domain and drives NPD erasure end-to-end using the REAL
 * default `runErasure` runner — WITHOUT this test ever calling
 * `registerNpdErasure`/`registerErasureHandlers` and WITHOUT a mock runner.
 *
 * It runs `registerGdprErasureCron` with NO `erasureRunner` injected, so the cron
 * resolves its default runner via `getDefaultErasureRunner()` — the exact code
 * path that runs in production — which registers the db-owned handlers before
 * resolving `@monopilot/gdpr.runErasure`. The request's `domains_run` must then
 * contain `npd`, proving the wiring is real, not test-only.
 *
 * Integration test: requires DATABASE_URL (clone migrated to @109+, incl. 115).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobRegistry, type Logger } from '../../registry.js';
import { registerGdprErasureCron } from '../gdpr-erasure-cron.js';
import { ownerQueryWithInferredOrgContext } from '../../__tests__/owner-org-context.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? describe : describe.skip;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const erasureMigrationPath = resolve(repoRoot, 'packages/db/migrations/115-npd-gdpr-erasure.sql');

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const tenantId = '89200000-0000-4000-8000-000000000000';
const orgId = '89200000-0000-4000-8000-00000000000a';
const roleId = '89200000-0000-4000-8000-0000000001aa';
const subjectUser = '89200000-0000-4000-8000-0000000000aa';

let ownerPool: pg.Pool | undefined;
let appPool: pg.Pool | undefined;

function createLoggerStub(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function ensureMigration115(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(778900115)');
    const { rows } = await client.query<{ exists: boolean }>(
      `select to_regprocedure('public.gdpr_redact_user_pii(uuid)') is not null as exists`,
    );
    if (!rows[0]?.exists) {
      await client.query(readFileSync(erasureMigrationPath, 'utf8'));
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function cleanup(pool: pg.Pool): Promise<void> {
  await pool.query(`delete from public.gdpr_erasure_requests where org_id = $1`, [orgId]);
  await pool.query(`delete from public.risks where org_id = $1`, [orgId]);
  await pool.query(`delete from public.product where org_id = $1`, [orgId]);
  await pool.query(
    `delete from public.audit_events where org_id = $1 and resource_type = 'gdpr_erasure'`,
    [orgId],
  );
  await pool.query(`delete from app.session_org_contexts where org_id = $1`, [orgId]);
}

async function seed(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'GDPR NPD Cron Tenant', 'eu', 'https://gdpr-npd-cron.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'GDPR NPD Cron Org', 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id`,
    [orgId, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'gdpr_npd_cron', 'GDPR NPD Cron Role', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleId, orgId],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'gdpr-cron-subject@example.test', 'GDPR Cron Subject', $3)
     on conflict (id) do update set org_id = excluded.org_id`,
    [subjectUser, orgId, roleId],
  );
  for (let i = 1; i <= 3; i++) {
    await ownerQueryWithInferredOrgContext(pool,
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, $3, 1, $4)`,
      [`FA-T089C-${i}`, orgId, `GDPR Cron Product ${i}`, subjectUser],
    );
  }
}

async function insertPendingRequest(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.gdpr_erasure_requests (org_id, subject_id, requested_by, status)
     values ($1, $2, $3, 'pending')
     returning id`,
    [orgId, subjectUser, subjectUser],
  );
  return rows[0]!.id;
}

runWithDb('GDPR erasure cron drives NPD via REAL default runErasure (T-089 HIGH-1)', () => {
  beforeAll(async () => {
    const dbClients = (await import(['@monopilot', 'db', 'clients.js'].join('/'))) as {
      getOwnerConnection: () => pg.Pool;
      getAppConnection: () => pg.Pool;
    };
    ownerPool = dbClients.getOwnerConnection();
    appPool = dbClients.getAppConnection();
    await ensureMigration115(ownerPool);
  });

  beforeEach(async () => {
    if (!ownerPool) throw new Error('pool not initialized');
    await cleanup(ownerPool);
    await seed(ownerPool);
  });

  afterAll(async () => {
    if (ownerPool) {
      await cleanup(ownerPool).catch(() => undefined);
      await ownerPool.query(`delete from public.users where id = $1`, [subjectUser]).catch(() => undefined);
      await ownerPool.query(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
      await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
      await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    }
    await appPool?.end();
    await ownerPool?.end();
  });

  it('cron default runner registers npd + drives real erasure → domains_run=[npd]', async () => {
    if (!ownerPool || !appPool) throw new Error('pool not initialized');

    const requestId = await insertPendingRequest(ownerPool);

    // ── Register the cron with NO erasureRunner injected → it resolves the REAL
    //    default runner (getDefaultErasureRunner), which is the exact production
    //    path that registers the db-owned npd handler and then calls
    //    @monopilot/gdpr.runErasure. This test NEVER calls registerNpdErasure().
    const registry = new JobRegistry({ pool: ownerPool, logger: createLoggerStub() });
    registerGdprErasureCron(registry, {
      ownerPool,
      appPool,
      everyMs: 60_000,
      maxPerTick: 5,
    });
    await registry.runOnceForTest('gdpr-erasure-cron');

    // ── The request is done and records the npd domain from the real run.
    const reqRow = await ownerPool.query<{ status: string; domains_run: string[]; last_error: string | null }>(
      `select status, domains_run, last_error from public.gdpr_erasure_requests where id = $1`,
      [requestId],
    );
    expect(reqRow.rows[0]?.last_error).toBeNull();
    expect(reqRow.rows[0]?.status).toBe('done');
    expect(reqRow.rows[0]?.domains_run).toContain('npd');

    // ── Real mutation: subject product rows now point at the anonymisation sentinel.
    const placeholder = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgId, PLACEHOLDER],
    );
    expect(Number(placeholder.rows[0]!.count)).toBe(3);

    // ── NPD handler's SECURITY DEFINER audit row was written by the dispatcher path.
    const npdAudit = await ownerPool.query<{ resource_id: string }>(
      `select resource_id from public.audit_events
        where org_id = $1 and resource_type = 'gdpr_erasure' and action = 'gdpr.erasure_executed'`,
      [orgId],
    );
    expect(npdAudit.rowCount).toBe(1);
    expect(npdAudit.rows[0]?.resource_id).toBe(subjectUser);
  });
});
