import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import net from 'node:net';
import path from 'node:path';

import type { BrowserContext, Page, Response } from '@playwright/test';

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

export function resolveRepoRoot(): string {
  return path.resolve(resolveWebRoot(), '../..');
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

export type ShellParityHarness = {
  baseURL: string;
  appPort: number;
  supabaseUrl: string;
  server_identity: string;
  installAuthCookie(context: BrowserContext): Promise<void>;
  close(): Promise<void>;
};

const HARNESS_ACCESS_TOKEN = 'shell-parity-access-token';
const HARNESS_USER = {
  id: 'shell-parity-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'shell.parity@monopilot.local',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {
    name: 'Shell Parity',
    full_name: 'Shell Parity',
    org_id: 'org-shell-parity',
    org_name: 'MonoPilot MES',
    language: 'en',
    locale: 'en',
  },
  created_at: '2026-05-20T00:00:00.000Z',
  updated_at: '2026-05-20T00:00:00.000Z',
};

async function findOpenPort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error(`No open port found near ${preferred}`);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function createFakeSupabaseAuthServer(): Server {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/auth/v1/user') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(HARNESS_USER));
      return;
    }
    if (requestUrl.pathname === '/auth/v1/token') {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        access_token: HARNESS_ACCESS_TOKEN,
        refresh_token: 'shell-parity-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        user: HARNESS_USER,
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found', path: requestUrl.pathname }));
  });
}

async function waitForHealthy(url: string, child: ChildProcessWithoutNullStreams, output: string[]): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Shell parity Next server exited early (${child.exitCode}): ${output.join('').slice(-2000)}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}; last error=${lastError}; output=${output.join('').slice(-2000)}`);
}

function killProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 5_000).unref();
  });
}

async function clearNextDevServerLock(): Promise<void> {
  const lockPath = path.join(resolveWebRoot(), '.next/dev/lock');
  if (!existsSync(lockPath)) return;

  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: unknown };
    if (typeof parsed.pid === 'number') {
      try {
        process.kill(parsed.pid, 'SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      } catch {
        // Stale lock; removing it below is sufficient.
      }
    }
  } catch {
    // Malformed lock; removing it below is sufficient.
  }

  try {
    unlinkSync(lockPath);
  } catch {
    // If Next already removed it, proceed.
  }
}

function authCookieName(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

function authCookieValue(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: HARNESS_ACCESS_TOKEN,
    refresh_token: 'shell-parity-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: HARNESS_USER,
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

type RouteConflictMove = {
  activePath: string;
  disabledPath: string;
};

function settingsRulesDynamicRouteConflict(): RouteConflictMove {
  // The shell smoke never visits the rule diff route, but this legacy folder collides with
  // settings/rules/[code] during Next dev route collection and otherwise masks AppShell/i18n failures.
  const rulesDir = path.join(resolveWebRoot(), 'app/[locale]/(app)/(admin)/settings/rules');
  return {
    activePath: path.join(rulesDir, '[rule_code]'),
    disabledPath: path.join(rulesDir, '.__shell-parity-disabled-rule_code'),
  };
}

function temporarilyDisableKnownNextDevRouteConflicts(): () => void {
  const moves = [settingsRulesDynamicRouteConflict()];
  const moved: RouteConflictMove[] = [];

  for (const move of moves) {
    if (existsSync(move.disabledPath) && !existsSync(move.activePath)) {
      renameSync(move.disabledPath, move.activePath);
    }
    if (existsSync(move.disabledPath) && existsSync(move.activePath)) {
      throw new Error(`Cannot prepare shell parity harness; both route paths exist: ${move.activePath} and ${move.disabledPath}`);
    }
    if (existsSync(move.activePath)) {
      renameSync(move.activePath, move.disabledPath);
      moved.push(move);
    }
  }

  return () => {
    for (const move of [...moved].reverse()) {
      if (existsSync(move.disabledPath) && !existsSync(move.activePath)) {
        renameSync(move.disabledPath, move.activePath);
      }
    }
  };
}

export async function startLocalShellParityHarness(): Promise<ShellParityHarness> {
  const configuredPort = Number(process.env.PORT ?? 3014);
  const supabasePort = await findOpenPort(configuredPort + 200);
  const appPort = await findOpenPort(configuredPort + 300);
  const supabaseUrl = `http://127.0.0.1:${supabasePort}`;
  const baseURL = `http://127.0.0.1:${appPort}`;

  const supabaseServer = createFakeSupabaseAuthServer();
  let restoreRouteConflicts: () => void = () => undefined;
  await listen(supabaseServer, supabasePort);
  await clearNextDevServerLock();
  try {
    restoreRouteConflicts = temporarilyDisableKnownNextDevRouteConflicts();
  } catch (error) {
    await closeServer(supabaseServer);
    throw error;
  }

  const output: string[] = [];
  const child = spawn('pnpm', ['--filter', 'web', 'dev'], {
    cwd: resolveRepoRoot(),
    env: {
      ...process.env,
      PORT: String(appPort),
      DEV_AUTH_BYPASS: 'true',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'shell-parity-anon-key',
    },
  });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  try {
    await waitForHealthy(`${baseURL}/en/login`, child, output);
  } catch (error) {
    await killProcess(child);
    restoreRouteConflicts();
    await closeServer(supabaseServer);
    throw error;
  }

  return {
    baseURL,
    appPort,
    supabaseUrl,
    server_identity: `Next dev server cwd=${resolveRepoRoot()} baseURL=${baseURL} fakeSupabase=${supabaseUrl}`,
    async installAuthCookie(context: BrowserContext) {
      await context.addCookies([
        {
          name: authCookieName(supabaseUrl),
          value: authCookieValue(),
          url: baseURL,
          httpOnly: false,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      ]);
    },
    async close() {
      await killProcess(child);
      restoreRouteConflicts();
      await closeServer(supabaseServer);
    },
  };
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
    if (message.type() === 'error' && /WebSocket connection to .*\/_next\/webpack-hmr/.test(message.text())) {
      return;
    }
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

  if (expected.expects_scanner && (await page.locator(shellSelectors.scanner_frame).count()) < 1) {
    failures.push({ category: 'region', message: `${expected.route} expected at least one scanner-frame` });
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
