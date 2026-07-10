/**
 * T-054 — Raw-SQL migration runner
 *
 * Reads migrations/*.sql, validates filenames match /^(\d{3})-[a-z0-9-]+\.sql$/,
 * sorts by the numeric prefix, applies each pending migration inside a transaction,
 * and records state in public.schema_migrations(filename, applied_at, checksum).
 *
 * Idempotent: a second run is a no-op (already-applied rows are skipped).
 * Checksum mismatch on a previously-applied file is a hard error by default.
 * --dry-run flag lists pending without applying.
 *
 * Uses getOwnerConnection() (DATABASE_URL or DATABASE_URL_OWNER) — never superuser
 * beyond what the owner role already is; no drizzle-kit involvement.
 *
 * --------------------------------------------------------------------
 * CHECKSUM DRIFT BYPASS — MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR
 * --------------------------------------------------------------------
 * Some environments (e.g. existing DBs that went through drizzle-kit push)
 * may have recorded a checksum for an already-applied migration that no
 * longer matches the file on disk (e.g. 017-rbac.sql). By default the
 * runner treats this as a hard error to prevent accidental edits.
 *
 * To acknowledge a known drift and allow the runner to update the stored
 * checksum to the current file hash, set:
 *
 *   MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR=017-rbac.sql
 *
 * Multiple filenames are comma-separated:
 *
 *   MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR=017-rbac.sql,018-password-history.sql
 *
 * When a filename appears in this list:
 *   1. A warning is emitted (never silent).
 *   2. The stored checksum in schema_migrations is updated to the current
 *      file hash so subsequent runs are clean.
 *   3. The migration is NOT re-applied — the SQL is NOT executed again.
 *
 * Remove the env var once all target environments have been updated.
 * --------------------------------------------------------------------
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { getOwnerConnection } from '../src/clients.js';

const VALID_FILENAME = /^(\d{3})-[a-z0-9-]+\.sql$/;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = resolve(packageRoot, 'migrations');

const isDryRun = process.argv.includes('--dry-run');

// Filenames for which a checksum drift is acknowledged via env var.
// Set MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR=017-rbac.sql (comma-separated) to enable.
const allowChecksumDriftFor = new Set<string>(
  (process.env['MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function numericPrefix(filename: string): number {
  const match = filename.match(/^(\d+)/);
  if (!match) throw new Error(`Cannot extract numeric prefix from: ${filename}`);
  return parseInt(match[1], 10);
}

async function run(): Promise<void> {
  // 1. Discover and validate migration files
  const allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  const invalid = allFiles.filter((f) => !VALID_FILENAME.test(f));
  if (invalid.length > 0) {
    throw new Error(
      `Migration runner startup error: the following migration files do not match the ` +
        `required NNN-name.sql convention (3-digit numeric prefix, lowercase dash-separated name):\n` +
        invalid.map((f) => `  - ${f}`).join('\n') +
        `\n\nRename these files before running the migration runner.`,
    );
  }

  // 2. Sort by numeric prefix, then filename for deterministic ordering when prefixes collide.
  const migrationFiles = allFiles.slice().sort((a, b) => {
    const prefixDiff = numericPrefix(a) - numericPrefix(b);
    return prefixDiff !== 0 ? prefixDiff : a.localeCompare(b);
  });

  // 3. Connect to the database
  const pool: pg.Pool = getOwnerConnection();
  const client = await pool.connect();

  try {
    // 4. Create schema_migrations table if absent
    await client.query(`
      create table if not exists public.schema_migrations (
        filename   text        primary key,
        applied_at timestamptz not null default now(),
        checksum   text        not null
      );
    `);

    // 5. Load already-applied migrations
    const { rows: appliedRows } = await client.query<{ filename: string; checksum: string }>(
      `select filename, checksum from public.schema_migrations order by filename`,
    );
    const applied = new Map<string, string>(appliedRows.map((r) => [r.filename, r.checksum]));

    // 6. Process each migration
    let pendingCount = 0;
    let appliedCount = 0;

    for (const file of migrationFiles) {
      const filePath = resolve(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf8');
      const checksum = sha256(sql);

      if (applied.has(file)) {
        // Checksum mismatch detection — editing an applied migration is a hard error
        const storedChecksum = applied.get(file)!;
        if (storedChecksum !== checksum) {
          if (allowChecksumDriftFor.has(file)) {
            // Env-gated bypass: update stored checksum and continue without re-applying.
            console.warn(
              `[migrate] checksum drift acknowledged for: ${file}\n` +
                `  Stored checksum : ${storedChecksum}\n` +
                `  Current checksum: ${checksum}\n` +
                `  Updating schema_migrations record. The migration will NOT be re-applied.`,
            );
            if (!isDryRun) {
              await client.query(
                `update public.schema_migrations set checksum = $1 where filename = $2`,
                [checksum, file],
              );
            }
          } else {
            throw new Error(
              `CHECKSUM MISMATCH on already-applied migration: ${file}\n` +
                `  Stored checksum : ${storedChecksum}\n` +
                `  Current checksum: ${checksum}\n` +
                `Applied migrations must never be edited. Create a new migration instead.\n` +
                `If this drift is intentional (e.g. drizzle-kit push on an existing DB), set:\n` +
                `  MIGRATE_ALLOW_CHECKSUM_DRIFT_FOR=${file}`,
            );
          }
        } else {
          console.log(`  already applied: ${file}`);
        }
        appliedCount++;
        continue;
      }

      pendingCount++;

      if (isDryRun) {
        console.log(`  [dry-run] pending : ${file}`);
        continue;
      }

      // Apply inside a transaction
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          `insert into public.schema_migrations (filename, checksum) values ($1, $2)`,
          [file, checksum],
        );
        await client.query('commit');
        console.log(`  applied          : ${file}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(
          `Migration failed: ${file}\n${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 7. Summary
    if (isDryRun) {
      console.log(
        `\n[dry-run] ${pendingCount} pending, ${appliedCount} already applied. No changes made.`,
      );
    } else {
      console.log(
        `\nDone: ${pendingCount} applied, ${appliedCount} already applied (skipped).`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration runner error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
