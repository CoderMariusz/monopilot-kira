import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'apps/web/app');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, baseURL).toString();
const fromAppRoot = (relativePath: string) => path.join(appRoot, relativePath);

const selectors = {
  subnav: '[data-testid="settings-subnav"]',
  main: '[data-testid="settings-main"]',
  activeItem: '[data-testid="settings-subnav"] [aria-current="page"]',
};

const settingsRoutes = ['/en/settings', '/en/settings/users', '/en/settings/roles'] as const;

test.describe('UI-132 settings subnav layout contract', () => {
  test('settings layout is a server component under (app)/(admin) and no parallel (app)/(settings) UI tree exists', () => {
    const layoutPath = fromAppRoot('[locale]/(app)/(admin)/settings/layout.tsx');
    expect(existsSync(layoutPath), 'settings layout must live at app/[locale]/(app)/(admin)/settings/layout.tsx').toBe(true);

    const source = readFileSync(layoutPath, 'utf8').trimStart();
    expect(source.startsWith('"use client"'), 'settings layout must remain a Server Component').toBe(false);
    expect(source.startsWith("'use client'"), 'settings layout must remain a Server Component').toBe(false);
    expect(source, 'settings layout must mount SettingsSubNav').toMatch(/SettingsSubNav|settings-subnav/);
    expect(source, 'settings layout must expose data-testid="settings-main" on the main content region').toContain('settings-main');
    expect(source, 'settings layout grid/sidebar width must use var(--shell-subnav-w)').toContain('--shell-subnav-w');

    expect(
      existsSync(fromAppRoot('[locale]/(app)/(settings)')),
      'UI-132 final IA must not create a parallel app/[locale]/(app)/(settings) settings route tree',
    ).toBe(false);
  });

  for (const route of settingsRoutes) {
    test(`${route} renders SettingsSubNav and settings main`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const response = await page.goto(routeUrl(route), { waitUntil: 'domcontentloaded' });

      expect(response?.status(), `${route} should render the settings route`).toBe(200);
      expect(new URL(page.url()).pathname, `${route} should not be redirected out of the requested settings path`).toBe(route);

      await expect(page.locator(selectors.subnav), `${route} must render settings-subnav`).toBeVisible();
      await expect(page.locator(selectors.main), `${route} must render settings-main`).toBeVisible();
      await expect(page.locator(selectors.activeItem), `${route} must expose exactly one active subnav item`).toHaveCount(1);

      const subnavBox = await page.locator(selectors.subnav).boundingBox();
      expect(subnavBox, `${route} settings-subnav must have a measurable box`).not.toBeNull();
      expect(Math.round(subnavBox!.width), `${route} settings-subnav width must resolve to --shell-subnav-w`).toBe(240);
    });
  }

  test('/en/ non-settings sibling layout does not mount the settings subnav', () => {
    const appLayoutPath = fromAppRoot('[locale]/(app)/layout.tsx');
    expect(existsSync(appLayoutPath), '(app)/layout.tsx must exist as the non-settings sibling layout').toBe(true);

    const source = readFileSync(appLayoutPath, 'utf8');
    expect(source, '(app)/layout.tsx must not import or mount SettingsSubNav').not.toMatch(/SettingsSubNav|settings-subnav/);
    expect(source, '(app)/layout.tsx must not expose the settings-main region').not.toContain('settings-main');
  });
});
