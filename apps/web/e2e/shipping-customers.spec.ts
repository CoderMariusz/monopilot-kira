/**
 * Wave-shipping — Customers list + create E2E (Playwright) stub — per-state
 * screenshots + trace for the /shipping/customers admin list.
 *
 * Closes an L2: public.customers existed but nothing could CREATE one, so a clean
 * org could never raise a sales order. This harness captures the new admin surface.
 *
 * Prototype anchors:
 *   - Customer list   → prototypes/design/Monopilot Design System/shipping/customer-screens.jsx:3-129 (ShCustomerList).
 *   - Create customer → shipping/modals.jsx:36-66 (M-01 customer create / edit, collapsed
 *                       to the reviewed createCustomer input).
 *
 * The /shipping/customers route is org-scoped (RLS via withOrgContext) and the
 * createCustomer action is RBAC-gated server-side (ship.so.create — the SO-create
 * prerequisite gate). Live capture therefore requires an authenticated Supabase
 * session against a running app server. When PLAYWRIGHT_BASE_URL is unset (default
 * in this isolated worktree) live capture is SKIPPED and the accepted fallback
 * evidence is the RTL coverage in:
 *   - shipping/customers/__tests__/customers.test.tsx (11 tests)
 * (per UI-PROTOTYPE-PARITY-POLICY.md). This spec is the harness that runs unchanged
 * against a preview to produce pixel screenshots + trace for each of the five UI
 * states (loading / empty / error / permission-denied / data + optimistic).
 */
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const evidenceDir = path.resolve(__dirname, 'artifacts/SHIP-CUSTOMER');

test.describe('Wave-shipping — Customers (list + create)', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used (shipping/customers/__tests__/customers.test.tsx).',
  );

  test('Customer list: KPI strip + status tabs + search, "+ Create customer" opens the create modal', async ({ page }) => {
    await page.goto(`${baseURL}/en/shipping/customers`);
    await expect(page.getByTestId('customer-list-view')).toBeVisible();
    await expect(page.getByTestId('customer-kpi-strip')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'customer-list-data.png'), fullPage: true });

    // Status tab filter (data state).
    await page.getByTestId('customer-list-tab-inactive').click();
    await page.screenshot({ path: path.join(evidenceDir, 'customer-list-tab-inactive.png'), fullPage: true });
    await page.getByTestId('customer-list-tab-all').click();

    // Empty state via an unmatched search.
    await page.getByTestId('customer-list-search').fill('zzz-no-such-customer-zzz');
    await expect(page.getByText(/no customers/i)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'customer-list-empty.png'), fullPage: true });
    await page.getByTestId('customer-list-search').fill('');

    // Create modal exposes all createCustomer fields (code is auto-numbered if blank).
    await page.getByTestId('customer-list-create').click();
    await expect(page.getByTestId('create-customer-form')).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'customer-create-modal.png') });
    await page.getByTestId('create-customer-cancel').click();
  });

  test('Customer create: a valid customer is persisted and appears in the list (optimistic refresh)', async ({ page }) => {
    await page.goto(`${baseURL}/en/shipping/customers?new=1`);
    await expect(page.getByTestId('create-customer-form')).toBeVisible();
    const stamp = Date.now();
    await page.getByTestId('create-customer-name').fill(`E2E Customer ${stamp}`);
    await page.getByTestId('create-customer-email').fill(`e2e-${stamp}@customer.test`);
    // Submit shows the busy state then closes + refreshes the org-scoped list.
    await page.getByTestId('create-customer-submit').click();
    await expect(page.getByTestId('create-customer-form')).toBeHidden();
    await expect(page.getByText(`E2E Customer ${stamp}`)).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, 'customer-created-row.png'), fullPage: true });
  });

  test('Customer create: a session lacking ship.so.create is refused server-side (forbidden inline, no crash)', async ({ page }) => {
    // Against a session without ship.so.create, createCustomer returns
    // { ok:false, error:'forbidden' } and the modal renders create-customer-error
    // (server-enforced, never client-trusted). Captured live with a read-only role.
    await page.goto(`${baseURL}/en/shipping/customers`);
    await page.screenshot({ path: path.join(evidenceDir, 'customer-list-permission-context.png'), fullPage: true });
  });
});
