import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ACTION_DIR = resolve(__dirname);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readActionSource(fileName: string): string {
  const path = resolve(ACTION_DIR, fileName);
  expect(
    existsSync(path),
    `${fileName} must exist as a Server Action module for T-018 users admin actions`,
  ).toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

function expectServerActionGuard(source: string): number {
  expect(source).toContain("'use server'");
  expect(source).toMatch(/withOrgContext\s*\(/);
  // accept either requirePermission('some.perm') or requireAnyPermission(ctx, [...])
  expect(source).toMatch(/requirePermission\s*\(\s*['"][a-z_.]+['"]\s*\)|requireAnyPermission\s*\(/);
  expect(source).toMatch(/FORBIDDEN|forbidden/);
  const single = source.indexOf('requirePermission(');
  const any = source.indexOf('requireAnyPermission(');
  return Math.max(single, any);
}

function expectOutboxAfterGuard(source: string, guardIndex: number, eventType: string): void {
  const eventIndex = source.indexOf(eventType);
  expect(eventIndex, `expected outbox event ${eventType}`).toBeGreaterThan(guardIndex);
  expect(source).toMatch(/outbox_events|enqueueOutbox|insert\s+into\s+public\.outbox/i);
  expect(source).toMatch(/org_id/i);
}

describe('T-018 admin user Server Actions', () => {
  it('assignRole enforces RBAC and writes a settings.role.assigned outbox event', () => {
    const source = readActionSource('assign-role.ts');
    expect(source).toMatch(/export\s+async\s+function\s+assignRole\s*\(/);

    const guardIndex = expectServerActionGuard(source);
    const mutationIndex = Math.max(source.indexOf('user_roles'), source.indexOf('role_id'));
    expect(mutationIndex, 'assignRole must change the target user role after permission guard').toBeGreaterThan(guardIndex);
    expectOutboxAfterGuard(source, guardIndex, 'settings.role.assigned');
  });

  it('deactivateUser enforces RBAC, rejects self-deactivation, and writes settings.user.deactivated', () => {
    const source = readActionSource('deactivate.ts');
    expect(source).toMatch(/export\s+async\s+function\s+deactivateUser\s*\(/);

    const guardIndex = expectServerActionGuard(source);
    expect(source).toMatch(/self_deactivation|cannot_deactivate_self|SELF_DEACTIVATION|targetUserId\s*={2,3}\s*userId|userId\s*={2,3}\s*targetUserId/);
    expect(source).toMatch(/update\s+public\.users|\.update\(/i);
    expect(source).toMatch(/is_active\s*=\s*false|isActive\s*:\s*false|deleted_at\s*=|deactivated_at\s*=/i);
    expectOutboxAfterGuard(source, guardIndex, 'settings.user.deactivated');

    // F2 carry-over: deactivateUser must accept either org.access.admin OR the
    // narrower seeded permission settings.users.deactivate (OR-union).
    expect(source).toContain("'org.access.admin'");
    expect(source).toContain("'settings.users.deactivate'");
    // requireAnyPermission helper (or inline OR logic) must be present.
    expect(source).toMatch(/requireAnyPermission|hasAnyPermission|any.*permission/i);
  });

  it('resetPassword enforces RBAC, uses Supabase Auth admin API, and revokes active sessions', () => {
    const source = readActionSource('reset-password.ts');
    expect(source).toMatch(/export\s+async\s+function\s+resetPassword\s*\(/);

    const guardIndex = expectServerActionGuard(source);
    const authAdminIndex = source.search(/auth\.admin\.(generateLink|updateUserById|inviteUserByEmail|resetPasswordForEmail)|supabase\.auth\.admin/);
    expect(authAdminIndex, 'resetPassword must call Supabase Auth admin API after permission guard').toBeGreaterThan(guardIndex);
    const revokeIndex = source.search(/user_sessions|revoked_at|revoke(d|All)?Sessions|signOut|session.*revoke/i);
    expect(revokeIndex, 'resetPassword must revoke active sessions after password reset').toBeGreaterThan(authAdminIndex);
  });
});
