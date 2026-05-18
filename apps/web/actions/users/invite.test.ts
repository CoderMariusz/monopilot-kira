import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const inviteActionPath = resolve(repoRoot, 'apps/web/actions/users/invite.ts');
const acceptRoutePath = resolve(repoRoot, 'apps/web/app/api/auth/invite/accept/route.ts');
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readRequiredSource(path: string, label: string): string {
  expect(existsSync(path), `${label} must exist for TASK-000081/T-017 inviteUser`).toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

function normalized(source: string): string {
  return source.replace(/\s+/g, ' ').toLowerCase();
}

function indexOfAny(source: string, fragments: readonly string[]): number {
  const indexes = fragments.map((fragment) => source.indexOf(fragment)).filter((index) => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

describe('inviteUser Server Action (TASK-000081/T-017 RED)', () => {
  it('rejects an invite before Supabase Auth when active users are already at the organization seat limit', () => {
    const source = normalized(readRequiredSource(inviteActionPath, 'apps/web/actions/users/invite.ts'));

    expect(source).toContain("'use server'");
    expect(source).toMatch(/export\s+async\s+function\s+inviteuser\s*\(/);

    const seatLimitIndex = indexOfAny(source, [
      'select seat_limit from public.organizations',
      'select seat_limit from organizations',
      '.from(organizations)',
    ]);
    const activeCountIndex = indexOfAny(source, [
      'count(*)',
      'count_active',
      'active_user_count',
    ]);
    const authIndex = indexOfAny(source, [
      'auth.admin.generatelink',
      'auth.admin.inviteuserbyemail',
      'supabase.auth.admin',
    ]);

    expect(seatLimitIndex, 'must SELECT seat_limit from organizations server-side').toBeGreaterThanOrEqual(0);
    expect(activeCountIndex, 'must COUNT active users server-side for the same org').toBeGreaterThan(seatLimitIndex);
    expect(source).toMatch(/is_active\s*=\s*true|status\s*=\s*['"]active['"]|active\s+users?/);
    expect(source).toMatch(/seat[_-]?limit[_-]?exceeded|over[_-]?limit|seat_limit/);
    expect(authIndex, 'seat-limit pre-flight must happen before Supabase mints any invite link/token').toBeGreaterThan(activeCountIndex);
  });

  it('sends a 7-day Supabase invite and records settings.user.invited in the outbox on success', () => {
    const source = normalized(readRequiredSource(inviteActionPath, 'apps/web/actions/users/invite.ts'));

    const authIndex = indexOfAny(source, [
      'auth.admin.generatelink',
      'auth.admin.inviteuserbyemail',
      'supabase.auth.admin',
    ]);
    const ttlIndex = indexOfAny(source, [
      `${INVITE_TTL_SECONDS}`,
      '7 * 24 * 60 * 60',
      'expires_at',
    ]);
    const outboxIndex = indexOfAny(source, [
      'settings.user.invited',
      'insert into public.outbox_events',
      'enqueueoutbox',
    ]);

    expect(authIndex, 'inviteUser must use Supabase Auth admin magic-link/invite API').toBeGreaterThanOrEqual(0);
    expect(ttlIndex, 'inviteUser must set/enforce a 7-day TTL (604800 seconds / expires_at)').toBeGreaterThanOrEqual(0);
    expect(source).toContain('settings.user.invited');
    expect(outboxIndex, 'settings.user.invited outbox event must be written after invite creation succeeds').toBeGreaterThan(authIndex);
    expect(source).toMatch(/org_id/);
    expect(source).toMatch(/email/);
  });

  it('returns HTTP 410 Gone from the accept route when the invite expires_at is in the past', () => {
    const source = normalized(readRequiredSource(acceptRoutePath, 'apps/web/app/api/auth/invite/accept/route.ts'));

    expect(source).toMatch(/export\s+async\s+function\s+(get|post)\s*\(/);
    expect(source).toMatch(/expires_at/);
    expect(source).toMatch(/date\.now\s*\(|new date\s*\(|now\s*\(\)/);
    expect(source).toMatch(/status\s*:\s*410|\.status\s*\(\s*410\s*\)|httpstatus\.gone/);
    expect(source).toMatch(/gone|expired/);
  });
});
