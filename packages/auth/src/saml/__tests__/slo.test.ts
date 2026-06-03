import { describe, expect, it, vi } from 'vitest';

import { handleVerifiedSloResponse, revokeLocalSession } from '../slo.js';

type CookieWrite = {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: string;
    secure?: boolean;
  };
};

function createCookieRecorder() {
  const writes: CookieWrite[] = [];
  return {
    writes,
    cookies: {
      set(name: string, value: string, options: CookieWrite['options']) {
        writes.push({ name, value, options });
      },
    },
  };
}

describe('SAML SLO local session revocation', () => {
  it('clears sb-access and sb-refresh cookies with Max-Age=0', async () => {
    const { cookies, writes } = createCookieRecorder();
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await revokeLocalSession('user-123', cookies, { signOut }, { sessionJwt: 'jwt-123' });

    expect(writes).toEqual([
      {
        name: 'sb-access',
        value: '',
        options: {
          httpOnly: true,
          maxAge: 0,
          path: '/',
          sameSite: 'lax',
          secure: true,
        },
      },
      {
        name: 'sb-refresh',
        value: '',
        options: {
          httpOnly: true,
          maxAge: 0,
          path: '/',
          sameSite: 'lax',
          secure: true,
        },
      },
    ]);
  });

  it('calls Supabase admin signOut once for the resolved user after verified SLO', async () => {
    const { cookies, writes } = createCookieRecorder();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const verifySloResponse = vi.fn().mockResolvedValue({ ok: true });
    const resolveLocalSession = vi.fn().mockResolvedValue({
      sessionJwt: 'jwt-123',
      userId: 'user-123',
    });

    await handleVerifiedSloResponse({
      cookies,
      resolveLocalSession,
      supabaseAuthAdmin: { signOut },
      verifySloResponse,
    });

    expect(verifySloResponse).toHaveBeenCalledTimes(1);
    expect(resolveLocalSession).toHaveBeenCalledWith({ ok: true });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith('jwt-123');
    expect(writes.map((write) => write.name)).toEqual(['sb-access', 'sb-refresh']);
  });

  it('does not clear cookies or sign out when SLO assertion verification fails', async () => {
    const { cookies, writes } = createCookieRecorder();
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await expect(
      handleVerifiedSloResponse({
        cookies,
        resolveLocalSession: vi.fn().mockResolvedValue({
          sessionJwt: 'jwt-123',
          userId: 'user-123',
        }),
        supabaseAuthAdmin: { signOut },
        verifySloResponse: vi.fn().mockRejectedValue(new Error('bad assertion')),
      }),
    ).rejects.toThrow('bad assertion');

    expect(signOut).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
