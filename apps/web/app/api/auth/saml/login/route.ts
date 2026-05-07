/**
 * T-012 — SAML SP login endpoint.
 *
 * GET /api/auth/saml/login?tenant=<tenantId>&org=<orgId>
 *
 * Loads the tenant's SAML config from `tenant_idp_config`, asks Jackson to
 * generate a signed AuthnRequest, and 302-redirects the browser to the IdP's
 * SSO endpoint with `SAMLRequest`, `RelayState=<orgId>`, `SigAlg`, and
 * `Signature` query parameters (HTTP-Redirect binding).
 *
 * Security:
 *   - The orgId placed into RelayState is verified on the callback against the
 *     tenant config. See lib/auth/saml.ts handleSamlCallback.
 *   - The IdP signature certificate (x509_cert) is registered with Jackson by
 *     the metadata-onboarding flow; this route only initiates the redirect.
 */

import type { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { handleSamlLogin } from '../../../../../lib/auth/saml';

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenant');
  const orgId = url.searchParams.get('org') ?? url.searchParams.get('org_id');

  if (!tenantId || !orgId) {
    return new Response(
      JSON.stringify({ error: 'tenant and org query params are required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let row: {
    tenant_id: string;
    provider_type: string;
    metadata_url: string | null;
    entity_id: string | null;
    x509_cert: string | null;
    jit_provisioning: boolean;
    enforce_for_non_admins: boolean;
  } | undefined;
  try {
    const res = await pool.query(
      `select tenant_id, provider_type, metadata_url, entity_id, x509_cert,
              jit_provisioning, enforce_for_non_admins
         from public.tenant_idp_config
        where tenant_id = $1`,
      [tenantId],
    );
    row = res.rows[0];
  } finally {
    await pool.end();
  }

  if (!row) {
    return new Response(
      JSON.stringify({ error: 'tenant_idp_config not found' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  }

  return handleSamlLogin({
    tenantId,
    orgId,
    tenantConfig: {
      tenant_id: row.tenant_id,
      provider_type: row.provider_type as 'saml' | 'oidc' | 'password' | 'magic',
      metadata_url: row.metadata_url,
      entity_id: row.entity_id,
      x509_cert: row.x509_cert,
      jit_provisioning: row.jit_provisioning,
      enforce_for_non_admins: row.enforce_for_non_admins,
    },
  });
}
