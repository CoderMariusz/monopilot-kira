/**
 * Auth-storage generator for the Wave-6 settings parity + flow E2E suites.
 *
 * Logs in as the admin user through the real login form and saves the
 * authenticated session to PLAYWRIGHT_AUTH_STORAGE (default
 * apps/web/e2e/.auth/user.json). The parity runner + flow specs then load that
 * storageState.
 *
 * Run it explicitly (it is a `.setup.ts`, not a `*.spec.ts`, so the normal
 * suite never collects it):
 *
 *   PLAYWRIGHT_BASE_URL=<preview> \
 *   PLAYWRIGHT_LOGIN_EMAIL=admin@monopilot.test \
 *   PLAYWRIGHT_LOGIN_PASSWORD=<password> \
 *   pnpm --filter web exec playwright test \
 *     --config=../../playwright.config.ts e2e/settings/auth.setup.ts
 *
 * Then PLAYWRIGHT_AUTH_STORAGE points at the saved file for the capture run.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const webRoot = path.resolve(__dirname, '../../');
const authFile = process.env.PLAYWRIGHT_AUTH_STORAGE ?? path.join(webRoot, 'e2e/.auth/user.json');

test('authenticate as settings admin and persist storageState', async ({ page }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? 'admin@monopilot.test';
  const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD;
  test.skip(
    !baseURL || !password,
    'auth.setup needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_LOGIN_PASSWORD (and optionally PLAYWRIGHT_LOGIN_EMAIL) to mint a real admin session.',
  );

  mkdirSync(path.dirname(authFile), { recursive: true });
  await page.goto(`${baseURL}/en/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password as string);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click();

  // Land on the authenticated app shell (any non-auth route).
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
