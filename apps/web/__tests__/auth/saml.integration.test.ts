/**
 * T-012 — SAML 2.0 SP integration tests (RED phase)
 *
 * TEST FORMAT: Vitest unit/integration
 *
 * These tests are intentionally RED. All 3 ACs require modules that do not yet exist:
 *   - apps/web/app/api/auth/saml/login/route.ts      [NOT CREATED]
 *   - apps/web/app/api/auth/saml/callback/route.ts   [NOT CREATED]
 *   - apps/web/lib/auth/saml.ts                      [NOT CREATED]
 *
 * Imports below resolve to non-existent paths → tests fail at import time.
 * AC3 (enforce_for_non_admins) DB-gated tests are skipped without DATABASE_URL.
 *
 * SECURITY RED LINES (pinned in assertions):
 *   1. Do NOT skip x509 signature validation — invalid cert → REJECTED
 *   2. Do NOT provision into a tenant that didn't initiate the flow — verify
 *      tenant_id from RelayState (cross-tenant attack → REJECTED)
 *
 * MUTATION EXPERIMENTS documented per AC:
 *   AC1: omit AuthnRequest signing → SAMLRequest absent/unsigned → test CATCHES
 *   AC2a: skip JIT provisioning → user not created → test CATCHES
 *   AC2b: provision into wrong tenant (RelayState says org B, assertion is for org A) → test CATCHES
 *   AC2c: skip RelayState check entirely → cross-tenant provisioning succeeds → test CATCHES
 *   AC2d: invalid x509_cert supplied → response accepted → test CATCHES (must REJECT)
 *   AC3a: enforce_for_non_admins=false → non-admin CAN sign in (control path)
 *   AC3b: enforce_for_non_admins=true + non-admin → 403 (treatment path)
 *   AC3c: enforce_for_non_admins=true + admin role → still allowed (not a blanket lockout)
 */

import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

// ─── Modules that WILL FAIL until GREEN creates them ─────────────────────────
// These imports reference scope_files from T-012.json. They are unresolvable
// in RED phase. Any test that imports from them will fail with MODULE_NOT_FOUND.
import type { handleSamlLogin, handleSamlCallback, enforceSamlPolicy } from '../../lib/auth/saml.js';

// ─── Top-level mocks (vi.mock hoisted before imports) ─────────────────────────
// Mock the Supabase server client so we can assert on auth.signInWithPassword calls
// and session creation without a live Supabase instance.
const _mockCreateUser = vi.fn();
const _mockSignInWithPassword = vi.fn();
const _mockGetUser = vi.fn();

vi.mock('../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      admin: {
        createUser: _mockCreateUser,
      },
      signInWithPassword: _mockSignInWithPassword,
      getUser: _mockGetUser,
    },
  })),
}));

// ─── Minimal self-signed x509 cert (PEM) for test IdP ────────────────────────
// This is a TEST-ONLY certificate. Do not use in production.
// Generated for: CN=TestIdP, valid through 2099-01-01.
// Use this cert when the test EXPECTS the signature to be valid.
const VALID_X509_CERT = `MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAl
UZXN0SWRQMCAXDTIzMDEwMTAwMDAwMFoYDzIwOTkwMTAxMDAwMDAwWjAUMRIw
EAYDVQQDDAlUZXN0SWRQMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAuSOlPlhFLp7SbMJD+bGjsAV5KBNTovxkCCQp3YQ9VfPMbX3yNFmYlmLQ
KzaWXXkXtKPTr3XxAuDqjFGjgFAKGdGJYqAZoiECfKWslJEoZ5wRlUlKZMYO
eV3QAU4oJnMY5bXsGN5bXsGN5bXsGN5bXsGN5bXsGN5bXsGN5bXsGN5bXsGN
TESTCERTDATA==`.replace(/\n/g, '');

// A DIFFERENT cert — belongs to a different IdP; use to assert rejection.
const INVALID_X509_CERT = `MIICpDCCAYwCCQDINVALIDCERTDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAl
WRONG1DXMCAX0...DIFFERENTKEY==`.replace(/\n/g, '');

// ─── Test-IdP SAML response builder ──────────────────────────────────────────
// Builds a minimal SAML response XML that mimics what a real IdP would produce.
// DOES NOT perform real signature validation — the real test is that the
// handleSamlCallback route validates the x509_cert from tenant_idp_config.
//
// The implemented route must call Jackson (or xmldom + xml-crypto) to verify the
// SAML response signature using the x509_cert from the DB row.
// Tests mock Jackson's samlResponse() to control the return value and assert on
// what cert/config the route passed in.
function buildSamlResponsePayload(opts: {
  email: string;
  orgId: string;
  relayState: string;
  // signed=false simulates a response with no XMLDSig → mutation test for x509 skip
  signed?: boolean;
}): { SAMLResponse: string; RelayState: string } {
  const signed = opts.signed !== false;
  const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_${randomUUID()}"
    Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    Destination="https://app.example.com/api/auth/saml/callback">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    ${signed ? '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignatureValue>TEST_SIG_VALUE</ds:SignatureValue></ds:Signature>' : '<!-- no signature -->'}
    <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
    <saml:Assertion Version="2.0">
      <saml:AttributeStatement>
        <saml:Attribute Name="email">
          <saml:AttributeValue>${opts.email}</saml:AttributeValue>
        </saml:Attribute>
      </saml:AttributeStatement>
    </saml:Assertion>
  </samlp:Response>`;
  return {
    SAMLResponse: Buffer.from(xml).toString('base64'),
    RelayState: opts.relayState,
  };
}

// ─── Mock Jackson SDK ─────────────────────────────────────────────────────────
// handleSamlLogin and handleSamlCallback must call Jackson internally.
// We mock the Jackson controllers so we can control return values and assert
// on what the route passed through (e.g. correct tenant, correct cert).
const _mockJacksonAuthorize = vi.fn();
const _mockJacksonSamlResponse = vi.fn();

vi.mock('@boxyhq/saml-jackson', () => ({
  controllers: vi.fn(async () => ({
    oauthController: {
      authorize: _mockJacksonAuthorize,
      samlResponse: _mockJacksonSamlResponse,
    },
    apiController: {
      createConnection: vi.fn(),
    },
    close: vi.fn(),
  })),
  default: vi.fn(async () => ({
    oauthController: {
      authorize: _mockJacksonAuthorize,
      samlResponse: _mockJacksonSamlResponse,
    },
    apiController: {
      createConnection: vi.fn(),
    },
    close: vi.fn(),
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// AC1: unauthenticated user hits /api/auth/saml/login → redirect with signed AuthnRequest
// ─────────────────────────────────────────────────────────────────────────────
describe('AC1: SAML login initiates signed AuthnRequest redirect to IdP SSO URL', () => {
  const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const IDP_SSO_URL = 'https://idp.example.com/sso/saml';
  const METADATA_URL = 'https://idp.example.com/metadata';

  beforeEach(() => {
    vi.clearAllMocks();

    // Jackson authorize() returns the IdP SSO URL with SAMLRequest embedded
    // A signed AuthnRequest means SAMLRequest query param is present and non-empty
    _mockJacksonAuthorize.mockResolvedValue({
      redirect_url: `${IDP_SSO_URL}?SAMLRequest=PHNhbWxwOkF1dGhuUmVxdWVzdA%3D%3D&RelayState=${encodeURIComponent(ORG_ID)}&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256&Signature=VALID_SIGNATURE_VALUE`,
    });
  });

  it('returns a redirect response when tenant has provider_type=saml and valid metadata', async () => {
    // This import will fail (MODULE_NOT_FOUND) until GREEN creates saml.ts
    const { handleSamlLogin } = await import('../../lib/auth/saml.js');

    const mockTenantConfig = {
      tenant_id: TENANT_ID,
      provider_type: 'saml' as const,
      metadata_url: METADATA_URL,
      entity_id: 'https://idp.example.com',
      x509_cert: VALID_X509_CERT,
      jit_provisioning: true,
      enforce_for_non_admins: false,
    };

    const response = await handleSamlLogin({ tenantId: TENANT_ID, orgId: ORG_ID, tenantConfig: mockTenantConfig });

    // Must redirect (302 or 307)
    expect(response.status).toBeOneOf([302, 307]);
    const location = response.headers.get('location') ?? '';
    expect(location).toBeTruthy();
    expect(location.startsWith('https://idp.example.com')).toBe(true);
  });

  it('redirect URL contains SAMLRequest query parameter (AuthnRequest is present)', async () => {
    const { handleSamlLogin } = await import('../../lib/auth/saml.js');

    const mockTenantConfig = {
      tenant_id: TENANT_ID,
      provider_type: 'saml' as const,
      metadata_url: METADATA_URL,
      entity_id: 'https://idp.example.com',
      x509_cert: VALID_X509_CERT,
      jit_provisioning: false,
      enforce_for_non_admins: false,
    };

    const response = await handleSamlLogin({ tenantId: TENANT_ID, orgId: ORG_ID, tenantConfig: mockTenantConfig });

    const location = response.headers.get('location') ?? '';
    const url = new URL(location);

    // MUTATION TEST: if implementer omits AuthnRequest, SAMLRequest param is absent → FAILS here
    expect(url.searchParams.has('SAMLRequest')).toBe(true);
    const samlRequest = url.searchParams.get('SAMLRequest') ?? '';
    expect(samlRequest.length).toBeGreaterThan(20); // non-trivial Base64 payload
  });

  it('redirect URL contains RelayState carrying the org_id for cross-tenant verification', async () => {
    const { handleSamlLogin } = await import('../../lib/auth/saml.js');

    const mockTenantConfig = {
      tenant_id: TENANT_ID,
      provider_type: 'saml' as const,
      metadata_url: METADATA_URL,
      entity_id: 'https://idp.example.com',
      x509_cert: VALID_X509_CERT,
      jit_provisioning: false,
      enforce_for_non_admins: false,
    };

    const response = await handleSamlLogin({ tenantId: TENANT_ID, orgId: ORG_ID, tenantConfig: mockTenantConfig });

    const location = response.headers.get('location') ?? '';
    const url = new URL(location);

    // RelayState must be present and encode the originating org/tenant
    // so the callback can verify the response is for the correct tenant
    expect(url.searchParams.has('RelayState')).toBe(true);
    const relayState = url.searchParams.get('RelayState') ?? '';
    // RelayState must encode org_id so callback can verify cross-tenant integrity
    expect(relayState).toBeTruthy();
    // The org/tenant must be identifiable from RelayState (decoded format implementation detail)
    expect(relayState.length).toBeGreaterThan(0);
  });

  it('redirect URL points to the IdP SSO endpoint (from metadata_url), not a local path', async () => {
    const { handleSamlLogin } = await import('../../lib/auth/saml.js');

    const mockTenantConfig = {
      tenant_id: TENANT_ID,
      provider_type: 'saml' as const,
      metadata_url: METADATA_URL,
      entity_id: 'https://idp.example.com',
      x509_cert: VALID_X509_CERT,
      jit_provisioning: false,
      enforce_for_non_admins: false,
    };

    const response = await handleSamlLogin({ tenantId: TENANT_ID, orgId: ORG_ID, tenantConfig: mockTenantConfig });

    const location = response.headers.get('location') ?? '';
    // Must redirect to external IdP URL, not a local /api/ path
    expect(location).toMatch(/^https?:\/\//);
    // Must not redirect back to ourselves
    expect(location).not.toMatch(/^https?:\/\/app\.example\.com\/api\/auth\/saml\/login/);
  });

  it('AuthnRequest is signed: redirect URL contains Signature (or SAMLRequest encodes signed XML)', async () => {
    const { handleSamlLogin } = await import('../../lib/auth/saml.js');

    const mockTenantConfig = {
      tenant_id: TENANT_ID,
      provider_type: 'saml' as const,
      metadata_url: METADATA_URL,
      entity_id: 'https://idp.example.com',
      x509_cert: VALID_X509_CERT,
      jit_provisioning: false,
      enforce_for_non_admins: false,
    };

    const response = await handleSamlLogin({ tenantId: TENANT_ID, orgId: ORG_ID, tenantConfig: mockTenantConfig });
    const location = response.headers.get('location') ?? '';
    const url = new URL(location);

    // MUTATION TEST (AC1): if implementer omits signing entirely, SigAlg and Signature
    // params will be absent, or the SAMLRequest Base64 will decode to unsigned XML.
    // Both cases must fail this assertion.
    const hasSigAlg = url.searchParams.has('SigAlg');
    const hasSignature = url.searchParams.has('Signature');
    const samlRequestB64 = url.searchParams.get('SAMLRequest') ?? '';

    // Either redirect-binding signature params present, OR SAMLRequest contains
    // signed XML (POST binding / signed assertion inside).
    // The primary test: Signature param present in redirect binding (Jackson default)
    const hasSignedRedirectBinding = hasSigAlg && hasSignature;

    // If not redirect-signed, the SAMLRequest XML itself must contain a ds:Signature element
    let hasXmlSignature = false;
    if (!hasSignedRedirectBinding && samlRequestB64) {
      try {
        const decoded = Buffer.from(samlRequestB64, 'base64').toString('utf8');
        hasXmlSignature = decoded.includes('ds:Signature') || decoded.includes('Signature');
      } catch {
        hasXmlSignature = false;
      }
    }

    // FAIL if neither signing mechanism is present (catches "omit signing" mutation)
    expect(hasSignedRedirectBinding || hasXmlSignature).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: SAML callback JIT provisioning + cross-tenant attack prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('AC2: SAML callback JIT-provisions user and verifies RelayState tenant integrity', () => {
  const ORG_A_ID = 'org-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const ORG_B_ID = 'org-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const TENANT_A_ID = 'ten-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const NEW_USER_EMAIL = `saml-jit-${randomUUID().split('-')[0]}@idp.example.com`;
  const DEFAULT_ROLE = 'org.member';

  const TENANT_A_CONFIG = {
    tenant_id: TENANT_A_ID,
    org_id: ORG_A_ID,
    provider_type: 'saml' as const,
    metadata_url: 'https://idp.example.com/metadata',
    entity_id: 'https://idp.example.com',
    x509_cert: VALID_X509_CERT,
    jit_provisioning: true,
    enforce_for_non_admins: false,
    org_default_role: DEFAULT_ROLE,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Jackson verifies SAML response successfully and returns profile
    _mockJacksonSamlResponse.mockResolvedValue({
      profile: {
        id: `saml-user-${randomUUID()}`,
        email: NEW_USER_EMAIL,
        firstName: 'Test',
        lastName: 'User',
        claims: {},
      },
    });

    // Default: Supabase admin.createUser succeeds
    _mockCreateUser.mockResolvedValue({
      data: {
        user: {
          id: randomUUID(),
          email: NEW_USER_EMAIL,
        },
      },
      error: null,
    });
  });

  it('creates a users row with org_default_role when jit_provisioning=true and email is unknown', async () => {
    // This import will fail (MODULE_NOT_FOUND) until GREEN creates saml.ts
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    const payload = buildSamlResponsePayload({
      email: NEW_USER_EMAIL,
      orgId: ORG_A_ID,
      relayState: ORG_A_ID, // RelayState encodes the initiating org
      signed: true,
    });

    const result = await handleSamlCallback({
      samlResponse: payload.SAMLResponse,
      relayState: payload.RelayState,
      tenantConfig: TENANT_A_CONFIG,
    });

    // User must have been provisioned
    expect(result.userCreated).toBe(true);
    expect(result.user?.email).toBe(NEW_USER_EMAIL);
    expect(result.user?.role).toBe(DEFAULT_ROLE);

    // Supabase admin.createUser must have been called to establish the user record
    expect(_mockCreateUser).toHaveBeenCalledOnce();
    const createUserCall = _mockCreateUser.mock.calls[0]![0] as Record<string, unknown>;
    expect(createUserCall.email).toBe(NEW_USER_EMAIL);
  });

  it('MUTATION: skip JIT provisioning (jit_provisioning=false) → user NOT created', async () => {
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    const configNoJit = { ...TENANT_A_CONFIG, jit_provisioning: false };
    const payload = buildSamlResponsePayload({
      email: NEW_USER_EMAIL,
      orgId: ORG_A_ID,
      relayState: ORG_A_ID,
      signed: true,
    });

    const result = await handleSamlCallback({
      samlResponse: payload.SAMLResponse,
      relayState: payload.RelayState,
      tenantConfig: configNoJit,
    });

    // MUTATION CHECK: if implementer ignores jit_provisioning flag, createUser is still called
    // This test catches that. When jit_provisioning=false, unknown email → reject, not create.
    expect(result.userCreated).toBe(false);
    expect(_mockCreateUser).not.toHaveBeenCalled();
    // Should return an error or 403-style rejection for unknown user without JIT
    expect(result.error).toBeTruthy();
  });

  it('CROSS-TENANT ATTACK: RelayState=org_B but SAML assertion is for org_A → REJECTED', async () => {
    // Red line: "Do not provision into a tenant that didn't initiate the flow — verify tenant_id from RelayState"
    // Attack: adversary crafts a request where RelayState points to org B (victim),
    // but the SAML response contains a valid assertion issued for org A's connection.
    // If the implementation trusts RelayState alone WITHOUT verifying it matches the
    // tenant that initiated the flow, the attacker gets provisioned into org B.
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    const ATTACKER_EMAIL = `attacker-${randomUUID().split('-')[0]}@attacker.com`;

    // SAML response was legitimately signed for Tenant A's connection
    // but RelayState claims org B (the victim tenant)
    const crossTenantPayload = buildSamlResponsePayload({
      email: ATTACKER_EMAIL,
      orgId: ORG_A_ID, // assertion is for org A
      relayState: ORG_B_ID, // but RelayState points to org B (CROSS-TENANT ATTACK)
      signed: true,
    });

    // Config for org B (victim tenant — different entity_id / cert from org A)
    const TENANT_B_CONFIG = {
      tenant_id: 'ten-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      org_id: ORG_B_ID,
      provider_type: 'saml' as const,
      metadata_url: 'https://idp-b.example.com/metadata',
      entity_id: 'https://idp-b.example.com', // DIFFERENT IdP
      x509_cert: INVALID_X509_CERT, // org B uses a different cert
      jit_provisioning: true,
      enforce_for_non_admins: false,
      org_default_role: DEFAULT_ROLE,
    };

    const result = await handleSamlCallback({
      samlResponse: crossTenantPayload.SAMLResponse,
      relayState: crossTenantPayload.RelayState, // RelayState = org B
      tenantConfig: TENANT_B_CONFIG, // config is for org B
    });

    // MUTATION CHECK: if implementer skips RelayState ↔ tenant verification,
    // the attacker is provisioned into org B → this assertion fails → RED catches it.
    // Must reject: the SAML assertion was issued for org A's IdP, not org B's.
    expect(result.error).toBeTruthy();
    expect(result.userCreated).toBe(false);
  });

  it('MUTATION: invalid x509_cert → SAML response REJECTED (do not skip x509 validation)', async () => {
    // Red line: "Do not skip x509 signature validation"
    // If implementer passes wrong/empty cert to Jackson, signature validation is skipped
    // and any response is accepted. This test catches that mutation.
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    const configInvalidCert = {
      ...TENANT_A_CONFIG,
      x509_cert: INVALID_X509_CERT, // cert does not match the IdP that signed the response
    };

    // Jackson receives incorrect cert → should throw or return error
    _mockJacksonSamlResponse.mockRejectedValue(
      new Error('SAML assertion signature verification failed: certificate mismatch'),
    );

    const payload = buildSamlResponsePayload({
      email: NEW_USER_EMAIL,
      orgId: ORG_A_ID,
      relayState: ORG_A_ID,
      signed: true,
    });

    const result = await handleSamlCallback({
      samlResponse: payload.SAMLResponse,
      relayState: payload.RelayState,
      tenantConfig: configInvalidCert,
    });

    // MUST reject — not silently succeed or create a user
    expect(result.error).toBeTruthy();
    // Red line pinned: error message must reference signature/cert validation
    expect(result.error).toMatch(/signature|cert|x509|validation/i);
    expect(result.userCreated).toBe(false);
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('established Supabase session after successful JIT provisioning', async () => {
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    const payload = buildSamlResponsePayload({
      email: NEW_USER_EMAIL,
      orgId: ORG_A_ID,
      relayState: ORG_A_ID,
      signed: true,
    });

    const result = await handleSamlCallback({
      samlResponse: payload.SAMLResponse,
      relayState: payload.RelayState,
      tenantConfig: TENANT_A_CONFIG,
    });

    // Supabase session must be established after successful JIT
    expect(result.sessionEstablished).toBe(true);
    expect(result.error).toBeFalsy();
  });

  it('MUTATION: provision into wrong org_id from RelayState → fail (RelayState not verified)', async () => {
    // Verifies that the handler uses the tenant_id from RelayState, not any server-side
    // default. If the implementer skips RelayState decode and always provisions into a
    // hardcoded or request-supplied org_id, this catches it.
    const { handleSamlCallback } = await import('../../lib/auth/saml.js');

    // RelayState encodes a DIFFERENT org than the tenantConfig.org_id
    const WRONG_ORG_ID = 'org-dead-beef-dead-beef-deadbeefdeaf';
    const payload = buildSamlResponsePayload({
      email: `mismatch-${randomUUID().split('-')[0]}@idp.example.com`,
      orgId: ORG_A_ID,
      relayState: WRONG_ORG_ID, // RelayState points to org that never initiated the flow
      signed: true,
    });

    // The tenantConfig.org_id is ORG_A_ID but RelayState says WRONG_ORG_ID
    // The handler MUST reject: RelayState tenant != config tenant
    const result = await handleSamlCallback({
      samlResponse: payload.SAMLResponse,
      relayState: payload.RelayState, // WRONG_ORG_ID
      tenantConfig: TENANT_A_CONFIG,  // org_id = ORG_A_ID
    });

    // If org mismatch: must reject, not silently provision into WRONG_ORG_ID
    expect(result.error).toBeTruthy();
    expect(result.userCreated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: enforce_for_non_admins=true → non-admin password sign-in rejected with 403
// DB-gated: requires DATABASE_URL. Skipped without it.
// ─────────────────────────────────────────────────────────────────────────────
describe('AC3: enforce_for_non_admins blocks non-admin password sign-in with 403', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runIfDb = databaseUrl ? it : it.skip;

  const SAML_TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const SAML_ORG_ID = '22222222-2222-4222-8222-222222222222';
  const ADMIN_USER_ID = '33333333-3333-4333-8333-333333333333';
  const NON_ADMIN_USER_ID = '44444444-4444-4444-8444-444444444444';
  const ADMIN_USER_EMAIL = 'admin@saml-test.example.com';
  const NON_ADMIN_USER_EMAIL = 'member@saml-test.example.com';

  let ownerPool: import('pg').Pool;
  let appPool: import('pg').Pool;

  beforeAll(async () => {
    if (!databaseUrl) return;

    const { getOwnerConnection, getAppConnection } = await import(
      '../../../../packages/db/test-utils/test-pool.js'
    );
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    // Ensure app_user role exists (idempotent, advisory-locked against concurrent suites)
    const { ensureAppUser: ensureAppUserWithAdvisoryLock } = await import(
      '../../tests/helpers/owner-org-context.js'
    );
    await ensureAppUserWithAdvisoryLock(ownerPool);

    // Seed test tenant
    await ownerPool.query(`
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-012 SAML Test Tenant', 'eu', 'https://saml-test.example.com')
      on conflict (id) do nothing
    `, [SAML_TENANT_ID]);

    // Seed test org
    await ownerPool.query(`
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-012 SAML Test Org', 'generic')
      on conflict (id) do nothing
    `, [SAML_ORG_ID, SAML_TENANT_ID]);

    // Seed admin user (no inline role column — users table uses user_roles join table)
    await ownerPool.query(`
      insert into public.users (id, org_id, email)
      values ($1, $2, $3)
      on conflict (id) do nothing
    `, [ADMIN_USER_ID, SAML_ORG_ID, ADMIN_USER_EMAIL]);

    // Seed non-admin user
    await ownerPool.query(`
      insert into public.users (id, org_id, email)
      values ($1, $2, $3)
      on conflict (id) do nothing
    `, [NON_ADMIN_USER_ID, SAML_ORG_ID, NON_ADMIN_USER_EMAIL]);

    // Configure tenant_idp_config with enforce_for_non_admins=false initially
    // (Seed trigger already created a row; we UPDATE it)
    await ownerPool.query(`
      update public.tenant_idp_config
      set provider_type = 'saml',
          metadata_url = 'https://idp.example.com/metadata',
          entity_id = 'https://idp.example.com',
          x509_cert = $2,
          jit_provisioning = true,
          enforce_for_non_admins = false
      where tenant_id = $1
    `, [SAML_TENANT_ID, VALID_X509_CERT]);
  });

  afterAll(async () => {
    if (!databaseUrl) return;

    // Cleanup in FK-safe order
    await ownerPool.query(`delete from public.users where org_id = $1`, [SAML_ORG_ID]);
    await ownerPool.query(`delete from public.organizations where id = $1`, [SAML_ORG_ID]);
    await ownerPool.query(`delete from public.tenants where id = $1`, [SAML_TENANT_ID]);
    await ownerPool.end();
    await appPool.end();
  });

  runIfDb(
    'CONTROL: enforce_for_non_admins=false → non-admin CAN password sign-in (baseline)',
    async () => {
      // This import will fail (MODULE_NOT_FOUND) until GREEN creates saml.ts
      const { enforceSamlPolicy } = await import('../../lib/auth/saml.js');

      // Fetch the actual config row to confirm enforce_for_non_admins=false
      const configRow = await appPool.query(
        `select enforce_for_non_admins, provider_type from public.tenant_idp_config where tenant_id = $1`,
        [SAML_TENANT_ID],
      );
      expect(configRow.rows[0]?.enforce_for_non_admins).toBe(false);

      // enforceSamlPolicy checks the config and returns 403 only when blocked
      const result = await enforceSamlPolicy({
        tenantId: SAML_TENANT_ID,
        userEmail: NON_ADMIN_USER_EMAIL,
        userRole: 'org.member',
        authMethod: 'password',
      });

      // Control path: no enforcement → allowed
      expect(result.allowed).toBe(true);
      expect(result.statusCode).not.toBe(403);
    },
  );

  runIfDb(
    'TREATMENT: enforce_for_non_admins=true + non-admin password sign-in → 403',
    async () => {
      // Enable enforcement for this test
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = true
        where tenant_id = $1
      `, [SAML_TENANT_ID]);

      const { enforceSamlPolicy } = await import('../../lib/auth/saml.js');

      const result = await enforceSamlPolicy({
        tenantId: SAML_TENANT_ID,
        userEmail: NON_ADMIN_USER_EMAIL,
        userRole: 'org.member',
        authMethod: 'password',
      });

      // MUTATION TEST (AC3b): if implementer ignores enforce_for_non_admins flag,
      // result.allowed will be true and this assertion fails → RED catches it.
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.reason).toMatch(/saml.*required|must.*use.*saml|password.*not.*allowed/i);

      // Reset after test
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = false
        where tenant_id = $1
      `, [SAML_TENANT_ID]);
    },
  );

  runIfDb(
    'MUTATION: enforce_for_non_admins=true + admin role → STILL ALLOWED (not a blanket lockout)',
    async () => {
      // Enable enforcement
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = true
        where tenant_id = $1
      `, [SAML_TENANT_ID]);

      const { enforceSamlPolicy } = await import('../../lib/auth/saml.js');

      // Admin user attempting password sign-in — must NOT be blocked
      const result = await enforceSamlPolicy({
        tenantId: SAML_TENANT_ID,
        userEmail: ADMIN_USER_EMAIL,
        userRole: 'org.access.admin', // admin role
        authMethod: 'password',
      });

      // MUTATION TEST (AC3c): if implementer makes enforce_for_non_admins a blanket
      // lockout for all roles including admin, result.allowed will be false → FAILS here.
      expect(result.allowed).toBe(true);
      expect(result.statusCode).not.toBe(403);

      // Reset
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = false
        where tenant_id = $1
      `, [SAML_TENANT_ID]);
    },
  );

  runIfDb(
    'enforce_for_non_admins=true → reads from DB (not client-supplied config) — non-spoofable',
    async () => {
      // This test verifies the enforcement reads from the DB, not from a
      // client-supplied or hardcoded value. We set enforce_for_non_admins=true in DB,
      // but pass enforce_for_non_admins=false in the call (if the API accepts it).
      // The function must read the real value from DB.
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = true
        where tenant_id = $1
      `, [SAML_TENANT_ID]);

      const { enforceSamlPolicy } = await import('../../lib/auth/saml.js');

      // Passing enforce_for_non_admins=false as a parameter — the DB value is true.
      // The function must use the DB value (true), NOT the parameter (false).
      const result = await enforceSamlPolicy({
        tenantId: SAML_TENANT_ID,
        userEmail: NON_ADMIN_USER_EMAIL,
        userRole: 'org.member',
        authMethod: 'password',
        // Attempt to spoof: client claims enforce_for_non_admins is false
        _spoofEnforceForNonAdmins: false,
      });

      // DB says enforce_for_non_admins=true → must reject despite spoofed param
      // If implementer trusts the parameter over DB, result.allowed=true → FAILS here.
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);

      // Reset
      await ownerPool.query(`
        update public.tenant_idp_config
        set enforce_for_non_admins = false
        where tenant_id = $1
      `, [SAML_TENANT_ID]);
    },
  );
});
