/**
 * T-089 AC4 — NPD erasure handler is registered with the foundation
 * `@monopilot/gdpr` registry and driven by the centralized `runErasure`
 * dispatcher (foundation T-113). Module-private erasure paths are forbidden by
 * `_foundation/contracts/gdpr.md`; this proves the reciprocal wire-up.
 *
 * Integration test: requires DATABASE_URL (clone migrated to @109). The NPD
 * erasure migration (115) is applied here so the suite is self-contained.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getRegisteredHandlers, runErasure } from '@monopilot/gdpr';

import { NPD_ERASURE_DOMAIN, registerNpdErasure, runNpdErasure } from '../npd.js';
import { getAppConnection, getOwnerConnection } from '../../../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = resolve(packageRoot, 'migrations/115-npd-gdpr-erasure.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

const tenantId = '89100000-0000-4000-8000-000000000000';
const orgA = '89100000-0000-4000-8000-00000000000a';
const roleA = '89100000-0000-4000-8000-0000000001aa';
const subjectUser = '89100000-0000-4000-8000-0000000000aa';

async function ensureAppUser(pool: pg.Pool): Promise<void> {
  // Only CREATE when absent — never ALTER an existing role: two parallel
  // integration files ALTERing the same pg_authid tuple raise
  // "tuple concurrently updated". The migrated clone already provisions app_user.
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function cleanup(pool: pg.Pool): Promise<void> {
  await pool.query(`delete from public.risks where org_id = $1`, [orgA]);
  await pool.query(`delete from public.product where org_id = $1`, [orgA]);
  await pool.query(
    `delete from public.audit_events where org_id = $1 and resource_type = 'gdpr_erasure'`,
    [orgA],
  );
  await pool.query(`delete from app.session_org_contexts where org_id = $1`, [orgA]);
}

async function seed(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'GDPR NPD Reg Tenant', 'eu', 'https://gdpr-npd-reg.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'GDPR NPD Reg Org', 'bakery')
     on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name`,
    [orgA, tenantId],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'gdpr_npd_reg', 'GDPR NPD Reg Role', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleA, orgA],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'gdpr-reg-subject@example.test', 'GDPR Reg Subject', $3)
     on conflict (id) do update set org_id = excluded.org_id`,
    [subjectUser, orgA, roleA],
  );
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, $3, 1, $4)`,
      [`FA-T089R-${i}`, orgA, `GDPR Reg Product ${i}`, subjectUser],
    );
  }
  await pool.query(
    `insert into public.risks (org_id, product_code, title, description, likelihood, impact, owner_user_id, created_by_user)
     values ($1, 'FA-T089R-1', 'Reg risk', 'Reg risk description long enough', 2, 2, $2, $2)`,
    [orgA, subjectUser],
  );
}

describe('NPD erasure handler registration (AC4)', () => {
  it('exposes the npd domain handler API and registers under domain "npd"', () => {
    expect(NPD_ERASURE_DOMAIN).toBe('npd');
    expect(typeof runNpdErasure).toBe('function');
    expect(typeof registerNpdErasure).toBe('function');

    registerNpdErasure({ force: true });
    expect(getRegisteredHandlers().has('npd')).toBe(true);
  });
});

runIntegrationTest('runErasure drives the NPD handler end-to-end (DATABASE_URL required)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);
    // Apply migration 115 only if absent, serialised across parallel integration
    // files via a DB-level advisory lock (concurrent `create or replace function`
    // + sentinel inserts otherwise raise "tuple concurrently updated").
    const client = await ownerPool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(778900115)');
      const { rows } = await client.query<{ exists: boolean }>(
        `select to_regprocedure('public.gdpr_redact_user_pii(uuid)') is not null as exists`,
      );
      if (!rows[0]?.exists) {
        await client.query(readFileSync(migrationPath, 'utf8'));
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    registerNpdErasure({ force: true });
  });

  beforeEach(async () => {
    await cleanup(ownerPool);
    await seed(ownerPool);
  });

  afterAll(async () => {
    await cleanup(ownerPool).catch(() => undefined);
    await ownerPool.query(`delete from public.users where id = $1`, [subjectUser]).catch(() => undefined);
    await ownerPool.query(`delete from public.roles where id = $1`, [roleA]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgA]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('invokes the npd handler via runErasure, returns rowsAffected, and writes the audit row', async () => {
    const report = await runErasure(ownerPool, appPool, orgA, subjectUser, { domains: ['npd'] });

    const npdResult = report.results.find((r) => r.domain === 'npd');
    expect(npdResult, 'expected an npd domain result in the report').toBeDefined();
    // 3 product + 1 risk (owner+created collapse to 1 row) ⇒ 4 rows affected.
    expect(npdResult!.rowsAffected).toBeGreaterThanOrEqual(4);
    expect(npdResult!.tablesTouched).toContain('public.product');
    expect(report.rowsAffected).toBe(npdResult!.rowsAffected);

    // Foundation framework audit row.
    const framework = await ownerPool.query<{ action: string }>(
      `select action from public.audit_events
        where org_id = $1 and resource_type = 'gdpr_erasure' and action = 'gdpr.erasure.completed'`,
      [orgA],
    );
    expect(framework.rowCount).toBe(1);

    // NPD-specific audit row written by the handler's SQL function.
    const npdAudit = await ownerPool.query<{ resource_id: string }>(
      `select resource_id from public.audit_events
        where org_id = $1 and resource_type = 'gdpr_erasure' and action = 'gdpr.erasure_executed'`,
      [orgA],
    );
    expect(npdAudit.rowCount).toBe(1);
    expect(npdAudit.rows[0]!.resource_id).toBe(subjectUser);

    // Real mutation happened (not dry-run): subject refs are now the placeholder.
    const placeholder = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgA, PLACEHOLDER],
    );
    expect(Number(placeholder.rows[0]!.count)).toBe(3);
  });

  it('dry-run previews rowsAffected but persists no mutation', async () => {
    const report = await runErasure(ownerPool, appPool, orgA, subjectUser, {
      domains: ['npd'],
      dryRun: true,
    });

    const npdResult = report.results.find((r) => r.domain === 'npd');
    expect(npdResult!.rowsAffected).toBeGreaterThanOrEqual(4);

    // No real mutation — subject refs still present, no placeholder rows.
    const stillSubject = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgA, subjectUser],
    );
    expect(Number(stillSubject.rows[0]!.count)).toBe(3);

    const placeholder = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgA, PLACEHOLDER],
    );
    expect(Number(placeholder.rows[0]!.count)).toBe(0);
  });
});
