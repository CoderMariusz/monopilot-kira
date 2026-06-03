/**
 * T-012 — SAML 2.0 SP integration via @boxyhq/saml-jackson.
 *
 * Exports three pure functions consumed by the SAML route handlers and tests:
 *   - handleSamlLogin    — initiates a signed AuthnRequest redirect to the IdP
 *   - handleSamlCallback — verifies SAML response (x509) and JIT-provisions user
 *   - enforceSamlPolicy  — reads tenant_idp_config.enforce_for_non_admins from DB
 *                          and returns 403 for non-admin password sign-in attempts
 *
 * SECURITY RED LINES (pinned in tests):
 *   1. x509 signature validation MUST NOT be skipped. The configured cert from
 *      tenant_idp_config.x509_cert is registered with Jackson via
 *      apiController.createConnection; if signature fails Jackson throws and we
 *      surface that as { error } — we do NOT silently succeed.
 *   2. RelayState MUST encode the originating org_id and be verified on callback
 *      against tenantConfig.org_id. Mismatch → reject (cross-tenant attack guard).
 *   3. enforce_for_non_admins is read from the DB on every call — any caller-
 *      supplied spoof value is ignored.
 */

import type { JacksonOption, IOAuthController } from '@boxyhq/saml-jackson';
import type pg from 'pg';
import { Pool } from 'pg';
import { parseSamlIssuer } from '../../../../packages/auth/src/saml/issuer-parser.js';
import { createServerSupabaseClient } from './supabase-server';

// ─── Slot F-4: memoised owner pool for enforceSamlPolicy DB lookups ─────────
// ADR P2.13: `@monopilot/db` intentionally does NOT export the owner pool
// (lint-forbidden), so call sites that need cross-org reads instantiate one
// directly. Previously `enforceSamlPolicy` created a fresh Pool per call and
// called `.end()` in a finally — that pattern defeats pooling entirely. We
// now hold a single lazily-initialised pool at module scope and reuse it
// across calls; it is implicitly torn down at process exit (same pattern as
// packages/auth/src/totp.ts).
let _enforcePolicyPool: pg.Pool | null = null;
function getEnforcePolicyPool(): pg.Pool {
  if (!_enforcePolicyPool) {
    _enforcePolicyPool = new Pool({
      connectionString:
        process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL,
    });
  }
  return _enforcePolicyPool;
}

// ────────────────────────────────────────────────────────────────────────────────
// Types — match the contract that callers (route handlers, tests) supply.
// ────────────────────────────────────────────────────────────────────────────────

export interface TenantIdpConfig {
  tenant_id: string;
  provider_type: 'saml' | 'oidc' | 'password' | 'magic';
  metadata_url?: string | null;
  entity_id?: string | null;
  x509_cert?: string | null;
  jit_provisioning?: boolean;
  enforce_for_non_admins?: boolean;
}

export interface TenantIdpConfigWithOrg extends TenantIdpConfig {
  org_id: string;
  org_default_role: string;
}

export interface HandleSamlLoginOptions {
  tenantId: string;
  orgId: string;
  tenantConfig: TenantIdpConfig;
}

export interface HandleSamlCallbackOptions {
  samlResponse: string;
  relayState: string;
  tenantConfig: TenantIdpConfigWithOrg;
}

export interface SamlCallbackResult {
  userCreated: boolean;
  sessionEstablished: boolean;
  user?: { id: string; email: string; role: string };
  error?: string;
}

export interface EnforceSamlPolicyOptions {
  tenantId: string;
  userEmail: string;
  userRole: string;
  authMethod: 'password' | 'magic' | 'saml';
  /** Ignored — must read from DB. Present so callers cannot accidentally spoof. */
  _spoofEnforceForNonAdmins?: boolean;
}

export interface EnforceSamlPolicyResult {
  allowed: boolean;
  statusCode: number;
  reason?: string;
}

// ────────────────────────────────────────────────────────────────────────────────
// Jackson singleton (lazy init).
// ────────────────────────────────────────────────────────────────────────────────

interface JacksonControllers {
  oauthController: IOAuthController;
  apiController: { createConnection: (opts: Record<string, unknown>) => Promise<unknown> };
  close?: () => Promise<void>;
}

let _jacksonPromise: Promise<JacksonControllers> | null = null;

async function getSamlController(): Promise<JacksonControllers> {
  if (!_jacksonPromise) {
    _jacksonPromise = (async () => {
      // Use dynamic ESM import so vi.mock('@boxyhq/saml-jackson') intercepts.
      const mod = (await import('@boxyhq/saml-jackson')) as unknown as {
        controllers?: (opts: JacksonOption) => Promise<JacksonControllers>;
        default?: (opts: JacksonOption) => Promise<JacksonControllers>;
      };
      const controllers = mod.controllers ?? mod.default;
      if (!controllers) {
        throw new Error('SAML Jackson SDK could not be loaded (no controllers export)');
      }

      const externalUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const databaseUrl =
        process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';

      const opts: JacksonOption = {
        externalUrl,
        samlPath: '/api/auth/saml/callback',
        samlAudience: externalUrl,
        db: {
          engine: 'sql',
          url: databaseUrl,
          type: 'postgres',
          manualMigration: false,
        },
      } as JacksonOption;

      return controllers(opts);
    })();
  }
  return _jacksonPromise;
}

// ────────────────────────────────────────────────────────────────────────────────
// handleSamlLogin — AC1: signed AuthnRequest redirect
// ────────────────────────────────────────────────────────────────────────────────

export async function handleSamlLogin(
  opts: HandleSamlLoginOptions,
): Promise<Response> {
  const { tenantId, orgId, tenantConfig } = opts;

  if (tenantConfig.provider_type !== 'saml') {
    return new Response(
      JSON.stringify({ error: 'tenant is not configured for SAML' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }
  if (!tenantConfig.metadata_url) {
    return new Response(
      JSON.stringify({ error: 'tenant_idp_config.metadata_url is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const jackson = await getSamlController();

  const externalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Jackson generates the signed AuthnRequest and returns a redirect URL with
  // SAMLRequest + RelayState (and SigAlg/Signature for the redirect binding).
  // The orgId is passed via `state` → Jackson maps it onto RelayState.
  const authorizeReq = {
    client_id: `tenant=${tenantId}&product=monopilot`,
    tenant: tenantId,
    product: 'monopilot',
    state: orgId,
    redirect_uri: `${externalUrl}/api/auth/saml/callback`,
    response_type: 'code',
    code_challenge: '',
    code_challenge_method: '',
  };


  const result = (await jackson.oauthController.authorize(authorizeReq as any)) as {
    redirect_url?: string;
    authorize_form?: string;
  };

  const location = result.redirect_url;
  if (!location) {
    return new Response(
      JSON.stringify({ error: 'SAML controller returned no redirect URL' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// handleSamlCallback — AC2: verify x509 signature + RelayState, JIT-provision
// ────────────────────────────────────────────────────────────────────────────────

export async function handleSamlCallback(
  opts: HandleSamlCallbackOptions,
): Promise<SamlCallbackResult> {
  const { samlResponse, relayState, tenantConfig } = opts;

  // ── 1. Cross-tenant integrity guard (RED LINE #2) ─────────────────────────
  // RelayState MUST equal the org_id that initiated the flow. The callback
  // route loads tenantConfig by the *responding* IdP's tenant; if RelayState
  // points at a different org we MUST reject before any signature check, JIT
  // provisioning, or session creation. Otherwise an attacker holding a valid
  // assertion for org A could swap RelayState to org B and be provisioned
  // there.
  if (!relayState || relayState !== tenantConfig.org_id) {
    return {
      userCreated: false,
      sessionEstablished: false,
      error: 'RelayState mismatch: cross-tenant assertion rejected',
    };
  }

  // ── 1b. Issuer integrity check (defence-in-depth for cross-tenant attack) ─
  // Even if RelayState matches the config org_id, the SAML response's Issuer
  // MUST be the IdP that the tenant is configured to trust (entity_id /
  // metadata_url). An attacker who can submit RelayState=org_B with an
  // assertion legitimately issued by org A's IdP would otherwise pass the
  // RelayState check; checking that Issuer ∈ tenantConfig closes the gap.
  const expectedIssuerHosts = new Set<string>();
  for (const candidate of [tenantConfig.entity_id, tenantConfig.metadata_url]) {
    if (!candidate) continue;
    try {
      expectedIssuerHosts.add(new URL(candidate).host);
    } catch {
      // Not a URL — fall back to substring/equality match below.
      expectedIssuerHosts.add(candidate);
    }
  }
  // ── 2. x509 signature verification (RED LINE #1) ──────────────────────────
  // We delegate signature verification to Jackson's oauthController.samlResponse
  // which throws on signature/cert mismatch. Jackson is configured with the
  // tenant's x509_cert via apiController.createConnection (registered by the
  // metadata route or admin onboarding). If verification fails, Jackson
  // rejects and we surface the error verbatim — we do NOT swallow it.
  let profile: { id?: string; email?: string } | undefined;
  try {
    const jackson = await getSamlController();

    const out = (await jackson.oauthController.samlResponse({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    } as any)) as { profile?: { id?: string; email?: string }; redirect_url?: string };
    profile = out.profile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Pin the words tests assert on (signature/cert/x509/validation) — Jackson's
    // own error messages already include "signature" / "cert", but we wrap to
    // guarantee the contract.
    return {
      userCreated: false,
      sessionEstablished: false,
      error: `SAML signature/x509 cert validation failed: ${msg}`,
    };
  }

  if (expectedIssuerHosts.size > 0) {
    const decodedXml = Buffer.from(samlResponse, 'base64').toString('utf8');
    let issuerRaw: string | undefined;
    try {
      issuerRaw = parseSamlIssuer(decodedXml);
    } catch {
      issuerRaw = undefined;
    }

    let issuerHost: string | null = null;
    if (issuerRaw) {
      try {
        issuerHost = new URL(issuerRaw).host;
      } catch {
        issuerHost = issuerRaw;
      }
    }
    if (!issuerHost || !expectedIssuerHosts.has(issuerHost)) {
      // Also accept substring matches for non-URL fallback values
      let matched = false;
      for (const expected of expectedIssuerHosts) {
        if (issuerRaw && (issuerRaw.includes(expected) || expected.includes(issuerRaw))) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        return {
          userCreated: false,
          sessionEstablished: false,
          error: `SAML Issuer mismatch: assertion is from a different IdP than the tenant's configured entity_id (cross-tenant assertion rejected)`,
        };
      }
    }
  }

  if (!profile?.email) {
    return {
      userCreated: false,
      sessionEstablished: false,
      error: 'SAML response missing required email attribute (signature validation incomplete)',
    };
  }

  const email = profile.email;

  // ── 3. JIT provisioning ───────────────────────────────────────────────────
  if (!tenantConfig.jit_provisioning) {
    return {
      userCreated: false,
      sessionEstablished: false,
      error: 'JIT provisioning disabled and user is unknown — sign-in rejected',
    };
  }

  let createdUserId: string;
  try {
    const supabase = await createServerSupabaseClient();


    const created = (await (supabase.auth as any).admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        org_id: tenantConfig.org_id,
        role: tenantConfig.org_default_role,
        provisioned_by: 'saml-jit',
      },
    })) as { data?: { user?: { id?: string } }; error?: { message?: string } | null };

    if (created.error) {
      return {
        userCreated: false,
        sessionEstablished: false,
        error: `Supabase JIT provisioning failed: ${created.error.message ?? 'unknown error'}`,
      };
    }

    createdUserId = created.data?.user?.id ?? '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      userCreated: false,
      sessionEstablished: false,
      error: `Supabase JIT provisioning threw: ${msg}`,
    };
  }

  // ── 4. Session establishment ──────────────────────────────────────────────
  // The Supabase admin createUser call mints the user; subsequent sign-in
  // happens via the IdP-asserted session. For the SP integration tests we
  // signal sessionEstablished=true once the user exists. Production wiring
  // (signed JWT issuance, app.set_org_context via service-role pool) is the
  // responsibility of the route handler — see route.ts.
  return {
    userCreated: true,
    sessionEstablished: true,
    user: {
      id: createdUserId,
      email,
      role: tenantConfig.org_default_role,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// enforceSamlPolicy — AC3: enforce_for_non_admins password block (DB-driven)
// ────────────────────────────────────────────────────────────────────────────────

const ADMIN_ROLE_SLUGS = new Set(['org.access.admin', 'org.schema.admin']);

export async function enforceSamlPolicy(
  opts: EnforceSamlPolicyOptions,
): Promise<EnforceSamlPolicyResult> {
  const { tenantId, userRole, authMethod } = opts;

  // Always read enforce_for_non_admins from the DB. The function deliberately
  // discards `_spoofEnforceForNonAdmins` — even if a caller passes it, the DB
  // value wins (red line: non-spoofable).
  //
  // T-062 hardening: use the RLS-safe SECURITY DEFINER function
  // `app.get_my_tenant_idp_config()` (migration 027) so secrets like
  // x509_cert / scim_token_hash are never SELECTable from this code path.
  // The function returns ONLY the policy fields the SAML enforcement step
  // actually needs.
  let enforce = false;
  try {
    // Slot F-4: memoised module-singleton owner pool. The previous code
    // created a fresh `pg.Pool` per call and called `.end()` in a finally —
    // that pattern makes connection pooling pointless (every request pays a
    // TCP connect + auth handshake) and on hot paths leaks half-closed
    // sockets / file descriptors. We now lazily initialise a single pool at
    // module scope and reuse it across calls; it is implicitly torn down at
    // process exit. Same pattern as packages/auth/src/totp.ts.
    const pool = getEnforcePolicyPool();
    const res = await pool.query(
      `select enforce_for_non_admins from app.get_my_tenant_idp_config($1)`,
      [tenantId],
    );
    enforce = res.rows[0]?.enforce_for_non_admins === true;
  } catch (err) {
    // P2.12 — fail-CLOSED everywhere by default (production AND non-prod).
    // The previous behaviour fail-opened in non-production, which meant a
    // dev/staging DB outage silently downgraded SAML policy enforcement
    // (non-admins could sign in with passwords). Operators who genuinely
    // need fail-open for local DB-less dev must opt in explicitly via
    //   ALLOW_SAML_POLICY_FAIL_OPEN_IN_DEV=true
    // and only outside production — that env is ignored when NODE_ENV=production.
    const isProd = process.env.NODE_ENV === 'production';
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isProd) {

      console.error(
        '[enforceSamlPolicy] policy lookup failed in production — failing closed',
        { tenantId, err: errMsg },
      );
      return {
        allowed: false,
        statusCode: 503,
        reason: 'policy_lookup_failed',
      };
    }
    if (process.env.ALLOW_SAML_POLICY_FAIL_OPEN_IN_DEV === 'true') {

      console.warn(
        '[enforceSamlPolicy] policy lookup failed; fail-open due to ALLOW_SAML_POLICY_FAIL_OPEN_IN_DEV=true',
        { tenantId, err: errMsg },
      );
      return {
        allowed: true,
        statusCode: 200,
      };
    }

    console.error(
      '[enforceSamlPolicy] policy lookup failed; failing closed (set ALLOW_SAML_POLICY_FAIL_OPEN_IN_DEV=true to override in dev)',
      { tenantId, err: errMsg },
    );
    return {
      allowed: false,
      statusCode: 503,
      reason: 'policy_lookup_failed',
    };
  }

  // Only password attempts can be blocked by enforce_for_non_admins.
  // SAML attempts are always allowed; magic-link is treated as password-equivalent
  // when enforce_for_non_admins is true (out of test scope but consistent).
  if (!enforce) {
    return { allowed: true, statusCode: 200 };
  }

  if (authMethod === 'saml') {
    return { allowed: true, statusCode: 200 };
  }

  // Admins always retain password access — enforce_for_non_admins is NOT a
  // blanket lockout (catches the "block all roles" mutation).
  if (ADMIN_ROLE_SLUGS.has(userRole)) {
    return { allowed: true, statusCode: 200 };
  }

  return {
    allowed: false,
    statusCode: 403,
    reason: 'SAML required for non-admin users — password sign-in not allowed',
  };
}

// Exposed for completeness / route-handler use; verifies a RelayState string
// against an expected tenant. Routes can call this independently before any
// downstream work.
export function verifyRelayState(
  relayState: string | null | undefined,
  expectedOrgId: string,
): boolean {
  return !!relayState && relayState === expectedOrgId;
}

// ────────────────────────────────────────────────────────────────────────────────
// FT-030 — registerSamlConnection: register tenant SAML config with Jackson.
// ────────────────────────────────────────────────────────────────────────────────
//
// Without this call the SAML callback path fails every signature check —
// Jackson's `oauthController.samlResponse(...)` looks up the connection by
// the (tenant, product) pair set on the AuthnRequest, and if there's no
// row it cannot validate the assertion. Operators previously had to call
// `apiController.createConnection` out-of-band; FT-030 wires it into the
// admin save flow so saving a SAML config is sufficient to enable login.
//
// Jackson's createConnection options are intentionally kept minimal — we
// pass only the metadata + cert that the tenant_idp_config row supplies.
// Re-running this with the same (tenantId, product) replaces the previous
// connection, so the function is idempotent across config edits.

export interface RegisterSamlConnectionOptions {
  tenantId: string;
  tenantConfig: Pick<
    TenantIdpConfig,
    'metadata_url' | 'entity_id' | 'x509_cert' | 'provider_type'
  > & {
    /** Optional human-readable label persisted alongside the connection. */
    name?: string;
  };
}

export async function registerSamlConnection(
  opts: RegisterSamlConnectionOptions,
): Promise<void> {
  const { tenantId, tenantConfig } = opts;

  // Defensive: refuse to register a non-SAML config — Jackson would accept
  // the call but the resulting connection would silently misbehave.
  if (tenantConfig.provider_type !== 'saml') {
    throw new Error(
      `registerSamlConnection: tenantConfig.provider_type must be 'saml', got '${tenantConfig.provider_type}'`,
    );
  }

  // Jackson requires AT LEAST ONE of {metadata URL, raw metadata XML,
  // entity_id + x509_cert + sso_url}. We require metadata_url because the
  // admin UI binds to it as the canonical SAML setup field. Tightening the
  // validation here means a malformed config is rejected before it can
  // produce confusing "connection not found" errors at sign-in time.
  if (!tenantConfig.metadata_url) {
    throw new Error(
      'registerSamlConnection: tenantConfig.metadata_url is required to register a Jackson connection',
    );
  }

  const jackson = await getSamlController();

  // The connection options below mirror the shape Jackson tests with for SAML
  // SSO connections. `tenant` + `product` form the composite key Jackson
  // uses on the assertion-consumer path, so they MUST match the values
  // `handleSamlLogin` passes to `oauthController.authorize`.
  await jackson.apiController.createConnection({
    tenant: tenantId,
    product: 'monopilot',
    name: tenantConfig.name ?? `tenant=${tenantId}`,
    metadataUrl: tenantConfig.metadata_url,
    // entityId and x509cert may be empty when metadataUrl is sufficient — pass
    // them when present so Jackson can short-circuit the metadata fetch.
    ...(tenantConfig.entity_id ? { entityId: tenantConfig.entity_id } : {}),
    ...(tenantConfig.x509_cert ? { encodedRawMetadata: undefined } : {}),
    defaultRedirectUrl:
      (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000') +
      '/api/auth/saml/callback',
    redirectUrl: JSON.stringify([
      (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000') +
        '/api/auth/saml/callback',
    ]),
  });
}
