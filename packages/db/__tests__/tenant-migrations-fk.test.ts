import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getOwnerConnection } from '../test-utils/test-pool.js';

// Integration tests run against the already-migrated DB (orchestrator applies
// migrations 001..062 incl. this FK restore). We do NOT replay a migration
// subset into an isolated schema — that diverges from the real cumulative
// schema. Mutations are wrapped in BEGIN/ROLLBACK so nothing persists.
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;
const runIntegrationTest = hasDatabaseUrl ? it : it.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fkRestoreMigrationPath = 'migrations/062-tenant-migrations-fk-restore.sql';

type ConstraintRow = { constraint_name: string; definition: string };

let pool: pg.Pool | undefined;
let dbClient: pg.PoolClient | undefined;

async function listFkConstraints(client: pg.PoolClient): Promise<ConstraintRow[]> {
  const result = await client.query<ConstraintRow>(
    `select c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_class tc on tc.oid = c.conrelid
       join pg_namespace tn on tn.oid = tc.relnamespace
      where tn.nspname = 'public'
        and tc.relname = 'tenant_migrations_legacy_t038'
        and c.contype = 'f'
        and c.conname = 'tenant_migrations_tenant_id_fkey'`,
  );
  return result.rows;
}

describe('tenant_migrations legacy tenant_id FK migration contract', () => {
  it('defines the FK restore migration with ON DELETE RESTRICT and no cascade', () => {
    const migrationSql = readFileSync(resolve(packageRoot, fkRestoreMigrationPath), 'utf8');
    expect(migrationSql).toMatch(/tenant_migrations_tenant_id_fkey/i);
    expect(migrationSql).toMatch(
      /foreign key\s*\(\s*tenant_id\s*\)\s*references\s+public\.tenants\s*\(\s*id\s*\)\s*on delete restrict/i,
    );
    expect(migrationSql).not.toMatch(/on delete cascade/i);
  });
});

runIntegrationSuite('tenant_migrations legacy tenant_id foreign key restore (real schema)', () => {
  beforeAll(async () => {
    pool = getOwnerConnection();
    dbClient = await pool.connect();
  });

  afterAll(async () => {
    dbClient?.release();
    if (pool) await pool.end();
  });

  runIntegrationTest('FK tenant_id → tenants(id) exists with ON DELETE RESTRICT', async () => {
    const rows = await listFkConstraints(dbClient!);
    expect(rows).toEqual([
      expect.objectContaining({
        constraint_name: 'tenant_migrations_tenant_id_fkey',
        definition: expect.stringMatching(
          /^FOREIGN KEY \(tenant_id\) REFERENCES .*tenants\(id\) ON DELETE RESTRICT$/,
        ),
      }),
    ]);
  });

  runIntegrationTest('no orphan legacy rows remain after the restore', async () => {
    const result = await dbClient!.query<{ orphan_count: string }>(
      `select count(*)::text as orphan_count
         from public.tenant_migrations_legacy_t038 tm
         left join public.tenants t on t.id = tm.tenant_id
        where t.id is null`,
    );
    expect(result.rows[0]?.orphan_count).toBe('0');
  });

  runIntegrationTest('accepts valid tenant_id, rejects orphan with 23503 (rolled back)', async () => {
    const validTenantId = randomUUID();
    const orphanTenantId = randomUUID();
    try {
      await dbClient!.query('BEGIN');
      await dbClient!.query(
        `insert into public.tenants (id, name, data_plane_url) values ($1, 'fk-test', 'https://dp.test')`,
        [validTenantId],
      );
      await expect(
        dbClient!.query(
          `insert into public.tenant_migrations_legacy_t038 (tenant_id, component, current_version, target_version)
           values ($1, 'settings', '1.0.0', '1.1.0')`,
          [validTenantId],
        ),
      ).resolves.toBeDefined();
      await expect(
        dbClient!.query(
          `insert into public.tenant_migrations_legacy_t038 (tenant_id, component, current_version, target_version)
           values ($1, 'settings', '1.0.0', '1.1.0')`,
          [orphanTenantId],
        ),
      ).rejects.toMatchObject({ code: '23503', constraint: 'tenant_migrations_tenant_id_fkey' });
    } finally {
      await dbClient!.query('ROLLBACK');
    }
  });

  runIntegrationTest('prevents deleting a referenced tenant with 23503 (rolled back)', async () => {
    const tenantId = randomUUID();
    try {
      await dbClient!.query('BEGIN');
      await dbClient!.query(
        `insert into public.tenants (id, name, data_plane_url) values ($1, 'del-restrict', 'https://dp.test')`,
        [tenantId],
      );
      await dbClient!.query(
        `insert into public.tenant_migrations_legacy_t038 (tenant_id, component, current_version, target_version)
         values ($1, 'rules', '1.0.0', '1.1.0')`,
        [tenantId],
      );
      await expect(
        dbClient!.query(`delete from public.tenants where id = $1`, [tenantId]),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await dbClient!.query('ROLLBACK');
    }
  });
});
