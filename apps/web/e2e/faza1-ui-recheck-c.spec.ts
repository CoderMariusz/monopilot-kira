/**
 * FAZA 1 — UI-* recheck, part C: the contracts left over from part B.
 *
 * UI-017/UI-021 need at least one location in the harness org (Apex has none —
 * the only public.locations row belongs to the GDPR sentinel org), so the chain
 * starts by creating one through the settings UI. UI-005 stays last: it signs out.
 *
 * ONE-SHOT, NOT IDEMPOTENT: it creates a location, a pallet, an adjustment and a site.
 * Re-running against an already-measured database proves nothing.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/faza1-ui-recheck-c.spec.ts
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';

import { HARNESS_ORG_ID } from './_helpers/shell-parity';
import { signIn } from './_shared/parity-login';

const { Client } = pg;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';
const OTHER_ORG_ID = '00000000-0000-0000-0000-0000000000ee';

async function sql<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    const { rows } = await client.query<T>(text, params);
    return rows;
  } finally {
    await client.end();
  }
}

async function assertHydrated(page: import('@playwright/test').Page) {
  const handle = await page.waitForFunction(
    () => Object.keys(document).some((k) => k.startsWith('__reactContainer$')),
    undefined,
    { timeout: 40_000 },
  );
  expect(await handle.jsonValue()).toBeTruthy();
}

/** This Select is @monopilot/ui/Select: role=combobox button + portaled role=option list. */
async function pickOption(page: import('@playwright/test').Page, testid: string, index = 0) {
  await page.getByTestId(testid).getByRole('combobox').click();
  // Scope to the custom Select's portaled <div role=listbox>: a bare getByRole('option')
  // also matches the topbar's NATIVE <select> options, which are hidden.
  const option = page.locator('div[role="listbox"]').getByRole('option').nth(index);
  await expect(option).toBeVisible({ timeout: 10_000 });
  const label = (await option.innerText()).replace(/\s+/g, ' ').trim();
  await option.click();
  return label;
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  test.skip(!baseURL || !ownerConnectionString, 'run through scripts/e2e-local.sh');
  await signIn(page, baseURL);
});

test('fixture — create a location in the harness org (Apex has none)', async ({ page }) => {
  const existing = await sql<{ n: string }>('select count(*)::text n from public.locations where org_id = $1::uuid', [
    HARNESS_ORG_ID,
  ]);
  console.log(`[fixture] Apex locations before = ${existing[0]?.n}`);
  test.skip(Number(existing[0]?.n) > 0, 'Apex already has a location');

  await page.goto(`${baseURL}/en/settings/infra/locations`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('settings-location-tree-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /add location/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.locator('#location-code').fill('UI-BAY-01');
  await page.locator('#location-name').fill('UI recheck bay');
  const warehouse = dialog.getByRole('combobox').first();
  await warehouse.click();
  const whOption = page.locator('div[role="listbox"]').getByRole('option').first();
  console.log(`[fixture] warehouse option = ${(await whOption.innerText()).replace(/\s+/g, ' ').trim()}`);
  await whOption.click();
  await dialog.locator('button[type="submit"]').click();
  await page.waitForTimeout(6_000);

  const after = await sql<{ code: string; org_id: string; warehouse_id: string; is_active: boolean }>(
    'select code, org_id::text, warehouse_id::text, is_active from public.locations where org_id = $1::uuid',
    [HARNESS_ORG_ID],
  );
  console.log(`[fixture] Apex locations after = ${JSON.stringify(after)}`);
  const alerts = await page.locator('[role="alert"]').allInnerTexts();
  if (alerts.length) console.log(`[fixture] alerts = ${JSON.stringify(alerts.map((a) => a.replace(/\s+/g, ' ').trim()))}`);
  expect(after.length).toBeGreaterThan(0);
});

test('UI-017 / UI-021 — adjustment from the "New" entry, then the multi-site aggregate', async ({ page }) => {
  await page.goto(`${baseURL}/en/warehouse/adjustments/new`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('adjust-form')).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId('adjust-locations-empty').count()) {
    console.log('[UI-017/021] still "No locations available." — chain unreachable');
    test.fail(true, 'no location available in the harness org');
    return;
  }

  console.log(`[UI-017/021] location = ${await pickOption(page, 'adjust-location')}`);
  await page.getByTestId('adjust-item-trigger').click();
  await page.getByTestId('adjust-item-panel').getByRole('combobox').fill('ING-SUGAR');
  const item = page.getByTestId('adjust-item-option').first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await item.click();
  await page.getByTestId('adjust-direction-increase').click();
  // 25.0005 kg: a value that only survives verbatim if nothing rounds it (UI-021).
  await page.getByTestId('adjust-quantity').fill('25.0005');
  await page.getByTestId('adjust-uom').fill('kg');
  console.log(`[UI-017/021] reason = ${await pickOption(page, 'adjust-reason')}`);
  // NOTE: the local fake GoTrue accepts any password, so this proves NOTHING about
  // the e-sign gate — it only lets the mutation through so the rows below exist.
  await page.getByTestId('adjust-password').fill('e2e-local');
  await page.getByTestId('adjust-submit').click();

  await Promise.race([
    page.getByTestId('adjust-success').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
    page.getByTestId('adjust-error').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
    page.getByTestId('adjust-validation-error').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined),
  ]);
  const success = page.getByTestId('adjust-success');
  console.log(
    `[UI-017/021] outcome = ${
      (await success.count())
        ? `SUCCESS ${(await success.innerText()).replace(/\s+/g, ' ').trim()}`
        : `FAILED ${JSON.stringify(await page.locator('[role="alert"], [data-state="error"]').allInnerTexts())}`
    }`,
  );

  const lps = await sql<{ lp_number: string; quantity: string; uom: string; status: string }>(
    'select lp_number, quantity::text, uom, status from public.license_plates where org_id = $1::uuid order by created_at desc limit 3',
    [HARNESS_ORG_ID],
  );
  const adj = await sql<{ n: string }>('select count(*)::text n from public.stock_adjustments where org_id = $1::uuid', [
    HARNESS_ORG_ID,
  ]);
  console.log(`[UI-017/021] license_plates = ${JSON.stringify(lps)} · stock_adjustments = ${adj[0]?.n}`);

  // UI-017 counter-control — the second nav entry ("history") must show it.
  await page.goto(`${baseURL}/en/warehouse/adjustments`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6_000);
  const history = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`[UI-017] /warehouse/adjustments = ${JSON.stringify(history.slice(0, 700))}`);

  // UI-021 — the aggregate must be rounded, carry a unit, and move by the added qty.
  await page.goto(`${baseURL}/en/multi-site`, { waitUntil: 'domcontentloaded' });
  const kpis = page.locator('[aria-label="Network KPIs"]');
  await expect(kpis).toBeVisible({ timeout: 60_000 });
  console.log(`[UI-021] ${(await kpis.innerText()).replace(/\s+/g, ' ').trim()}`);
  const dbAgg = await sql<{ uom: string; total: string }>(
    `select uom, sum(quantity)::text as total from public.license_plates
      where org_id = $1::uuid and status not in ('consumed','shipped','destroyed','merged','returned')
      group by uom order by uom`,
    [HARNESS_ORG_ID],
  );
  console.log(`[UI-021] db aggregate = ${JSON.stringify(dbAgg)}`);
});

test('UI-022 — site metadata validation on create', async ({ page }) => {
  const openAdd = async () => {
    await page.goto(`${baseURL}/en/settings/sites`, { waitUntil: 'domcontentloaded' });
    await assertHydrated(page);
    await page.getByRole('button', { name: /add site/i }).first().click();
    await expect(page.getByTestId('sites-add-site-form')).toBeVisible({ timeout: 20_000 });
  };
  const submitAndReport = async (tag: string) => {
    await page.getByTestId('sites-add-site-form').locator('button[type="submit"]').click();
    await page.waitForTimeout(6_000);
    const err = page.getByTestId('sites-modal-error');
    console.log(
      `[UI-022${tag}] modal error = ${(await err.count()) ? JSON.stringify((await err.first().innerText()).trim()) : '(none — accepted)'}`,
    );
  };

  // (a) lowercase country code + valid IANA timezone.
  await openAdd();
  await page.locator('#site-code').fill('UI022A');
  await page.locator('#site-name').fill('UI-022 country case');
  await page.locator('#site-timezone').fill('Europe/Warsaw');
  await page.locator('#site-country').fill('uk');
  await submitAndReport('a');

  // (b) invalid timezone.
  await openAdd();
  await page.locator('#site-code').fill('UI022B');
  await page.locator('#site-name').fill('UI-022 bad timezone');
  await page.locator('#site-timezone').fill('CET+1');
  await page.locator('#site-country').fill('PL');
  await submitAndReport('b');

  console.log(
    `[UI-022] public.sites = ${JSON.stringify(
      await sql('select site_code, country, timezone from public.sites order by created_at'),
    )}`,
  );
  console.log(`[UI-022] distinct country = ${JSON.stringify(await sql('select distinct country from public.sites order by 1'))}`);
});

test('UI-039 — the two feature-flag screens; a toggle must persist and not leak', async ({ page }) => {
  const features = await page.goto(`${baseURL}/en/settings/features`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await page.waitForTimeout(5_000);
  console.log(
    `[UI-039] /settings/features (HTTP ${features?.status()}) = ${JSON.stringify(
      (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 600),
    )}`,
  );

  await page.goto(`${baseURL}/en/settings/flags`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  const screen = page.getByTestId('settings-flags-admin-screen');
  await expect(screen).toBeVisible({ timeout: 60_000 });
  console.log(`[UI-039] /settings/flags = ${JSON.stringify((await screen.innerText()).replace(/\s+/g, ' ').trim().slice(0, 800))}`);

  const FLAG = 'scanner.pwa.enabled';
  console.log(
    `[UI-039] ${FLAG} before = ${JSON.stringify(
      await sql('select org_id::text, is_enabled from public.feature_flags_core where flag_code = $1 order by org_id', [FLAG]),
    )}`,
  );
  const toggle = page.locator(`[aria-label="${FLAG}"]`).first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(6_000);
    const alerts = await page.locator('[role="alert"]').allInnerTexts();
    console.log(`[UI-039] alerts after toggle = ${JSON.stringify(alerts.map((a) => a.replace(/\s+/g, ' ').trim()))}`);
  } else {
    console.log('[UI-039] no toggle control found for the flag');
  }
  const after = await sql<{ org_id: string; is_enabled: boolean }>(
    'select org_id::text, is_enabled from public.feature_flags_core where flag_code = $1 order by org_id',
    [FLAG],
  );
  console.log(`[UI-039] ${FLAG} after  = ${JSON.stringify(after)}`);
  console.log(`[UI-039] other org still = ${after.find((r) => r.org_id === OTHER_ORG_ID)?.is_enabled}`);
});

test('UI-005 — user menu contents, then sign out (LAST: ends the session)', async ({ page }) => {
  await page.goto(`${baseURL}/en/planning`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  const trigger = page.getByTestId('app-topbar-user-trigger');
  await expect(trigger).toBeVisible({ timeout: 40_000 });
  console.log(`[UI-005] aria-expanded before = ${await trigger.getAttribute('aria-expanded')}`);
  await trigger.click();
  console.log(`[UI-005] aria-expanded after  = ${await trigger.getAttribute('aria-expanded')}`);

  const menu = page.locator('div.absolute.right-0.top-12');
  await expect(menu).toBeVisible({ timeout: 10_000 });
  const menuText = (await menu.innerText()).replace(/\s+/g, ' ').trim();
  console.log(`[UI-005] menu text = ${JSON.stringify(menuText)}`);
  console.log(
    `[UI-005] menu links = ${JSON.stringify(
      await menu.locator('a').evaluateAll((els) =>
        els.map((e) => ({ text: (e.textContent ?? '').trim(), href: (e as HTMLAnchorElement).getAttribute('href') })),
      ),
    )}`,
  );
  console.log(
    `[UI-005] menu buttons = ${JSON.stringify((await menu.locator('button').allInnerTexts()).map((b) => b.replace(/\s+/g, ' ').trim()))}`,
  );
  console.log(`[UI-005] profile/PIN entry present = ${/profile|\bpin\b/i.test(menuText)}`);

  await page.getByTestId('app-topbar-sign-out').click();
  await page.waitForURL(/\/login/, { timeout: 40_000 }).catch(() => undefined);
  console.log(`[UI-005] after sign out = ${new URL(page.url()).pathname}`);
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForTimeout(3_000);
  console.log(`[UI-005] after back-button = ${new URL(page.url()).pathname}`);
  console.log(
    `[UI-005] cookies left = ${JSON.stringify((await page.context().cookies()).map((c) => c.name).filter((n) => n.includes('auth')))}`,
  );
});
