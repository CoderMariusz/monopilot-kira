import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installBrowserErrorSpies } from './_helpers/shell-parity';

const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const prototypeRoot = path.join(repoRoot, 'prototypes/design/Monopilot Design System');
const adminScreensPath = path.join(prototypeRoot, 'settings/admin-screens.jsx');
const modalsPath = path.join(prototypeRoot, 'settings/modals.jsx');
const evidenceDir = path.join(webRoot, 'e2e/artifacts/TASK-001090');
const targetRoute = '/en/settings/email';
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

type RegionSummary = {
  selector: string;
  count: number;
  visibleCount: number;
  textSample: string;
};

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
  expect(existsSync(absolute), `${relativeName} must be written for AC4 UI parity evidence`).toBe(true);
  expect(statSync(absolute).size, `${relativeName} must not be empty`).toBeGreaterThan(0);
}

test.describe('TASK-001090 settings email parity evidence', () => {
  test('settings email captures prototype/target screenshots, DOM diff, modal proof, and console-network report', async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL;
    const authStorageState = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
    expect(
      baseURL,
      'BLOCKED_AUTH: settings email parity evidence requires PLAYWRIGHT_BASE_URL for the real target route; route existence or unauthenticated redirect is not accepted.',
    ).toBeTruthy();
    expect(
      authStorageState && existsSync(authStorageState),
      'BLOCKED_AUTH: settings email parity evidence requires PLAYWRIGHT_AUTH_STORAGE/PLAYWRIGHT_AUTH_STORAGE_STATE for an authenticated operator session.',
    ).toBeTruthy();

    ensureEvidenceDir();
    const prototypeServer = await servePrototype();
    const context = await browser.newContext({ viewport, storageState: authStorageState });
    const prototypePage = await context.newPage();
    const targetPage = await context.newPage();
    const spy = installBrowserErrorSpies(targetPage);

    try {
      await prototypePage.addInitScript(() => {
        localStorage.setItem('settings-route', JSON.stringify({ screen: 'email_templates' }));
        localStorage.setItem('settings-role', 'admin');
      });
      await prototypePage.goto(prototypeServer.url, { waitUntil: 'networkidle' });
      await prototypePage.screenshot({ path: path.join(evidenceDir, 'prototype-email-templates-desktop-1440x900.png'), fullPage: true });

      spy.setRoute(targetRoute);
      const response = await targetPage.goto(`${baseURL}${targetRoute}`, { waitUntil: 'domcontentloaded' });
      await targetPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await targetPage.screenshot({ path: path.join(evidenceDir, 'target-email-templates-desktop-1440x900.png'), fullPage: true });

      const editButton = targetPage.getByRole('button', { name: /edit.*po_to_supplier|edit/i }).first();
      let modalEvidence = 'not_opened';
      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();
        const dialog = targetPage.getByRole('dialog', { name: /email|template/i }).first();
        if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await targetPage.screenshot({ path: path.join(evidenceDir, 'target-email-template-edit-modal-desktop-1440x900.png'), fullPage: true });
          modalEvidence = 'opened_from_table_edit';
        }
      }

      const selectors = {
        email_templates_screen: 'main[data-screen="email_templates_screen"]',
        provider_section: '[data-region="provider-section"]',
        templates_section: '[data-region="templates-section"]',
        variables_reference: '[data-region="variables-reference"]',
        email_template_edit_modal: '[role="dialog"]',
      };
      const browserFailures = spy.failuresFor(targetRoute);
      const bodyText = await targetPage.locator('body').innerText().catch(() => '');
      const finalPath = new URL(targetPage.url()).pathname;
      const routeRendered = finalPath === targetRoute;
      const targetHasTemplateTable = await targetPage.locator('main table, main [role="table"]').first().isVisible().catch(() => false);
      const targetHasProviderAffordance = await targetPage.getByRole('button', { name: /test send/i }).isVisible().catch(() => false);
      const targetHasVariablesLink = await targetPage.getByRole('link', { name: /email variables|variables reference/i }).isVisible().catch(() => false);
      const targetHasRealSurface = routeRendered && targetHasTemplateTable && targetHasProviderAffordance && targetHasVariablesLink && !/login|sign in|not configured|permission|unable to load/i.test(bodyText);

      const domDiff = {
        task_id: 'TASK-001090',
        prototype_path: adminScreensPath,
        prototype_route: prototypeServer.url,
        target_route: `${baseURL}${targetRoute}`,
        viewport: 'desktop-1440x900',
        region_selectors: selectors,
        prototype_regions: Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await summarizeRegion(prototypePage, selector)]))),
        target_regions: Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await summarizeRegion(targetPage, selector)]))),
        browser_events: browserFailures,
        target_http_status: response?.status() ?? null,
        target_final_url: targetPage.url(),
        modal_evidence: modalEvidence,
        anchors: {
          email_templates_screen: sliceLines(adminScreensPath, 626, 673).slice(0, 2000),
          email_template_edit_modal: sliceLines(modalsPath, 141, 259).slice(0, 2000),
        },
      };
      writeFileSync(path.join(evidenceDir, 'dom-diff.json'), `${JSON.stringify(domDiff, null, 2)}\n`);

      const parityReport = {
        task_id: 'TASK-001090',
        prototype_path: adminScreensPath,
        prototype_route: 'settings/admin-screens.jsx#email_templates_screen; settings/modals.jsx#email_template_edit_modal',
        target_route: targetRoute,
        viewports: ['desktop-1440x900'],
        region_selectors: selectors,
        parity_matrix: {
          structural: targetHasRealSurface ? 'captured_template_table_provider_variables_link' : 'fail_real_email_surface_missing',
          visual: targetHasRealSurface ? 'captured_target_vs_prototype_screenshot_pair' : 'fail_target_screenshot_not_real_surface',
          interaction: modalEvidence === 'opened_from_table_edit' ? 'edit_modal_opened_and_captured' : 'fail_edit_modal_not_opened_from_table',
          console_network: browserFailures.length === 0 ? 'captured_no_browser_failures' : 'fail_browser_failures_present',
        },
        artifacts: {
          prototype_screenshot: 'apps/web/e2e/artifacts/TASK-001090/prototype-email-templates-desktop-1440x900.png',
          target_screenshot: 'apps/web/e2e/artifacts/TASK-001090/target-email-templates-desktop-1440x900.png',
          target_modal_screenshot: modalEvidence === 'opened_from_table_edit' ? 'apps/web/e2e/artifacts/TASK-001090/target-email-template-edit-modal-desktop-1440x900.png' : null,
          dom_diff_json: 'apps/web/e2e/artifacts/TASK-001090/dom-diff.json',
        },
        status: targetHasRealSurface && modalEvidence === 'opened_from_table_edit' && browserFailures.length === 0 ? 'CAPTURED' : 'FAIL',
      };
      writeFileSync(path.join(evidenceDir, 'parity_report.json'), `${JSON.stringify(parityReport, null, 2)}\n`);

      expect(routeRendered, 'target route must stay on /en/settings/email, not login or redirect-only evidence').toBe(true);
      expect(targetHasRealSurface, 'target must render real email templates table/provider/test/variables surface, not permission/error/placeholder state').toBe(true);
      expect(modalEvidence, 'table Edit action must open EmailTemplateEditModal for screenshot/DOM evidence').toBe('opened_from_table_edit');
      expect(browserFailures, 'console/network/page errors must be empty for compared surface').toEqual([]);
      expect(parityReport.status).toBe('CAPTURED');
      expectNonEmptyArtifact('prototype-email-templates-desktop-1440x900.png');
      expectNonEmptyArtifact('target-email-templates-desktop-1440x900.png');
      expectNonEmptyArtifact('dom-diff.json');
      expectNonEmptyArtifact('parity_report.json');
    } finally {
      await context.close();
      await closeServer(prototypeServer.server);
    }
  });
});
