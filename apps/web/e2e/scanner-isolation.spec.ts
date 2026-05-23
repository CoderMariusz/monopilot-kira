import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'apps/web/app');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, baseURL).toString();
const fromAppRoot = (relativePath: string) => path.join(appRoot, relativePath);

const scannerSelectors = {
  frame: '[data-testid="scanner-frame"]',
  statusBar: '[data-testid="scanner-status-bar"]',
  content: '[data-testid="scanner-content"]',
  bottomActions: '[data-testid="scanner-bottom-actions"]',
  appShell: '[data-testid="app-shell"]',
  appSidebar: '[data-testid="app-sidebar"]',
  appTopbar: '[data-testid="app-topbar"]',
};

test.describe('T-134 scanner route-group isolation', () => {
  test('scanner layout stays isolated from AppShell imports and auth gates', () => {
    const scannerLayoutPath = fromAppRoot('[locale]/(scanner)/layout.tsx');
    expect(existsSync(scannerLayoutPath), '(scanner)/layout.tsx must exist as a sibling route-group layout').toBe(true);

    const source = readFileSync(scannerLayoutPath, 'utf8');
    expect(source, '(scanner)/layout.tsx must not import AppSidebar').not.toMatch(/AppSidebar|app-sidebar/);
    expect(source, '(scanner)/layout.tsx must not import AppTopbar').not.toMatch(/AppTopbar|app-topbar/);
    expect(source, '(scanner)/layout.tsx must not import or wrap the (app) layout').not.toMatch(/\(app\)|AppRouteGroupLayout|app\/layout/);
    expect(source, '(scanner)/layout.tsx must not add a Supabase/auth gate').not.toMatch(/createServerSupabaseClient|supabase\.auth|getUser\(/);
  });

  test('public /en/dev/scanner renders a 390x844 ScannerFrame and no AppShell chrome', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(routeUrl('/en/dev/scanner'), { waitUntil: 'domcontentloaded' });

    expect(response?.status(), '/en/dev/scanner must be a public scanner harness route').toBe(200);
    await expect(page.locator(scannerSelectors.frame), 'scanner-frame root must render on the dev harness').toBeVisible();
    await expect(page.locator(scannerSelectors.statusBar), 'scanner status-bar slot must render').toBeVisible();
    await expect(page.locator(scannerSelectors.content), 'scanner content slot must render').toBeVisible();
    await expect(page.locator(scannerSelectors.bottomActions), 'scanner bottom-actions slot must render').toBeVisible();

    const frameBox = await page.locator(scannerSelectors.frame).boundingBox();
    expect(frameBox, 'scanner-frame must have a measurable bounding box').not.toBeNull();
    expect(Math.round(frameBox!.width), 'scanner-frame width must resolve from --shell-scanner-w').toBe(390);
    expect(Math.round(frameBox!.height), 'scanner-frame height must resolve from --shell-scanner-h').toBe(844);

    await expect(page.locator(scannerSelectors.appSidebar), 'scanner route must not inherit AppSidebar').toHaveCount(0);
    await expect(page.locator(scannerSelectors.appTopbar), 'scanner route must not inherit AppTopbar').toHaveCount(0);
    await expect(page.locator(scannerSelectors.appShell), 'scanner route must not inherit AppShell').toHaveCount(0);

    const body = await page.locator('body').innerHTML();
    expect(body, 'response body must not include AppSidebar test-id').not.toContain('data-testid="app-sidebar"');
    expect(body, 'response body must not include AppTopbar test-id').not.toContain('data-testid="app-topbar"');
    expect(body, 'response body must not include AppShell test-id').not.toContain('data-testid="app-shell"');
  });

  test('app route group remains a separate sibling and does not import the scanner frame', () => {
    const appLayoutPath = fromAppRoot('[locale]/(app)/layout.tsx');
    expect(existsSync(appLayoutPath), '(app)/layout.tsx must remain the separate app route-group layout').toBe(true);

    const source = readFileSync(appLayoutPath, 'utf8');
    expect(source, '(app)/layout.tsx must not import ScannerFrame or the scanner route group').not.toMatch(
      /ScannerFrame|scanner-frame|\(scanner\)/,
    );
  });
});
