/**
 * T-012 — SAML SP assertion-consumer (ACS) endpoint.
 *
 * POST /api/auth/saml/callback
 * Body: application/x-www-form-urlencoded with SAMLResponse + RelayState
 *
 * Verifies the SAML response (x509 signature via Jackson), enforces the
 * RelayState ↔ org_id integrity check, and JIT-provisions the user when the
 * tenant has jit_provisioning=true. After provisioning, sets the org context
 * for the new session via `app.set_org_context` (service-role pool — see
 * T-011 carry-forward note in lib/auth/session-check.ts).
 *
 * RED LINES:
 *   - Cross-tenant: RelayState must equal tenantConfig.org_id (lib/auth/saml.ts).
 *   - x509: Jackson rejects on signature mismatch; we do not swallow.
 */

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { handleSamlCallback } from '../../../../../lib/auth/saml';
import { createServerSupabaseClient } from '../../../../../lib/auth/supabase-server';

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData();
  const samlResponse = form.get('SAMLResponse');
  const relayState = form.get('RelayState');

  if (typeof samlResponse !== 'string' || typeof relayState !== 'string') {
    return new Response(
      JSON.stringify({ error: 'SAMLResponse and RelayState form fields are required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  // Resolve the tenant config from RelayState (== org_id). We do a separate
  // lookup to find the matching tenant_idp_config row by org_id; this is the
  // authoritative source of truth for the cross-tenant check inside
  // handleSamlCallback.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let row: {
    tenant_id: string;
    org_id: string;
    provider_type: string;
    metadata_url: string | null;
    entity_id: string | null;
    x509_cert: string | null;
    jit_provisioning: boolean;
    enforce_for_non_admins: boolean;
    org_default_role: string;
  } | undefined;
  try {
    const res = await pool.query(
      `select tic.tenant_id,
              o.id   as org_id,
              tic.provider_type,
              tic.metadata_url,
              tic.entity_id,
              tic.x509_cert,
              tic.jit_provisioning,
              tic.enforce_for_non_admins,
              coalesce(
                (select r.slug from public.roles r
                  where r.org_id = o.id and r.system = false
                  order by r.created_at asc limit 1),
                'org.member'
              ) as org_default_role
         from public.tenant_idp_config tic
         join public.organizations o on o.tenant_id = tic.tenant_id
        where o.id = $1`,
      [relayState],
    );
    row = res.rows[0];
  } finally {
    await pool.end();
  }

  if (!row) {
    return new Response(
      JSON.stringify({ error: 'no tenant_idp_config matches RelayState org_id' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const result = await handleSamlCallback({
    samlResponse,
    relayState,
    tenantConfig: {
      tenant_id: row.tenant_id,
      org_id: row.org_id,
      provider_type: row.provider_type as 'saml' | 'oidc' | 'password' | 'magic',
      metadata_url: row.metadata_url,
      entity_id: row.entity_id,
      x509_cert: row.x509_cert,
      jit_provisioning: row.jit_provisioning,
      enforce_for_non_admins: row.enforce_for_non_admins,
      org_default_role: row.org_default_role,
    },
  });

  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  // T-062 wiring: register a fresh session_token in app.session_org_contexts
  // BEFORE calling set_org_context (which validates the token exists). The
  // previous code passed gen_random_uuid() directly to set_org_context, which
  // would raise '28000 invalid organization context' because the token was
  // never inserted into the trusted_context table.
  //
  // Note: the org context registered here serves the redirect-time RLS check
  // only. Subsequent requests resolve their own context via the
  // `withOrgContext` HOF, which mints a fresh per-call session_token.
  if (result.user) {
    const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL });
    const sessionToken = randomUUID();
    try {
      await ownerPool.query(
        `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
        [sessionToken, row.org_id],
      );
      await ownerPool.query(`select app.set_org_context($1::uuid, $2::uuid)`, [
        sessionToken,
        row.org_id,
      ]);
    } catch (err) {
      // Surface the failure: silently dropping the org context here would let
      // the redirected page load with NULL app.current_org_id() and either
      // 0-row everything (confusing UX) or worse, leak data if a downstream
      // bug forgets a tenant filter.
      return new Response(
        JSON.stringify({
          error: `failed to register org context post-SAML: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    } finally {
      await ownerPool.end();
    }
  }

  // ── Establish a Supabase browser session via magic-link → verifyOtp ────────
  // The Jackson SAML flow gives us an authenticated identity but no Supabase
  // access_token cookie. We use the admin API to mint a one-shot magic link
  // for the verified email, then immediately consume it server-side via the
  // cookie-bound Supabase client so the response carries Set-Cookie headers
  // for the new session.
  //
  // Edge cases:
  //   - Admin API failure → 502 (we cannot establish a session safely).
  //   - generateLink omits properties.hashed_token in some Supabase builds →
  //     we surface that as a 502 rather than redirect a logged-out user.
  //
  // TODO(post-merge wave): once Agent 3 normalizes (auth)/actions.ts and the
  // magic-link callback path stabilizes, consider routing through that
  // shared helper instead of inlining the verifyOtp call here.
  if (result.user?.email) {
    try {
      const supabase = await createServerSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminAuth = (supabase.auth as any).admin;
      const linkRes = (await adminAuth.generateLink({
        type: 'magiclink',
        email: result.user.email,
      })) as {
        data?: { properties?: { hashed_token?: string; email_otp?: string } };
        error?: { message?: string } | null;
      };

      if (linkRes.error) {
        return new Response(
          JSON.stringify({
            error: `failed to mint SAML session token: ${linkRes.error.message ?? 'unknown'}`,
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        );
      }

      const tokenHash = linkRes.data?.properties?.hashed_token;
      if (!tokenHash) {
        return new Response(
          JSON.stringify({
            error: 'SAML session establishment failed: admin.generateLink returned no hashed_token',
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        );
      }

      // verifyOtp on the cookie-bound client mints sb-access-token /
      // sb-refresh-token cookies via the cookie adapter passed into
      // createServerSupabaseClient → setAll().
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: tokenHash,
      });
      if (verifyError) {
        return new Response(
          JSON.stringify({
            error: `SAML session verifyOtp failed: ${verifyError.message}`,
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        );
      }
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: `SAML session establishment threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  return new Response(null, {
    status: 302,
    headers: { location: '/' },
  });
}
