import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies } from './_helpers/shell-parity';

/**
 * T-076 / SET-110 — Integrations catalog parity evidence.
 * Prototype anchor: prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107.
 *
 * Mirrors the established settings parity-evidence harness (TASK-001090 email,
 * TASK-001048 users). Captures prototype vs target screenshots, per-state
 * coverage, an axe report, a DOM region diff, and a parity_report.json.
 *
 * Real-data + auth gated: a populated, authenticated target route requires a
 * live Supabase auth session (PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE).
 * When those are absent this records a BLOCKED_AUTH report instead of faking a
 * surface — same blocker model the sibling settings tasks document.
 */

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const integrationsPath = path.join(prototypeRoot, 'settings/integrations.jsx');
const evidenceDir = path.join(webRoot, 'e2e/artifacts/T-076');
const targetRoute = '/en/settings/integrations';
const viewport = { width: 1440, height: 900 };

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

function sliceLines(filePath: string, start: number, end: number) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/).slice(start - 1, end).join('\n');
}

function expectNonEmptyArtifact(relativeName: string) {
  const absolute = path.join(evidenceDir, relativeName);
  expect(existsSync(absolute), `${relativeName} must be written for UI parity evidence`).toBe(true);
  expect(statSync(absolute).size, `${relativeName} must not be empty`).toBeGreaterThan(0);
}

function writeBlocked(reason: string) {
  ensureEvidenceDir();
  const report = {
    task_id: 'T-076',
    screen: 'integrations_screen',
    prototype_anchor: 'prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107',
    target_route: targetRoute,
    status: 'BLOCKED_AUTH',
    reason,
    note:
      'No live Supabase auth/Postgres stack available in this environment. RTL parity + 5-state + accordion + real-loader-wiring evidence is captured by the vitest.ui suite (page.test.tsx). Re-run with PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for screenshot/axe artifacts.',
  };
  writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

test.describe('T-076 settings integrations parity evidence', () => {
  test('integrations captures prototype/target screenshots, per-state coverage, axe report, and DOM diff', async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL;
    const authStorageState = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;

    if (!baseURL || !(authStorageState && existsSync(authStorageState))) {
      writeBlocked(
        'PLAYWRIGHT_BASE_URL and PLAYWRIGHT_AUTH_STORAGE are required for an authenticated, real-data integrations surface.',
      );
      test.skip(
        true,
        'BLOCKED_AUTH: integrations parity evidence requires PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated operator session (recorded in parity_report.json).',
      );
      return;
    }

    ensureEvidenceDir();
    const prototypeServer = await servePrototype();
    const context = await browser.newContext({ viewport, storageState: authStorageState });
    const prototypePage = await context.newPage();
    const targetPage = await context.newPage();
    const spy = installBrowserErrorSpies(targetPage);

    try {
      await prototypePage.addInitScript(() => {
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'integrations' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-integrations-desktop-1440x900.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-integrations-ready-desktop-1440x900.png'), fullPage: true });

      // Interaction state: collapse the first category accordion and screenshot.
      const firstToggle = targetPage.locator('[data-testid="settings-integrations-category-section"] button[aria-expanded]').first();
      let interactionEvidence = 'not_toggled';
      if (await firstToggle.isVisible().catch(() => false)) {
        await firstToggle.click();
        await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
        await targetPage.screenshot({ path: path.join(evidenceDir, 'target-integrations-collapsed-desktop-1440x900.png'), fullPage: true });
        interactionEvidence = 'accordion_collapsed';
      }

      // Grid view state.
      await targetPage.goto(`${baseURL}${targetRoute}?view=grid`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-integrations-grid-desktop-1440x900.png'), fullPage: true });

      // Optional dependency (declared by packages/ui). Import dynamically with a
      // non-literal specifier so the spec stays loadable/listable and typechecks
      // even when the dep is not linked in this checkout; the live-preview run
      // has it installed.
      type AxeAnalysis = { violations: Array<{ id: string; impact?: string | null }> };
      type AxeBuilderCtor = new (opts: { page: typeof targetPage }) => { analyze(): Promise<AxeAnalysis> };
      const axeSpecifier = '@axe-core/playwright';
      const { default: AxeBuilder } = (await import(axeSpecifier)) as { default: AxeBuilderCtor };
      const axe = await new AxeBuilder({ page: targetPage }).analyze();
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(axe, null, 2)}\n`);

      const selectors = {
        integrations_screen: 'main[data-screen="integrations_screen"]',
        kpi_grid: '[data-testid="settings-integrations-kpi"]',
        category_sections: '[data-testid="settings-integrations-category-section"]',
        activity_table: 'section[aria-labelledby="settings-integrations-activity-heading"] table',
      };
      const browserFailures = spy.failuresFor(targetRoute);
      const finalPath = new URL(targetPage.url()).pathname;
      const routeRendered = finalPath === targetRoute;

      const domDiff = {
        task_id: 'T-076',
        prototype_path: integrationsPath,
        prototype_route: prototypeServer.url,
        target_route: `${baseURL}${targetRoute}`,
        viewport: 'desktop-1440x900',
        region_selectors: selectors,
        browser_events: browserFailures,
        target_http_status: response?.status() ?? null,
        target_final_url: targetPage.url(),
        interaction_evidence: interactionEvidence,
        anchor: { integrations_screen: sliceLines(integrationsPath, 7, 107).slice(0, 4000) },
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const parityReport = {
        task_id: 'T-076',
        prototype_anchor: 'prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107',
        target_route: targetRoute,
        viewports: ['desktop-1440x900'],
        parity_matrix: {
          structural: 'captured_kpi_grid_category_sections_activity_table',
          visual: 'captured_target_vs_prototype_screenshot_pair',
          interaction: interactionEvidence === 'accordion_collapsed' ? 'accordion_toggled_and_captured' : 'fail_accordion_not_toggled',
          accessibility: axe.violations.length === 0 ? 'axe_clean' : `axe_violations_${axe.violations.length}`,
          console_network: browserFailures.length === 0 ? 'captured_no_browser_failures' : 'fail_browser_failures_present',
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/T-076/prototype-integrations-desktop-1440x900.png',
          target_ready_screenshot: 'apps/web/e2e/artifacts/T-076/target-integrations-ready-desktop-1440x900.png',
          target_collapsed_screenshot: 'apps/web/e2e/artifacts/T-076/target-integrations-collapsed-desktop-1440x900.png',
          target_grid_screenshot: 'apps/web/e2e/artifacts/T-076/target-integrations-grid-desktop-1440x900.png',
          axe_report: 'apps/web/e2e/artifacts/T-076/axe-report.json',
          dom_diff_json: 'apps/web/e2e/artifacts/T-076/dom-diff.json',
        },
        status:
          routeRendered && interactionEvidence === 'accordion_collapsed' && axe.violations.length === 0 && browserFailures.length === 0
            ? 'CAPTURED'
            : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);

      expect(routeRendered, 'target route must stay on /en/settings/integrations, not login or redirect-only').toBe(true);
      expect(interactionEvidence, 'category accordion must collapse for interaction evidence').toBe('accordion_collapsed');
      expect(axe.violations, 'axe must report zero violations on the integrations surface').toEqual([]);
      expect(browserFailures, 'console/network/page errors must be empty for compared surface').toEqual([]);
      expectNonEmptyArtifact('prototype-integrations-desktop-1440x900.png');
      expectNonEmptyArtifact('target-integrations-ready-desktop-1440x900.png');
      expectNonEmptyArtifact('axe-report.json');
      expectNonEmptyArtifact('dom-diff.json');
      expectNonEmptyArtifact('parity_report.json');
    } finally {
      await context.close();
      await closeServer(prototypeServer.server);
    }
  });
});
