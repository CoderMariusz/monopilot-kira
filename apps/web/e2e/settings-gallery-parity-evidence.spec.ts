import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies, startLocalShellParityHarness } from './_helpers/shell-parity';

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const evidenceDir = path.join(webRoot, 'e2e/artifacts/SETTINGS-GALLERY');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const prototypePath = path.join(prototypeRoot, 'settings/modals.jsx');
const targetRoute = '/en/settings/gallery';
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

test.describe('settings modal gallery parity evidence', () => {
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
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'modalGallery' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.getByText('Modal gallery', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-desktop-1440x1000.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${harness.baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-desktop-1440x1000.png'), fullPage: true });

      const triggerIds = ['SM-01', 'SM-02', 'SM-03', 'SM-04', 'SM-05', 'SM-06', 'SM-07', 'SM-08', 'SM-09', 'SM-10', 'SM-11'];
      const modalEvidence: Record<string, string> = {};
      for (const id of triggerIds) {
        const trigger = targetPage.locator(`[data-testid="gallery-trigger-${id}"]`).first();
        await expect(trigger, `${id} modal trigger must be visible`).toBeVisible();
        await trigger.click();
        const dialog = targetPage.locator('[role="dialog"]').first();
        await dialog.waitFor({ state: 'visible', timeout: 5_000 });
        modalEvidence[id] = (await dialog.innerText()).replace(/\s+/g, ' ').trim().slice(0, 240);
        await targetPage.keyboard.press('Escape').catch(() => undefined);
        if (await dialog.isVisible().catch(() => false)) {
          await dialog.getByRole('button', { name: /close|cancel/i }).first().click().catch(() => undefined);
        }
        await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
      }
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-after-modal-trigger-pass-desktop-1440x1000.png'), fullPage: true });

      const selectors = {
        page: 'main[data-testid="settings-modal-gallery"][data-prototype-source="prototypes/design/Monopilot Design System/settings/modals.jsx"]',
        page_head: '.sg-head',
        sections: '.sg-section',
        gallery_rows: '.sg-row',
        triggers: '[data-testid^="gallery-trigger-SM-"]',
        dialog: '[role="dialog"]',
      };
      const domDiff = {
        task_id: 'SETTINGS-GALLERY',
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
        modal_evidence: modalEvidence,
        anchors: {
          modal_inventory_excerpt: sliceLines(prototypePath, 1, 40),
          modal_gallery_excerpt: sliceLines(prototypePath, 562, 604),
        },
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const browserFailures = spy.failuresFor(targetRoute);
      const targetPageText = await targetPage.locator('body').innerText().catch(() => '');
      const routeRendered = new URL(targetPage.url()).pathname === targetRoute;
      const rawI18nVisible = /settings\.gallery\.|settings_gallery|gallery\.(title|subtitle|open)/i.test(targetPageText);
      const hasPrototypeAnchor = await targetPage.locator(selectors.page).first().isVisible().catch(() => false);
      const hasSharedShell = (await targetPage.locator('.sg-head').count().catch(() => 0)) >= 1
        && (await targetPage.locator('.sg-section').count().catch(() => 0)) >= 11;
      const triggerCount = await targetPage.locator(selectors.triggers).count().catch(() => 0);
      const allModalsOpened = triggerIds.every((id) => modalEvidence[id]?.length > 0);

      const parityReport = {
        task_id: 'SETTINGS-GALLERY',
        generated_at: new Date().toISOString(),
        prototype_path: prototypePath,
        prototype_route: prototypeServer.url,
        target_route: targetRoute,
        base_url: harness.baseURL,
        server_identity: harness.server_identity,
        viewports: ['desktop-1440x1000'],
        region_selectors: selectors,
        parity_matrix: {
          structural: routeRendered && hasPrototypeAnchor && hasSharedShell && triggerCount >= 11
            ? 'captured_modal_catalog_sections_and_triggers'
            : 'fail_required_regions_missing',
          visual: routeRendered ? 'captured_target_vs_prototype_screenshot_pair' : 'fail_route_not_rendered',
          interaction: allModalsOpened ? 'all_gallery_triggers_open_real_role_dialog_modals' : 'fail_modal_trigger_missing_or_dialog_not_visible',
          i18n: rawI18nVisible ? 'fail_raw_key_visible' : 'captured_no_raw_settings_gallery_key_observed',
          authenticated_preview: `local_dev_harness_with_auth_cookie baseURL=${harness.baseURL}; server=${harness.server_identity}`,
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/prototype-desktop-1440x1000.png',
          target_screenshot: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/target-desktop-1440x1000.png',
          target_after_modal_trigger_pass_screenshot: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/target-after-modal-trigger-pass-desktop-1440x1000.png',
          dom_diff_json: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/dom-diff.json',
          parity_report_json: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/parity_report.json',
          axe_report: 'apps/web/e2e/artifacts/SETTINGS-GALLERY/axe-report.json',
        },
        axe: { status: 'not_run', reason: 'No @axe-core/playwright dependency is configured in this web package; structural DOM report and browser error spy captured.' },
        status: routeRendered && hasPrototypeAnchor && hasSharedShell && triggerCount >= 11 && allModalsOpened && !rawI18nVisible && browserFailures.length === 0
          ? 'CAPTURED'
          : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);
      writeFileSync(path.join(evidenceDir, 'axe-report.json'), `${JSON.stringify(parityReport.axe, null, 2)}\n`);

      expect(routeRendered, 'target route should not redirect away from /en/settings/gallery under the local harness').toBe(true);
      expect(hasPrototypeAnchor, 'target route must retain the prototype-source anchor for settings/modals.jsx').toBe(true);
      expect(hasSharedShell, 'target route must render the shared .sg-head and .sg-section structure').toBe(true);
      expect(triggerCount, 'target route must render one trigger for each SM-01 through SM-11 modal').toBeGreaterThanOrEqual(11);
      expect(allModalsOpened, 'every gallery trigger must open a real visible dialog').toBe(true);
      expect(rawI18nVisible, 'target route must not leak raw settings.gallery i18n keys').toBe(false);
      expect(browserFailures, 'target route should not emit console/network/page errors while capturing evidence').toEqual([]);
      expect(parityReport.status).toBe('CAPTURED');
      expectNonEmptyArtifact('prototype-desktop-1440x1000.png');
      expectNonEmptyArtifact('target-desktop-1440x1000.png');
      expectNonEmptyArtifact('target-after-modal-trigger-pass-desktop-1440x1000.png');
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
