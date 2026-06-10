import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/265-scanner-sessions-audit.sql');

function readMigration(): string {
  expect(existsSync(migrationPath), `expected ${migrationPath}`).toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

function expectOrgRls(sql: string, table: string): void {
  expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'));
  expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i'));
  expect(sql).toMatch(new RegExp(`create\\s+policy\\s+${table}_[a-z_]+[\\s\\S]*on\\s+public\\.${table}[\\s\\S]*app\\.current_org_id\\s*\\(\\s*\\)`, 'i'));
}

describe('265 scanner sessions and audit migration', () => {
  it('creates org-scoped scanner tables without tenant leakage', () => {
    const sql = readMigration();

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.scanner_sessions/i);
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.scanner_audit_log/i);
    expect(sql).toMatch(/org_id\s+uuid\s+not\s+null/i);
    expect(sql).not.toMatch(/tenant_id/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });

  it('enables and forces RLS through app.current_org_id on both tables', () => {
    const sql = readMigration();

    expectOrgRls(sql, 'scanner_sessions');
    expectOrgRls(sql, 'scanner_audit_log');
  });

  it('keeps scanner_audit_log append-only for app_user', () => {
    const sql = readMigration();

    expect(sql).toMatch(/grant\s+select\s*,\s*insert\s+on\s+public\.scanner_audit_log\s+to\s+app_user/i);
    expect(sql).not.toMatch(/grant\s+[^;]*(update|delete)[^;]*on\s+public\.scanner_audit_log\s+to\s+app_user/i);
    expect(sql).not.toMatch(/create\s+policy\s+scanner_audit_log_[a-z_]+update/i);
    expect(sql).not.toMatch(/create\s+policy\s+scanner_audit_log_[a-z_]+delete/i);
  });

  it('defines required scanner indexes including partial idempotency index', () => {
    const sql = readMigration();

    expect(sql).toMatch(/on\s+public\.scanner_sessions\s*\(\s*org_id\s*,\s*user_id\s*\)/i);
    expect(sql).toMatch(/on\s+public\.scanner_audit_log\s*\(\s*org_id\s*,\s*occurred_at\s+desc\s*\)/i);
    expect(sql).toMatch(/on\s+public\.scanner_audit_log\s*\(\s*org_id\s*,\s*wo_id\s*\)/i);
    expect(sql).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+scanner_audit_log_org_client_op_id_uq[\s\S]*on\s+public\.scanner_audit_log\s*\(\s*org_id\s*,\s*client_op_id\s*\)[\s\S]*where\s+client_op_id\s+is\s+not\s+null/i);
  });
});
