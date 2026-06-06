/**
 * T-089 — NPD GDPR right-to-erasure migration contract + behaviour.
 *
 * Covers AC1 (per-table pseudonymisation counts), AC2 (audit_events row), and
 * org-scoping + idempotency for the SECURITY DEFINER function
 * `public.gdpr_redact_user_pii(target_user_id uuid)` shipped by migration
 * 115-npd-gdpr-erasure.sql.
 *
 * Integration test: requires DATABASE_URL pointing at a clone already migrated
 * to @109. The migration under test (115) is applied here against the owner
 * pool so the suite is self-contained.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/115-npd-gdpr-erasure.sql');
// NPD pivot Phase 2C (mig 243) drops the standalone brief tables and re-points the
// erasure function so it no longer touches public.brief. We apply 243 on top of 115
// so this contract reflects the production function body (no brief block).
const dropBriefMigrationPath = resolve(packageRoot, 'migrations/243-drop-brief-tables.sql');

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

// Deterministic UUIDs for this suite (prefix 89… avoids collisions with other suites).
const tenantId = '89000000-0000-4000-8000-000000000000';
const orgA = '89000000-0000-4000-8000-00000000000a';
const orgB = '89000000-0000-4000-8000-00000000000b';
const roleA = '89000000-0000-4000-8000-0000000001aa';
const roleB = '89000000-0000-4000-8000-0000000001bb';
const subjectUser = '89000000-0000-4000-8000-0000000000aa'; // the GDPR subject (org A)
const otherUser = '89000000-0000-4000-8000-0000000000ab'; // another org-A user, must NOT be redacted
const orgBUser = '89000000-0000-4000-8000-0000000000bb'; // org B user referencing same subject? no — cross-org isolation guard

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

async function applyMigration(pool: pg.Pool): Promise<void> {
  const sql = readFileSync(migrationPath, 'utf8');
  // Mig 243 re-points the function (removes the brief block) + drops the brief tables.
  // Apply it after 115 so the function reflects production. Both are idempotent.
  const dropBriefSql = readFileSync(dropBriefMigrationPath, 'utf8');
  // Serialise concurrent applies across parallel integration test files — two
  // simultaneous `create or replace function` on the same object can deadlock.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(778900115)');
    // Always (re)apply: the migration is fully idempotent (ON CONFLICT sentinel
    // inserts + `create or replace function`), so re-running it picks up function
    // body changes (e.g. the prod_detail count branch) on clones where 115 was
    // already applied by the migration runner.
    await client.query(sql);
    await client.query(dropBriefSql);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function cleanup(pool: pg.Pool): Promise<void> {
  // Children first (FK order), scoped to the test orgs.
  for (const table of [
    'gate_approvals',
    'gate_checklist_items',
    'formulations',
    'compliance_docs',
    'risks',
    'npd_projects',
    'product',
  ]) {
    await pool.query(`delete from public.${table} where org_id = any($1::uuid[])`, [[orgA, orgB]]);
  }
  await pool.query(
    `delete from public.audit_events where org_id = any($1::uuid[]) and resource_type = 'gdpr_erasure'`,
    [[orgA, orgB]],
  );
  await pool.query(`delete from app.session_org_contexts where org_id = any($1::uuid[])`, [[orgA, orgB]]);
}

async function seed(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'GDPR NPD Test Tenant', 'eu', 'https://gdpr-npd.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'GDPR NPD Org A', 'bakery'), ($3, $2, 'GDPR NPD Org B', 'fmcg')
     on conflict (id) do update set tenant_id = excluded.tenant_id, name = excluded.name`,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `insert into public.roles (id, org_id, code, name, permissions, is_system)
     values ($1, $2, 'gdpr_npd_user', 'GDPR NPD Role A', '[]'::jsonb, true),
            ($3, $4, 'gdpr_npd_user', 'GDPR NPD Role B', '[]'::jsonb, true)
     on conflict (org_id, code) do update set name = excluded.name`,
    [roleA, orgA, roleB, orgB],
  );
  await pool.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 'gdpr-subject@example.test', 'GDPR Subject', $3),
            ($4, $2, 'gdpr-other@example.test', 'GDPR Other', $3),
            ($5, $6, 'gdpr-orgb@example.test', 'GDPR Org B', $7)
     on conflict (id) do update set org_id = excluded.org_id, email = excluded.email`,
    [subjectUser, orgA, roleA, otherUser, orgBUser, orgB, roleB],
  );

  // ---- org A: 3 product rows created_by subject (AC1: fa) ----
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
       values ($1, $2, $3, 1, $4)`,
      [`FA-T089-A${i}`, orgA, `GDPR Product A${i}`, subjectUser],
    );
  }
  // one product created by the OTHER user — must be left untouched
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, $3, 1, $4)`,
    ['FA-T089-AOTHER', orgA, 'GDPR Product Other', otherUser],
  );

  // ---- org A: 2 risks owned by subject (AC1: risks) ----
  for (let i = 1; i <= 2; i++) {
    await pool.query(
      `insert into public.risks (org_id, product_code, title, description, likelihood, impact, owner_user_id, created_by_user)
       values ($1, $2, $3, $4, 2, 2, $5, $5)`,
      [orgA, 'FA-T089-A1', `Risk A${i} title`, `Risk A${i} description long enough`, subjectUser],
    );
  }

  // ---- org A: npd_project + dependent gate/formulation rows ----
  const projectA = randomUUID();
  await pool.query(
    `insert into public.npd_projects (id, org_id, code, name, type, created_by_user)
     values ($1, $2, 'NPD-T089-A', 'GDPR NPD Project A', 'standard', $3)`,
    [projectA, orgA, subjectUser],
  );
  await pool.query(
    `insert into public.gate_checklist_items (org_id, project_id, gate_code, category_code, item_text, completed_by_user)
     values ($1, $2, 'G0', 'technical', 'Checklist item text', $3)`,
    [orgA, projectA, subjectUser],
  );
  await pool.query(
    `insert into public.gate_approvals (org_id, project_id, gate_code, decision, approver_user_id)
     values ($1, $2, 'G0', 'approved', $3)`,
    [orgA, projectA, subjectUser],
  );
  await pool.query(
    `insert into public.formulations (org_id, project_id, product_code, created_by_user, locked_by_user)
     values ($1, $2, 'FA-T089-A1', $3, $3)`,
    [orgA, projectA, subjectUser],
  );

  // ---- org A: compliance_docs ----
  // (brief insert removed — mig 243 dropped the standalone brief tables; the brief is
  //  now merged into npd_projects, covered by the npd_projects pseudonymisation block.)
  await pool.query(
    `insert into public.compliance_docs
       (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, uploaded_by_user, created_by_user)
     values ($1, 'FA-T089-A1', 'CoA', 'GDPR doc', '/x/doc.pdf', 'application/pdf', 1024, $2, $2)`,
    [orgA, subjectUser],
  );

  // ---- org B: product created by the SAME subject UUID value (cross-org isolation guard) ----
  // org B references orgBUser, but we also create a product in org B whose created_by_user is the
  // subject's UUID to prove the function only redacts within the active org context.
  await pool.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, $3, 1, $4)`,
    ['FA-T089-BX', orgB, 'GDPR Product B cross', subjectUser],
  );
}

/**
 * Runs gdpr_redact_user_pii under an app-role transaction with org context set
 * for `orgId` — exactly how the foundation dispatcher invokes the NPD handler.
 */
async function runRedactAsApp(
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  orgId: string,
  targetUserId: string,
): Promise<Record<string, number>> {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1, $2)`,
    [sessionToken, orgId],
  );
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const res = await client.query<{ counts: Record<string, number> }>(
      'select public.gdpr_redact_user_pii($1::uuid) as counts',
      [targetUserId],
    );
    await client.query('commit');
    return res.rows[0]!.counts;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await ownerPool
      .query(`delete from app.session_org_contexts where session_token = $1`, [sessionToken])
      .catch(() => undefined);
  }
}

describe('115 NPD GDPR erasure migration contract', () => {
  it('exists and is org-scoped, pseudonymises (not deletes), and is SECURITY DEFINER', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/115-npd-gdpr-erasure.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/create or replace function public\.gdpr_redact_user_pii/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/app\.current_org_id\(\)/);
    expect(sql).toMatch(/00000000-0000-0000-0000-000000000000/);
    expect(sql).toMatch(/gdpr\.erasure_executed/);
    // prod_detail is a named erasure scope and must appear as a counts key.
    expect(sql).toMatch(/jsonb_build_object\('prod_detail'/);
    // Wave0 lock — org-scoping must use app.current_org_id(), never the stale spoofable GUC.
    // (tenant_id is legitimate ONLY on the organizations↔tenants FK, never for org scoping.)
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
    expect(sql).not.toMatch(/where[\s\S]{0,40}\btenant_id\b\s*=/i);
    // must never DELETE business rows
    expect(sql).not.toMatch(/delete\s+from\s+public\.(product|risks|brief|formulations|compliance_docs|npd_projects|gate_)/i);
  });
});

runIntegrationTest('115 NPD GDPR erasure behaviour (DATABASE_URL required)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);
    await applyMigration(ownerPool);
  });

  beforeEach(async () => {
    await cleanup(ownerPool);
    await seed(ownerPool);
  });

  afterAll(async () => {
    await cleanup(ownerPool).catch(() => undefined);
    await ownerPool.query(`delete from public.users where id = any($1::uuid[])`, [[subjectUser, otherUser, orgBUser]]).catch(() => undefined);
    await ownerPool.query(`delete from public.roles where id = any($1::uuid[])`, [[roleA, roleB]]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = any($1::uuid[])`, [[orgA, orgB]]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('AC1: pseudonymises subject FK refs to the placeholder UUID and returns per-table counts', async () => {
    const counts = await runRedactAsApp(ownerPool, appPool, orgA, subjectUser);

    // AC1 exact: fa (product) 3 rows, risks 2 rows.
    expect(counts.product).toBe(3);
    expect(counts.risks).toBe(2);
    // full coverage of the other NPD tables (1 row each)
    expect(counts.npd_projects).toBe(1);
    expect(counts.gate_checklist_items).toBe(1);
    expect(counts.gate_approvals).toBe(1);
    expect(counts.formulations).toBe(1);
    // brief count key removed in mig 243 (standalone brief tables dropped).
    expect(counts).not.toHaveProperty('brief');
    expect(counts.compliance_docs).toBe(1);
    // prod_detail is in the named erasure scope but has no user-FK yet → always 0,
    // but the key MUST be present so the contract scope is provably covered.
    expect(counts).toHaveProperty('prod_detail');
    expect(counts.prod_detail).toBe(0);

    // All subject refs in org A now point to the placeholder.
    const remaining = await ownerPool.query<{ count: string }>(
      `select (
         (select count(*) from public.product where org_id = $1 and created_by_user = $2)
       + (select count(*) from public.risks where org_id = $1 and (owner_user_id = $2 or created_by_user = $2 or closed_by_user = $2))
       + (select count(*) from public.npd_projects where org_id = $1 and created_by_user = $2)
       + (select count(*) from public.gate_checklist_items where org_id = $1 and completed_by_user = $2)
       + (select count(*) from public.gate_approvals where org_id = $1 and approver_user_id = $2)
       + (select count(*) from public.formulations where org_id = $1 and (created_by_user = $2 or locked_by_user = $2))
       + (select count(*) from public.compliance_docs where org_id = $1 and (uploaded_by_user = $2 or created_by_user = $2))
       )::text as count`,
      [orgA, subjectUser],
    );
    expect(Number(remaining.rows[0]!.count)).toBe(0);

    // Placeholder now present on the AC1 product rows.
    const placeholderProducts = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgA, PLACEHOLDER],
    );
    expect(Number(placeholderProducts.rows[0]!.count)).toBe(3);

    // No business rows were deleted (pseudonymise, not delete).
    const productTotal = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1`,
      [orgA],
    );
    expect(Number(productTotal.rows[0]!.count)).toBe(4); // 3 subject + 1 other

    // The OTHER user's product is untouched.
    const otherProduct = await ownerPool.query<{ created_by_user: string }>(
      `select created_by_user from public.product where product_code = 'FA-T089-AOTHER'`,
    );
    expect(otherProduct.rows[0]!.created_by_user).toBe(otherUser);
  });

  it('AC2: writes a gdpr.erasure_executed audit_events row with target_user_id + counts', async () => {
    await runRedactAsApp(ownerPool, appPool, orgA, subjectUser);

    const rows = await ownerPool.query<{
      action: string;
      resource_id: string;
      after_state: Record<string, unknown>;
      retention_class: string;
    }>(
      `select action, resource_id, after_state, retention_class
         from public.audit_events
        where org_id = $1 and resource_type = 'gdpr_erasure' and action = 'gdpr.erasure_executed'
        order by occurred_at desc, id desc`,
      [orgA],
    );
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
    const row = rows.rows[0]!;
    expect(row.resource_id).toBe(subjectUser);
    expect(row.retention_class).toBe('security');
    expect(row.after_state).toMatchObject({ target_user_id: subjectUser });
    const counts = (row.after_state as { counts?: Record<string, number> }).counts;
    expect(counts).toBeDefined();
    expect(counts!.product).toBe(3);
    expect(counts!.risks).toBe(2);
  });

  it('org-scoped: a run for org A does NOT touch org B rows referencing the same subject UUID', async () => {
    await runRedactAsApp(ownerPool, appPool, orgA, subjectUser);

    const orgBProduct = await ownerPool.query<{ created_by_user: string }>(
      `select created_by_user from public.product where product_code = 'FA-T089-BX'`,
    );
    // org B's row still references the original subject UUID (untouched by an org-A erasure).
    expect(orgBProduct.rows[0]!.created_by_user).toBe(subjectUser);
  });

  it('idempotent: a second run returns zero counts and leaves rows at the placeholder', async () => {
    await runRedactAsApp(ownerPool, appPool, orgA, subjectUser);
    const second = await runRedactAsApp(ownerPool, appPool, orgA, subjectUser);

    expect(second.product).toBe(0);
    expect(second.risks).toBe(0);
    expect(second.npd_projects).toBe(0);

    const placeholderProducts = await ownerPool.query<{ count: string }>(
      `select count(*)::text as count from public.product where org_id = $1 and created_by_user = $2`,
      [orgA, PLACEHOLDER],
    );
    expect(Number(placeholderProducts.rows[0]!.count)).toBe(3);
  });
});
