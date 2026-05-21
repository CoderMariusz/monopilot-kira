import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createSupabaseServerClient: vi.fn(),
  signInWithPassword: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createSupabaseServerClient,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

function formData(entries: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

function installSupabaseMock() {
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
        listFactors: mocks.listFactors,
        challengeAndVerify: mocks.challengeAndVerify,
      },
    },
  });
}

describe('T-126 login Supabase Auth server action behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSupabaseMock();
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    mocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('returns an inline error without redirecting when Supabase rejects password credentials', async () => {
    const { signInWithPassword } = await import('./auth.js');
    mocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });

    const result = await signInWithPassword(
      { error: null, success: false },
      formData({ locale: 'en', email: ' operator@apex.pl ', password: 'bad-secret' }),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'operator@apex.pl', password: 'bad-secret' });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Invalid login credentials', success: false });
  });

  it('redirects to the locale home route after successful password sign-in when MFA is already satisfied', async () => {
    const { signInWithPassword } = await import('./auth.js');
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'red-session' } }, error: null });

    await expect(
      signInWithPassword(
        { error: null, success: false },
        formData({ locale: 'en', email: 'operator@apex.pl', password: 'correct-secret' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/en/');

    expect(mocks.redirect).toHaveBeenCalledWith('/en/');
  });
});
