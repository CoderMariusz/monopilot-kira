/**
 * Static (no-DB) test for migration 032 — per-tenant Reference seed on org
 * INSERT. Verifies the migration file's existence and that load-bearing SQL
 * fragments are present, so a refactor that strips the trigger or backfill
 * fails CI without needing a live Postgres.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '..',
  'migrations',
  '032-reference-seed-on-org-insert.sql',
);

describe('migration 032 — per-tenant Reference seed', () => {
  it('migration file exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('declares the trigger function on public.seed_reference_data_on_org_insert', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.seed_reference_data_on_org_insert/i,
    );
  });

  it('attaches an AFTER INSERT trigger on public.organizations', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/AFTER\s+INSERT\s+ON\s+public\.organizations/i);
    expect(sql).toMatch(/EXECUTE\s+FUNCTION\s+public\.seed_reference_data_on_org_insert/i);
  });

  it('is idempotent — uses ON CONFLICT DO NOTHING for both Reference tables', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    // Two inserts (Departments + ManufacturingOperations) inside the trigger,
    // plus two more inside the backfill block = at least 4 ON CONFLICT clauses.
    const matches = sql.match(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+NOTHING/gi);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('contains a backfill DO $$ block for existing non-Apex orgs', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    // The backfill loops orgs and skips Apex (id <> apex_org_id).
    expect(sql).toMatch(/FOR\s+v_org\s+IN/i);
    expect(sql).toMatch(/<>\s*v_apex_org_id/i);
    // At least two anonymous DO blocks (pre-flight + backfill); the file may
    // have more (this assertion is the lower bound).
    const doBlocks = sql.match(/DO\s+\$\$/gi);
    expect((doBlocks ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('skips self-copy on the Apex org row', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/IF\s+NEW\.id\s*=\s*v_apex_org_id/i);
  });

  it('targets the actual cased table names "Reference"."Departments" and "Reference"."ManufacturingOperations"', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('"Reference"."Departments"');
    expect(sql).toContain('"Reference"."ManufacturingOperations"');
  });

  it('seeds with the canonical Apex org UUID 00000000-0000-0000-0000-000000000002', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('00000000-0000-0000-0000-000000000002');
  });
});
