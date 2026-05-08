/**
 * FT-011 — Static tests for migration 033-consumed-approval-tokens.sql.
 *
 * These tests assert the migration file exists with the exact shape grantRole
 * relies on. They run with no DB connection — they are pure file-content
 * assertions. The integration semantics (INSERT-then-replay) are covered in
 * packages/rbac/src/__tests__/grant.test.ts.
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
  '033-consumed-approval-tokens.sql',
);

describe('FT-011 migration 033 — consumed_approval_tokens schema', () => {
  it('migration file 033-consumed-approval-tokens.sql exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('declares the consumed_approval_tokens table', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // CREATE TABLE [IF NOT EXISTS] public.consumed_approval_tokens
    expect(sql).toMatch(
      /CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.consumed_approval_tokens/i,
    );
  });

  it('jti is uuid PRIMARY KEY (single-use token id, no NULLs allowed)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // Mutation-proof: pin both the type AND the PK constraint on the same column.
    expect(sql).toMatch(/jti\s+uuid\s+PRIMARY KEY/i);
  });

  it('org_id is uuid NOT NULL REFERENCES organizations(id) (FK to org tenant)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/org_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.organizations\s*\(\s*id\s*\)/i);
  });

  it('declares an index on (org_id, consumed_at) for the audit-prune sweep', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // Either CREATE INDEX or CREATE INDEX IF NOT EXISTS — both must mention
    // the (org_id, consumed_at) tuple in that order so the prune cron can
    // do a simple range scan per org.
    expect(sql).toMatch(
      /CREATE INDEX\s+(IF NOT EXISTS\s+)?[\w_]+\s+ON\s+public\.consumed_approval_tokens\s*\(\s*org_id\s*,\s*consumed_at\s*\)/i,
    );
  });

  it('revokes app_user privileges (owner-only access to jti values)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // jti values are sensitive — knowing one is sufficient for the replay
    // attack we guard against. app_user must never be able to read this table.
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.consumed_approval_tokens\s+FROM\s+app_user/i);
  });
});
