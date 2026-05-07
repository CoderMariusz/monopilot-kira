/**
 * Server Actions for authentication (T-011).
 *
 * Magic-link TTL: magic-link OTPs are valid for 7 days. This is controlled
 * by the Supabase project's auth.email.otp_expiry setting. In addition, we
 * pass `options.data.ttl` as a JWT claim so consuming applications can enforce
 * the window at the application layer. Production deployment MUST configure
 * Supabase auth settings to match (7-day OTP window, 15-min access token TTL).
 *
 * Access token TTL (15 min / 900s): Controlled by Supabase GoTrue JWT_EXP=900.
 * Must be set in the Supabase project dashboard (Auth > Settings > JWT expiry).
 *
 * SECURITY: shouldCreateUser=true allows new users to sign up via magic link.
 * If invite-only is required, set shouldCreateUser=false.
 */

'use server';

import { createServerSupabaseClient } from '../../lib/auth/supabase-server';

/** 7 days in seconds — magic-link OTP validity window. */
const MAGIC_LINK_TTL_S = 7 * 24 * 60 * 60;

export interface MagicLinkResult {
  error: string | null;
}

/**
 * Initiate a magic-link (OTP) sign-in for the given email address.
 *
 * Sends a magic-link email via Supabase Auth. The link is valid for 7 days
 * (controlled by Supabase project settings; `data.ttl` carries the intent
 * as an application-layer claim).
 *
 * Returns `{ error: null }` on success or `{ error: string }` on failure.
 */
export async function signInWithMagicLink(email: string): Promise<MagicLinkResult> {
  const supabase = await createServerSupabaseClient();

  // Determine the redirect URL for the magic-link callback.
  // In production this should be derived from the request origin or env var.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    'http://localhost:3000';

  const emailRedirectTo = `${siteUrl}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
      data: {
        // Application-layer TTL claim (7 days in seconds).
        // The actual OTP expiry window is configured in Supabase project settings.
        ttl: MAGIC_LINK_TTL_S,
      },
    },
  });

  if (error) {
    // T-062 hardening: do NOT echo the upstream Supabase error message back
    // to the client — `error.message` can leak whether an account exists
    // (e.g. "User already registered", "Invalid email", rate-limit details).
    // We log the real error server-side for ops visibility and return a
    // constant, neutral string. Reveals nothing whether the email is known.
    // eslint-disable-next-line no-console
    console.error('[signInWithMagicLink] supabase.auth.signInWithOtp failed', {
      code: (error as { code?: string }).code,
      status: (error as { status?: number }).status,
      message: error.message,
    });
    return {
      error: 'If an account with that email exists, a sign-in link has been sent.',
    };
  }

  return { error: null };
}
