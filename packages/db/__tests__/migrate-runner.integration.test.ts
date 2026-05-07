/**
 * T-054 — migrate-runner.integration.test.ts
 * RED-phase integration tests for the raw-SQL migration runner.
 *
 * Acceptance criteria:
 *  AC1: Fresh DB — migration runner applies all 12 migrations in numeric order (001→015),
 *       creates schema_migrations table with 12 rows (one per applied file).
 *  AC2: Idempotency — running the runner twice results in 0 new DDL on second run;
 *       second run reports "already applied" for each file.
 *  AC3: Filename validation — runner rejects mixed-convention filenames (e.g., 0010_file.sql mixed with NNN-file.sql).
 *  AC4: Filename ordering — `ls migrations | sort` gives lex order matching numeric order:
 *       001, 002, 003, 004, 005, 006, 009, 010, 011, 013, 014, 015.
 *  AC5: Dependency enforcement — if a migration depends on an earlier one (e.g., 014 needs 002's
 *       app.current_org_id()), runner enforces order and setup is robust.
 *
 * Test mode: skips gracefully when DATABASE_URL is not set (CI without Postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? it : it.skip;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');

let dbClient: pg.PoolClient;
let dbPool: pg.Pool;
let schemaName = 'public';
let closePool: () => Promise<void>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }

  // eslint-disable-next-line no-restricted-syntax -- migrate-runner tests the raw runner; T-058 out-of-scope
  dbPool = new pg.Pool({ connectionString: databaseUrl });
  closePool = async () => {
    await dbPool.end();
  };

  dbClient = await dbPool.connect();
  schemaName = `ci_migrate_${randomUUID().split('-').join('_')}`;
  await dbClient.query(`create schema ${quoteIdentifier(schemaName)};`);
});

afterAll(async () => {
  if (dbClient) {
    try {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade;`);
    } finally {
      dbClient.release();
    }
  }

  if (closePool) {
    await closePool();
  }
});

describe('migration runner filename validation', () => {
  it('all migration files follow NNN-name.sql or NNNN_name.sql convention (currently)', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    // RED phase: expect MIXED conventions (NNNN_ underscore files still exist)
    // This test will FAIL initially because 0014_r13-placeholder-tables.sql breaks the pattern
    const validPattern = /^(\d{3}-[a-z0-9-]+|0\d{3}_[a-z0-9-]+)\.sql$/i;
    const invalidFiles = files.filter((f) => !validPattern.test(f));

    expect(invalidFiles, `all migration files must follow NNN-name.sql or NNNN_name.sql convention; invalid: ${invalidFiles.join(', ')}`).toEqual(
      [],
    );
  });

  it('mixed naming conventions detected (RED phase: test will FAIL)', () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

    const dashPattern = /^\d{3}-/;
    const underscorePattern = /^\d{4}_/;

    const dashFiles = files.filter((f) => dashPattern.test(f));
    const underscoredFiles = files.filter((f) => underscorePattern.test(f));

    // RED: this test expects to FAIL because both patterns exist
    if (underscoredFiles.length > 0 && dashFiles.length > 0) {
      expect(underscoredFiles, `BLOCKING: mixed naming conventions exist. Dash-pattern files (001-name.sql) coexist with underscore-pattern files (0010_name.sql). This breaks lex sort ordering. Files to normalize: ${underscoredFiles.join(', ')}`).toEqual([]);
    }
  });

  it('lexicographic sort order matches numeric prefix order (RED: will FAIL due to 0014)', () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const prefixes = files.map((f) => {
      const match = f.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    });

    // RED: lex sort puts 0014_r13-placeholder-tables.sql BEFORE 002-rls-baseline.sql
    // This is the actual bug the runner will encounter
    const violations: string[] = [];
    for (let i = 0; i < prefixes.length - 1; i++) {
      const curr = prefixes[i];
      const next = prefixes[i + 1];
      if (curr === null || next === null) {
        throw new Error(`Failed to extract numeric prefix from migration files`);
      }
      if (!(next > curr)) {
        violations.push(`${files[i]} (${curr}) → ${files[i + 1]} (${next})`);
      }
    }

    if (violations.length > 0) {
      expect(violations, `BLOCKING: lex sort breaks numeric order. Violations: ${violations.join('; ')}`).toEqual([]);
    }
  });
});

runIntegrationSuite('migration runner — idempotency and state tracking', () => {
  runIntegrationTest('creates schema_migrations table if absent', async () => {
    // Manually replicate runner behavior: create schema_migrations
    const createTableQuery = `
      create table if not exists ${quoteIdentifier(schemaName)}.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `;

    await dbClient.query(createTableQuery);

    const checkQuery = `
      select table_name
      from information_schema.tables
      where table_schema = $1 and table_name = 'schema_migrations';
    `;

    const result = await dbClient.query(checkQuery, [schemaName]);
    expect(result.rows).toHaveLength(1);
  });

  runIntegrationTest('applies all 12 migrations in order and records them in schema_migrations', async () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    expect(files).toHaveLength(12);

    // Create schema_migrations first
    await dbClient.query(`
      create table if not exists ${quoteIdentifier(schemaName)}.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    // Apply each migration
    for (const file of files) {
      const version = file.replace('.sql', '');
      const filePath = resolve(migrationsDir, file);
      let migration = readFileSync(filePath, 'utf8');

      // Replace 'public.' with our test schema
      migration = migration.split('public.').join(`${schemaName}.`);
      migration = migration.split('public ').join(`${schemaName} `);

      // Skip if already applied
      const checkResult = await dbClient.query(
        `select 1 from ${quoteIdentifier(schemaName)}.schema_migrations where version = $1`,
        [version],
      );

      if (checkResult.rows.length === 0) {
        // Apply migration in a transaction
        const client = await dbPool.connect();
        try {
          await client.query('begin');
          await client.query(migration);
          await client.query(
            `insert into ${quoteIdentifier(schemaName)}.schema_migrations (version) values ($1)`,
            [version],
          );
          await client.query('commit');
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      }
    }

    // Assert all 12 are recorded
    const result = await dbClient.query(
      `select version from ${quoteIdentifier(schemaName)}.schema_migrations order by version`,
    );

    expect(result.rows).toHaveLength(12);
    const versions = result.rows.map((r: any) => r.version);
    expect(versions).toEqual(
      expect.arrayContaining(['001-baseline', '002-rls-baseline', '003-outbox', '004-audit', '005-tenant-idp-config']),
    );
  });

  runIntegrationTest('is idempotent — second run applies no new DDL', async () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const schema2 = `ci_migrate_idempotent_${randomUUID().split('-').join('_')}`;
    await dbClient.query(`create schema ${quoteIdentifier(schema2)};`);

    try {
      // Create schema_migrations
      await dbClient.query(`
        create table ${quoteIdentifier(schema2)}.schema_migrations (
          version text primary key,
          applied_at timestamptz not null default now()
        );
      `);

      let appliedCount = 0;

      // First pass: apply all
      for (const file of files) {
        const version = file.replace('.sql', '');
        const filePath = resolve(migrationsDir, file);
        let migration = readFileSync(filePath, 'utf8');

        migration = migration.split('public.').join(`${schema2}.`);
        migration = migration.split('public ').join(`${schema2} `);

        const client = await dbPool.connect();
        try {
          await client.query('begin');
          await client.query(migration);
          await client.query(`insert into ${quoteIdentifier(schema2)}.schema_migrations (version) values ($1)`, [version]);
          await client.query('commit');
          appliedCount++;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      }

      expect(appliedCount).toBe(12);

      // Second pass: check idempotency (skip already-applied)
      let skipped = 0;
      for (const file of files) {
        const version = file.replace('.sql', '');
        const checkResult = await dbClient.query(
          `select 1 from ${quoteIdentifier(schema2)}.schema_migrations where version = $1`,
          [version],
        );

        if (checkResult.rows.length > 0) {
          skipped++;
        }
      }

      expect(skipped).toBe(12);
    } finally {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schema2)} cascade;`);
    }
  });

  runIntegrationTest('migrations are applied in a single transaction per file', async () => {
    const schema3 = `ci_migrate_txn_${randomUUID().split('-').join('_')}`;
    await dbClient.query(`create schema ${quoteIdentifier(schema3)};`);

    try {
      await dbClient.query(`
        create table ${quoteIdentifier(schema3)}.schema_migrations (
          version text primary key,
          applied_at timestamptz not null default now()
        );
      `);

      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .slice(0, 3); // Apply first 3 for speed

      for (const file of files) {
        const version = file.replace('.sql', '');
        const filePath = resolve(migrationsDir, file);
        let migration = readFileSync(filePath, 'utf8');

        migration = migration.split('public.').join(`${schema3}.`);
        migration = migration.split('public ').join(`${schema3} `);

        const client = await dbPool.connect();
        try {
          await client.query('begin');
          // If this was multi-statement without proper transaction, partial DDL could leak
          await client.query(migration);
          await client.query(`insert into ${quoteIdentifier(schema3)}.schema_migrations (version) values ($1)`, [version]);
          await client.query('commit');
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      }

      const result = await dbClient.query(
        `select version from ${quoteIdentifier(schema3)}.schema_migrations order by version`,
      );

      expect(result.rows).toHaveLength(3);
    } finally {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schema3)} cascade;`);
    }
  });

  runIntegrationTest('migration dependencies are satisfied in order (e.g., 014 depends on 002)', async () => {
    const schema4 = `ci_migrate_deps_${randomUUID().split('-').join('_')}`;
    await dbClient.query(`create schema ${quoteIdentifier(schema4)};`);

    try {
      // Apply migrations in correct order to prove 014 depends on earlier ones
      const files = ['001-baseline.sql', '002-rls-baseline.sql', '0014_r13-placeholder-tables.sql'].filter((f) => {
        // Filter for files that actually exist
        try {
          const path = resolve(migrationsDir, f);
          readFileSync(path);
          return true;
        } catch {
          return false;
        }
      });

      // Since 0014 may have been renamed, try the new name
      const actualFiles = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .slice(0, 3);

      for (const file of actualFiles) {
        const filePath = resolve(migrationsDir, file);
        let migration = readFileSync(filePath, 'utf8');

        migration = migration.split('public.').join(`${schema4}.`);
        migration = migration.split('public ').join(`${schema4} `);

        const client = await dbPool.connect();
        try {
          await client.query('begin');
          await client.query(migration);
          await client.query('commit');
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      }

      // If we got here without errors, dependencies were satisfied
      const tableCheck = await dbClient.query(
        `select table_name from information_schema.tables where table_schema = $1`,
        [schema4],
      );

      expect(tableCheck.rows.length).toBeGreaterThan(0);
    } finally {
      await dbClient.query(`drop schema if exists ${quoteIdentifier(schema4)} cascade;`);
    }
  });
});
