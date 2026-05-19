import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

type RoleCategoryRow = {
  role_code: string;
  ui_category: 'admin' | 'manager' | 'operator' | 'viewer';
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');
const roleCategoriesSeedPath = resolve(packageRoot, 'seeds/role-categories.sql');

const expectedRoleCategories: RoleCategoryRow[] = [
  { role_code: 'admin', ui_category: 'admin' },
  { role_code: 'auditor', ui_category: 'viewer' },
  { role_code: 'module_admin', ui_category: 'manager' },
  { role_code: 'npd_manager', ui_category: 'manager' },
  { role_code: 'owner', ui_category: 'admin' },
  { role_code: 'planner', ui_category: 'manager' },
  { role_code: 'production_lead', ui_category: 'manager' },
  { role_code: 'quality_lead', ui_category: 'manager' },
  { role_code: 'viewer', ui_category: 'viewer' },
  { role_code: 'warehouse_operator', ui_category: 'operator' },
];

function roleCategoryMigrationPaths() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => resolve(migrationsDir, file))
    .filter((filePath) => readFileSync(filePath, 'utf8').includes('role_categories'))
    .sort();
}

async function applySqlFile(pool: pg.Pool, path: string) {
  await pool.query(readFileSync(path, 'utf8'));
}

describe('T-091 role_categories reference seed', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_OWNER) {
      throw new Error('DATABASE_URL or DATABASE_URL_OWNER must be set for role_categories integration tests');
    }

    pool = getOwnerConnection();
    await pool.query('drop table if exists public.role_categories cascade');

    const migrations = roleCategoryMigrationPaths();
    for (const migrationPath of migrations) {
      await applySqlFile(pool, migrationPath);
      await applySqlFile(pool, migrationPath);
    }
  });

  afterAll(async () => {
    await pool?.query('drop table if exists public.role_categories cascade').catch(() => undefined);
    await pool?.end();
  });

  it('creates the role_categories table with the required schema and ui_category CHECK', async () => {
    const table = await pool.query<{ table_regclass: string | null }>(
      "select to_regclass('public.role_categories')::text as table_regclass",
    );
    expect(table.rows[0]?.table_regclass, 'role_categories table must exist after the T-091 migration runs').toBe(
      'role_categories',
    );

    const columns = await pool.query<{ column_name: string; data_type: string; is_nullable: 'YES' | 'NO' }>(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'role_categories'
       order by ordinal_position`,
    );
    expect(columns.rows).toEqual([
      { column_name: 'role_code', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'ui_category', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'color_hint', data_type: 'text', is_nullable: 'YES' },
    ]);

    const constraints = await pool.query<{ contype: string; definition: string }>(
      `select c.contype, pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       where c.conrelid = 'public.role_categories'::regclass
       order by c.contype, c.conname`,
    );
    expect(
      constraints.rows.some((row) => row.contype === 'p' && /PRIMARY KEY \(role_code\)/i.test(row.definition)),
      'role_code must be the primary key',
    ).toBe(true);
    const checkDefinitions = constraints.rows.filter((row) => row.contype === 'c').map((row) => row.definition).join('\n');
    for (const category of ['admin', 'manager', 'operator', 'viewer']) {
      expect(checkDefinitions, `ui_category CHECK must include ${category}`).toContain(category);
    }
  });

  it('seeds exactly the 10 PRD §3 system role category rows', async () => {
    const result = await pool.query<RoleCategoryRow>(
      `select role_code, ui_category
       from public.role_categories
       order by role_code`,
    );

    expect(result.rows).toEqual(expectedRoleCategories);
    expect(result.rows).toHaveLength(10);
    expect(result.rows.filter((row) => row.ui_category === 'admin')).toHaveLength(2);
    expect(result.rows.filter((row) => row.ui_category === 'manager')).toHaveLength(5);
    expect(result.rows.filter((row) => row.ui_category === 'operator')).toHaveLength(1);
    expect(result.rows.filter((row) => row.ui_category === 'viewer')).toHaveLength(2);
  });

  it('rejects categories outside admin, manager, operator, viewer', async () => {
    let error: unknown;
    try {
      await pool.query(
        `insert into public.role_categories (role_code, ui_category, color_hint)
         values ('bad_role', 'superuser', 'black')`,
      );
    } catch (caught) {
      error = caught;
    }

    expect((error as { code?: string } | undefined)?.code, 'invalid ui_category must fail the CHECK constraint').toBe(
      '23514',
    );
  });

  it('can re-run the seed file without creating duplicates', async () => {
    await applySqlFile(pool, roleCategoriesSeedPath);
    await applySqlFile(pool, roleCategoriesSeedPath);

    const count = await pool.query<{ count: string }>('select count(*)::text as count from public.role_categories');
    expect(count.rows[0]?.count).toBe('10');

    const duplicates = await pool.query<{ role_code: string; copies: string }>(
      `select role_code, count(*)::text as copies
       from public.role_categories
       group by role_code
       having count(*) > 1`,
    );
    expect(duplicates.rows).toEqual([]);
  });

  it('has a discoverable T-091 migration file for the table and seed', () => {
    const migrations = roleCategoryMigrationPaths().map((filePath) => basename(filePath));
    expect(migrations, 'a new migration must create and seed public.role_categories').not.toHaveLength(0);
  });
});
