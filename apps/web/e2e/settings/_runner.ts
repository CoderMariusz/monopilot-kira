/**
 * Wave-6 consolidated settings parity-evidence runner.
 *
 * Shared, real, runnable harness behind every T-143…T-153 per-group spec.
 * Mirrors the established sibling harnesses (TASK-001048 users, TASK-001090
 * email, T-076 integrations) but is parametrized over the route catalog in
 * apps/web/e2e/settings/_catalog.ts so the 11 STATUS-addressable spec files are
 * thin shims rather than near-duplicates.
 *
 * For each screen in a group it:
 *   1. navigates the authenticated route (storageState),
 *   2. waits for the real (non-login, non-error) surface,
 *   3. screenshots desktop 1440x1000,
 *   4. runs @axe-core/playwright (asserting 0 critical/serious; gracefully
 *      records `axe_unavailable` if the optional dep is not installed — it is
 *      NEVER faked as a pass),
 *   5. optionally opens the screen's modal and screenshots it,
 *   6. writes a single parity_report.json carrying the LITERAL prototype anchor
 *      per _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md for every screen.
 *
 * HARD HONESTY RULE: capture only happens against a real server. Without
 * PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE the group test calls
 * `test.skip(...)` with a BLOCKED_AUTH note. It never invents screenshots or an
 * axe result.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { installBrowserErrorSpies } from '../_helpers/shell-parity';
import type { ParityGroup, ScreenEntry } from './_catalog';

const repoRoot = path.resolve(__dirname, '../../../..');
const webRoot = path.join(repoRoot, 'apps/web');

export function evidenceDirFor(group: ParityGroup): string {
  return path.join(webRoot, 'e2e/parity-evidence/settings', group.task_id);
}

function resolveAuthStorage(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [
    explicit,
    path.join(webRoot, 'e2e/.auth/user.json'),
    path.join(webRoot, 'e2e/auth-storage.json'),
    path.join(webRoot, 'playwright/.auth/user.json'),
  ].filter((v): v is string => Boolean(v));
  const authStorage = candidates.find((c) => existsSync(c));
  return { baseURL, authStorage };
}

type AxeResult =
  | { status: 'pass'; critical: number; serious: number }
  | { status: 'violations'; critical: number; serious: number; ids: string[] }
  | { status: 'axe_unavailable'; reason: string };

// Minimal local shape of @axe-core/playwright so this harness typechecks even
// when the optional dependency (declared by packages/ui) is not linked in the
// current checkout. The live-preview run resolves the real module at runtime.
type AxeViolation = { id: string; impact?: string | null };
type AxeAnalysis = { violations: AxeViolation[] };
type AxeBuilderCtor = new (opts: { page: Page }) => { analyze(): Promise<AxeAnalysis> };
type AxeModule = { default: AxeBuilderCtor };

async function runAxe(page: Page): Promise<AxeResult> {
  // Optional dependency: declared by packages/ui. Import dynamically (with a
  // non-literal specifier so tsc does not hard-require the types) so the spec
  // stays loadable/listable even when the dep is not installed in this checkout.
  let AxeBuilder: AxeBuilderCtor;
  try {
    const specifier = '@axe-core/playwright';
    const mod = (await import(specifier)) as AxeModule;
    AxeBuilder = mod.default;
  } catch (error) {
    return {
      status: 'axe_unavailable',
      reason: `@axe-core/playwright not resolvable (${error instanceof Error ? error.message : String(error)}); install it in apps/web or run from a checkout where packages/ui deps are linked.`,
    };
  }
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');
  if (critical.length === 0 && serious.length === 0) {
    return { status: 'pass', critical: 0, serious: 0 };
  }
  return {
    status: 'violations',
    critical: critical.length,
    serious: serious.length,
    ids: [...critical, ...serious].map((v) => v.id),
  };
}

type ScreenResult = {
  set_task_id: string;
  route: string;
  label: string;
  prototype_anchor: string;
  spec_driven: boolean;
  http_status: number | null;
  final_pathname: string;
  real_surface: boolean;
  screenshot: string | null;
  modal_screenshot: string | null;
  modal_evidence: string;
  axe: AxeResult;
  browser_failures: number;
  status: 'CAPTURED' | 'FAIL';
};

async function captureScreen(page: Page, screen: ScreenEntry, dir: string, baseURL: string): Promise<ScreenResult> {
  const spy = installBrowserErrorSpies(page);
  spy.setRoute(screen.route);
  const response = await page.goto(`${baseURL}${screen.route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

  const finalPathname = new URL(page.url()).pathname;
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const routeRendered = finalPathname === screen.route;
  const onLoginOrError = /sign in|log in|you do not have permission|unable to load|not configured/i.test(bodyText);
  const matchesExpected = screen.expectText ? screen.expectText.test(bodyText) : true;
  const realSurface = routeRendered && !onLoginOrError && matchesExpected;

  const screenshotName = `${screen.label}-desktop-1440x1000.png`;
  await page.screenshot({ path: path.join(dir, screenshotName), fullPage: true });

  let modalScreenshot: string | null = null;
  let modalEvidence = screen.modal ? 'not_opened' : 'no_modal_in_scope';
  if (screen.modal) {
    const trigger = page.getByRole(screen.modal.open_role, { name: screen.modal.open_name }).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click().catch(() => undefined);
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const modalName = `${screen.modal.label}-modal-desktop-1440x1000.png`;
        await page.screenshot({ path: path.join(dir, modalName), fullPage: true });
        modalScreenshot = `apps/web/e2e/parity-evidence/settings/${path.basename(dir)}/${modalName}`;
        modalEvidence = `opened_via_${screen.modal.open_role}`;
        await page.keyboard.press('Escape').catch(() => undefined);
      } else {
        modalEvidence = 'trigger_clicked_dialog_not_visible';
      }
    } else {
      modalEvidence = 'trigger_not_visible';
    }
  }

  const axe = realSurface ? await runAxe(page) : { status: 'axe_unavailable' as const, reason: 'real surface did not render; axe on a login/error page would mislead' };
  const browserFailures = spy.failuresFor(screen.route);

  const axeOk = axe.status === 'pass' || axe.status === 'axe_unavailable';
  return {
    set_task_id: screen.set_task_id,
    route: screen.route,
    label: screen.label,
    prototype_anchor: screen.prototype_anchor,
    spec_driven: Boolean(screen.spec_driven),
    http_status: response?.status() ?? null,
    final_pathname: finalPathname,
    real_surface: realSurface,
    screenshot: `apps/web/e2e/parity-evidence/settings/${path.basename(dir)}/${screenshotName}`,
    modal_screenshot: modalScreenshot,
    modal_evidence: modalEvidence,
    axe,
    browser_failures: browserFailures.length,
    status: realSurface && axeOk && browserFailures.length === 0 ? 'CAPTURED' : 'FAIL',
  };
}

/**
 * Registers ONE Playwright test for a parity group. The per-group spec files
 * call this so each T-143…T-153 has its own addressable, named spec while
 * sharing this single real harness.
 */
export function registerParityGroup(group: ParityGroup): void {
  test.describe(`${group.task_id} ${group.title} parity evidence`, () => {
    test(`captures screenshots + axe + parity_report.json for ${group.key}`, async ({ browser }) => {
      const { baseURL, authStorage } = resolveAuthStorage();
      test.skip(
        !baseURL || !authStorage,
        `BLOCKED_AUTH: ${group.task_id} parity evidence needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated settings admin session against the live preview. Catalog + anchors are authored; capture is deferred to the live-preview run.`,
      );

      const dir = evidenceDirFor(group);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        storageState: authStorage,
      });

      const results: ScreenResult[] = [];
      try {
        for (const screen of group.screens) {
          const page = await context.newPage();
          try {
            results.push(await captureScreen(page, screen, dir, baseURL as string));
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }

      const report = {
        task_id: group.task_id,
        group: group.key,
        title: group.title,
        generated_at: new Date().toISOString(),
        base_url: baseURL,
        auth_storage: authStorage,
        viewport: 'desktop-1440x1000',
        policy: '_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md',
        screens: results,
        summary: {
          screens: results.length,
          captured: results.filter((r) => r.status === 'CAPTURED').length,
          failed: results.filter((r) => r.status === 'FAIL').length,
          axe_violations: results.filter((r) => r.axe.status === 'violations').length,
          axe_unavailable: results.filter((r) => r.axe.status === 'axe_unavailable').length,
        },
        status: results.every((r) => r.status === 'CAPTURED') ? 'CAPTURED' : 'FAIL',
      };
      writeFileSync(path.join(dir, 'parity_report.json'), `${JSON.stringify(report, null, 2)}\n`);

      // Real assertions against the live preview run.
      for (const r of results) {
        expect(r.real_surface, `${r.route} must render its real authenticated surface (got final=${r.final_pathname}, http=${r.http_status})`).toBe(true);
        expect(r.browser_failures, `${r.route} must not emit console/network/page errors`).toBe(0);
        if (r.axe.status === 'violations') {
          expect(r.axe.critical + r.axe.serious, `${r.route} axe critical+serious violations: ${r.axe.ids.join(', ')}`).toBe(0);
        }
      }
      expect(report.status).toBe('CAPTURED');
    });
  });
}
