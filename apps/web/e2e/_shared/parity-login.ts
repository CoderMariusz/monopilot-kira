/**
 * The one sign-in step for every live flow spec.
 *
 * Two modes, one helper:
 *
 * - default (deployed app): fills the /{locale}/login form with
 *   PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD and waits for the redirect
 *   away from /login. Unchanged from what the specs did before.
 * - E2E_LOCAL=1 (scripts/e2e-local.sh): there is no Supabase Auth in front of the
 *   local Postgres — passwords do not live in public.users — so the form can never
 *   succeed. Instead we install the same session cookie the shell-parity harness
 *   uses; the harness' fake GoTrue answers /auth/v1/user for middleware, layout and
 *   withOrgContext. scripts/e2e-local-run.ts exports E2E_LOCAL_SUPABASE_URL.
 */
import type { Page } from '@playwright/test';

import { installHarnessAuthCookie } from '../_helpers/shell-parity';

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

/** True when the run is driven by scripts/e2e-local.sh against the local database. */
export const isLocalHarnessRun = process.env.E2E_LOCAL === '1';

/** Sign in against `baseURL` (defaults to PLAYWRIGHT_BASE_URL, which every flow spec gates on). */
export async function signIn(
  page: Page,
  baseURL: string = process.env.PLAYWRIGHT_BASE_URL ?? '',
  locale = 'en',
): Promise<void> {
  if (isLocalHarnessRun) {
    const supabaseUrl = process.env.E2E_LOCAL_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error(
        'E2E_LOCAL=1 but E2E_LOCAL_SUPABASE_URL is unset — start the run via scripts/e2e-local.sh so the fake Supabase Auth server exists.',
      );
    }
    await installHarnessAuthCookie(page.context(), baseURL, supabaseUrl);
    return;
  }

  await page.goto(`${baseURL}/${locale}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/work email/i).or(page.locator('input[type="email"]')).first();
  await email.fill(adminEmail);
  const password = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await password.fill(adminPassword);
  // type=submit, not a name regex — the button label is localized (e.g. "Zaloguj się" on /pl).
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}
