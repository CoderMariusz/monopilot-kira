/**
 * T-034 — Schema drift detection daily job (RED phase tests)
 *
 * AC1 (per task JSON):
 *   Given a DeptColumns row references column_key='foo' on a table where
 *   information_schema reports no 'foo' column, when drift-detect runs, then
 *   it returns diff.missing_in_db = ['foo'] AND writes an audit_events row
 *   with action='schema.drift_detected' retention_class='operational'.
 *
 * AC2:
 *   Given DeptColumns and information_schema agree, when drift-detect runs,
 *   then diff is empty and no audit row is written.
 *
 * AC3:
 *   Given the cron route is hit without the internal cron header, when
 *   processed, then it returns 401.
 *
 * Risk red line: audit_events writes MUST use retention_class='operational'.
 *
 * RED expectations:
 *   - Importing '../drift-detect' fails (module does not exist yet).
 *   - Importing the cron route handler from
 *     'apps/web/app/api/internal/cron/drift/route' fails (does not exist yet).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../../..');
const dbPackageRoot = resolve(repoRoot, 'packages/db');
const baselineMigrationPath = resolve(dbPackageRoot, 'migrations/001-baseline.sql');
const rlsBaselineMigrationPath = resolve(dbPackageRoot, 'migrations/002-rls-baseline.sql');
const auditMigrationPath = resolve(dbPackageRoot, 'migrations/004-audit.sql');
const schemaDrivenMigrationPath = resolve(dbPackageRoot, 'migrations/009-schema-driven.sql');

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const runWithDb = hasDatabaseUrl ? it : it.skip;

let dbPool: pg.Pool | null = null;
let dbClient: pg.PoolClient | null = null;
const testOrgId = '99999999-9999-9999-9999-999999999099';
const testDeptCode = 't034_drift_dept';

async function tryReadAndExec(client: pg.PoolClient, path: string): Promise<void> {
  // Migrations are idempotent in this repo; safe to re-apply against a shared
  // test database. We swallow expected errors that arise from re-applying
  // CREATE TYPE / CREATE ROLE statements that were issued in prior runs.
  const sql = readFileSync(path, 'utf-8');
  try {
    await client.query(sql);
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42710 = duplicate_object, 42P07 = duplicate_table
    if (code !== '42710' && code !== '42P07') {
      throw err;
    }
  }
}

beforeAll(async () => {
  if (!hasDatabaseUrl) return;
  dbPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  dbClient = await dbPool.connect();
  await tryReadAndExec(dbClient, baselineMigrationPath);
  await tryReadAndExec(dbClient, rlsBaselineMigrationPath);
  await tryReadAndExec(dbClient, auditMigrationPath);
  await tryReadAndExec(dbClient, schemaDrivenMigrationPath);

  // Ensure org row exists for FK reference.
  await dbClient.query(
    `INSERT INTO public.organizations (id, name)
     VALUES ($1, 't034-org') ON CONFLICT (id) DO NOTHING`,
    [testOrgId],
  );
});

afterAll(async () => {
  if (dbClient) {
    try {
      await dbClient.query(
        `DELETE FROM "Reference"."DeptColumns" WHERE org_id = $1 AND dept_code = $2`,
        [testOrgId, testDeptCode],
      );
      await dbClient.query(
        `DELETE FROM public.audit_events WHERE org_id = $1 AND action = 'schema.drift_detected'`,
        [testOrgId],
      );
      dbClient.release();
    } catch {
      /* ignore */
    }
  }
  if (dbPool) await dbPool.end();
});

beforeEach(async () => {
  if (!dbClient) return;
  // Wipe per-test state inside the test org slice.
  await dbClient.query(
    `DELETE FROM "Reference"."DeptColumns" WHERE org_id = $1 AND dept_code = $2`,
    [testOrgId, testDeptCode],
  );
  await dbClient.query(
    `DELETE FROM public.audit_events WHERE org_id = $1 AND action = 'schema.drift_detected'`,
    [testOrgId],
  );
});

// ---------------------------------------------------------------------------
// RED phase — module imports must fail until GREEN implementation lands.
// ---------------------------------------------------------------------------

describe('T-034 RED: drift-detect module surface', () => {
  it('exports detectDrift() from packages/ops/src/drift-detect.ts', async () => {
    // RED: module does not exist yet — import will throw.
    const mod = await import('../drift-detect');
    expect(typeof mod.detectDrift).toBe('function');
  });

  it('cron route handler exists at apps/web/app/api/internal/cron/drift/route.ts', async () => {
    // RED: route does not exist yet — import will throw.
    const mod = await import(
      // Resolved relative to repo root via packageRoot.
      resolve(repoRoot, 'apps/web/app/api/internal/cron/drift/route.ts')
    );
    // Next.js App Router conventions: GET or POST handler.
    const handler = mod.GET ?? mod.POST;
    expect(typeof handler).toBe('function');
  });

  it('scripts/cron.json declares the /api/internal/cron/drift schedule', () => {
    // RED: file does not exist yet.
    const cronJsonPath = resolve(repoRoot, 'scripts/cron.json');
    const raw = readFileSync(cronJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { crons: Array<{ path: string; schedule: string }> };
    const driftEntry = parsed.crons.find((c) => c.path === '/api/internal/cron/drift');
    expect(driftEntry).toBeDefined();
    expect(driftEntry?.schedule).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC1 — drift detected: missing_in_db populated AND audit row written.
// ---------------------------------------------------------------------------

describe('T-034 AC1: drift detection writes operational audit row', () => {
  runWithDb(
    'returns diff.missing_in_db=["foo"] when DeptColumns references a column absent from the underlying table',
    async () => {
      const { detectDrift } = await import('../drift-detect');

      // Seed DeptColumns row referencing column_key='foo' on a real table
      // (manufacturing_ops.production_runs is created in 012; for RED we use a
      // table guaranteed by 001-baseline: public.organizations) — column 'foo'
      // is not part of organizations, so it is missing in DB.
      await dbClient!.query(
        `INSERT INTO "Reference"."DeptColumns"
           (org_id, dept_code, column_key, field_type, is_required, schema_version)
         VALUES ($1, $2, 'foo', 'string', false, 1)`,
        [testOrgId, testDeptCode],
      );

      const result = await detectDrift({
        orgId: testOrgId,
        // The implementation must map dept_code → physical table; for the
        // RED contract we only require the diff shape and audit emission.
      } as { orgId: string });

      expect(Array.isArray(result.diff?.missing_in_db)).toBe(true);
      expect(result.diff?.missing_in_db).toContain('foo');

      // Audit row written with the exact action + retention class required.
      const audit = await dbClient!.query(
        `SELECT action, retention_class, after_state
           FROM public.audit_events
          WHERE org_id = $1 AND action = 'schema.drift_detected'
          ORDER BY occurred_at DESC LIMIT 1`,
        [testOrgId],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].action).toBe('schema.drift_detected');
      // Risk red line (T-009): retention_class MUST be 'operational'.
      expect(audit.rows[0].retention_class).toBe('operational');
      // Diff stored in after_state as required by spec.
      expect(audit.rows[0].after_state).toBeTruthy();
    },
  );

  runWithDb(
    'mutation: dropping the offending DeptColumns row eliminates missing_in_db entry',
    async () => {
      const { detectDrift } = await import('../drift-detect');

      // No DeptColumns row inserted → diff must NOT contain 'foo'.
      const result = await detectDrift({ orgId: testOrgId } as { orgId: string });
      expect(result.diff?.missing_in_db ?? []).not.toContain('foo');
    },
  );

  runWithDb(
    'audit row PINS SQLSTATE 23514 if a non-operational retention_class is attempted (taxonomy guard)',
    async () => {
      // Direct DB-level guard: the audit_events_retention_class_check
      // CHECK constraint must reject any value outside the allowed set.
      // This pins the contract that drift-detect cannot bypass T-009.
      let sqlstate: string | undefined;
      try {
        await dbClient!.query(
          `INSERT INTO public.audit_events
             (org_id, action, resource_type, resource_id, request_id, retention_class)
           VALUES ($1, 'schema.drift_detected', 'reference.dept_columns',
                   'drift-test', $2, 'bogus_class')`,
          [testOrgId, randomUUID()],
        );
      } catch (err) {
        sqlstate = (err as { code?: string }).code;
      }
      expect(sqlstate).toBe('23514');
    },
  );
});

// ---------------------------------------------------------------------------
// AC2 — no drift: diff empty AND no audit row written.
// ---------------------------------------------------------------------------

describe('T-034 AC2: no drift → no audit row', () => {
  runWithDb(
    'when DeptColumns and information_schema agree, diff is empty and no audit row is written',
    async () => {
      const { detectDrift } = await import('../drift-detect');

      // No DeptColumns rows for this org/dept ⇒ trivially in agreement.
      // Stronger: insert a row whose column_key matches a real column on the
      // chosen physical table (e.g. organizations.id) — but the simplest
      // RED contract is "zero rows ⇒ zero diff".
      const before = await dbClient!.query(
        `SELECT count(*)::int AS c FROM public.audit_events
          WHERE org_id = $1 AND action = 'schema.drift_detected'`,
        [testOrgId],
      );
      const beforeCount = before.rows[0].c as number;

      const result = await detectDrift({ orgId: testOrgId } as { orgId: string });

      // Diff must be empty in every dimension.
      expect(result.diff?.missing_in_db ?? []).toEqual([]);
      expect(result.diff?.extra_in_db ?? []).toEqual([]);
      expect(result.diff?.type_mismatch ?? []).toEqual([]);

      const after = await dbClient!.query(
        `SELECT count(*)::int AS c FROM public.audit_events
          WHERE org_id = $1 AND action = 'schema.drift_detected'`,
        [testOrgId],
      );
      expect(after.rows[0].c).toBe(beforeCount);
    },
  );
});

// ---------------------------------------------------------------------------
// AC3 — cron route auth: 401 without internal cron header.
// ---------------------------------------------------------------------------

describe('T-034 AC3: cron route requires internal cron header', () => {
  it('returns 401 when the cron route is hit without the internal cron header', async () => {
    const mod = await import(
      resolve(repoRoot, 'apps/web/app/api/internal/cron/drift/route.ts')
    );
    const handler = (mod.GET ?? mod.POST) as (req: Request) => Promise<Response>;
    expect(typeof handler).toBe('function');

    const req = new Request('http://localhost/api/internal/cron/drift', {
      method: 'GET',
      // Intentionally no x-vercel-cron / authorization header.
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('mutation: presenting the correct cron header yields a non-401 response', async () => {
    const mod = await import(
      resolve(repoRoot, 'apps/web/app/api/internal/cron/drift/route.ts')
    );
    const handler = (mod.GET ?? mod.POST) as (req: Request) => Promise<Response>;
    const req = new Request('http://localhost/api/internal/cron/drift', {
      method: 'GET',
      headers: {
        // Vercel cron sends `x-vercel-cron: 1`; CRON_SECRET is the recommended
        // shared-secret pattern for the internal route. Implementer chooses
        // exactly one — this test asserts ANY valid signal lifts the 401.
        'x-vercel-cron': '1',
        authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-cron-secret'}`,
      },
    });
    const res = await handler(req);
    expect(res.status).not.toBe(401);
  });
});
