import type { Page } from '@playwright/test';

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

/** Sign in via the login form (mirrors npd-create-to-wo-flow / purchasing-chain specs). */
export async function signIn(page: Page, baseURL: string, locale = 'en'): Promise<void> {
  await page.goto(`${baseURL}/${locale}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
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
