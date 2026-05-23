import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Page, Response } from '@playwright/test';

export const FOLLOWUP_NOTE = 'NOT auto-created; review this finding before creating ACP follow-up tasks.';

export type ShellFailureCategory =
  | 'pageerror'
  | 'console.error'
  | 'console.warning.hydration'
  | 'requestfailed'
  | 'http_status'
  | 'region'
  | 'active_nav'
  | 'localized_redirect'
  | 'screenshot'
  | 'unexpected_exception';

export type ShellFailure = {
  category: ShellFailureCategory;
  message: string;
};

export type ShellRouteExpectation = {
  route: string;
  label: string;
  auth_state: 'auth' | 'public';
  expects_shell: boolean;
  expects_subnav?: boolean;
  expects_scanner?: boolean;
  active_nav_item?: string | null;
  active_subnav_item?: string | null;
  viewport?: { width: number; height: number };
  expected_final_pathname?: string;
};

export type ShellRouteResult = {
  route: string;
  label: string;
  auth_state: 'auth' | 'public';
  expects_shell: boolean;
  expects_subnav?: boolean;
  active_nav_item?: string | null;
  active_subnav_item?: string | null;
  status: 'PASS' | 'FAIL';
  http_status: number | null;
  final_pathname: string;
  screenshot: string;
  failures: ShellFailure[];
};

export type ShellParityReport = {
  task_id: 'T-136';
  generated_at: string;
  status: 'PASS' | 'FAIL';
  summary: {
    pass: number;
    fail: number;
    routes_visited: number;
    screenshots_written: number;
  };
  routes: ShellRouteResult[];
  recommended_followups: Array<{
    route: string;
    category: string;
    message: string;
    note: typeof FOLLOWUP_NOTE;
  }>;
};

type BrowserEventRecorder = {
  setRoute(route: string): void;
  failuresFor(route: string): ShellFailure[];
};

const HYDRATION_WARNING = /hydration|hydrated|did not match|text content does not match|expected server html/i;

export const shellSelectors = {
  app_shell: '[data-testid="app-shell"]',
  app_sidebar: '[data-testid="app-sidebar"]',
  app_topbar: '[data-testid="app-topbar"]',
  primary_nav: 'nav[aria-label="Primary"]',
  scanner_frame: '[data-testid="scanner-frame"]',
  active_nav_item: '[aria-current="page"]',
  settings_subnav: '[data-testid="settings-subnav"]',
};

export function resolveWebRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'e2e')) && existsSync(path.join(cwd, 'package.json'))) return cwd;
  return path.join(cwd, 'apps/web');
}

export function evidenceDir(): string {
  return path.join(resolveWebRoot(), 'e2e/parity-evidence/shell');
}

export function ensureEvidenceDir(): string {
  const dir = evidenceDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveAuthStorageState(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [
    explicit,
    path.join(resolveWebRoot(), 'e2e/.auth/user.json'),
    path.join(resolveWebRoot(), 'e2e/auth-storage.json'),
    path.join(resolveWebRoot(), 'playwright/.auth/user.json'),
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => existsSync(candidate));
}

export function assertInsideShellEvidenceDir(candidate: string): string {
  const dir = path.resolve(ensureEvidenceDir());
  const resolved = path.resolve(candidate);
  const relative = path.relative(dir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`shell parity evidence attempted to write outside ${dir}: ${resolved}`);
  }
  return resolved;
}

export function installConsoleSpy(page: Page): BrowserEventRecorder {
  return installBrowserErrorSpies(page);
}

export function installNetworkSpy(page: Page): BrowserEventRecorder {
  return installBrowserErrorSpies(page);
}

export function installBrowserErrorSpies(page: Page): BrowserEventRecorder {
  let currentRoute = 'unassigned';
  const events: Array<{ route: string; failure: ShellFailure }> = [];
  const push = (failure: ShellFailure) => events.push({ route: currentRoute, failure });

  page.on('pageerror', (error) => push({ category: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      push({ category: 'console.error', message: message.text() });
    } else if (message.type() === 'warning' && HYDRATION_WARNING.test(message.text())) {
      push({ category: 'console.warning.hydration', message: message.text() });
    }
  });
  page.on('requestfailed', (request) => {
    push({
      category: 'requestfailed',
      message: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim(),
    });
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 400) {
      push({ category: 'http_status', message: `${response.status()} ${response.url()}` });
    }
  });

  return {
    setRoute(route: string) {
      currentRoute = route;
    },
    failuresFor(route: string) {
      return events.filter((event) => event.route === route).map((event) => event.failure);
    },
  };
}

async function visibleCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    }).length,
  );
}

export async function assertShellRegions(page: Page, expected: ShellRouteExpectation): Promise<ShellFailure[]> {
  const failures: ShellFailure[] = [];
  const shellCount = await page.locator(shellSelectors.app_shell).count();
  const sidebarCount = await page.locator(shellSelectors.app_sidebar).count();
  const topbarCount = await page.locator(shellSelectors.app_topbar).count();

  if (expected.expects_shell) {
    for (const [name, selector] of [
      ['app-shell', shellSelectors.app_shell],
      ['app-sidebar', shellSelectors.app_sidebar],
      ['app-topbar', shellSelectors.app_topbar],
      ['primary nav', shellSelectors.primary_nav],
    ] as const) {
      if ((await visibleCount(page, selector)) !== 1) {
        failures.push({ category: 'region', message: `${expected.route} expected exactly one visible ${name}` });
      }
    }
  } else {
    if (shellCount !== 0) failures.push({ category: 'region', message: `${expected.route} must not render app-shell` });
    if (sidebarCount !== 0) failures.push({ category: 'region', message: `${expected.route} must not render app-sidebar` });
    if (topbarCount !== 0) failures.push({ category: 'region', message: `${expected.route} must not render app-topbar` });
  }

  if (expected.expects_subnav) {
    if ((await visibleCount(page, shellSelectors.settings_subnav)) !== 1) {
      failures.push({ category: 'region', message: `${expected.route} expected exactly one visible settings-subnav` });
    }
  } else if ((await page.locator(shellSelectors.settings_subnav).count()) > 0) {
    failures.push({ category: 'region', message: `${expected.route} must not render settings-subnav` });
  }

  if (expected.expects_scanner && (await visibleCount(page, shellSelectors.scanner_frame)) !== 1) {
    failures.push({ category: 'region', message: `${expected.route} expected exactly one visible scanner-frame` });
  }

  return failures;
}

export async function assertActiveNavigation(page: Page, expected: ShellRouteExpectation): Promise<ShellFailure[]> {
  const failures: ShellFailure[] = [];
  if (expected.active_nav_item) {
    const activeSidebar = page.locator(`[data-testid="app-sidebar-item-${expected.active_nav_item}"]`);
    if ((await activeSidebar.count()) !== 1) {
      failures.push({ category: 'active_nav', message: `${expected.route} missing sidebar item ${expected.active_nav_item}` });
    } else if ((await activeSidebar.getAttribute('aria-current')) !== 'page') {
      failures.push({ category: 'active_nav', message: `${expected.route} must mark sidebar item ${expected.active_nav_item} aria-current=page` });
    }

    const activeCount = await page.locator('[data-testid^="app-sidebar-item-"][aria-current="page"]').count();
    if (activeCount !== 1) {
      failures.push({ category: 'active_nav', message: `${expected.route} must expose exactly one active sidebar item; saw ${activeCount}` });
    }
  }

  if (expected.active_subnav_item) {
    const activeSubnav = page.locator(`[data-testid="settings-subnav-item-${expected.active_subnav_item}"]`);
    if ((await activeSubnav.count()) !== 1) {
      failures.push({ category: 'active_nav', message: `${expected.route} missing settings subnav item ${expected.active_subnav_item}` });
    } else if ((await activeSubnav.getAttribute('aria-current')) !== 'page') {
      failures.push({ category: 'active_nav', message: `${expected.route} must mark settings subnav item ${expected.active_subnav_item} aria-current=page` });
    }

    const activeSubnavCount = await page.locator('[data-testid^="settings-subnav-item-"][aria-current="page"]').count();
    if (activeSubnavCount !== 1) {
      failures.push({ category: 'active_nav', message: `${expected.route} must expose exactly one active settings subnav item; saw ${activeSubnavCount}` });
    }
  }

  return failures;
}

export function screenshotPathFor(route: string): string {
  const basename = route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return assertInsideShellEvidenceDir(path.join(ensureEvidenceDir(), `${basename || 'root'}.png`));
}

export function reportPath(): string {
  return assertInsideShellEvidenceDir(path.join(ensureEvidenceDir(), 'parity_report.json'));
}

export function buildReportEntry(
  expected: ShellRouteExpectation,
  httpStatus: number | null,
  finalPathname: string,
  screenshot: string,
  failures: ShellFailure[],
): ShellRouteResult {
  return {
    route: expected.route,
    label: expected.label,
    auth_state: expected.auth_state,
    expects_shell: expected.expects_shell,
    expects_subnav: expected.expects_subnav,
    active_nav_item: expected.active_nav_item ?? null,
    active_subnav_item: expected.active_subnav_item ?? null,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    http_status: httpStatus,
    final_pathname: finalPathname,
    screenshot: path.relative(resolveWebRoot(), screenshot),
    failures,
  };
}

export function buildReport(entries: ShellRouteResult[]): ShellParityReport {
  const fail = entries.filter((entry) => entry.status === 'FAIL').length;
  return {
    task_id: 'T-136',
    generated_at: new Date().toISOString(),
    status: fail === 0 ? 'PASS' : 'FAIL',
    summary: {
      pass: entries.length - fail,
      fail,
      routes_visited: entries.length,
      screenshots_written: entries.filter((entry) => entry.screenshot.length > 0).length,
    },
    routes: entries,
    recommended_followups: entries.flatMap((entry) =>
      entry.failures.map((failure) => ({
        route: entry.route,
        category: failure.category,
        message: failure.message,
        note: FOLLOWUP_NOTE,
      })),
    ),
  };
}

export function writeReport(reportFile: string, report: ShellParityReport): void {
  const safePath = assertInsideShellEvidenceDir(reportFile);
  writeFileSync(safePath, `${JSON.stringify(report, null, 2)}\n`);
}
