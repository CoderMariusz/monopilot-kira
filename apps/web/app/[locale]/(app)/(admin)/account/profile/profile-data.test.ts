/**
 * T-074 / SET-101 — real profile data + Server Actions.
 *
 * Runs each action/read against a fake in-transaction pg client + a stubbed
 * Supabase auth client — no DB or live Supabase required. Asserts the REAL
 * SQL hits `public.users` and the REAL Supabase auth backend is used, and that
 * a genuinely-absent session-revoke backend is reported (not silently faked).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, ctxRef } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ctxRef: { userId: 'real-user-uuid', orgId: 'real-org-uuid' },
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => unknown) =>
    action({ userId: ctxRef.userId, orgId: ctxRef.orgId, sessionToken: 'tok', client: { query: queryMock } }),
}));

const { updateUserMock, signOutMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({ auth: { updateUser: updateUserMock, signOut: signOutMock } }),
}));

vi.mock('./mfa-actions', () => ({
  readMfaBackendAvailability: () => ({ available: false }),
}));

import {
  logoutEverywhereAction,
  readMyProfile,
  revokeSessionAction,
  saveProfileAction,
  updateLanguagePreferenceAction,
  updatePasswordAction,
} from './profile-data';

beforeEach(() => {
  queryMock.mockReset();
  updateUserMock.mockReset();
  signOutMock.mockReset();
  ctxRef.userId = 'real-user-uuid';
  ctxRef.orgId = 'real-org-uuid';
});

describe('readMyProfile — real signed-in user fetch', () => {
  it('reads the real public.users row + the user roles scoped by the signed-in user id and org', async () => {
    // First query → user row; second query → roles; third → MFA enrollment.
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'real-user-uuid', email: 'k.nowak@apex.pl', name: 'Krzysztof Nowak', display_name: 'K. Nowak', language: 'pl' }],
      })
      .mockResolvedValueOnce({
        rows: [{ code: 'production_manager', name: 'Production Manager' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const data = await readMyProfile();

    expect(queryMock).toHaveBeenCalledTimes(3);
    const [userSql, userParams] = queryMock.mock.calls[0];
    expect(userSql).toContain('from public.users');
    expect(userParams).toEqual(['real-user-uuid']);

    // The roles read mirrors the verified user_roles → roles join, scoped by the
    // context user id + org (never client-trusted).
    const [rolesSql, rolesParams] = queryMock.mock.calls[1];
    expect(rolesSql).toContain('from public.user_roles ur');
    expect(rolesSql).toContain('join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id');
    expect(rolesParams).toEqual(['real-user-uuid', 'real-org-uuid']);

    expect(data.state).toBe('ready');
    expect(data.user).toMatchObject({
      id: 'real-user-uuid',
      fullName: 'Krzysztof Nowak',
      displayName: 'K. Nowak',
      email: 'k.nowak@apex.pl',
      initials: 'KN',
    });
    expect(data.roles).toEqual([{ code: 'production_manager', name: 'Production Manager' }]);
    expect(data.preferences.language).toBe('pl');
    expect(data.canEditProfile).toBe(true);
    expect(data.mfa.enabled).toBe(false);
  });

  it('returns the empty state when the signed-in user has no public.users row', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const data = await readMyProfile();
    expect(data.state).toBe('empty');
    expect(data.user).toBeNull();
    expect(data.roles).toEqual([]);
  });

  it('degrades to the error state (logged, not thrown) when the read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValue(new Error('connection refused'));
    const data = await readMyProfile();
    expect(data.state).toBe('error');
    expect(data.roles).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('saveProfileAction — real public.users write', () => {
  it('updates name/display_name/language for the verified caller id (not client-trusted)', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await saveProfileAction({
      fullName: 'New Name',
      displayName: 'NN',
      phone: '+48 600 123 456',
      language: 'en',
      timezone: 'Europe/Warsaw',
    });

    expect(result).toEqual({ ok: true, userRowUpdated: true });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('update public.users');
    // The WHERE id is the context user id — never an id from the payload.
    expect(params).toEqual(['New Name', 'NN', 'en', 'real-user-uuid']);
  });

  it('rejects an empty full name with invalid_input and no DB write', async () => {
    const result = await saveProfileAction({
      fullName: '  ',
      displayName: 'NN',
      phone: '',
      language: 'en',
      timezone: 'Europe/Warsaw',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('updateLanguagePreferenceAction — real public.users.language write', () => {
  it('writes the language for the verified caller and returns the NEXT_LOCALE cookie', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const result = await updateLanguagePreferenceAction({ userId: 'spoofed', language: 'pl' });

    expect(result.ok).toBe(true);
    expect(result.userPreferencesRowUpdated).toBe(true);
    expect(result.localeCookie).toContain('NEXT_LOCALE=pl');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('update public.users');
    expect(sql).toContain('set language');
    // ignores the spoofed payload userId, uses the context id.
    expect(params).toEqual(['pl', 'real-user-uuid']);
  });
});

describe('updatePasswordAction — real Supabase auth backend', () => {
  it('calls supabase.auth.updateUser with the new password', async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    const result = await updatePasswordAction({
      currentPassword: 'oldpassword123',
      newPassword: 'a-strong-new-password',
      confirmNew: 'a-strong-new-password',
    });
    expect(result).toEqual({ ok: true, passwordUpdated: true });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'a-strong-new-password' });
  });

  it('rejects mismatched confirmation before hitting the auth backend', async () => {
    const result = await updatePasswordAction({
      currentPassword: 'x',
      newPassword: 'a-strong-new-password',
      confirmNew: 'different-password-here',
    });
    expect(result).toEqual({ ok: false, error: 'password_mismatch' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe('logoutEverywhereAction — real Supabase global sign-out', () => {
  it('calls supabase.auth.signOut with global scope', async () => {
    signOutMock.mockResolvedValue({ error: null });
    const result = await logoutEverywhereAction();
    expect(result).toEqual({ ok: true });
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'global' });
  });
});

describe('revokeSessionAction — genuinely absent backend', () => {
  it('reports SESSIONS_BACKEND_UNAVAILABLE (typed, not a silent fake)', async () => {
    const result = await revokeSessionAction({ sessionId: 'current' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SESSIONS_BACKEND_UNAVAILABLE');
    expect(result.invalidatedSessionToken).toBe(false);
  });
});
