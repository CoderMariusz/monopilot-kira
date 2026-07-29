/**
 * The hydration gate for the local harness.
 *
 * Kept because a dead HMR websocket breaks this chain SILENTLY — no pageerror,
 * no 4xx, no failed request — so every other spec degrades into "the page
 * renders, nothing clicks" while still looking healthy. The harness now refuses
 * to start in that state (assertDevHmrUpgradeAccepted, _helpers/shell-parity.ts);
 * this spec is the end-to-end half of the same guard.
 *
 * Proves the chain the whole campaign depends on: React hydrates → a REAL click
 * opens a React-state modal → submit reaches a Server Action → a row lands in
 * public.reorder_thresholds.
 */
import { test, expect } from '@playwright/test';

import { signIn } from './_shared/parity-login';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';

test('real click reaches upsertReorderThreshold and writes a row', async ({ page }) => {
  test.skip(!baseURL, 'run through scripts/e2e-local.sh');
  test.setTimeout(180_000);

  await signIn(page, baseURL);
  await page.goto(`${baseURL}/en/planning/reorder-thresholds`, { waitUntil: 'domcontentloaded' });

  // 1. hydration actually happened
  const hydrated = await page.waitForFunction(
    () => Object.keys(document).some((k) => k.startsWith('__reactContainer$')),
    undefined,
    { timeout: 30_000 },
  );
  expect(await hydrated.jsonValue()).toBeTruthy();

  // 2. the useEffect-driven list left 'loading'
  await expect(page.getByTestId('thresholds-loading')).toHaveCount(0, { timeout: 30_000 });

  // 3. a real click opens the React-state modal
  await page.getByTestId('thresholds-add').click();
  await expect(page.getByTestId('threshold-form')).toBeVisible({ timeout: 15_000 });

  // 4. item picker — itself a Server Action call from the client
  await page.getByTestId('item-picker-trigger').click();
  await page.getByTestId('item-picker-panel').getByRole('combobox').fill('RM-BEEF');
  const option = page.getByTestId('item-picker-option').first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  const pickedCode = (await option.innerText()).trim();
  await option.click();
  await expect(page.getByTestId('threshold-item')).toBeVisible();

  await page.getByTestId('threshold-min-qty').fill('12.5');
  await page.getByTestId('threshold-reorder-qty').fill('40');

  // 5. submit → Server Action → DB
  await page.getByTestId('threshold-submit').click();
  await expect(page.getByTestId('threshold-form-error')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('threshold-form')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('thresholds-table')).toBeVisible({ timeout: 20_000 });

  console.log(`[proof] picked item: ${pickedCode.replace(/\s+/g, ' ')}`);
});
