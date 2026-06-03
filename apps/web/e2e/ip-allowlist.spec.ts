/**
 * T-087 — E2E: admin IP allowlist 403 + SCIM bypass + impersonation bypass.
 *
 * The edge policy reads the client IP from `x-forwarded-for` (apps/web/proxy.ts
 * getClientIp) and denies admin routes with 403 when the IP is outside the
 * org's admin_ip_allowlist_cidrs (apps/web/lib/auth/edge-middleware-policy.ts
 * isRequestIpAllowed). Playwright can therefore spoof a denied IP via an extra
 * header — so the 403 case is runnable against a live preview where the test org
 * has an allowlist configured.
 *
 * Runs only when PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE are set AND the
 * org has an allowlist seeded (signalled by PLAYWRIGHT_IP_ALLOWLIST_DENY_IP, an
 * IP guaranteed outside the allowlist). Otherwise BLOCKED_AUTH skip — no fake.
 *
 * The SCIM-bypass and impersonation-bypass cases need seeded bearer/impersonation
 * tokens and are authored as `test.fixme` until the orchestrator seeds them.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const webRoot = path.resolve(__dirname, '../');
const adminRoute = '/en/settings/security';

function resolveAuth(): { baseURL?: string; authStorage?: string; denyIp?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter((v): v is string => Boolean(v));
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)), denyIp: process.env.PLAYWRIGHT_IP_ALLOWLIST_DENY_IP };
}

test.describe('T-087 admin IP allowlist', () => {
  test('admin route returns 403 from an IP outside the allowlist', async ({ browser }) => {
    const { baseURL, authStorage, denyIp } = resolveAuth();
    test.skip(
      !baseURL || !authStorage || !denyIp,
      'BLOCKED_AUTH: IP-allowlist 403 E2E needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE + PLAYWRIGHT_IP_ALLOWLIST_DENY_IP (an IP outside the seeded allowlist). Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({
      storageState: authStorage,
      extraHTTPHeaders: { 'x-forwarded-for': denyIp as string },
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseURL}${adminRoute}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), 'admin route must 403 when the source IP is outside the allowlist').toBe(403);
    } finally {
      await context.close();
    }
  });

  test.fixme('SCIM bearer path bypasses the IP allowlist (public bypass is intentional)', async () => {
    // Needs a seeded scim_ bearer token. Then call the SCIM endpoint from the
    // denied IP and assert it is NOT 403-gated by the admin IP allowlist (the
    // SCIM public bypass is intentional per edge-middleware-policy.ts).
  });

  test.fixme('impersonation session bypasses the IP allowlist', async () => {
    // Needs a seeded impersonation grant. Then assert an impersonated admin
    // session from the denied IP is allowed (support impersonation bypass).
  });
});
