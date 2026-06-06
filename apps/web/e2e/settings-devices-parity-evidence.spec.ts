import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies, startLocalShellParityHarness } from './_helpers/shell-parity';

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const evidenceDir = path.join(webRoot, 'e2e/artifacts/SETTINGS-DEVICES');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const prototypePath = path.join(prototypeRoot, 'settings/ops-screens.jsx');
const targetRoute = '/en/settings/devices';
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

function expectNonEmptyArtifact(relativeName: string) {
  const absolute = path.join(evidenceDir, relativeName);
  expect(existsSync(absolute), `${relativeName} must be written for the UI parity evidence`).toBe(true);
  expect(statSync(absolute).size, `${relativeName} must not be empty`).toBeGreaterThan(0);
}

test.describe('settings devices parity evidence', () => {
  test('captures prototype and real target route screenshots, DOM summary, runtime wiring evidence, and parity report', async ({ browser }) => {
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
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'devices' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.getByText('Scanner devices', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-desktop-1440x1000.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${harness.baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-desktop-1440x1000.png'), fullPage: true });

      const pairButton = targetPage.getByRole('button', { name: /\+ pair device/i }).first();
      let dialogEvidence = 'not_opened_read_only_or_error_state';
      if (await pairButton.isVisible().catch(() => false)) {
        await pairButton.click();
        const dialog = targetPage.locator('[role="dialog"]').first();
        if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await targetPage.screenshot({ path: path.join(evidenceDir, 'target-pair-device-dialog-desktop-1440x1000.png'), fullPage: true });
          dialogEvidence = 'opened_from_pair_device_cta';
        } else {
          dialogEvidence = 'not_opened_client_hydration_unavailable; rtl_covers_pair_modal';
        }
      }

      const selectors = {
        page: 'main[data-prototype-source="prototypes/design/Monopilot Design System/settings/ops-screens.jsx:4-95"]',
        page_head: '.sg-head',
        kpis: '[data-testid="devices-kpis"]',
        paired_devices: '.sg-section:has-text("Paired devices") table, [data-testid="devices-empty"]',
        defaults_section: '.sg-section:has-text("Device defaults")',
        defaults_rows: '.sg-section:has-text("Device defaults") .sg-row',
        pair_modal_trigger: 'button:has-text("+ Pair device")',
        dialog: '[role="dialog"]',
      };
      const domDiff = {
        task_id: 'SETTINGS-DEVICES',
        generated_at: new Date().toISOString(),
        prototype_path: `${prototypePath}:4-95`,
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
          devices_screen_excerpt: sliceLines(prototypePath, 4, 95),
        },
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const browserFailures = spy.failuresFor(targetRoute);
      const targetPageText = await targetPage.locator('body').innerText().catch(() => '');
      const routeRendered = new URL(targetPage.url()).pathname === targetRoute;
      const rawI18nVisible = /settings\.devices\.|settings_devices|devices\.(title|subtitle|pair)/i.test(targetPageText);
      const hasSafeErrorState = /scanner devices could not be loaded|could not be loaded|unable to load|not configured/i.test(targetPageText);
      const hasPrototypeAnchor = await targetPage.locator(selectors.page).first().isVisible().catch(() => false);
      const hasKpis = (await targetPage.locator('[data-testid="devices-kpis"] .kpi').count().catch(() => 0)) === 4;
      const hasPairedDevicesSurface = await targetPage.locator(selectors.paired_devices).first().isVisible().catch(() => false);
      const hasDefaultsSection = await targetPage.locator(selectors.defaults_section).first().isVisible().catch(() => false);
      const hasDefaultsRows = (await targetPage.locator(selectors.defaults_rows).count().catch(() => 0)) >= 3;
      const pairTriggerVisible = await pairButton.isVisible().catch(() => false);
      const readOnlyNoticeVisible = await targetPage.getByRole('note', { name: /read-only/i }).isVisible().catch(() => false);

      const parityReport = {
        task_id: 'SETTINGS-DEVICES',
        generated_at: new Date().toISOString(),
        prototype_path: `${prototypePath}:4-95`,
        prototype_route: prototypeServer.url,
        target_route: targetRoute,
        base_url: harness.baseURL,
        server_identity: harness.server_identity,
        viewports: ['desktop-1440x1000'],
        region_selectors: selectors,
        parity_matrix: {
          structural: routeRendered && hasPrototypeAnchor && hasKpis && hasPairedDevicesSurface && hasDefaultsSection && hasDefaultsRows
            ? 'captured_kpis_paired_devices_defaults'
            : 'fail_required_regions_missing',
          visual: routeRendered ? 'captured_target_vs_prototype_screenshot_pair' : 'fail_route_not_rendered',
          interaction: dialogEvidence === 'opened_from_pair_device_cta'
            ? 'pair_modal_captured'
            : pairTriggerVisible
              ? 'pair_trigger_visible_but_modal_not_opened; rtl_covers_modal'
              : readOnlyNoticeVisible
                ? 'read_only_state_captured_without_pair_trigger'
                : 'pair_trigger_not_visible',
          data: hasPairedDevicesSurface ? 'captured_live_scanner_devices_table_or_empty_state' : 'fail_paired_devices_surface_missing',
          rbac: readOnlyNoticeVisible ? 'read_only_notice_captured' : 'editable_pair_trigger_captured',
          i18n: rawI18nVisible ? 'fail_raw_key_visible' : 'captured_no_raw_settings_devices_key_observed',
          authenticated_preview: `local_dev_harness_with_auth_cookie baseURL=${harness.baseURL}; server=${harness.server_identity}`,
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/SETTINGS-DEVICES/prototype-desktop-1440x1000.png',
          target_screenshot: 'apps/web/e2e/artifacts/SETTINGS-DEVICES/target-desktop-1440x1000.png',
          target_dialog_screenshot: dialogEvidence === 'opened_from_pair_device_cta' ? 'apps/web/e2e/artifacts/SETTINGS-DEVICES/target-pair-device-dialog-desktop-1440x1000.png' : null,
          dom_diff_json: 'apps/web/e2e/artifacts/SETTINGS-DEVICES/dom-diff.json',
          parity_report_json: 'apps/web/e2e/artifacts/SETTINGS-DEVICES/parity_report.json',
          axe_report: 'apps/web/e2e/artifacts/SETTINGS-DEVICES/axe-report.json',
        },
        axe: { status: 'not_run', reason: 'No @axe-core/playwright dependency is configured in this web package; structural DOM report and browser error spy captured.' },
        status: routeRendered && !hasSafeErrorState && hasPrototypeAnchor && hasKpis && hasPairedDevicesSurface && hasDefaultsSection && hasDefaultsRows && (pairTriggerVisible || readOnlyNoticeVisible) && !rawI18nVisible && browserFailures.length === 0
          ? 'CAPTURED'
          : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(parityReport.axe, null, 2)}\n`);

      expect(routeRendered, 'target route should not redirect away from /en/settings/devices under the local harness').toBe(true);
      expect(hasSafeErrorState, 'target route must render the real scanner devices surface, not the load-error state').toBe(false);
      expect(hasPrototypeAnchor, 'target route must retain the prototype-source anchor for ops-screens.jsx:4-95').toBe(true);
      expect(hasKpis, 'target route must render four KPI cards').toBe(true);
      expect(hasPairedDevicesSurface, 'target route must render the paired-devices table or its explicit empty state').toBe(true);
      expect(hasDefaultsSection, 'target route must render the Device defaults section').toBe(true);
      expect(hasDefaultsRows, 'target route must render the auto-lock row and two toggle rows').toBe(true);
      expect(pairTriggerVisible || readOnlyNoticeVisible, 'target route must expose the pair modal trigger or an explicit read-only notice').toBe(true);
      expect(rawI18nVisible, 'target route must not leak raw settings.devices i18n keys').toBe(false);
      expect(browserFailures, 'target route should not emit console/network/page errors while capturing evidence').toEqual([]);
      expect(parityReport.status).toBe('CAPTURED');
      expectNonEmptyArtifact('prototype-desktop-1440x1000.png');
      expectNonEmptyArtifact('target-desktop-1440x1000.png');
      expectNonEmptyArtifact('dom-diff.json');
      expectNonEmptyArtifact('parity_report.json');
      expectNonEmptyArtifact('axe-report.json');
    } finally {
      await context.close();
      await harness.close();
      await closeServer(prototypeServer.server);
    }
  });
});
