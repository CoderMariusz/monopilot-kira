/**
 * T-085 — dept_column_drafts partial unique active-draft index.
 *
 * DB assertions skip cleanly without DATABASE_URL. When DATABASE_URL is present,
 * the test applies the prerequisite migrations plus 059 idempotently, then pins
 * the unique violation SQLSTATE for duplicate active drafts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  packageRoot,
  'migrations/059-dept-column-drafts-unique.sql',
);

const prerequisiteMigrationPaths = [
  'migrations/000-app-user-role.sql',
  'migrations/001-baseline.sql',
  'migrations/002-rls-baseline.sql',
  'migrations/022-dept-column-drafts.sql',
  'migrations/059-dept-column-drafts-unique.sql',
].map((path) => resolve(packageRoot, path));

describe('059 dept_column_drafts active-draft unique index — static contract', () => {
  it('migration file exists at the assigned path', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('creates a partial unique index only for draft rows', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+dept_column_drafts_active_draft_uq\s+on\s+public\.dept_column_drafts\s*\(\s*org_id\s*,\s*dept_id\s*,\s*column_key\s*\)\s+where\s+status\s*=\s*'draft'/i,
    );
  });
});

runIntegrationSuite('059 dept_column_drafts active-draft unique index — Postgres', () => {
  let pool: pg.Pool;
  const tenantId = randomUUID();
  const orgId = randomUUID();
  const createdBy = randomUUID();
  const deptId = randomUUID();
  const columnKey = `t085_${randomUUID()}`;

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    pool = getOwnerConnection();

    for (const path of prerequisiteMigrationPaths) {
      await pool.query(readFileSync(path, 'utf8'));
    }

    await pool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-085 Tenant', 'eu', 'https://t085.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await pool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-085 Org', 'generic')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );
  });

  afterAll(async () => {
    if (!pool) return;

    await pool.query(
      `delete from public.dept_column_drafts where org_id = $1`,
      [orgId],
    ).catch(() => undefined);

    await pool.query(
      `delete from public.organizations where id = $1`,
      [orgId],
    ).catch(() => undefined);

    await pool.query(
      `delete from public.tenants where id = $1`,
      [tenantId],
    ).catch(() => undefined);

    await pool.end();
  });

  runIntegrationTest('AC1: duplicate draft rows for the same org/dept/column raise SQLSTATE 23505', async () => {
    await insertDeptColumnDraft({
      pool,
      orgId,
      deptId,
      columnKey,
      createdBy,
      status: 'draft',
    });

    await expect(
      insertDeptColumnDraft({
        pool,
        orgId,
        deptId,
        columnKey,
        createdBy,
        status: 'draft',
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  runIntegrationTest('AC2: one draft and one published row for the same org/dept/column both succeed', async () => {
    const nonDraftColumnKey = `${columnKey}_published`;

    await insertDeptColumnDraft({
      pool,
      orgId,
      deptId,
      columnKey: nonDraftColumnKey,
      createdBy,
      status: 'draft',
    });

    await insertDeptColumnDraft({
      pool,
      orgId,
      deptId,
      columnKey: nonDraftColumnKey,
      createdBy,
      status: 'published',
    });

    const result = await pool.query<{ status: string }>(
      `select status
       from public.dept_column_drafts
       where org_id = $1 and dept_id = $2 and column_key = $3
       order by status`,
      [orgId, deptId, nonDraftColumnKey],
    );

    expect(result.rows.map((row) => row.status)).toEqual(['draft', 'published']);
  });
});

async function insertDeptColumnDraft({
  pool,
  orgId,
  deptId,
  columnKey,
  createdBy,
  status,
}: {
  pool: pg.Pool;
  orgId: string;
  deptId: string;
  columnKey: string;
  createdBy: string;
  status: 'draft' | 'published';
}): Promise<void> {
  await pool.query(
    `insert into public.dept_column_drafts (
       org_id,
       dept_id,
       column_key,
       field_type,
       created_by,
       status
     )
     values ($1, $2, $3, 'string', $4, $5)`,
    [orgId, deptId, columnKey, createdBy, status],
  );
}
