/**
 * Slot F-4 — Static tests for migration 034-approval-token-prune-cron.sql.
 *
 * No DB connection — pure file-content assertions, mirroring the style of
 * consumed-approval-tokens.test.ts (033). These tests pin the contract that
 * migration 034 (a) defines `prune_consumed_approval_tokens`, (b) deletes
 * the right age window, and (c) wraps cron.schedule in a pg_extension guard
 * so the migration is a no-op on Postgres images without pg_cron.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '..',
  'migrations',
  '034-approval-token-prune-cron.sql',
);

describe('Slot F-4 migration 034 — approval token prune cron', () => {
  it('migration file 034-approval-token-prune-cron.sql exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('declares prune_consumed_approval_tokens() function', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.prune_consumed_approval_tokens\s*\(\s*\)/i,
    );
  });

  it('prune body deletes rows where consumed_at is older than 30 days', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // Pin the exact age predicate — protects against accidental change to
    // the retention window, which is a security/compliance contract.
    expect(sql).toMatch(/consumed_at\s*<\s*now\s*\(\s*\)\s*-\s*interval\s*'30 days'/i);
    expect(sql).toMatch(/DELETE\s+FROM\s+public\.consumed_approval_tokens/i);
  });

  it('schedules the prune via pg_cron at 03:00 UTC daily', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/cron\.schedule\s*\(/i);
    // Cron expression "0 3 * * *" — daily at 03:00.
    expect(sql).toMatch(/'0\s+3\s+\*\s+\*\s+\*'/);
  });

  it('wraps cron.schedule in a pg_extension guard so migration is no-op without pg_cron', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // The DO $$ ... IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') ... END $$
    // pattern is the pinned shape; assert each piece independently so the
    // test remains robust to formatting tweaks.
    expect(sql).toMatch(/pg_extension/i);
    expect(sql).toMatch(/extname\s*=\s*'pg_cron'/i);
    expect(sql).toMatch(/DO\s+\$\$/i);
  });
});
