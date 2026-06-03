import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies } from './_helpers/shell-parity';

// T-121 / SET-029 Global Import / Export hub parity evidence.
// Prototype anchor: prototypes/design/Monopilot Design System/settings/ops-screens.jsx:263-384
const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const opsScreensPath = path.join(prototypeRoot, 'settings/ops-screens.jsx');
const evidenceDir = path.join(webRoot, 'e2e/artifacts/SET-029-T121');
const targetRoute = '/en/settings/import-export';
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

type RegionSummary = { selector: string; count: number; visibleCount: number; textSample: string };

async function summarizeRegion(page: import('@playwright/test').Page, selector: string): Promise<RegionSummary> {
  const locator = page.locator(selector);
  const count = await locator.count().catch(() => 0);
  const visibleCount = await locator
    .evaluateAll((nodes) =>
      nodes.filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      }).length,
    )
    .catch(() => 0);
  const textSample = count > 0 ? (await locator.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  return { selector, count, visibleCount, textSample };
}

function sliceLines(filePath: string, start: number, end: number) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/).slice(start - 1, end).join('\n');
}

function expectNonEmptyArtifact(relativeName: string) {
  const absolute = path.join(evidenceDir, relativeName);
  expect(existsSync(absolute), `${relativeName} must be written for the UI parity evidence`).toBe(true);
  expect(statSync(absolute).size, `${relativeName} must not be empty`).toBeGreaterThan(0);
}

test.describe('SET-029 / T-121 settings import-export parity evidence', () => {
  test('captures prototype/target screenshots, DOM region diff, and console-network report', async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL;
    const authStorageState = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
    expect(
      baseURL,
      'BLOCKED_AUTH: import/export parity evidence requires PLAYWRIGHT_BASE_URL for the real admin target route (test-stage Vercel/Supabase).',
    ).toBeTruthy();
    expect(
      authStorageState && existsSync(authStorageState),
      'BLOCKED_AUTH: import/export parity evidence requires PLAYWRIGHT_AUTH_STORAGE for an authenticated settings.* operator session.',
    ).toBeTruthy();

    ensureEvidenceDir();
    const prototypeServer = await servePrototype();
    const context = await browser.newContext({ viewport, storageState: authStorageState });
    const prototypePage = await context.newPage();
    const targetPage = await context.newPage();
    const spy = installBrowserErrorSpies(targetPage);

    try {
      await prototypePage.addInitScript(() => {
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'import_export' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-import-export-desktop-1440x900.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-import-export-desktop-1440x900.png'), fullPage: true });

      const selectors = {
        import_export_screen: '[data-testid="settings-import-export-screen"]',
        entity_selector: '#settings-import-export-entity',
        import_card: '[aria-labelledby="settings-import-card-title"]',
        export_card: '[aria-labelledby="settings-export-card-title"]',
        recent_jobs_table: 'table[aria-label="Recent import and export jobs"]',
      };
      const browserFailures = spy.failuresFor(targetRoute);
      const bodyText = await targetPage.locator('body').innerText().catch(() => '');
      const finalPath = new URL(targetPage.url()).pathname;
      const routeRendered = finalPath === targetRoute;
      const hasSelector = await targetPage.locator(selectors.entity_selector).first().isVisible().catch(() => false);
      const hasJobsTable = await targetPage.locator(selectors.recent_jobs_table).first().isVisible().catch(() => false);
      const targetHasRealSurface =
        routeRendered && hasSelector && hasJobsTable && !/login|sign in|not configured|unable to load/i.test(bodyText);

      const domDiff = {
        task_id: 'SET-029-T121',
        prototype_path: opsScreensPath,
        prototype_route: prototypeServer.url,
        target_route: `${baseURL}${targetRoute}`,
        viewport: 'desktop-1440x900',
        region_selectors: selectors,
        target_regions: Object.fromEntries(
          await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await summarizeRegion(targetPage, selector)])),
        ),
        browser_events: browserFailures,
        target_http_status: response?.status() ?? null,
        target_final_url: targetPage.url(),
        anchor: sliceLines(opsScreensPath, 263, 384).slice(0, 4000),
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const parityReport = {
        task_id: 'SET-029-T121',
        prototype_path: `${opsScreensPath}:263-384`,
        target_route: targetRoute,
        parity_matrix: {
          structural: targetHasRealSurface ? 'captured_selector_import_export_cards_jobs_table' : 'fail_real_surface_missing',
          visual: targetHasRealSurface ? 'captured_target_vs_prototype_screenshot_pair' : 'fail_target_screenshot_not_real_surface',
          console_network: browserFailures.length === 0 ? 'captured_no_browser_failures' : 'fail_browser_failures_present',
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/SET-029-T121/prototype-import-export-desktop-1440x900.png',
          target_screenshot: 'apps/web/e2e/artifacts/SET-029-T121/target-import-export-desktop-1440x900.png',
          dom_diff_json: 'apps/web/e2e/artifacts/SET-029-T121/dom-diff.json',
        },
        status: targetHasRealSurface && browserFailures.length === 0 ? 'CAPTURED' : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);

      expect(routeRendered, 'target route must stay on /en/settings/import-export, not login/redirect').toBe(true);
      expect(targetHasRealSurface, 'target must render real entity selector + jobs table, not placeholder/error/permission state').toBe(true);
      expect(browserFailures, 'console/network/page errors must be empty for compared surface').toEqual([]);
      expect(parityReport.status).toBe('CAPTURED');
      expectNonEmptyArtifact('prototype-import-export-desktop-1440x900.png');
      expectNonEmptyArtifact('target-import-export-desktop-1440x900.png');
      expectNonEmptyArtifact('dom-diff.json');
      expectNonEmptyArtifact('parity_report.json');
    } finally {
      await context.close();
      await closeServer(prototypeServer.server);
    }
  });
});
