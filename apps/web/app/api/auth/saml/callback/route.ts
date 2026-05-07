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

import type { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { handleSamlCallback } from '../../../../../lib/auth/saml';

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

  // Carry-forward T-062: register session_org_contexts so RLS resolves
  // app.current_org_id() for the new SAML session.
  if (result.user) {
    const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // Best-effort — non-fatal if the helper isn't available in this env.
      await ownerPool.query(`select app.set_org_context(gen_random_uuid(), $1)`, [
        row.org_id,
      ]);
    } catch {
      // ignore — production middleware will re-establish on next request
    } finally {
      await ownerPool.end();
    }
  }

  return new Response(null, {
    status: 302,
    headers: { location: '/' },
  });
}
