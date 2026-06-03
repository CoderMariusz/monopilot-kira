/**
 * T-082 — E2E: SSO SAML round-trip with a mock Entra IdP (S-A1).
 *
 * HONEST STATUS: authored as `test.fixme`. A real SAML round-trip needs a mock
 * Entra/SAML IdP that issues a signed assertion the app's ACS endpoint will
 * accept (signing cert + IdP metadata + a relay-state handshake). That mock IdP
 * is not provisioned in this authoring worktree and cannot be faked without
 * fabricating a signed assertion — which the parity policy and the "tests run
 * for real" rule forbid.
 *
 * Infra needed for the orchestrator to un-fixme this:
 *  - a mock SAML IdP (e.g. samltest.id, a node-saml-idp container, or a Vercel
 *    preview-only stub) reachable from the preview;
 *  - SAML connection config seeded for the test org (entityId, ACS URL, IdP
 *    cert);
 *  - PLAYWRIGHT_SAML_IDP_URL + PLAYWRIGHT_BASE_URL.
 */
import { test } from '@playwright/test';

test.describe('T-082 SSO SAML round-trip (mock Entra IdP)', () => {
  test.fixme('SP-initiated login redirects to IdP, posts a signed assertion to ACS, and lands authenticated', async () => {
    // 1. GET /api/auth/saml/login?org=<slug> → 302 to PLAYWRIGHT_SAML_IDP_URL.
    // 2. Mock IdP auto-posts a signed SAMLResponse to the app ACS endpoint.
    // 3. Assert the session cookie is set and the user lands on the app shell.
    // 4. Assert a JIT-provisioned user row exists for the asserted NameID.
  });

  test.fixme('assertion with an unknown/invalid signature is rejected', async () => {
    // Post a tampered SAMLResponse to ACS and assert 401/403 + no session.
  });
});
