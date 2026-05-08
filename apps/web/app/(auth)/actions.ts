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
 *
 * FT-028 — SAML enforcement on magic-link path:
 *   Before sending the magic-link email, look up the tenant the email belongs
 *   to and call `enforceSamlPolicy`. If the tenant has
 *   `enforce_for_non_admins=true` and the user is not an admin, the magic
 *   link is NOT sent. The caller still receives the constant neutral string
 *   so we don't reveal that SAML is required (user-enumeration guard — same
 *   surface as the existing T-062 hardening for unknown / failed emails).
 */

'use server';

import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type pg from 'pg';
import { createServerSupabaseClient } from '../../lib/auth/supabase-server';
import { enforceSamlPolicy } from '../../lib/auth/saml';

// ─── Slot F-4: memoised owner pool for tenant-by-email lookup ───────────────
// Previously `lookupTenantForEmail` created a fresh Pool per call and called
// `.end()` in its finally — every magic-link request paid a fresh TCP +
// auth handshake and risked half-closed-socket pile-up under load. We now
// lazily initialise a single module-scope pool and reuse it across calls.
// It is implicitly torn down at process exit. ADR P2.13 (the owner pool is
// intentionally not exported by `@monopilot/db`).
let _ownerPool: pg.Pool | null = null;
function getOwnerPool(): pg.Pool {
  if (!_ownerPool) {
    _ownerPool = new Pool({
      connectionString:
        process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL,
    });
  }
  return _ownerPool;
}

// ADR P2.13 (see lib/auth/with-org-context.ts): the magic-link path runs
// pre-session, so app.current_org_id() is unset and `@monopilot/db`'s
// app-role pool would not be RLS-useful. The owner pool is intentionally
// not re-exported from @monopilot/db (eslint forbids), and we need it here
// to read `public.users` cross-org for the email→tenant mapping. Same
// pattern as `apps/web/app/api/auth/saml/callback/route.ts` (line 49) and
// `apps/web/lib/auth/saml.ts` (line 381).

/** 7 days in seconds — magic-link OTP validity window. */
const MAGIC_LINK_TTL_S = 7 * 24 * 60 * 60;

/**
 * Constant neutral response shown to the caller in EVERY non-success path
 * (unknown email, SAML enforced, DB outage in prod, Supabase error). The
 * sender does not learn whether the email is registered or whether SAML is
 * required — both invariants are part of the user-enumeration guard.
 */
const NEUTRAL_RESPONSE: MagicLinkResult = {
  error: 'If an account with that email exists, a sign-in link has been sent.',
};

export interface MagicLinkResult {
  error: string | null;
}

interface TenantLookupRow {
  tenant_id: string;
  user_id: string;
  is_admin: boolean;
}

/**
 * Look up the tenant + admin status for the given email. Returns `null` when
 * no `public.users` row matches — the magic-link flow then proceeds without
 * SAML enforcement (the email may be a brand-new invitee whose user row
 * doesn't yet exist, or a typo where we want to leak nothing).
 *
 * Owner-pool only because pre-session email-→-tenant mapping has no
 * `app.current_org_id()` set, which is what RLS keys off. The query is
 * bounded to a single LIMIT 1 row of {tenant_id, user_id, is_admin} — no
 * secrets are returned.
 */
async function lookupTenantForEmail(email: string): Promise<TenantLookupRow | null> {
  // Slot F-4: pool is memoised at module scope (see getOwnerPool above) — we
  // no longer create a fresh Pool per call. The try/finally is retained for
  // structural symmetry, but we MUST NOT call `pool.end()` here: the pool
  // is long-lived and shared across all magic-link sign-ins for the
  // process.
  const pool = getOwnerPool();
  try {
    const res = await pool.query<TenantLookupRow>(
      `select t.id as tenant_id,
              u.id as user_id,
              exists(
                select 1 from public.user_roles ur
                  join public.roles r on r.id = ur.role_id
                 where ur.user_id = u.id
                   and ur.org_id = u.org_id
                   and r.slug in ('org.access.admin', 'org.platform.admin')
              ) as is_admin
         from public.users u
         join public.organizations o on o.id = u.org_id
         join public.tenants t on t.id = o.tenant_id
        where u.email = $1
        limit 1`,
      [email],
    );
    return res.rows[0] ?? null;
  } finally {
    // Intentionally no pool.end() — see getOwnerPool() comment.
  }
}

/**
 * Initiate a magic-link (OTP) sign-in for the given email address.
 *
 * Sends a magic-link email via Supabase Auth. The link is valid for 7 days
 * (controlled by Supabase project settings; `data.ttl` carries the intent
 * as an application-layer claim).
 *
 * SAML enforcement (FT-028): if the email's tenant has
 * `enforce_for_non_admins=true` and the user is not an admin, the magic
 * link is suppressed and the caller still receives the constant neutral
 * response (see `NEUTRAL_RESPONSE`).
 *
 * Returns `{ error: null }` on success or `{ error: string }` on failure.
 */
export async function signInWithMagicLink(email: string): Promise<MagicLinkResult> {
  // ── FT-028: SAML enforce gate ──────────────────────────────────────────────
  // Resolve the email's tenant + admin status BEFORE we ask Supabase to mint a
  // magic link. If the tenant requires SAML for non-admins, suppress the email
  // entirely.
  let tenantRow: TenantLookupRow | null;
  try {
    tenantRow = await lookupTenantForEmail(email);
  } catch (err) {
    // Fail-closed in production: a DB outage during the SAML pre-check must
    // NOT silently degrade to "send the link anyway", because that downgrades
    // the SAML enforcement guarantee. In dev, we log + continue so local
    // DB-less work still flows.
    const isProd = process.env.NODE_ENV === 'production';
    console.error('[signInWithMagicLink] tenant lookup failed', {
      email_hash: hashEmail(email),
      err: err instanceof Error ? err.message : String(err),
      failingClosed: isProd,
    });
    if (isProd) {
      return NEUTRAL_RESPONSE;
    }
    tenantRow = null;
  }

  if (tenantRow) {
    // Note: enforceSamlPolicy reads enforce_for_non_admins from the DB and
    // ignores any caller-supplied spoof. We pass userRole as the canonical
    // admin slug so the function's admin-bypass check fires correctly.
    const policy = await enforceSamlPolicy({
      tenantId: tenantRow.tenant_id,
      userEmail: email,
      userRole: tenantRow.is_admin ? 'org.access.admin' : 'user',
      authMethod: 'magic',
    });

    if (!policy.allowed) {
      // Constant neutral response — do NOT reveal that SAML is required, do
      // NOT reveal that the email is known. Caller cannot distinguish this
      // path from "email unknown" or "Supabase error".
      console.warn('[signInWithMagicLink] SAML policy denied magic-link path', {
        email_hash: hashEmail(email),
        reason: policy.reason,
      });
      return NEUTRAL_RESPONSE;
    }
  }

  // ── Existing T-011 magic-link send ────────────────────────────────────────
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
    return NEUTRAL_RESPONSE;
  }

  return { error: null };
}

/**
 * Hash an email to a short stable identifier for log lines. We must not log
 * raw emails (PII), but we still want to correlate failures across requests.
 * Uses Node's built-in createHash to avoid pulling crypto-deps.
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12);
}
