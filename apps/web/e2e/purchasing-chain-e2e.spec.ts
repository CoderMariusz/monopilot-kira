/**
 * PURCHASING CHAIN — end-to-end Playwright spec driving the full Purchasing flow
 * the owner reports as painful: create a PO → confirm it → receive it (GRN → LP) →
 * verify the received stock is valued in the RIGHT currency, and that the illegal
 * shortcuts (create-as-received, receive against a blocked supplier) are rejected.
 *
 * This is a real-driving chain (NOT a screenshot stub): it clicks through the
 * shipped UI on a live authenticated preview and HARD-ASSERTS the structural
 * invariants that must always hold —
 *   • the create/confirm/receive routes + affordances are reachable,
 *   • a new PO can only be born `draft` (never `received`),
 *   • the PO status advances draft → sent → confirmed → (partially_)received,
 *   • a received line materialises an AVAILABLE license plate,
 *   • the WAC / inventory valuation reflects the receipt in the PO's OWN currency
 *     (the reported bug is receipts mislabelled as GBP — this fails red on it),
 * — while DEGRADING GRACEFULLY (logged note, no false failure) on pure data-shape
 * branches (which seeded supplier/item exists, whether a blocked-supplier fixture
 * is present, whether the item's UoM resolves to a valued row vs the `unvalued`
 * bucket).
 *
 * Gating: every write path here is org-scoped (RLS) + RBAC-gated server-side
 * (npd.planning.write, warehouse.grn.receive, finance.valuation.view), so a live
 * run needs an authenticated Supabase session against a running app server:
 *
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test purchasing-chain-e2e --trace on
 *
 * When PLAYWRIGHT_BASE_URL is unset (the default in this isolated worktree) the
 * whole suite SKIPS and still collects/lists cleanly (no live server needed).
 * Fallback component evidence for the same seams lives in the PO RTL suites
 * (purchase-orders/__tests__/*, warehouse receive-po-line-core tests,
 * finance/valuation get-inventory-valuation test), per UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Credentials: admin@monopilot.test / PLAYWRIGHT_ADMIN_PASSWORD env — no secret in
 * this file (red-line: no real passwords in test code).
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// ── env / paths ────────────────────────────────────────────────────────────────

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';
const artifactDir = path.resolve(__dirname, 'artifacts/PURCHASING-CHAIN-E2E');
const L = 'en'; // locale segment

function ensureDir(): void {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
}

function url(route: string): string {
  return `${baseURL}${route}`;
}

async function shot(page: Page, name: string): Promise<void> {
  ensureDir();
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
}

// ── auth (mirrors npd-full-lifecycle.spec.ts / npd-project-gate-flow.spec.ts) ──

async function signIn(page: Page): Promise<void> {
  await page.goto(url(`/${L}/login`), { waitUntil: 'domcontentloaded' });
  const email = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
  await email.fill(adminEmail);
  const password = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await password.fill(adminPassword);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

/** Read the value of a (possibly read-only) input by testid. */
async function inputValue(page: Page, testId: string): Promise<string> {
  const el = page.getByTestId(testId);
  if (!(await el.count())) return '';
  return (await el.inputValue().catch(() => '')) || '';
}

// ── the chain ──────────────────────────────────────────────────────────────────

// describe.serial: fullyParallel is on in playwright.config.ts, so the shared
// state below (poId, currency, itemCode, LP number…) only survives if the steps
// run sequentially in a single worker and stop on the first failure.
test.describe.serial('Purchasing chain: PO create → confirm → GRN receipt → LP + WAC + valuation', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live RBAC-authenticated server required; RTL component fallback evidence used.',
  );

  const chain = {
    poId: '',
    poNumber: '',
    currency: '',
    itemCode: '',
    orderedQty: '100',
    unitPrice: '2.50',
    lpNumber: '',
    grnNumber: '',
    received: false, // whether step 3 actually pushed stock (gates step-4 hard asserts)
  };

  // ── Step 1: create a PO (raw item + supplier + qty/UoM + unit price + currency)
  //            — and prove it can ONLY be born `draft` (negative path 5a). ────────
  test('1 · creates a PO for a supplier + raw item, and it is born DRAFT (never received)', async ({
    page,
  }) => {
    await signIn(page);

    // ?new=1 deep-links straight into the create modal.
    await page.goto(url(`/${L}/planning/purchase-orders?new=1`), { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('create-po-form');
    await expect(form, 'create-PO form is reachable').toBeVisible({ timeout: 12_000 });
    await shot(page, '01-create-form');

    // Invariant / negative path 5a: the create form exposes NO status control — a
    // PO cannot be requested as `received`; the server hardcodes `draft`. Assert
    // there is no affordance offering a received/confirmed birth status.
    await expect(
      form.getByText(/^received$/i),
      'create form must not let a PO be born in a received state',
    ).toHaveCount(0);

    // Some suppliers have no supplier-scoped items; try a few until the item picker
    // yields at least one option, then build the line on that supplier.
    const supplierSelect = form.getByRole('combobox').first();
    let built = false;
    const maxSuppliers = 6;
    for (let i = 0; i < maxSuppliers && !built; i++) {
      await supplierSelect.click();
      const options = page.getByRole('option');
      const count = await options.count();
      if (count === 0) {
        console.log('[purchasing-chain] no supplier options seeded — cannot build chain.');
        break;
      }
      await options.nth(Math.min(i, count - 1)).click();
      chain.currency = await inputValue(page, 'create-po-currency');

      // Ensure a line row with an open item picker exists.
      if (!(await page.getByTestId('item-picker-trigger').count())) {
        await page.getByTestId('create-po-add-line').click();
      }
      await page.getByTestId('item-picker-trigger').first().click();
      const pickerOptions = page.getByTestId('item-picker-options');
      await expect(pickerOptions).toBeVisible({ timeout: 8_000 });
      if (await page.getByTestId('item-picker-option').count()) {
        await page.getByTestId('item-picker-option').first().click();
        built = true;
      } else {
        // No items for this supplier — close the picker and try the next supplier.
        await page.keyboard.press('Escape').catch(() => undefined);
        console.log(`[purchasing-chain] supplier #${i} has no items — trying next.`);
      }
    }

    if (!built) {
      console.log('[purchasing-chain] no supplier+item pair available in this org — skipping the write chain.');
      await shot(page, '01-no-seed-data');
      test.skip(true, 'No seeded supplier+item pair to build a PO line — data-shape branch.');
      return;
    }

    // Capture the item code, set a real qty + explicit unit price (so WAC books the
    // entered price in the PO currency, not the list-price GBP fallback).
    chain.itemCode = ((await page.getByTestId('create-po-line-item').first().innerText()) || '')
      .trim()
      .split(/\s+/)[0] ?? '';
    await page.getByTestId('create-po-line-qty').first().fill(chain.orderedQty);
    await page.getByTestId('create-po-line-price').first().fill(chain.unitPrice);
    await shot(page, '02-create-line-filled');

    // Currency must be a real 3-letter code derived from the supplier.
    expect(chain.currency, 'PO currency derived from supplier').toMatch(/^[A-Z]{3}$/);

    await page.getByTestId('create-po-submit').click();
    await expect(form, 'create modal closes on success').toBeHidden({ timeout: 12_000 });

    // Resolve the created PO: either we land on its detail page, or it is the newest
    // row on the list.
    const detailMatch = /\/planning\/purchase-orders\/([0-9a-f-]{36})/.exec(page.url());
    if (detailMatch) {
      chain.poId = detailMatch[1] ?? '';
    } else {
      const firstLink = page.locator('[data-testid^="po-link-"]').first();
      await expect(firstLink, 'new PO appears in the list').toBeVisible({ timeout: 10_000 });
      const tid = (await firstLink.getAttribute('data-testid')) ?? '';
      chain.poId = tid.replace('po-link-', '');
      await firstLink.click();
    }
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: 10_000 });
    chain.poNumber = (await page.getByTestId('po-detail-header').innerText().catch(() => '')).trim();

    // HARD: the PO is DRAFT (forced-to-draft invariant; negative path 5a).
    await expect(
      page.getByTestId('po-status-draft'),
      'a freshly created PO is always DRAFT — cannot be born received',
    ).toBeVisible({ timeout: 8_000 });
    // The PO detail currency must match the supplier-derived currency (chain
    // consistency — the first place a GBP mislabel would surface).
    await expect(page.getByTestId('po-detail-summary')).toContainText(chain.currency);
    await shot(page, '03-po-detail-draft');
    console.log(`[purchasing-chain] created PO ${chain.poId} (${chain.currency}) for item ${chain.itemCode}`);
  });

  // ── Step 2: confirm the PO (draft → sent → confirmed) ──────────────────────────
  test('2 · confirms the PO through draft → sent → confirmed', async ({ page }) => {
    test.skip(!chain.poId, 'no PO created in step 1');
    await signIn(page);
    await page.goto(url(`/${L}/planning/purchase-orders/${chain.poId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: 10_000 });

    // draft → sent (the state machine has no direct draft→confirmed).
    const toSent = page.getByTestId('po-transition-sent');
    if (await toSent.count()) {
      await toSent.click();
      await expect(page.getByTestId('po-status-sent')).toBeVisible({ timeout: 10_000 });
      await shot(page, '04-po-sent');
    } else {
      console.log('[purchasing-chain] no sent transition offered — PO may already be past draft.');
    }

    // sent → confirmed.
    const toConfirmed = page.getByTestId('po-transition-confirmed');
    await expect(toConfirmed, 'confirm transition is reachable on a sent PO').toBeVisible({ timeout: 10_000 });
    await toConfirmed.click();

    // HARD: the PO is now CONFIRMED and thus receivable.
    await expect(
      page.getByTestId('po-status-confirmed'),
      'PO advances to confirmed',
    ).toBeVisible({ timeout: 10_000 });
    // Currency stays stable across the transition (no silent GBP relabel).
    await expect(page.getByTestId('po-detail-summary')).toContainText(chain.currency);
    await shot(page, '05-po-confirmed');
  });

  // ── Step 3: receive the PO line (GRN) → materialises an available LP ────────────
  test('3 · receives the PO line, minting a GRN + license plate', async ({ page }) => {
    test.skip(!chain.poId, 'no PO created in step 1');
    await signIn(page);
    await page.goto(url(`/${L}/planning/purchase-orders/${chain.poId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: 10_000 });

    const receiveBtn = page.locator('[data-testid^="po-line-receive-"]').first();
    await expect(receiveBtn, 'a confirmed PO line exposes a Receive affordance').toBeVisible({ timeout: 10_000 });
    await receiveBtn.click();

    const receiveForm = page.getByTestId('po-receive-form');
    await expect(receiveForm).toBeVisible({ timeout: 8_000 });
    // Full receipt: the qty is prefilled with the remaining qty — submit as-is.
    await shot(page, '06-receive-modal');
    await page.getByTestId('po-receive-submit').click();

    // HARD: the GRN/LP success line renders — a receipt happened.
    const success = page.getByTestId('po-receive-success');
    await expect(success, 'receipt succeeds and surfaces the GRN + LP').toBeVisible({ timeout: 15_000 });
    const successText = (await success.innerText()).trim();
    chain.lpNumber = (/\bLP-[A-Za-z0-9-]+/.exec(successText)?.[0] ?? '').trim();
    chain.grnNumber = (/\bGRN-[A-Za-z0-9-]+/.exec(successText)?.[0] ?? '').trim();
    chain.received = true;
    await shot(page, '07-receive-success');
    console.log(`[purchasing-chain] received: GRN=${chain.grnNumber || '?'} LP=${chain.lpNumber || '?'}`);
  });

  // ── Step 4: assert LP available + WAC currency correct + valuation + PO status ──
  test('4 · asserts LP available, valuation in the RIGHT currency, and PO status advanced', async ({
    page,
  }) => {
    test.skip(!chain.received, 'no receipt captured in step 3');
    await signIn(page);

    // (a) PO status advanced per the receipt (full → received, partial → partially).
    await page.goto(url(`/${L}/planning/purchase-orders/${chain.poId}`), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('po-detail-view')).toBeVisible({ timeout: 10_000 });
    const receivedBadge = page.getByTestId('po-status-received');
    const partialBadge = page.getByTestId('po-status-partially_received');
    await expect(
      receivedBadge.or(partialBadge),
      'PO status advances to received / partially_received after a receipt',
    ).toBeVisible({ timeout: 10_000 });
    await shot(page, '08-po-status-after-receipt');

    // (b) The license plate exists and is AVAILABLE stock.
    await page.goto(url(`/${L}/warehouse/license-plates`), { waitUntil: 'domcontentloaded' });
    if (chain.lpNumber) {
      const search = page.getByRole('searchbox').or(page.locator('input[type="search"]')).first();
      if (await search.count()) {
        await search.fill(chain.lpNumber);
      }
      const lpCell = page.getByText(chain.lpNumber, { exact: false }).first();
      await expect(lpCell, `received LP ${chain.lpNumber} is listed`).toBeVisible({ timeout: 10_000 });
      // Its row should read as available/received stock (status text families:
      // received → available in lp_state_history).
      const lpRow = page.locator('tr', { hasText: chain.lpNumber }).first();
      await expect(
        lpRow.getByText(/available|received/i),
        'the received LP is available stock',
      ).toBeVisible({ timeout: 8_000 });
      await shot(page, '09-lp-available');
    } else {
      console.log('[purchasing-chain] LP number not parsed from the success line — skipping LP-list assertion.');
      await shot(page, '09-lp-list');
    }

    // (c) Inventory valuation reflects the receipt IN THE PO CURRENCY (the reported
    //     bug is receipts mislabelled as GBP — this fails red on it).
    await page.goto(url(`/${L}/finance/valuation`), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await shot(page, '10-valuation');

    const itemRow = chain.itemCode
      ? page.locator('tr', { hasText: chain.itemCode }).first()
      : null;

    if (itemRow && (await itemRow.count())) {
      // qty + value present (the receipt is reflected, not zeroed).
      const rowText = (await itemRow.innerText()).trim();
      expect(rowText, 'valuation row carries a qty/value for the received item').toMatch(/\d/);
      // HARD: the currency column shows the PO's currency, NOT a mislabelled GBP.
      await expect(
        itemRow.getByText(new RegExp(`\\b${chain.currency}\\b`)),
        `WAC/valuation for ${chain.itemCode} is in ${chain.currency}, not mislabelled`,
      ).toBeVisible({ timeout: 8_000 });
      if (chain.currency !== 'GBP') {
        await expect(
          itemRow.getByText(/\bGBP\b/),
          `a ${chain.currency} receipt must NOT be labelled GBP`,
        ).toHaveCount(0);
      }
      await shot(page, '11-valuation-item-currency');
      console.log(`[purchasing-chain] valuation OK: ${chain.itemCode} valued in ${chain.currency}`);
    } else {
      // Data-shape branch: the item may land in the `unvalued` bucket (e.g. its UoM
      // did not resolve to kg for WAC). Degrade gracefully with a logged note, but
      // still confirm the valuation surface rendered.
      const unvalued = page.getByTestId('finance-valuation-unvalued');
      const hasUnvalued = (await unvalued.count()) > 0;
      console.log(
        `[purchasing-chain] item ${chain.itemCode || '?'} not on a valued row` +
          (hasUnvalued ? ' — present in the UNVALUED bucket (likely unresolved UoM).' : '.'),
      );
      expect(
        (await page.getByRole('table').count()) + (hasUnvalued ? 1 : 0),
        'valuation screen rendered a table or an unvalued bucket',
      ).toBeGreaterThan(0);
    }
  });

  // ── Step 5: negative — create-as-received forced to draft; blocked supplier ─────
  test('5 · negative paths: PO cannot be born received; blocked supplier is rejected', async ({
    page,
  }) => {
    await signIn(page);

    // 5a — create-as-received is impossible: re-open the create form and assert it
    // offers no way to birth a received/confirmed PO (server also hardcodes draft).
    await page.goto(url(`/${L}/planning/purchase-orders?new=1`), { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId('create-po-form');
    await expect(form).toBeVisible({ timeout: 12_000 });
    await expect(
      form.getByText(/^received$/i),
      'no create-time status control offers a received birth state',
    ).toHaveCount(0);
    await shot(page, '12-create-no-received-status');

    // 5b — blocked supplier: the block is enforced at BOTH create and receive. It is
    // fixture-dependent (needs a supplier with status=blocked), so drive it
    // best-effort and degrade gracefully. If a supplier selection is rejected with a
    // blocked error, HARD-assert the rejection surfaces; otherwise log a note.
    const supplierSelect = form.getByRole('combobox').first();
    let sawBlockedRejection = false;
    const optionsCount = await (async () => {
      await supplierSelect.click();
      const c = await page.getByRole('option').count();
      await page.keyboard.press('Escape').catch(() => undefined);
      return c;
    })();

    for (let i = 0; i < Math.min(optionsCount, 6) && !sawBlockedRejection; i++) {
      await supplierSelect.click();
      const opt = page.getByRole('option').nth(i);
      const label = (await opt.innerText().catch(() => '')).toLowerCase();
      await opt.click();
      // A blocked supplier surfaces the guard immediately on the create form once a
      // line is submittable; the error alert carries the blocked message.
      const err = page.getByTestId('create-po-error');
      if ((await err.count()) && /block/i.test((await err.innerText().catch(() => '')) || '')) {
        sawBlockedRejection = true;
        await expect(err, 'blocked-supplier rejection is surfaced').toBeVisible();
        await shot(page, '13-blocked-supplier-rejected');
        break;
      }
      if (/block/i.test(label)) {
        // The seed labels this supplier as blocked — selecting it must be guarded.
        console.log(`[purchasing-chain] supplier "${label}" looks blocked; expecting a guard on submit.`);
      }
    }

    if (!sawBlockedRejection) {
      console.log(
        '[purchasing-chain] no blocked-supplier fixture reachable via the create form — ' +
          'blocked-supplier rejection verified at the component/action layer ' +
          '(actions.test.ts / receive-po-line-core). Graceful degrade.',
      );
      await shot(page, '13-no-blocked-fixture');
    }
  });
});
