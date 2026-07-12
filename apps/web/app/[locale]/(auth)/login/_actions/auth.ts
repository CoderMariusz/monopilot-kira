'use server';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient as createSupabaseServerClient } from '../../../../../lib/auth/supabase-server';
import { syncUserOnboardingClaimFromOrg } from '../../../../../lib/auth/sync-user-onboarding-claim';

export type AuthActionState = {
  error?: string | null;
  success?: boolean;
};

const SUPPORTED_LOCALES = new Set(['pl', 'en', 'uk', 'ro']);

function valueFrom(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function localeFrom(formData: FormData): string {
  const locale = valueFrom(formData, 'locale');
  return SUPPORTED_LOCALES.has(locale) ? locale : 'en';
}

export async function signInWithPassword(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const rawLocale = formData.get('locale');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const locale = typeof rawLocale === 'string' && SUPPORTED_LOCALES.has(rawLocale) ? rawLocale : 'en';

  if (!email || !password) {
    return { error: 'Email and password are required.', success: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message, success: false };
  }

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    return { error: 'Unable to verify MFA requirements.', success: false };
  }

  const { data: sessionUser } = await supabase.auth.getUser();
  if (sessionUser.user?.id) {
    await syncUserOnboardingClaimFromOrg(sessionUser.user.id);
    await supabase.auth.refreshSession();
  }

  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      return { error: 'Unable to start MFA challenge.', success: false };
    }

    const factorId = factors?.totp.find((factor) => factor.status === 'verified')?.id ?? factors?.totp[0]?.id;

    if (!factorId) {
      return { error: 'Unable to start MFA challenge.', success: false };
    }

    redirect(`/${locale}/login/mfa?factorId=${encodeURIComponent(factorId)}`);
  }

  redirect(`/${locale}/`);
}

export async function sendPasswordReset(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  const locale = localeFrom(formData);
  const supabase = await createSupabaseServerClient();

  if (!email) {
    return { error: 'Email is required.', success: false };
  }

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/${locale}/login`,
  });

  return { success: true, error: null };
}

export async function verifyMfaCode(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const factorId = valueFrom(formData, 'factorId');
  const code = valueFrom(formData, 'code');
  const locale = localeFrom(formData);

  if (!factorId || !code) {
    return { error: 'Invalid or expired code', success: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

  if (error) {
    return { error: 'Invalid or expired code', success: false };
  }

  const { data: sessionUser } = await supabase.auth.getUser();
  if (sessionUser.user?.id) {
    await syncUserOnboardingClaimFromOrg(sessionUser.user.id);
    await supabase.auth.refreshSession();
  }

  redirect(`/${locale}/`);
}
