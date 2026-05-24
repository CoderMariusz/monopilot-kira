import { expect, test } from '@playwright/test';
import { APP_NAV_GROUPS } from '../lib/navigation/app-nav';
import {
  assertActiveNavigation,
  assertShellRegions,
  buildReport,
  buildReportEntry,
  ensureEvidenceDir,
  installBrowserErrorSpies,
  reportPath,
  resolveAuthStorageState,
  screenshotPathFor,
  startLocalShellParityHarness,
  type ShellFailure,
  type ShellParityHarness,
  type ShellRouteExpectation,
  type ShellRouteResult,
  writeReport,
} from './_helpers/shell-parity';

let activeBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const routeUrl = (route: string) => new URL(route, activeBaseURL).toString();
const authStorageState = resolveAuthStorageState();
let shellParityHarness: ShellParityHarness | undefined;

if (authStorageState) {
  test.use({ storageState: authStorageState });
}

const desktopViewport = { width: 1440, height: 900 };
const scannerViewport = { width: 390, height: 844 };

const sidebarRoutes: ShellRouteExpectation[] = APP_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    route: `/en${item.route}`,
    label: `sidebar:${item.key}`,
    auth_state: 'auth' as const,
    expects_shell: true,
    expects_subnav: item.key === 'settings',
    active_nav_item: item.key,
    viewport: desktopViewport,
    expected_final_pathname: `/en${item.route}`,
  })),
);

const explicitShellRoutes: ShellRouteExpectation[] = [
  {
    route: '/en/',
    label: 'localized app home',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: false,
    active_nav_item: null,
    viewport: desktopViewport,
    expected_final_pathname: '/en',
  },
  {
    route: '/en/settings/users',
    label: 'settings users shell',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'users',
    viewport: desktopViewport,
    expected_final_pathname: '/en/settings/users',
  },
  {
    route: '/en/settings/roles',
    label: 'settings roles shell',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'users',
    viewport: desktopViewport,
    expected_final_pathname: '/en/settings/roles',
  },
  {
    route: '/en/settings/rules',
    label: 'settings rules registry shell and i18n',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'rules',
    viewport: desktopViewport,
    expected_final_pathname: '/en/settings/rules',
  },
  {
    route: '/en/settings/flags',
    label: 'settings flags admin shell and i18n',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'flags',
    viewport: desktopViewport,
    expected_final_pathname: '/en/settings/flags',
  },
  {
    route: '/en/settings/reference/manufacturing-operations',
    label: 'settings manufacturing operations shell and i18n',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'reference',
    viewport: desktopViewport,
    expected_final_pathname: '/en/settings/reference/manufacturing-operations',
  },
  {
    route: '/pl/settings/rules',
    label: 'polish settings rules registry shell and i18n',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'rules',
    viewport: desktopViewport,
    expected_final_pathname: '/pl/settings/rules',
  },
  {
    route: '/pl/settings/flags',
    label: 'polish settings flags admin shell and i18n',
    auth_state: 'auth',
    expects_shell: true,
    expects_subnav: true,
    active_nav_item: 'settings',
    active_subnav_item: 'flags',
    viewport: desktopViewport,
    expected_final_pathname: '/pl/settings/flags',
  },
];

const isolationRoutes: ShellRouteExpectation[] = [
  {
    route: '/en/login',
    label: 'english login isolation',
    auth_state: 'public',
    expects_shell: false,
    expects_subnav: false,
    viewport: desktopViewport,
    expected_final_pathname: '/en/login',
  },
  {
    route: '/pl/login',
    label: 'polish login isolation',
    auth_state: 'public',
    expects_shell: false,
    expects_subnav: false,
    viewport: desktopViewport,
    expected_final_pathname: '/pl/login',
  },
  {
    route: '/en/dev/scanner',
    label: 'scanner shell isolation',
    auth_state: 'public',
    expects_shell: false,
    expects_subnav: false,
    expects_scanner: true,
    viewport: scannerViewport,
    expected_final_pathname: '/en/dev/scanner',
  },
  {
    route: '/login',
    label: 'bare login localized redirect',
    auth_state: 'public',
    expects_shell: false,
    expects_subnav: false,
    viewport: desktopViewport,
    expected_final_pathname: '/en/login',
  },
];

const routeMatrix: ShellRouteExpectation[] = [
  ...explicitShellRoutes,
  ...sidebarRoutes,
  ...isolationRoutes,
];

const settingsI18nRouteExpectations: Record<string, { rawKeyPrefix: string; expectedHeading: string; screenSelector: string }> = {
  '/en/settings/rules': {
    rawKeyPrefix: 'settings.rules_registry.',
    expectedHeading: 'Rules registry',
    screenSelector: '[data-testid="settings-rules-registry-screen"]',
  },
  '/en/settings/flags': {
    rawKeyPrefix: 'settings.flags_admin.',
    expectedHeading: 'Feature flags',
    screenSelector: '[data-testid="settings-flags-admin-screen"]',
  },
  '/en/settings/reference/manufacturing-operations': {
    rawKeyPrefix: 'settings.manufacturing_operations.',
    expectedHeading: 'Manufacturing operations',
    screenSelector: 'main[aria-labelledby="manufacturing-operations-heading"]',
  },
  '/pl/settings/rules': {
    rawKeyPrefix: 'settings.rules_registry.',
    expectedHeading: 'Rejestr reguł',
    screenSelector: '[data-testid="settings-rules-registry-screen"]',
  },
  '/pl/settings/flags': {
    rawKeyPrefix: 'settings.flags_admin.',
    expectedHeading: 'Flagi funkcji',
    screenSelector: '[data-testid="settings-flags-admin-screen"]',
  },
};

async function assertSettingsI18n(page: Parameters<typeof installBrowserErrorSpies>[0], route: string): Promise<ShellFailure[]> {
  const assertion = settingsI18nRouteExpectations[route];
  if (!assertion) return [];

  const failures: ShellFailure[] = [];
  const screen = page.locator(assertion.screenSelector);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const headingText = await screen.locator('h1').first().innerText().catch(() => '');

  if ((await screen.count()) !== 1) {
    failures.push({ category: 'region', message: `${route} must render ${assertion.screenSelector} inside the real AppShell` });
  }

  if (!headingText.includes(assertion.expectedHeading)) {
    failures.push({
      category: 'region',
      message: `${route} h1 must resolve localized Settings copy "${assertion.expectedHeading}" from next-intl; saw "${headingText || '<missing>'}"`,
    });
  }

  if (bodyText.includes(assertion.rawKeyPrefix)) {
    failures.push({
      category: 'region',
      message: `${route} must not expose raw next-intl keys with prefix ${assertion.rawKeyPrefix}`,
    });
  }

  return failures;
}

async function visitAndAssertRoute(page: Parameters<typeof installBrowserErrorSpies>[0], expected: ShellRouteExpectation, spy: ReturnType<typeof installBrowserErrorSpies>): Promise<ShellRouteResult> {
  const failures: ShellFailure[] = [];
  let httpStatus: number | null = null;
  let finalPathname = '';
  const screenshotPath = screenshotPathFor(expected.route);

  spy.setRoute(expected.route);
  await page.setViewportSize(expected.viewport ?? desktopViewport);

  try {
    const response = await page.goto(routeUrl(expected.route), { waitUntil: 'domcontentloaded' });
    httpStatus = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    finalPathname = new URL(page.url()).pathname;

    if (expected.expected_final_pathname && finalPathname !== expected.expected_final_pathname) {
      failures.push({
        category: expected.route === '/login' ? 'localized_redirect' : 'region',
        message: `${expected.route} final pathname must be ${expected.expected_final_pathname}; saw ${finalPathname}`,
      });
    }

    failures.push(...(await assertShellRegions(page, expected)));
    failures.push(...(await assertActiveNavigation(page, expected)));
    failures.push(...(await assertSettingsI18n(page, expected.route)));
  } catch (error) {
    failures.push({
      category: 'unexpected_exception',
      message: error instanceof Error ? error.message : String(error),
    });
    finalPathname = page.url() ? new URL(page.url()).pathname : '';
  }

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    failures.push({
      category: 'screenshot',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  failures.push(...spy.failuresFor(expected.route));
  return buildReportEntry(expected, httpStatus, finalPathname, screenshotPath, failures);
}

test.describe('T-136 Foundation AppShell browser parity smoke', () => {
  test.beforeAll(async () => {
    if (!authStorageState) {
      shellParityHarness = await startLocalShellParityHarness();
      activeBaseURL = shellParityHarness.baseURL;
    }
  });

  test.afterAll(async () => {
    await shellParityHarness?.close();
    shellParityHarness = undefined;
  });

  test('visits every shell route, fails closed on browser errors, and writes parity_report.json', async ({ page, request }) => {
    ensureEvidenceDir();
    await shellParityHarness?.installAuthCookie(page.context());
    expect(sidebarRoutes, 'APP_NAV_GROUPS must expose exactly 15 active desktop sidebar routes for this parity gate').toHaveLength(15);

    const redirect = await request.get(routeUrl('/login'), { maxRedirects: 0 });
    const redirectLocation = redirect.headers()['location'];
    const redirectFailures: ShellFailure[] = [];
    if (![302, 307, 308].includes(redirect.status())) {
      redirectFailures.push({ category: 'localized_redirect', message: `/login must redirect before render; saw ${redirect.status()}` });
    }
    if (!redirectLocation || new URL(redirectLocation, activeBaseURL).pathname !== '/en/login') {
      redirectFailures.push({
        category: 'localized_redirect',
        message: `/login location must be /en/login; saw ${redirectLocation ?? '<missing>'}`,
      });
    }

    const spy = installBrowserErrorSpies(page);
    const results: ShellRouteResult[] = [];
    for (const expected of routeMatrix) {
      const result = await visitAndAssertRoute(page, expected, spy);
      if (expected.route === '/login') result.failures.push(...redirectFailures);
      result.status = result.failures.length === 0 ? 'PASS' : 'FAIL';
      results.push(result);
    }

    const report = buildReport(results);
    writeReport(reportPath(), report);

    expect(
      report.recommended_followups.every((entry) => entry.note === 'NOT auto-created; review this finding before creating ACP follow-up tasks.'),
      'every failure follow-up must be operator-facing only and not auto-created',
    ).toBe(true);
    expect(report.status, JSON.stringify(report.recommended_followups.slice(0, 8), null, 2)).toBe('PASS');
  });
});
