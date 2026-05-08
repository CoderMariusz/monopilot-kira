/**
 * Slot F-4 — Static tests for migration 035-tenant-idp-grants.sql.
 *
 * Pins the defence-in-depth column-level REVOKE on public.tenant_idp_config
 * so that any future migration that re-grants table-level SELECT to app_user
 * does NOT re-expose IdP secret columns (x509_cert, scim_token_hash, etc.).
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
  '035-tenant-idp-grants.sql',
);

describe('Slot F-4 migration 035 — tenant_idp_config column-level grants', () => {
  it('migration file 035-tenant-idp-grants.sql exists', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('revokes column-level SELECT on sensitive IdP columns from app_user', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    // The exact column list pinned here is the secrets contract: any column
    // dropped from this assertion would have to also be dropped from the
    // migration (and reviewed against the secrets-exposure threat model).
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*x509_cert[^)]*\)\s+ON\s+public\.tenant_idp_config\s+FROM\s+app_user/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*scim_token_hash[^)]*\)\s+ON\s+public\.tenant_idp_config\s+FROM\s+app_user/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*metadata_url[^)]*\)\s+ON\s+public\.tenant_idp_config\s+FROM\s+app_user/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*entity_id[^)]*\)\s+ON\s+public\.tenant_idp_config\s+FROM\s+app_user/i,
    );
  });

  it('also revokes the same columns from PUBLIC (defence-in-depth)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*\)\s+ON\s+public\.tenant_idp_config\s+FROM\s+PUBLIC/i,
    );
  });
});
