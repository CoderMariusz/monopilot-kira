/**
 * NPD — full-page 4-step "Create NPD project" wizard (Basics → Brief → Starting point → Review).
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263 (CreateProjectWizard)
 *
 * Routes exercised:
 *   /en/login          — admin sign-in
 *   /en/pipeline       — pipeline board ("+ New project" CTA → wizard)
 *   /en/pipeline/new   — the full-page wizard
 *   /en/pipeline/[id]  — the created project (lands on its Brief stage)
 *
 * Gate on PLAYWRIGHT_BASE_URL:
 *   When unset (CI / isolated worktree where local Supabase data is blocked) every
 *   test is SKIPPED via test.skip(!baseURL). The spec is collected normally so
 *   `--list` works; component-level parity is covered by the RTL vitest suite
 *   (create-project-wizard.test.tsx).
 *
 * Live run (Gate-5 / module sign-off):
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test npd-create-project-wizard --trace on
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

const artifactDir = path.resolve(__dirname, 'artifacts/npd-create-project-wizard');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function url(route: string): string {
  return `${baseURL}${route}`;
}

async function runAxe(page: import('@playwright/test').Page, label: string): Promise<void> {
  type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
  type AxeBuilderCtor = new (opts: { page: typeof page }) => { analyze(): Promise<AxeAnalysis> };
  const axeSpecifier = '@axe-core/playwright';
  try {
    const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
    const results = await new AxeBuilder({ page }).analyze();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(artifactDir, `axe-${label}.json`), `${JSON.stringify(results, null, 2)}\n`);
    expect(results.violations, `axe violations on ${label}`).toEqual([]);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND'))
    ) {
      return;
    }
    throw err;
  }
}

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(url('/en/login'), { waitUntil: 'domcontentloaded' });
  const emailInput = page.getByLabel(/work email/i).or(page.locator('input[type="email"]'));
  await emailInput.fill(adminEmail);
  const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]')).first();
  await passwordInput.fill(adminPassword);
  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

test.describe('NPD create-project wizard — 4 steps (project.jsx:107-263)', () => {
  test.skip(!baseURL, 'Set PLAYWRIGHT_BASE_URL to run against a live preview.');

  test.beforeAll(() => ensureDir(artifactDir));

  test('"+ New project" navigates to the full-page wizard', async ({ page }) => {
    await signIn(page);
    await page.goto(url('/en/pipeline'), { waitUntil: 'domcontentloaded' });
    await page.getByTestId('pipeline-new-project').click();
    await page.waitForURL(/\/pipeline\/new$/, { timeout: 10_000 });
    await expect(page.getByTestId('create-project-wizard')).toBeVisible();
  });

  test('walks all 4 steps and creates a project (per-state screenshots + axe)', async ({ page }) => {
    await signIn(page);
    await page.goto(url('/en/pipeline/new'), { waitUntil: 'domcontentloaded' });

    // Step 1 — Basics. Continue is gated until name is filled (proto line 258).
    await expect(page.getByTestId('wizard-step-basics')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('wizard-continue')).toBeDisabled();
    await page.locator('#wiz-name').fill('E2E Sliced Ham 200g');
    await page.locator('#wiz-target').fill('2026-09-01');
    await page.screenshot({ path: path.join(artifactDir, 'step-1-basics.png'), fullPage: true });
    await runAxe(page, 'step-1-basics');
    await page.getByTestId('wizard-continue').click();

    // Step 2 — Brief.
    await expect(page.getByTestId('wizard-step-brief')).toBeVisible();
    await page.locator('#wiz-price').fill('19.90');
    await page.screenshot({ path: path.join(artifactDir, 'step-2-brief.png'), fullPage: true });
    await page.getByTestId('wizard-continue').click();

    // Step 3 — Starting point. Choosing clone reveals the blue alert (proto 220-225).
    await expect(page.getByTestId('wizard-step-starting')).toBeVisible();
    await page.getByTestId('wizard-start-clone').click();
    await expect(page.getByTestId('wizard-clone-alert')).toBeVisible();
    await page.screenshot({ path: path.join(artifactDir, 'step-3-starting.png'), fullPage: true });
    await page.getByTestId('wizard-continue').click();

    // Step 4 — Review summary table (proto 236-250).
    await expect(page.getByTestId('wizard-step-review')).toBeVisible();
    await page.screenshot({ path: path.join(artifactDir, 'step-4-review.png'), fullPage: true });
    await runAxe(page, 'step-4-review');

    // Create → lands on the new project (Brief stage).
    await page.getByTestId('wizard-create').click();
    await page.waitForURL(/\/pipeline\/[a-f0-9-]{36}/, { timeout: 15_000 });
    await page.screenshot({ path: path.join(artifactDir, 'created-project.png'), fullPage: true });
  });
});
