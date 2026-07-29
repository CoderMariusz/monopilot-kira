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
  // Znacznikiem musi być `e2e/_helpers`, nie samo `e2e`: KORZEŃ REPO ma i `e2e/` (z artefaktami),
  // i `package.json`, więc słabszy warunek uznawał korzeń za katalog aplikacji. Wtedy
  // resolveRepoRoot() (dwa poziomy wyżej) wskazywał KATALOG DOMOWY, a `pnpm --filter web dev`
  // skanował wszystkie repozytoria użytkownika ("Scope: 2 of 71 projects") i startował serwer
  // deweloperski z CUDZEGO checkoutu. `e2e/_helpers` istnieje wyłącznie w apps/web.
  if (existsSync(path.join(cwd, 'e2e/_helpers')) && existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }
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
  installAuthCookie(context: BrowserContext, identity?: HarnessIdentity): Promise<void>;
  close(): Promise<void>;
};

const HARNESS_ACCESS_TOKEN = 'shell-parity-access-token';
export const HARNESS_USER_ID = '11111111-1111-4111-8111-111111111111';
export const HARNESS_ORG_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Identities the harness can sign in as.
 *
 * `harness` is the DEFAULT and keeps the pre-existing behaviour byte for byte
 * (same user id, same access token) so every existing spec is unaffected.
 * The five personas are the deterministic UUIDs from
 * `packages/db/seeds/test-personas.ts`; they are copied here rather than
 * imported because that seed file ends in a top-level `await main()`, which
 * Playwright's CommonJS transform refuses to `require()`.
 *
 * All six live in the Apex org, so `withOrgContext`'s
 * `select org_id from public.users where id = $1` resolves for each of them —
 * seed them first (`TEST_PERSONAS_CONFIRM_TEST_DB=YES … seeds/test-personas.ts`)
 * or the app redirects/throws instead of denying.
 */
export const HARNESS_PERSONAS = {
  harness: { userId: HARNESS_USER_ID, email: 'shell.parity@monopilot.local', name: 'Shell Parity' },
  admin: { userId: '7f290000-0000-4000-8000-000000000001', email: 'persona.admin@monopilot.test', name: 'Test Persona — Admin' },
  no_asset_deactivate: { userId: '7f290000-0000-4000-8000-000000000002', email: 'persona.no-asset-deactivate@monopilot.test', name: 'Test Persona — No Asset Deactivate' },
  second_signer: { userId: '7f290000-0000-4000-8000-000000000003', email: 'persona.second-signer@monopilot.test', name: 'Test Persona — Second Signer' },
  single_site_operator: { userId: '7f290000-0000-4000-8000-000000000004', email: 'persona.single-site-operator@monopilot.test', name: 'Test Persona — Single Site Operator' },
  no_module_access: { userId: '7f290000-0000-4000-8000-000000000005', email: 'persona.no-module-access@monopilot.test', name: 'Test Persona — No Module Access' },
} as const;

export type HarnessPersonaKey = keyof typeof HARNESS_PERSONAS;
/** A persona key from {@link HARNESS_PERSONAS}, or a bare `public.users.id`. */
export type HarnessIdentity = HarnessPersonaKey | (string & {});

type HarnessIdentityRecord = { userId: string; email: string; name: string };

const HARNESS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveHarnessIdentity(identity: HarnessIdentity = 'harness'): HarnessIdentityRecord {
  const known = HARNESS_PERSONAS[identity as HarnessPersonaKey];
  if (known) return known;
  if (HARNESS_UUID_RE.test(identity)) {
    return { userId: identity, email: `${identity}@monopilot.local`, name: identity };
  }
  throw new Error(
    `Unknown harness identity "${identity}"; pass one of ${Object.keys(HARNESS_PERSONAS).join(', ')} or a public.users id.`,
  );
}

function harnessUser(identity: HarnessIdentityRecord) {
  return {
    id: identity.userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: identity.email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      name: identity.name,
      full_name: identity.name,
      org_id: HARNESS_ORG_ID,
      org_name: 'Apex',
      language: 'en',
      locale: 'en',
    },
    created_at: '2026-05-20T00:00:00.000Z',
    updated_at: '2026-05-20T00:00:00.000Z',
  };
}

const HARNESS_USER = harnessUser(HARNESS_PERSONAS.harness);

/**
 * The chosen identity travels INSIDE the access token: the fake auth server runs
 * in the runner process (scripts/e2e-local-run.ts) while the cookie is written
 * from a Playwright worker, so a shared registry would not cross the process
 * boundary. Separator is `~`, never `.`, so supabase-js keeps treating the value
 * as an opaque non-JWT string. The default identity keeps the legacy token
 * verbatim.
 */
function accessTokenFor(identity: HarnessIdentityRecord): string {
  return identity.userId === HARNESS_USER_ID
    ? HARNESS_ACCESS_TOKEN
    : `${HARNESS_ACCESS_TOKEN}~${identity.userId}`;
}

function userForAccessToken(token: string | undefined) {
  const prefix = `${HARNESS_ACCESS_TOKEN}~`;
  // No token / the legacy token / anything unrecognised → the default identity,
  // which is exactly what this endpoint answered before personas existed.
  if (!token?.startsWith(prefix)) return HARNESS_USER;
  const userId = token.slice(prefix.length);
  const known = Object.values(HARNESS_PERSONAS).find((persona) => persona.userId === userId);
  return harnessUser(known ?? { userId, email: `${userId}@monopilot.local`, name: userId });
}

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
      // The endpoint middleware (session-check.ts) and supabase-js getUser() both
      // hit — answering with the persona that owns the bearer token is what makes
      // the layout gate and withOrgContext see the SELECTED user, not the default.
      const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(userForAccessToken(bearer)));
      return;
    }
    // ponytail: /auth/v1/token always answers as the default identity. It is only
    // reached on a session refresh, and the cookie is minted with expires_at +1h.
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

/**
 * Fail loudly if the dev server refuses its own origin.
 *
 * A blocked /_next/webpack-hmr upgrade costs us hydration (see the --hostname
 * comment on the spawn below) but produces no browser-visible error, so without
 * this probe the whole suite degrades into "the page renders, nothing clicks".
 * We do the handshake at socket level because a blocked upgrade never becomes a
 * parsable HTTP response — Next writes a bare "Unauthorized" onto the Duplex.
 */
async function assertDevHmrUpgradeAccepted(appPort: number): Promise<void> {
  const response = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(appPort, '127.0.0.1', () => {
      socket.write(
        [
          'GET /_next/webpack-hmr HTTP/1.1',
          `Host: 127.0.0.1:${appPort}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          // Must decode to exactly 16 bytes or the ws server answers 400 before
          // the origin check ever runs. This is "the sample nonce" from RFC 6455.
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          `Origin: http://127.0.0.1:${appPort}`,
          '',
          '',
        ].join('\r\n'),
      );
    });
    let buffered = '';
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      if (buffered.includes('\r\n\r\n') || buffered.length > 512) {
        socket.destroy();
        resolve(buffered);
      }
    });
    socket.on('error', reject);
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error('timed out probing the dev HMR websocket'));
    });
    socket.on('close', () => resolve(buffered));
  });

  if (!/^HTTP\/1\.1 101/.test(response)) {
    throw new Error(
      'Next dev refused the /_next/webpack-hmr websocket upgrade ' +
        `(answered ${JSON.stringify(response.slice(0, 120))}). React will not hydrate, so no ` +
        'click reaches a Server Action. Expected `next dev --hostname 127.0.0.1` to put this ' +
        'origin on the allowedDevOrigins list.',
    );
  }
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

function authCookieValue(identity: HarnessIdentityRecord): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: accessTokenFor(identity),
    refresh_token: 'shell-parity-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: harnessUser(identity),
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

/**
 * Install the harness session cookie on a browser context.
 *
 * Shared with the flow specs' signIn (`e2e/_shared/parity-login.ts`) so the local
 * run has exactly one auth mechanism: this cookie + the fake Supabase Auth server
 * spawned by startLocalShellParityHarness().
 *
 * `identity` selects WHO the browser is: a key of {@link HARNESS_PERSONAS} or a
 * bare `public.users.id`. It defaults to the historical shell-parity user, so
 * callers that omit it behave exactly as before.
 */
export async function installHarnessAuthCookie(
  context: BrowserContext,
  baseURL: string,
  supabaseUrl: string,
  identity: HarnessIdentity = 'harness',
): Promise<void> {
  await context.addCookies([
    {
      name: authCookieName(supabaseUrl),
      value: authCookieValue(resolveHarnessIdentity(identity)),
      url: baseURL,
      httpOnly: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
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
  // Filtr PO ŚCIEŻCE, nie po nazwie: `--filter web` rozwijało się w tym kontekście do
  // "Scope: 2 of 71 projects" i startowało DWA `next dev` na tym samym porcie —
  // drugi padał na EADDRINUSE, a harness raportował to jako "server exited early".
  // Filtr ścieżkowy może wskazać dokładnie jeden projekt.
  // `--hostname 127.0.0.1` is NOT cosmetic: without it React never hydrates here.
  // Next 16 blocks every /_next/* dev resource whose Origin host is not in
  // ['*.localhost', 'localhost', ...allowedDevOrigins, <dev server hostname>]
  // (next/dist/server/lib/router-utils/block-cross-site-dev.js:52, called from
  // router-server.js:615 for the socket upgrade). `next dev` without --hostname
  // leaves that last entry undefined, so our baseURL host 127.0.0.1 is refused:
  // the HMR websocket upgrade gets a bare "Unauthorized" written onto the Duplex
  // (no status line ⇒ ERR_INVALID_HTTP_RESPONSE) and app-index's `await
  // initialServerResponse` never settles, so hydrateRoot() is never reached.
  // The failure is SILENT — no pageerror, no 4xx, no failed request — and
  // installBrowserErrorSpies below deliberately drops the webpack-hmr console
  // error, so nothing surfaces it. Passing the hostname puts 127.0.0.1 in the
  // allowlist and also binds the dev server to loopback only.
  const child = spawn('pnpm', ['--filter', './apps/web', 'dev', '--hostname', '127.0.0.1'], {
    cwd: resolveRepoRoot(),
    env: {
      ...process.env,
      PORT: String(appPort),
      NODE_ENV: 'development',
      DEV_AUTH_BYPASS: 'true',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'shell-parity-anon-key',
    },
  });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  try {
    await waitForHealthy(`${baseURL}/en/login`, child, output);
    await assertDevHmrUpgradeAccepted(appPort);
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
    async installAuthCookie(context: BrowserContext, identity: HarnessIdentity = 'harness') {
      await installHarnessAuthCookie(context, baseURL, supabaseUrl, identity);
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
