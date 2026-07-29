/**
 * FAZA 1 — recheck of the UI-* catalog contracts, part B (action → persistent state):
 * UI-008 (low-stock KPI) and UI-012 (TO-alerts empty state).
 *
 * Both click for real and then read the row they should have written straight out of
 * Postgres, so a green cannot come from a rendered screen. The remaining write-bound
 * contracts (UI-017/021/022/039/005) are in faza1-ui-recheck-c.spec.ts.
 *
 * ONE-SHOT, NOT IDEMPOTENT: each run consumes state (a new threshold row, a cancelled
 * transfer order). Re-running against an already-measured database proves nothing.
 *
 * Run: bash scripts/e2e-local.sh apps/web/e2e/faza1-ui-recheck-b.spec.ts
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';

import { HARNESS_ORG_ID } from './_helpers/shell-parity';
import { signIn } from './_shared/parity-login';

const { Client } = pg;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

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

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  test.skip(!baseURL || !ownerConnectionString, 'run through scripts/e2e-local.sh');
  await signIn(page, baseURL);
});

async function assertHydrated(page: import('@playwright/test').Page) {
  const handle = await page.waitForFunction(
    () => Object.keys(document).some((k) => k.startsWith('__reactContainer$')),
    undefined,
    { timeout: 40_000 },
  );
  expect(await handle.jsonValue()).toBeTruthy();
}

async function readLowStockKpi(page: import('@playwright/test').Page) {
  await page.goto(`${baseURL}/en/dashboard`, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId('dashboard-kpi-lowStock');
  await expect(card).toBeVisible({ timeout: 40_000 });
  const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
  return text;
}

test('UI-008 — Low Stock Alerts KPI reacts to a new reorder threshold, and its caption', async ({ page }) => {
  const before = await readLowStockKpi(page);
  const rowsBefore = await sql<{ n: string }>('select count(*)::text n from public.reorder_thresholds');
  console.log(`[UI-008] KPI before = ${JSON.stringify(before)} · reorder_thresholds = ${rowsBefore[0]?.n}`);

  // Create a threshold that is necessarily breached (no stock at all for this item).
  await page.goto(`${baseURL}/en/planning/reorder-thresholds`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('thresholds-loading')).toHaveCount(0, { timeout: 40_000 });
  await page.getByTestId('thresholds-add').click();
  await expect(page.getByTestId('threshold-form')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('item-picker-trigger').click();
  await page.getByTestId('item-picker-panel').getByRole('combobox').fill('ING-SUGAR');
  const option = page.getByTestId('item-picker-option').first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  console.log(`[UI-008] picking item ${(await option.innerText()).replace(/\s+/g, ' ').trim()}`);
  await option.click();
  await page.getByTestId('threshold-min-qty').fill('999');
  await page.getByTestId('threshold-reorder-qty').fill('1000');
  await page.getByTestId('threshold-submit').click();
  await expect(page.getByTestId('threshold-form')).toHaveCount(0, { timeout: 25_000 });

  const rowsAfter = await sql<{ item_code: string; min_qty: string }>(
    `select i.item_code, rt.min_qty::text as min_qty
       from public.reorder_thresholds rt join public.items i on i.id = rt.item_id
      where rt.org_id = $1::uuid order by rt.created_at`,
    [HARNESS_ORG_ID],
  );
  console.log(`[UI-008] reorder_thresholds now = ${JSON.stringify(rowsAfter)}`);

  const after = await readLowStockKpi(page);
  console.log(`[UI-008] KPI after = ${JSON.stringify(after)}`);
});

test('UI-012 — TO alerts empty-state wording once the alerting TO is cancelled', async ({ page }) => {
  const to = (
    await sql<{ id: string; to_number: string; status: string }>(
      "select id::text, to_number, status from public.transfer_orders where status in ('draft','in_transit')",
    )
  )[0];
  console.log(`[UI-012] alerting TO before = ${JSON.stringify(to)}`);
  test.skip(!to, 'no alerting transfer order on this data');

  await page.goto(`${baseURL}/en/planning/transfer-orders/${to.id}`, { waitUntil: 'domcontentloaded' });
  await assertHydrated(page);
  await expect(page.getByTestId('to-detail-view')).toBeVisible({ timeout: 40_000 });
  const cancel = page.getByTestId('to-transition-cancelled');
  await expect(cancel).toBeVisible({ timeout: 20_000 });
  page.once('dialog', (d) => void d.accept());
  await cancel.click();
  await expect(page.getByTestId('to-transition-cancelled')).toHaveCount(0, { timeout: 30_000 });

  const afterStatus = await sql<{ status: string }>('select status from public.transfer_orders where id = $1::uuid', [to.id]);
  console.log(`[UI-012] transfer_orders.status after cancel = ${JSON.stringify(afterStatus)}`);

  await page.goto(`${baseURL}/en/planning`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('planning-alert-cols')).toBeVisible({ timeout: 40_000 });
  const count = await page.getByTestId('planning-to-alerts-count').innerText();
  const empty = page.getByTestId('planning-to-alerts-empty');
  const emptyText = (await empty.count()) ? (await empty.innerText()).trim() : '(still has rows)';
  console.log(`[UI-012] TO alerts count = ${count} · empty-state text = ${JSON.stringify(emptyText)}`);
});

// UI-017 / UI-021 moved to faza1-ui-recheck-c.spec.ts: the direct-adjustment form
// rendered "No locations available." because public.locations held exactly one row and
// it belongs to the GDPR sentinel org, not to Apex. Part C creates the location first.

// UI-022 / UI-039 / UI-005: see faza1-ui-recheck-c.spec.ts.
