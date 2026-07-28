/**
 * FALA 6 / R01-07 — the app shell must show the SAVED display name.
 *
 * Before this, `shellUserFromSupabase()` built the user menu from Supabase
 * `user_metadata` alone, so saving a Display name on /account/profile (which
 * writes `public.users.display_name` + `.name`) left the shell showing the
 * stale metadata value — the reported "still says Apex Admin" symptom.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `loadShellIdentity` is wrapped in React `cache()`; outside a request scope we
// want the plain function (same approach as lib/auth/with-org-context.test.ts).
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }));

const { runWithOrgContext } = vi.hoisted(() => ({ runWithOrgContext: vi.fn() }));

vi.mock('../auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

import { initialsFor, loadShellIdentity, resolveShellUser } from './shell-identity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const supabaseUser = {
  id: USER_ID,
  email: 'ola.admin@apex.local',
  user_metadata: { name: 'Apex Admin', full_name: 'Apex Administrator' },
};

function clientReturning(rows: unknown[], calls: { sql: string; params: readonly unknown[] }[] = []) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      return { rows: rows as T[], rowCount: rows.length };
    },
  };
}

describe('resolveShellUser — persisted identity beats auth metadata', () => {
  it('renders the saved display name instead of the stale user_metadata name', () => {
    const shellUser = resolveShellUser(supabaseUser, { display_name: 'Ola K.', name: 'Aleksandra Kowalska' });

    expect(shellUser.name).toBe('Ola K.');
    expect(shellUser.name).not.toBe('Apex Admin');
  });

  it('falls back to users.name when display_name was never set', () => {
    expect(resolveShellUser(supabaseUser, { display_name: null, name: 'Aleksandra Kowalska' }).name).toBe(
      'Aleksandra Kowalska',
    );
    // A blank display_name must fall through rather than blanking the menu.
    expect(resolveShellUser(supabaseUser, { display_name: '   ', name: 'Aleksandra Kowalska' }).name).toBe(
      'Aleksandra Kowalska',
    );
  });

  it('degrades to user_metadata, then to the email, when there is no users row', () => {
    expect(resolveShellUser(supabaseUser, null).name).toBe('Apex Admin');
    expect(resolveShellUser({ ...supabaseUser, user_metadata: { full_name: 'Apex Administrator' } }, null).name).toBe(
      'Apex Administrator',
    );
    expect(resolveShellUser({ ...supabaseUser, user_metadata: null }, null).name).toBe('ola.admin@apex.local');
  });

  it('never throws on a half-empty auth user', () => {
    const shellUser = resolveShellUser({}, null);
    expect(shellUser.id).toBe('current-user');
    expect(shellUser.email).toBe('user@monopilot.local');
    expect(shellUser.initials).toBe('U');
  });

  it('derives initials from the persisted name, not from the email', () => {
    expect(resolveShellUser(supabaseUser, { display_name: 'Aleksandra Kowalska', name: null }).initials).toBe('AK');
    expect(initialsFor('', 'ola.admin@apex.local')).toBe('O');
  });

  it('exposes the same resolved label for act-as chrome as for the user menu', () => {
    const shellUser = resolveShellUser(supabaseUser, { display_name: 'Ola K.', name: 'Aleksandra Kowalska' });
    expect(shellUser.name).toBe('Ola K.');
    expect(shellUser.name).not.toBe(supabaseUser.user_metadata?.name);
    expect(shellUser.email).toBe('ola.admin@apex.local');
  });
});

describe('loadShellIdentity — one keyed read, and it can never break the shell', () => {
  // Braces matter: `mockReset()` RETURNS the mock, and Vitest treats a function
  // returned from beforeEach as a teardown hook — so the concise-arrow form had
  // vitest calling runWithOrgContext() with no action after every test.
  beforeEach(() => {
    runWithOrgContext.mockReset();
  });

  it('reads the caller row with a single primary-key query (no N+1)', async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: 'org', client: clientReturning([{ display_name: 'Ola K.', name: 'Ola' }], calls) }),
    );

    await expect(loadShellIdentity()).resolves.toEqual({ display_name: 'Ola K.', name: 'Ola' });

    expect(calls).toHaveLength(1);
    const normalized = calls[0].sql.replace(/\s+/g, ' ').trim().toLowerCase();
    expect(normalized).toContain('from public.users');
    expect(normalized).toContain('where id = $1::uuid');
    expect(normalized).toContain('limit 1');
    expect(calls[0].params).toEqual([USER_ID]);
  });

  it('returns null when the user has no public.users row yet', async () => {
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: 'org', client: clientReturning([]) }),
    );

    await expect(loadShellIdentity()).resolves.toBeNull();
    // …and the shell still renders a usable identity from metadata.
    expect(resolveShellUser(supabaseUser, await loadShellIdentity()).name).toBe('Apex Admin');
  });

  it('swallows a failing lookup instead of taking the whole shell down', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runWithOrgContext.mockRejectedValue(new Error('org context unavailable'));

    await expect(loadShellIdentity()).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
