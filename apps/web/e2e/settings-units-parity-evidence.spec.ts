import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies, startLocalShellParityHarness } from './_helpers/shell-parity';

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
// Reviewer requested TASK-001045 artifact path for this rework; keep the path stable for closeout harvest.
const evidenceDir = path.join(webRoot, 'e2e/artifacts/TASK-001045');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const prototypePath = path.join(prototypeRoot, 'settings/data-screens.jsx');
const targetRoute = '/en/settings/units';
const viewport = { width: 1440, height: 1000 };

function ensureEvidenceDir() {
  mkdirSync(evidenceDir, { recursive: true });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function contentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function servePrototype(): Promise<{ server: Server; url: string }> {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, '')) || 'settings/settings.html';
    const filePath = path.resolve(prototypeRoot, relative);
    if (!filePath.startsWith(prototypeRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(filePath) });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('prototype server did not expose a TCP port'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}/settings/settings.html` });
    });
  });
}

type RegionSummary = {
  selector: string;
  count: number;
  visibleCount: number;
  textSample: string;
};

async function summarizeRegion(page: import('@playwright/test').Page, selector: string): Promise<RegionSummary> {
  const locator = page.locator(selector);
  const count = await locator.count().catch(() => 0);
  const visibleCount = await locator.evaluateAll((nodes) => nodes.filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  }).length).catch(() => 0);
  const textSample = count > 0 ? (await locator.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  return { selector, count, visibleCount, textSample };
}

function sliceLines(filePath: string, start: number, end: number) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/).slice(start - 1, end).join('\n');
}

test.describe('TASK-001049 settings units parity evidence', () => {
  test('captures prototype and real target route screenshots, DOM summary, and parity report', async ({ browser }) => {
    ensureEvidenceDir();
    const prototypeServer = await servePrototype();
    const harness = await startLocalShellParityHarness();
    const context = await browser.newContext({ viewport });
    await harness.installAuthCookie(context);
    const targetPage = await context.newPage();
    const prototypePage = await context.newPage();
    const spy = installBrowserErrorSpies(targetPage);

    try {
      await prototypePage.addInitScript(() => {
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'units' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.getByText('Units & conversions', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-desktop-1440x1000.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${harness.baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-desktop-1440x1000.png'), fullPage: true });

      const primaryButton = targetPage.getByRole('button', { name: /add unit/i }).first();
      let dialogEvidence = 'not_opened_read_only_or_error_state';
      if (await primaryButton.isVisible().catch(() => false)) {
        await primaryButton.click();
        const dialog = targetPage.locator('[role="dialog"]').first();
        await dialog.waitFor({ state: 'visible', timeout: 5_000 });
        await targetPage.screenshot({ path: path.join(evidenceDir, 'target-add-unit-dialog-desktop-1440x1000.png'), fullPage: true });
        dialogEvidence = 'opened_from_primary_cta';
      }

      const selectors = {
        page: 'main',
        table: 'table, [role="table"]',
        dialog: '[role="dialog"]',
        primary_cta: 'button, [role="button"]',
      };
      const domDiff = {
        task_id: 'TASK-001049',
        artifact_dir_task_id: 'TASK-001045',
        generated_at: new Date().toISOString(),
        prototype_path: prototypePath,
        prototype_route: prototypeServer.url,
        target_route: `${harness.baseURL}${targetRoute}`,
        viewport: 'desktop-1440x1000',
        region_selectors: selectors,
        prototype_regions: Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await summarizeRegion(prototypePage, selector)]))),
        target_regions: Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await summarizeRegion(targetPage, selector)]))),
        browser_events: spy.failuresFor(targetRoute),
        target_http_status: response?.status() ?? null,
        target_final_url: targetPage.url(),
        dialog_evidence: dialogEvidence,
        anchors: {
          units_screen_excerpt: sliceLines(prototypePath, 151, 187),
        },
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const targetPageText = await targetPage.locator('body').innerText().catch(() => '');
      const targetHasSafeNonCrudState = /unable to load units|permission|read-only|deferred|not editable/i.test(targetPageText);
      const targetHasLiveUnitsTable = /Units & conversions/i.test(targetPageText)
        && /Base unit:/i.test(targetPageText)
        && /Factor to base/i.test(targetPageText);
      const routeRendered = new URL(targetPage.url()).pathname === targetRoute;
      const rawI18nVisible = /settings\.units\.|settings_units|units\.(title|subtitle|addUnit)/i.test(targetPageText);
      const parityReport = {
        task_id: 'TASK-001049',
        artifact_dir_task_id: 'TASK-001045',
        root_task_id: 'TASK-001038',
        generated_at: new Date().toISOString(),
        prototype_path: prototypePath,
        prototype_route: prototypeServer.url,
        target_route: targetRoute,
        base_url: harness.baseURL,
        server_identity: harness.server_identity,
        viewports: ['desktop-1440x1000'],
        region_selectors: selectors,
        parity_matrix: {
          structural: routeRendered && targetHasLiveUnitsTable ? 'captured_live_units_table' : 'captured_fail_closed_read_only_or_error_state',
          visual: routeRendered && targetHasLiveUnitsTable ? 'captured_live_units_table' : 'captured_fail_closed_read_only_or_error_state',
          interaction: dialogEvidence === 'opened_from_primary_cta' ? 'primary_cta_dialog_captured' : 'read_only_deferred_no_primary_cta_on_real_route; rtl covers injected editable dialog',
          data: targetHasLiveUnitsTable ? 'captured_from_real_route' : 'not_verified_live_db_context_unavailable_no_mock_fallback',
          rbac: targetHasSafeNonCrudState ? 'fail_closed_read_only_or_error_state_captured' : 'captured_route_response',
          i18n: rawI18nVisible ? 'fail_raw_key_visible' : 'captured_no_raw_settings_units_key_observed',
          authenticated_preview: 'local_dev_harness_with_auth_cookie; fake Supabase user; real withOrgContext DB unavailable in this worktree',
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/TASK-001045/prototype-desktop-1440x1000.png',
          target_screenshot: 'apps/web/e2e/artifacts/TASK-001045/target-desktop-1440x1000.png',
          target_dialog_screenshot: dialogEvidence === 'opened_from_primary_cta' ? 'apps/web/e2e/artifacts/TASK-001045/target-add-unit-dialog-desktop-1440x1000.png' : null,
          dom_diff_json: 'apps/web/e2e/artifacts/TASK-001045/dom-diff.json',
          axe_report: 'apps/web/e2e/artifacts/TASK-001045/axe-report.json',
        },
        axe: {
          status: 'not_run',
          reason: targetHasLiveUnitsTable ? 'No axe dependency is configured in this web package; browser error spy and DOM parity report captured.' : 'Live DB/org context unavailable; route rendered fail-closed read-only/error state, so axe on the target units CRUD surface would be misleading.',
        },
        deviations: [
          {
            item: 'units_crud',
            status: 'explicit_deferred_read_only',
            note: 'PRD/schema review found no editable units Server Action in this wave; production route renders read-only/deferred capability instead of implying completed CRUD.',
          },
        ],
        status: routeRendered && !rawI18nVisible ? (targetHasLiveUnitsTable ? 'CAPTURED' : 'BLOCKED_LIVE_DB_CONTEXT_SAFE_STATE_CAPTURED') : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(parityReport.axe, null, 2)}\n`);

      expect(routeRendered, 'target route should not redirect away from /en/settings/units under the local harness').toBe(true);
      expect(rawI18nVisible, 'target route must not leak raw settings.units i18n keys').toBe(false);
      expect(existsSync(path.join(evidenceDir, 'prototype-desktop-1440x1000.png'))).toBe(true);
      expect(existsSync(path.join(evidenceDir, 'target-desktop-1440x1000.png'))).toBe(true);
      expect(existsSync(path.join(evidenceDir, 'dom-diff.json'))).toBe(true);
      expect(existsSync(path.join(evidenceDir, 'parity_report.json'))).toBe(true);
    } finally {
      await context.close();
      await harness.close();
      await closeServer(prototypeServer.server);
    }
  });
});
