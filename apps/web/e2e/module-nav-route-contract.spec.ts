import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { APP_NAV_GROUPS } from '../lib/navigation/app-nav';

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'apps/web/app');
const appRouteRoot = path.join(appRoot, '[locale]/(app)');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, baseURL).toString();

const sidebarRoutes = APP_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    key: item.key,
    label: item.label,
    moduleId: item.module_id,
    route: item.route,
    expectedPathname: `/en${item.route}`,
    expectedTestId: `app-sidebar-item-${item.key}`,
  })),
);

const expectedModuleLandingIds = sidebarRoutes
  .filter((item) => item.moduleId !== null && item.moduleId !== 'settings')
  .map((item) => item.moduleId as string);

function toRoutePath(pagePath: string) {
  const relative = path.relative(appRouteRoot, pagePath);
  const parts = relative.split(path.sep).slice(0, -1).filter((part) => !/^\(.+\)$/.test(part));
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

function collectLocalizedPageRoots(dir = appRouteRoot): Map<string, string> {
  const roots = new Map<string, string>();
  if (!existsSync(dir)) return roots;

  const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [route, file] of collectLocalizedPageRoots(absolute)) roots.set(route, file);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      roots.set(toRoutePath(absolute), absolute);
    }
  }

  return roots;
}

function assertRouteRootContract() {
  expect(sidebarRoutes.map((item) => item.key), 'Scanner must stay absent from APP_NAV_GROUPS').not.toContain('scanner');

  const pageRoots = collectLocalizedPageRoots();
  const missingRoutes = sidebarRoutes
    .filter((item) => !pageRoots.has(item.route))
    .map((item) => `${item.key}:${item.route}`);

  expect(
    missingRoutes,
    `Every AppSidebar item must resolve to an apps/web/app/[locale]/(app)/.../page.tsx root before the click-through E2E can run; found routes: ${JSON.stringify([...pageRoots.keys()].sort())}`,
  ).toEqual([]);

  const missingLandingIds = expectedModuleLandingIds.filter((moduleId) => {
    const item = sidebarRoutes.find((candidate) => candidate.moduleId === moduleId);
    const pagePath = item ? pageRoots.get(item.route) : undefined;
    return !pagePath || !readFileSync(pagePath, 'utf8').includes(`module-landing-${moduleId}`);
  });

  expect(
    missingLandingIds,
    'Missing UI-128 module roots must be minimal landing stubs with data-testid=module-landing-<module_id>; existing Settings page is excluded from the stub requirement',
  ).toEqual([]);
}

test.describe('UI-138 module nav route contract', () => {
  test('clicks every AppSidebar link without 404s, keeps active nav state, and leaves scanner isolated', async ({ page, request }) => {
    assertRouteRootContract();

    const consoleFailures: string[] = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) consoleFailures.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleFailures.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (failedRequest) => {
      const url = failedRequest.url();
      if (!url.includes('/_next/static/')) consoleFailures.push(`requestfailed: ${url} ${failedRequest.failure()?.errorText ?? ''}`.trim());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    const homeResponse = await page.goto(routeUrl('/en/'), { waitUntil: 'domcontentloaded' });
    expect(homeResponse?.status(), '/en/ must render an authenticated AppShell for sidebar click-through').toBe(200);
    await expect(page.getByTestId('app-shell'), 'AppShell must wrap sidebar module landing routes').toBeVisible();
    await expect(page.getByTestId('app-sidebar'), 'AppSidebar must render before clicking module links').toBeVisible();
    await expect(page.getByTestId('app-topbar'), 'AppTopbar must render for app routes').toBeVisible();
    await expect(page.getByTestId('app-sidebar-item-scanner'), 'Scanner must not be exposed in desktop sidebar').toHaveCount(0);

    for (const item of sidebarRoutes) {
      const link = page.getByTestId(item.expectedTestId);
      await expect(link, `${item.key} sidebar link must be visible`).toBeVisible();
      await expect(link, `${item.key} href must be /en-localized`).toHaveAttribute('href', item.expectedPathname);

      await link.click();
      await page.waitForURL((url) => url.pathname === item.expectedPathname, { timeout: 10_000 });

      const routeResponse = await request.get(routeUrl(item.expectedPathname), { maxRedirects: 0 });
      expect(routeResponse.status(), `${item.expectedPathname} must not 404; 200 or intentional auth redirect is acceptable`).not.toBe(404);
      await expect(page.getByTestId(item.expectedTestId), `${item.key} must be active after navigation`).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('app-shell-main'), `${item.key} route must render inside AppShell main`).toBeVisible();
      if (item.moduleId && item.moduleId !== 'settings') {
        await expect(page.getByTestId(`module-landing-${item.moduleId}`), `${item.key} missing root must render its UI-138 landing stub`).toBeVisible();
      }
    }

    const scannerResponse = await request.get(routeUrl('/en/dev/scanner'), { maxRedirects: 0 });
    expect(scannerResponse.status(), '/en/dev/scanner must remain a non-404 scanner route outside desktop nav').not.toBe(404);
    expect(consoleFailures, 'sidebar click-through should not emit console errors/warnings or failed app network requests').toEqual([]);
  });
});
