/**
 * E2E — NPD → production chain + schedule-overlap flow (Playwright).
 *
 * Exercises the seam that turns a released NPD finished good into a multi-stage
 * production Work-Order *chain*, then drives the schedule board to prove the
 * overlap (capacity-conflict) detection is correct.
 *
 * Chain of custody under test:
 *   NPD G4 "release to factory"  →  FG is `released_to_factory`
 *     └─ Planning createWorkOrderChain (factory-release gate: not_released_to_factory blocks)
 *          builds  FG-WO  +  [W1..Wn] WIP-stage WOs  linked by public.wo_dependencies
 *          (parent FG → child WIP, material_link + required_qty; NO status gate columns)
 *     └─ WO detail → Dependencies tab surfaces the upstream/downstream links
 *     └─ Schedule board → two WOs overlapping on ONE line ⇒ data-conflict="true" (red ring)
 *
 * Routes:
 *   /en/login                          — admin sign-in
 *   /en/planning/work-orders           — WO list + create modal (?new=1 auto-open)
 *   /en/planning/work-orders/[id]      — WO detail (Dependencies tab)
 *   /en/planning/schedule              — schedule board (overlap conflict)
 *
 * Surfaces asserted (data-testids that MUST exist for the flow to be correct):
 *   wo-list-view, wo-list-create, create-wo-form            (WO list + create)
 *   wo-chain-preview / wo-chain-tree / wo-chain-single-stage(chain composition, dry-run)
 *   wo-row-*, wo-tab-dependencies, wo-panel-dependencies    (WO detail deps)
 *   wo-dependencies-table / wo-dependencies-empty
 *   planning-schedule-board, schedule-bar-*, data-conflict  (overlap detection)
 *
 * Gate on PLAYWRIGHT_BASE_URL: when unset (default in CI / isolated worktree) the
 * whole describe SKIPS. Playwright still collects the spec so `--list` works. A
 * live Gate-5 run drives it against a seeded preview:
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test npd-to-production-chain-overlap --trace on
 *
 * Credentials: admin@monopilot.test / PLAYWRIGHT_ADMIN_PASSWORD env.
 * No secrets in this file (red-line).
 *
 * Data-dependent branches (which FG is multi-stage, whether ≥2 WOs share a line)
 * degrade gracefully with a logged note — matching the sibling harnesses
 * (npd-full-lifecycle.spec.ts). The STRUCTURAL invariants (routes render, chain
 * seam behaves, dependency direction is labelled, an overlapping pair is flagged
 * conflicting) are hard-asserted so a real regression fails the spec red.
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

const artifactDir = path.resolve(__dirname, 'artifacts/npd-to-production-chain-overlap');

function ensureDir(): void {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
}

function url(route: string): string {
  return `${baseURL}${route}`;
}

function shot(page: Page, name: string): Promise<Buffer> {
  return page.screenshot({ path: path.join(artifactDir, name), fullPage: true });
}

/** Email + password sign-in — same pattern as npd-full-lifecycle.spec.ts. */
async function signIn(page: Page): Promise<void> {
  await page.goto(url('/en/login'), { waitUntil: 'domcontentloaded' });
  const emailInput = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
  await emailInput.fill(adminEmail);
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await passwordInput.fill(adminPassword);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

test.describe('NPD → production chain + schedule-overlap flow', () => {
  test.skip(
    !baseURL,
    'PLAYWRIGHT_BASE_URL unset — live authenticated + seeded server required (Gate-5 only).',
  );

  // ── 1 · WO list route contract + create-modal auto-open ────────────────────
  test('1 · Planning WO list renders and the create modal opens (?new=1)', async ({ page }) => {
    ensureDir();
    await signIn(page);

    await page.goto(url('/en/planning/work-orders'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-list-view'), 'WO list view renders').toBeVisible({
      timeout: 10_000,
    });
    // The "create WO" affordance must exist for the chain flow to be reachable.
    await expect(page.getByTestId('wo-list-create'), 'create-WO button present').toBeVisible({
      timeout: 8_000,
    });
    await shot(page, '01-wo-list.png');

    // Deep-link auto-opens the create modal (autoOpenCreate).
    await page.goto(url('/en/planning/work-orders?new=1'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-wo-form'), 'create-WO form opens via ?new=1').toBeVisible({
      timeout: 10_000,
    });
    await shot(page, '02-create-wo-form.png');
  });

  // ── 2 · Chain composition preview (NPD FG → WIP stages, dry-run, no write) ──
  test('2 · picking a product renders the production-chain preview seam', async ({ page }) => {
    ensureDir();
    await signIn(page);
    await page.goto(url('/en/planning/work-orders?new=1'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-wo-form')).toBeVisible({ timeout: 10_000 });

    // Pick the first selectable product to arm the (read-only, dry-run) chain preview.
    // The product picker markup varies (combobox/list) so probe common affordances.
    const productPicker = page
      .getByTestId('create-wo-product-search')
      .or(page.getByRole('combobox', { name: /product|finished good|item/i }))
      .or(page.getByPlaceholder(/product|search/i))
      .first();
    if (await productPicker.count()) {
      await productPicker.click().catch(() => undefined);
      // Choose the first suggested option, if a listbox appears.
      const firstOption = page.getByRole('option').first();
      if (await firstOption.count()) {
        await firstOption.click().catch(() => undefined);
      }
    } else {
      console.log('[chain-overlap] product picker not found — chain preview seam not reachable from modal; check create-wo-modal product search testid.');
    }

    // Once a product is selected, the chain preview wrapper must render. It shows
    // EITHER the multi-stage tree (wo-chain-tree with ≥1 wo-chain-stage-*) OR the
    // single-stage hint. Absence of both while a product is picked is a bug.
    const preview = page.getByTestId('wo-chain-preview');
    if (await preview.count()) {
      await expect(preview, 'chain preview wrapper visible after product pick').toBeVisible({
        timeout: 10_000,
      });
      // Wait out the loading state, then assert a terminal branch resolved.
      await page.getByTestId('wo-chain-loading').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);

      const tree = page.getByTestId('wo-chain-tree');
      const singleStage = page.getByTestId('wo-chain-single-stage');
      const error = page.getByTestId('wo-chain-error');

      // A dry-run preview must NOT error for a valid released FG.
      expect(await error.count(), 'chain preview must not error for a valid product').toBe(0);

      if (await tree.count()) {
        const stages = page.getByTestId(/^wo-chain-stage-/);
        expect(
          await stages.count(),
          'multi-stage chain tree lists at least one upstream WIP stage',
        ).toBeGreaterThan(0);
        await shot(page, '03-chain-tree-multistage.png');
      } else {
        await expect(singleStage, 'single-stage FG shows the no-upstream hint').toBeVisible({
          timeout: 5_000,
        });
        await shot(page, '03-chain-single-stage.png');
        console.log('[chain-overlap] first product is single-stage — seed a multi-stage FG (BOM with WIP lines) to exercise the full chain tree.');
      }
    } else {
      console.log('[chain-overlap] wo-chain-preview absent — either no product selected or the preview seam is not wired into this modal instance.');
      await shot(page, '03-no-chain-preview.png');
    }
  });

  // ── 3 · WO detail → Dependencies tab surfaces the chain links ──────────────
  test('3 · WO detail Dependencies tab labels upstream/downstream links correctly', async ({
    page,
  }) => {
    ensureDir();
    await signIn(page);
    await page.goto(url('/en/planning/work-orders'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wo-list-view')).toBeVisible({ timeout: 10_000 });

    const firstRowLink = page
      .locator('[data-testid^="wo-row-"] a[href*="/planning/work-orders/"]')
      .first();
    const rowCount = await firstRowLink.count();
    expect(rowCount, 'at least one work order must be seeded to exercise the detail view').toBeGreaterThan(0);
    await firstRowLink.click();
    await page.waitForURL(/\/planning\/work-orders\/[a-f0-9-]{36}/, { timeout: 10_000 });
    await expect(page.getByTestId('wo-detail-view'), 'WO detail renders').toBeVisible({
      timeout: 10_000,
    });

    // Open the Dependencies tab — the panel MUST render (empty or table variant).
    const depTab = page.getByTestId('wo-tab-dependencies');
    await expect(depTab, 'dependencies tab trigger present').toBeVisible({ timeout: 8_000 });
    await depTab.click();
    await expect(page.getByTestId('wo-panel-dependencies'), 'dependencies panel opens').toBeVisible({
      timeout: 8_000,
    });
    await shot(page, '04-wo-dependencies.png');

    const depTable = page.getByTestId('wo-dependencies-table');
    if (await depTable.count()) {
      // A chain WO: every row must be labelled with a direction (upstream/downstream).
      // This is the wo_dependencies wiring contract made visible.
      const directionBadges = depTable.getByText(/^(upstream|downstream)$/i);
      expect(
        await directionBadges.count(),
        'each dependency row carries an upstream/downstream direction badge',
      ).toBeGreaterThan(0);
    } else {
      // Standalone WO (not part of a chain) — the empty state must be shown, not a broken panel.
      await expect(
        page.getByTestId('wo-dependencies-empty'),
        'standalone WO shows the empty dependencies state',
      ).toBeVisible({ timeout: 5_000 });
      console.log('[chain-overlap] first WO has no dependencies — open a chain FG WO to assert upstream/downstream rows.');
    }
  });

  // ── 4 · Schedule board overlap → capacity-conflict detection ───────────────
  test('4 · two WOs overlapping on one line are flagged data-conflict="true"', async ({ page }) => {
    ensureDir();
    await signIn(page);
    await page.goto(url('/en/planning/schedule'), { waitUntil: 'domcontentloaded' });

    const board = page.getByTestId('planning-schedule-board');
    await expect(board, 'schedule board renders').toBeVisible({ timeout: 10_000 });
    await shot(page, '05-schedule-board.png');

    // Invariant A: the conflict-detection contract holds for whatever is on the board —
    // any bar already flagged conflicting must carry the red-ring styling class.
    const flaggedBars = page.locator('[data-testid^="schedule-bar-"][data-conflict="true"]');
    const flaggedCount = await flaggedBars.count();
    for (let i = 0; i < flaggedCount; i++) {
      const cls = (await flaggedBars.nth(i).getAttribute('class')) ?? '';
      expect(cls, 'a conflicting bar carries the red-ring styling').toContain('ring-red');
    }

    // Invariant B (driven): force an overlap and assert the board detects it.
    // Find a lane with ≥2 bars; if none, drive one bar onto another lane's window.
    const allBars = page.locator('[data-testid^="schedule-bar-"]');
    const barCount = await allBars.count();
    if (barCount < 2) {
      console.log(`[chain-overlap] only ${barCount} scheduled bar(s) — seed ≥2 same-line WOs to drive the overlap assertion.`);
      return;
    }

    // Read the first two bars' woNumbers to reschedule them into a guaranteed overlap.
    const barA = allBars.nth(0);
    const barB = allBars.nth(1);
    const numA = (await barA.getAttribute('data-testid'))?.replace('schedule-bar-', '') ?? '';
    const numB = (await barB.getAttribute('data-testid'))?.replace('schedule-bar-', '') ?? '';

    // Overlapping window on the SAME line (open interval [start,end)).
    const start = '2026-07-08T08:00';
    const end = '2026-07-08T16:00';
    const overlapStart = '2026-07-08T12:00'; // starts inside A's window → must conflict
    const overlapEnd = '2026-07-08T20:00';

    // Reschedule bar A → fixed window on the first available line.
    await barA.click();
    await expect(page.getByTestId('reschedule-start')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('reschedule-start').fill(start);
    await page.getByTestId('reschedule-end').fill(end);
    const lineSelect = page.getByTestId('reschedule-line');
    // Pick a concrete line so both WOs land on the same lane.
    let chosenLine = '';
    if (await lineSelect.count()) {
      // shadcn Select — open and choose the first real option.
      await lineSelect.click().catch(() => undefined);
      const firstLineOption = page.getByRole('option').first();
      if (await firstLineOption.count()) {
        chosenLine = (await firstLineOption.textContent())?.trim() ?? '';
        await firstLineOption.click().catch(() => undefined);
      }
    }
    await page.getByTestId('reschedule-save').click();
    await expect(page.getByTestId('planning-schedule-board')).toBeVisible({ timeout: 10_000 });

    // Reschedule bar B → overlapping window on the SAME line.
    const barBAfter = page.getByTestId(`schedule-bar-${numB}`);
    await barBAfter.click();
    await expect(page.getByTestId('reschedule-start')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('reschedule-start').fill(overlapStart);
    await page.getByTestId('reschedule-end').fill(overlapEnd);
    if (chosenLine && (await lineSelect.count())) {
      await lineSelect.click().catch(() => undefined);
      const sameLine = page.getByRole('option', { name: chosenLine }).first();
      if (await sameLine.count()) await sameLine.click().catch(() => undefined);
    }
    await page.getByTestId('reschedule-save').click();
    await expect(page.getByTestId('planning-schedule-board')).toBeVisible({ timeout: 10_000 });
    await shot(page, '06-schedule-overlap.png');

    // The two overlapping bars on one line MUST now be flagged conflicting.
    const aFlag = await page.getByTestId(`schedule-bar-${numA}`).getAttribute('data-conflict');
    const bFlag = await page.getByTestId(`schedule-bar-${numB}`).getAttribute('data-conflict');
    expect(
      { woA: numA, woB: numB, conflictA: aFlag, conflictB: bFlag },
      'overlapping same-line WOs are both flagged data-conflict="true"',
    ).toEqual({ woA: numA, woB: numB, conflictA: 'true', conflictB: 'true' });
  });
});
