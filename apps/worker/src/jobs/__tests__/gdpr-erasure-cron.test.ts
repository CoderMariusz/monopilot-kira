import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobRegistry, type Logger } from '../../registry.js';
import { registerGdprErasureCron, type ErasureRunner } from '../gdpr-erasure-cron.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? describe : describe.skip;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const migrationPath = resolve(repoRoot, 'packages/db/migrations/057-gdpr-erasure-requests.sql');

const tenantId = '11400000-0000-4000-8000-000000000001';
const orgId = '11400000-0000-4000-8000-000000000114';
const requestedBy = '11400000-0000-4000-8000-000000000999';

let ownerPool: pg.Pool | undefined;

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createRegistry(pool: pg.Pool, erasureRunner: ErasureRunner, maxPerTick = 5): JobRegistry {
  const registry = new JobRegistry({ pool, logger: createLoggerStub() });
  registerGdprErasureCron(registry, {
    ownerPool: pool,
    appPool: pool,
    erasureRunner,
    everyMs: 60_000,
    maxPerTick,
  });
  return registry;
}

async function applyMigration057(pool: pg.Pool): Promise<void> {
  await pool.query(readFileSync(migrationPath, 'utf8'));
}

async function seedTestOrg(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO public.tenants (id, name, region_cluster, data_plane_url)
     VALUES ($1::uuid, 'T-114 Worker Tenant', 'eu', 'https://t114-worker.example.test')
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           region_cluster = EXCLUDED.region_cluster,
           data_plane_url = EXCLUDED.data_plane_url`,
    [tenantId],
  );
  await pool.query(
    `INSERT INTO public.organizations (id, tenant_id, name, industry_code)
     VALUES ($1::uuid, $2::uuid, 'T-114 Worker Org', 'generic')
     ON CONFLICT (id) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           industry_code = EXCLUDED.industry_code`,
    [orgId, tenantId],
  );
}

async function cleanupRequests(pool: pg.Pool): Promise<void> {
  await pool.query(`DELETE FROM public.gdpr_erasure_requests WHERE org_id = $1::uuid`, [orgId]);
}

async function insertRequest(
  pool: pg.Pool,
  values: { subjectId?: string; status?: 'pending' | 'running' | 'done' | 'failed' } = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.gdpr_erasure_requests (org_id, subject_id, requested_by, status)
     VALUES ($1::uuid, $2, $3::uuid, $4)
     RETURNING id`,
    [orgId, values.subjectId ?? `subject:${randomUUID()}`, requestedBy, values.status ?? 'pending'],
  );
  return result.rows[0].id;
}

async function requestRows(pool: pg.Pool): Promise<
  Array<{
    id: string;
    subject_id: string;
    status: string;
    domains_run: string[];
    last_error: string | null;
    started_at: Date | null;
    processed_at: Date | null;
  }>
> {
  const result = await pool.query(
    `SELECT id, subject_id, status, domains_run, last_error, started_at, processed_at
     FROM public.gdpr_erasure_requests
     WHERE org_id = $1::uuid
     ORDER BY requested_at, id`,
    [orgId],
  );
  return result.rows;
}

describe('migration 057 — GDPR erasure requests contract', () => {
  it('defines an org-scoped RLS table using app.current_org_id()', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create table if not exists public\.gdpr_erasure_requests/i);
    expect(migration).toMatch(/org_id uuid not null/i);
    expect(migration).toMatch(/subject_id text not null/i);
    expect(migration).toMatch(/status text not null default 'pending'/i);
    expect(migration).toMatch(/check \(status in \('pending', 'running', 'done', 'failed'\)\)/i);
    expect(migration).toMatch(/domains_run text\[\] not null default '\{\}'::text\[\]/i);
    expect(migration).toMatch(/alter table public\.gdpr_erasure_requests force row level security/i);
    expect(migration).toMatch(/using \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/with check \(org_id = app\.current_org_id\(\)\)/i);
    expect(migration).toMatch(/grant select, insert, update on public\.gdpr_erasure_requests to app_user/i);
    expect(migration).not.toMatch(/\btenant_id\b/i);
    expect(migration).not.toMatch(/current_setting/i);
  });
});

runWithDb('GDPR erasure cron integration (skipped unless DATABASE_URL is set)', () => {
  beforeAll(async () => {
    const dbClients = (await import(['@monopilot', 'db', 'clients.js'].join('/'))) as {
      getOwnerConnection: () => pg.Pool;
    };
    ownerPool = dbClients.getOwnerConnection();
    await applyMigration057(ownerPool);
    await seedTestOrg(ownerPool);
  });

  beforeEach(async () => {
    if (!ownerPool) throw new Error('database pool not initialized');
    await cleanupRequests(ownerPool);
  });

  afterAll(async () => {
    if (!ownerPool) return;

    await cleanupRequests(ownerPool);
    await ownerPool.query(`DELETE FROM public.organizations WHERE id = $1::uuid`, [orgId]);
    await ownerPool.query(`DELETE FROM public.tenants WHERE id = $1::uuid`, [tenantId]);
    await ownerPool.end();
  });

  it('creates the expected columns, forced RLS, and org-context policy', async () => {
    if (!ownerPool) throw new Error('database pool not initialized');

    const columns = await ownerPool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'gdpr_erasure_requests'`,
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      'created_at',
      'domains_run',
      'id',
      'last_error',
      'org_id',
      'processed_at',
      'requested_at',
      'requested_by',
      'started_at',
      'status',
      'subject_id',
      'updated_at',
    ]);

    const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE oid = 'public.gdpr_erasure_requests'::regclass`,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const policy = await ownerPool.query<{ qual: string; with_check: string }>(
      `SELECT qual, with_check
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'gdpr_erasure_requests'
         AND policyname = 'gdpr_erasure_requests_org_context'`,
    );
    expect(policy.rows[0]?.qual).toContain('app.current_org_id()');
    expect(policy.rows[0]?.with_check).toContain('app.current_org_id()');
  });

  it('marks a pending request running before completing it and records all domains', async () => {
    if (!ownerPool) throw new Error('database pool not initialized');

    const subjectId = `subject:${randomUUID()}`;
    await insertRequest(ownerPool, { subjectId });
    const erasureRunner = vi.fn<ErasureRunner>(async (owner, _app, receivedOrgId, receivedSubjectId) => {
      const visibleDuringRun = await owner.query<{ status: string }>(
        `SELECT status
         FROM public.gdpr_erasure_requests
         WHERE org_id = $1::uuid
           AND subject_id = $2`,
        [receivedOrgId, receivedSubjectId],
      );
      expect(visibleDuringRun.rows[0]?.status).toBe('running');

      return {
        orgId: receivedOrgId,
        subjectId: receivedSubjectId,
        reason: 'gdpr-rtbf',
        dryRun: false,
        rowsAffected: 2,
        tablesTouched: ['public.people', 'public.orders'],
        warnings: [],
        results: [
          { domain: 'people', rowsAffected: 1, tablesTouched: ['public.people'], warnings: [] },
          { domain: 'orders', rowsAffected: 1, tablesTouched: ['public.orders'], warnings: [] },
        ],
      };
    });

    const registry = createRegistry(ownerPool, erasureRunner);
    await registry.runOnceForTest('gdpr-erasure-cron');

    const rows = await requestRows(ownerPool);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_id: subjectId,
      status: 'done',
      domains_run: ['people', 'orders'],
      last_error: null,
    });
    expect(rows[0]?.started_at).toBeInstanceOf(Date);
    expect(rows[0]?.processed_at).toBeInstanceOf(Date);
    expect(erasureRunner).toHaveBeenCalledTimes(1);
  });

  it('marks a request failed and preserves last_error when the erasure runner throws', async () => {
    if (!ownerPool) throw new Error('database pool not initialized');

    await insertRequest(ownerPool);
    const erasureRunner = vi.fn<ErasureRunner>(async () => {
      throw new Error('registered handler failed');
    });

    const registry = createRegistry(ownerPool, erasureRunner);
    await registry.runOnceForTest('gdpr-erasure-cron');

    const rows = await requestRows(ownerPool);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.last_error).toContain('registered handler failed');
    expect(rows[0]?.processed_at).toBeInstanceOf(Date);
    expect(erasureRunner).toHaveBeenCalledTimes(1);
  });

  it('processes up to maxPerTick pending rows and does not reprocess crashed running rows', async () => {
    if (!ownerPool) throw new Error('database pool not initialized');

    const pendingA = await insertRequest(ownerPool);
    const pendingB = await insertRequest(ownerPool);
    const crashedRunning = await insertRequest(ownerPool, { status: 'running' });
    const erasureRunner = vi.fn<ErasureRunner>(async (owner, _app, receivedOrgId, receivedSubjectId) => {
      await owner.query(
        `SELECT 1
         FROM public.gdpr_erasure_requests
         WHERE org_id = $1::uuid
           AND subject_id = $2
           AND status = 'running'`,
        [receivedOrgId, receivedSubjectId],
      );

      return {
        orgId: receivedOrgId,
        subjectId: receivedSubjectId,
        reason: 'gdpr-rtbf',
        dryRun: false,
        rowsAffected: 1,
        tablesTouched: ['public.test'],
        warnings: [],
        results: [
          { domain: 'test', rowsAffected: 1, tablesTouched: ['public.test'], warnings: [] },
        ],
      };
    });

    const registry = createRegistry(ownerPool, erasureRunner, 5);
    await registry.runOnceForTest('gdpr-erasure-cron');

    const rowsById = new Map((await requestRows(ownerPool)).map((row) => [row.id, row]));
    expect(rowsById.get(pendingA)?.status).toBe('done');
    expect(rowsById.get(pendingB)?.status).toBe('done');
    expect(rowsById.get(crashedRunning)?.status).toBe('running');
    expect(erasureRunner).toHaveBeenCalledTimes(2);
  });
});
