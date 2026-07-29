/**
 * FAZA 1 — UI-039 follow-up: what each of the two feature-flag screens actually
 * renders in its MAIN region (part C only captured the shell around it), and
 * whether the org-module toggle on /settings/features is reachable at all.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/faza1-ui-recheck-d.spec.ts
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';

import { signIn } from './_shared/parity-login';

const { Client } = pg;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

test('UI-039 — main region of /settings/features and /settings/flags', async ({ page }) => {
  test.skip(!baseURL || !ownerConnectionString, 'run through scripts/e2e-local.sh');
  test.setTimeout(180_000);
  await signIn(page, baseURL);

  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  const modules = await client.query<{ n: string }>('select count(*)::text n from public.modules');
  const orgModules = await client.query<{ n: string }>('select count(*)::text n from public.organization_modules');
  await client.end();
  console.log(`[UI-039] public.modules = ${modules.rows[0]?.n} · public.organization_modules = ${orgModules.rows[0]?.n}`);

  await page.goto(`${baseURL}/en/settings/features`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6_000);
  const main = page.locator('main').last();
  await expect(main).toBeVisible({ timeout: 60_000 });
  console.log(`[UI-039] features <main> = ${JSON.stringify((await main.innerText()).replace(/\s+/g, ' ').trim().slice(0, 900))}`);
  console.log(`[UI-039] features switches = ${await page.getByRole('switch').count()}`);
  console.log(`[UI-039] 'Unable to load' present = ${(await page.locator('body').innerText()).includes('Unable to load')}`);

  await page.goto(`${baseURL}/en/settings/flags`, { waitUntil: 'domcontentloaded' });
  const screen = page.getByTestId('settings-flags-admin-screen');
  await expect(screen).toBeVisible({ timeout: 60_000 });
  for (const tab of ['L2 local', 'L3 tenant']) {
    await page.getByRole('button', { name: new RegExp(tab, 'i') }).click();
    await page.waitForTimeout(1_500);
    console.log(`[UI-039] flags tab "${tab}" = ${JSON.stringify((await screen.innerText()).replace(/\s+/g, ' ').trim().slice(-260))}`);
  }
});
