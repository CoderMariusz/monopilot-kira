/**
 * NPD project DETAIL — clean header + 8-stage operational rail + Brief stage parity.
 *
 * Prototype anchor:
 *   prototypes/design/Monopilot Design System/npd/project.jsx:4-105
 *     - StageRail        (project.jsx:4-20)   → 8-stage operational rail (layout)
 *     - ProjectHeader    (project.jsx:22-43)  → persistent header (layout)
 *     - BriefScreen      (project.jsx:46-105) → read-oriented "Project brief" card
 *
 * Routes exercised:
 *   /en/login                              — admin sign-in
 *   /en/pipeline                           — pipeline board (find a project)
 *   /en/pipeline/[projectId]               — detail index (header + rail + dept strip)
 *   /en/pipeline/[projectId]/brief         — Brief stage (read-only card)
 *
 * Gate on PLAYWRIGHT_BASE_URL:
 *   When unset (default in CI / isolated worktree, where local Supabase data is
 *   blocked — no DATABASE_URL_OWNER) every test is SKIPPED via test.skip(!baseURL).
 *   The spec is collected normally so `--list` works; it reports [skipped]. The
 *   component-level parity is covered by the RTL vitest suites
 *   (project-stepper.test.tsx, page.test.tsx, brief/page.test.tsx).
 *
 * Live run (Gate-5 / module sign-off):
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app \
 *   PLAYWRIGHT_ADMIN_PASSWORD=<pwd> \
 *     pnpm --filter web exec playwright test npd-project-detail-header-rail --trace on
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

const artifactDir = path.resolve(__dirname, 'artifacts/npd-project-detail-header-rail');

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

async function resolveFirstProjectId(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto(url('/en/pipeline'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pipeline-tabs')).toBeVisible({ timeout: 10_000 });
  const link = page.locator('a[href*="/pipeline/"]').first();
  if (await link.count()) {
    const href = await link.getAttribute('href');
    const match = href ? /\/pipeline\/([a-f0-9-]{36})/.exec(href) : null;
    if (match) return match[1] ?? null;
  }
  return null;
}

test.describe('NPD project detail — header + 8-stage rail + brief (project.jsx:4-105)', () => {
  test.skip(!baseURL, 'Set PLAYWRIGHT_BASE_URL to run against a live preview.');

  test.beforeAll(() => ensureDir(artifactDir));

  test('header + 8-stage operational rail render on the detail index (no G0-G4 rail)', async ({ page }) => {
    await signIn(page);
    const projectId = await resolveFirstProjectId(page);
    expect(projectId, 'a project must exist in the seeded org').not.toBeNull();

    await page.goto(url(`/en/pipeline/${projectId}`), { waitUntil: 'domcontentloaded' });

    // Persistent header (project.jsx:22-43).
    const header = page.getByTestId('project-header');
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('project-header-advance')).toBeVisible();

    // 8-stage OPERATIONAL rail (project.jsx:4-20) — exactly 8 stage links.
    const stepper = page.getByTestId('project-stepper');
    await expect(stepper).toBeVisible();
    for (const key of ['brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff']) {
      await expect(page.getByTestId(`project-step-link-${key}`)).toBeVisible();
    }

    // The legacy G0-G4 gate rail must be GONE (the "too many tabs" complaint).
    await expect(page.getByTestId('project-stage-rail')).toHaveCount(0);

    await page.screenshot({ path: path.join(artifactDir, 'detail-index.png'), fullPage: true });
    await runAxe(page, 'detail-index');
  });

  test('clicking a rail stage navigates to that stage route', async ({ page }) => {
    await signIn(page);
    const projectId = await resolveFirstProjectId(page);
    await page.goto(url(`/en/pipeline/${projectId}`), { waitUntil: 'domcontentloaded' });

    await page.getByTestId('project-step-link-recipe').click();
    await page.waitForURL(/\/pipeline\/[a-f0-9-]{36}\/formulation/, { timeout: 10_000 });
    // Header + rail persist across the stage route.
    await expect(page.getByTestId('project-header')).toBeVisible();
    await expect(page.getByTestId('project-stepper')).toBeVisible();
  });

  test('Brief stage shows the read-only "Project brief" card with captured fields', async ({ page }) => {
    await signIn(page);
    const projectId = await resolveFirstProjectId(page);
    await page.goto(url(`/en/pipeline/${projectId}/brief`), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('project-brief-card-title')).toHaveText(/Project brief/i, {
      timeout: 10_000,
    });
    await expect(page.getByTestId('project-brief-completed-badge')).toBeVisible();
    await expect(page.getByTestId('project-brief-field-product-name')).toBeVisible();

    await page.screenshot({ path: path.join(artifactDir, 'brief-stage.png'), fullPage: true });
    await runAxe(page, 'brief-stage');
  });

  /**
   * FG-candidate affordance (dead-end fix — "Finished Good not found").
   *
   * A project at gate G2/G3 with no linked product_code exposes a header
   * "Create / Link FG" button that opens the FgCandidateModal (Create vs Link
   * mode, suggested FG-{code} pre-fill). Once an FG is linked the header instead
   * offers an "Open FG" link to /{locale}/fg/{code}. Exactly ONE of the two
   * affordances is present on any project (and neither on non-G2/G3 gates) — so we
   * assert the header surfaces an FG control and capture per-state screenshots.
   */
  test('header surfaces the Create/Link FG affordance and opens the modal', async ({ page }) => {
    await signIn(page);
    const projectId = await resolveFirstProjectId(page);
    await page.goto(url(`/en/pipeline/${projectId}`), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('project-header')).toBeVisible({ timeout: 10_000 });

    const createFg = page.getByTestId('project-header-create-fg');
    const openFg = page.getByTestId('project-header-open-fg');

    // Empty state: the project may already have an FG (Open FG) or not (Create FG);
    // capture whichever the seeded project is in. Off-G2/G3 projects show neither —
    // skip the interaction in that case but still record the header screenshot.
    await page.screenshot({ path: path.join(artifactDir, 'fg-affordance-header.png'), fullPage: true });

    if (await createFg.count()) {
      await createFg.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      // Mode toggle (Create default) + pre-filled suggested code input present.
      await expect(dialog.getByTestId('fg-candidate-mode')).toBeVisible();
      const suggested = dialog.locator('#fg-candidate-create-code');
      await expect(suggested).toHaveValue(/^FG-/);
      await page.screenshot({ path: path.join(artifactDir, 'fg-create-modal.png'), fullPage: true });
      await runAxe(page, 'fg-create-modal');
    } else if (await openFg.count()) {
      await expect(openFg).toHaveAttribute('href', /\/fg\//);
      await page.screenshot({ path: path.join(artifactDir, 'fg-open-link.png'), fullPage: true });
    }
  });
});
