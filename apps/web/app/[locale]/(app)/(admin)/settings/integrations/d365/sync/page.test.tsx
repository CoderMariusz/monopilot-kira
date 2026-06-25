/**
 * @vitest-environment jsdom
 * T-111 / SET-082 — D365 Sync Config RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespaceInput?: string | { namespace?: string }) => (key: string, values?: Record<string, string | number>) => {
    const namespace = typeof namespaceInput === 'string' ? namespaceInput : namespaceInput?.namespace;
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const labels: Record<string, string> = {
      'settings.integrations.d365.sync.title': 'D365 sync config',
      'settings.integrations.d365.sync.subtitle': 'Pull schedule, push queue, retry policy, and dead-letter queue access.',
      'settings.integrations.d365.sync.save': 'Save sync config',
      'settings.integrations.d365.sync.saved': 'D365 sync config saved',
      'settings.integrations.d365.sync.forbiddenTitle': '403 — Owner access required',
      'settings.integrations.d365.sync.sections.polling': 'Polling & sync translated',
      'settings.integrations.d365.sync.sections.retry': 'Retry policy translated',
      'settings.integrations.d365.sync.sections.dlq': 'Dead-letter queue translated',
      'settings.integrations.d365.sync.fields.pullCron': 'Pull schedule cron translated',
      'settings.integrations.d365.sync.fields.batchSize': 'Batch size translated',
      'settings.integrations.d365.sync.fields.pushQueue': 'Push queue translated',
      'settings.integrations.d365.sync.fields.maxAttempts': 'Max attempts translated',
      'settings.integrations.d365.sync.fields.retryBackoff': 'Retry backoff translated',
      'settings.d365.sync.title': 'D365 sync config',
      'settings.d365.sync.subtitle': 'Pull schedule, push queue, retry policy, and dead-letter queue access.',
      'settings.d365.sync.save': 'Save sync config',
      'settings.d365.sync.saved': 'D365 sync config saved',
      'settings.d365.sync.forbiddenTitle': '403 — Owner access required',
      'settings.d365.sync.sections.polling': 'Polling & sync translated',
      'settings.d365.sync.sections.retry': 'Retry policy translated',
      'settings.d365.sync.sections.dlq': 'Dead-letter queue translated',
      'settings.d365.sync.fields.pullCron': 'Pull schedule cron translated',
      'settings.d365.sync.fields.batchSize': 'Batch size translated',
      'settings.d365.sync.fields.pushQueue': 'Push queue translated',
      'settings.d365.sync.fields.maxAttempts': 'Max attempts translated',
      'settings.d365.sync.fields.retryBackoff': 'Retry backoff translated',
      'settings.d365.sync.hints.pullCron': 'Cron schedule for D365 pull jobs.',
      'settings.d365.sync.status.lastApplied': 'Last applied',
      'settings.d365.sync.status.appliedBy': 'Applied by {user}',
      'settings.d365.sync.status.legacyNotice': 'LEGACY-D365. Sync is retained for transition operations; no credentials are stored on this SET-082 screen.',
      'settings.d365.sync.status.nextRun': 'Next run {date} UTC',
      'settings.d365.sync.status.nextRunUnavailable': 'Next run unavailable until the cron is valid.',
      'settings.d365.sync.status.invalidCron': 'Invalid cron expression. Use a valid cron-parser style 5-field expression.',
      'settings.d365.sync.status.enabled': 'Enabled',
      'settings.d365.sync.status.dlqDescription': 'Items that exceed the retry policy are visible in the worker-owned DLQ tooling.',
      'settings.d365.sync.status.dlqLink': 'Dead-letter queue',
    };
    return (labels[fullKey] ?? labels[key] ?? fullKey).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

type D365SyncConfig = {
  pull_cron: string;
  batch_size: number;
  max_attempts: number;
  retry_backoff_minutes: number;
  push_queue_enabled: boolean;
  dlq_href: string;
  last_applied_at: string | null;
  applied_by_user: string | null;
};

type UpdateD365SyncConfigInput = Pick<
  D365SyncConfig,
  'pull_cron' | 'batch_size' | 'max_attempts' | 'retry_backoff_minutes' | 'push_queue_enabled'
>;

type D365SyncPageProps = {
  params?: Promise<{ locale: string }>;
  callerRole?: 'owner' | 'admin' | 'planner' | 'viewer';
  config?: D365SyncConfig;
  updateD365SyncConfig?: (input: UpdateD365SyncConfigInput) => Promise<{ ok: true } | { ok: false; message: string }>;
};

type D365SyncPage = (props: D365SyncPageProps) => React.ReactNode | Promise<React.ReactNode>;

const syncConfig: D365SyncConfig = {
  pull_cron: '15 */2 * * *',
  batch_size: 25,
  max_attempts: 2,
  retry_backoff_minutes: 10,
  push_queue_enabled: true,
  dlq_href: '/en/settings/integrations/d365/dead-letter',
  last_applied_at: '2026-05-20T14:30:00.000Z',
  applied_by_user: 'Marta Owner',
};

const requiredAddedI18nKeys = [
  'reference.import.title',
  'reference.import.subtitle',
  'reference.import.dropzone',
  'reference.import.downloadTemplate',
  'd365.sync.sections.polling',
  'd365.sync.fields.pullCron',
  'd365.sync.fields.batchSize',
  'd365.connection.sections.endpoint',
  'd365.connection.fields.baseUrl',
  'd365.connection.dialog.testTitle',
] as const;

function getMessage(tree: unknown, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, tree);
}

const connectionConfig = {
  baseUrl: 'https://apex.operations.dynamics.com',
  environment: 'Sandbox' as const,
  tenantId: '12345678-1234-1234-1234-123456789012',
  clientId: 'client-12345',
  clientSecretSet: true,
  serviceAccountEmail: 'svc-d365@example.test',
  pollCron: '0 2 * * *',
  enabled: true,
  lastTest: { ok: true as const, at: '2026-05-20T14:30:00.000Z', latencyMs: 120, environment: 'Sandbox' },
};

const routeDirCandidates = [
  join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/sync'),
  join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/sync'),
];

function existingRoutePath(fileName: string) {
  const path = routeDirCandidates.map((dir) => join(dir, fileName)).find((candidate) => existsSync(candidate));
  expect(path, `Expected ${fileName} to exist in the localized D365 sync AppShell route`).toBeDefined();
  return path!;
}

async function loadD365SyncPage(): Promise<D365SyncPage> {
  const candidates = [
    join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/sync/page.tsx'),
    join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/sync/page.tsx'),
  ];

  if (!candidates.some((c) => existsSync(c))) {
    return function MissingD365SyncPage() {
      return React.createElement('main', { 'data-testid': 'missing-d365-sync-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'T-111 D365 sync config page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as D365SyncPage;
}

async function renderD365SyncPage(overrides: Partial<D365SyncPageProps> = {}) {
  const Page = await loadD365SyncPage();
  const props: D365SyncPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    callerRole: 'owner',
    config: syncConfig,
    updateD365SyncConfig: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function syncScreen() {
  return screen.getByTestId('settings-d365-sync-screen');
}

describe('T-111 D365 sync localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/integrations/d365/sync route under the AppShell route group only', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/sync/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/sync/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/integrations/d365/sync/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/integrations/d365/sync/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-111 must implement /en/settings/integrations/d365/sync under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });

  it('keeps page.tsx as the async Server Component wrapper with no hooks, browser handlers, or children:any', () => {
    const pageSource = readFileSync(existingRoutePath('page.tsx'), 'utf8');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).toContain("import { getTranslations } from 'next-intl/server'");
    expect(pageSource).toMatch(/export\s+default\s+async\s+function\s+D365SyncPage/);
    expect(pageSource).toContain("from './d365-sync-config-form.client'");
    expect(pageSource).not.toMatch(/React\.use(State|Reducer|Effect|Memo|Callback|Transition)|\buse(State|Reducer|Effect|Memo|Callback|Transition)\s*\(/);
    expect(pageSource).not.toMatch(/\bon(Submit|Change|Blur|Click|CheckedChange)=/);
    expect(pageSource).not.toMatch(/children\s*:\s*any\b/);
  });

  it('places the interactive D365 sync form behind an explicit use-client leaf component', async () => {
    const clientPath = existingRoutePath('d365-sync-config-form.client.tsx');
    const clientSource = readFileSync(clientPath, 'utf8').trimStart();

    expect(clientSource).toMatch(/^['"]use client['"]/);
    expect(clientSource).toContain('D365SyncConfigForm');
    expect(clientSource).toMatch(/React\.useState|\buseState\s*\(/);

    const clientModulePath = './d365-sync-config-form.client.tsx';
    const mod = await import(/* @vite-ignore */ `${clientModulePath}`);
    const exportedForm = mod.D365SyncConfigForm ?? mod.default;
    expect(exportedForm, 'client boundary must export a renderable D365SyncConfigForm component').toEqual(expect.any(Function));
  });
});

function readSettingsCatalog(locale: 'en' | 'pl'): unknown {
  // Resolve regardless of the vitest runner cwd (repo root vs apps/web), mirroring
  // the dual-candidate route resolution used elsewhere in this file.
  const candidates = [
    join(process.cwd(), 'apps/web/messages', locale, '02-settings.json'),
    join(process.cwd(), 'messages', locale, '02-settings.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  expect(path, `Expected ${locale}/02-settings.json to exist in the apps/web messages catalog`).toBeDefined();
  return JSON.parse(readFileSync(path!, 'utf8'));
}

describe('R-W10W11-005 settings i18n message coverage', () => {
  it('defines added reference import and D365 sync/connection keys with exact EN/PL structural parity', () => {
    const catalogs = {
      en: readSettingsCatalog('en'),
      pl: readSettingsCatalog('pl'),
    } as const;

    for (const key of requiredAddedI18nKeys) {
      expect(getMessage(catalogs.en, key), `EN 02-settings.json is missing ${key}`).toEqual(expect.any(String));
      expect(getMessage(catalogs.pl, key), `PL 02-settings.json is missing ${key}`).toEqual(expect.any(String));
    }
  });
});

describe('T-111 D365 sync config behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/integrations/d365/sync');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders owner form with header applied metadata, push queue, retry policy, cron preview, and DLQ link', async () => {
    await renderD365SyncPage();

    const root = syncScreen();
    expect(root).toHaveAttribute('data-route', '/settings/integrations/d365/sync');
    expect(root).toHaveAttribute('data-prototype-source', 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107');
    expect(screen.getByRole('heading', { name: /d365 sync config/i })).toBeInTheDocument();

    const appliedStrip = screen.getByTestId('d365-sync-applied-strip');
    expect(appliedStrip).toHaveTextContent(/last applied/i);
    expect(appliedStrip).toHaveTextContent(/2026-05-20|May 20, 2026/i);
    expect(appliedStrip).toHaveTextContent(/Marta Owner/i);

    expect(screen.getByRole('textbox', { name: /pull schedule.*cron/i })).toHaveValue('15 */2 * * *');
    expect(screen.getByRole('spinbutton', { name: /batch size/i })).toHaveValue(25);
    expect(screen.getByRole('spinbutton', { name: /max attempts/i })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: /retry backoff/i })).toHaveValue(10);
    expect(screen.getByRole('switch', { name: /push queue/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/next run/i)).toHaveTextContent(/next run/i);
    expect(screen.getByRole('link', { name: /dead-letter queue/i })).toHaveAttribute('href', syncConfig.dlq_href);
  });

  it('renders D365 sync critical section and field labels from the translated label map passed into the client form', async () => {
    await renderD365SyncPage();

    const root = syncScreen();
    expect(within(root).getByText(/polling & sync translated/i)).toBeInTheDocument();
    expect(within(root).getByRole('textbox', { name: /pull schedule cron translated/i })).toHaveValue('15 */2 * * *');
    expect(within(root).getByRole('spinbutton', { name: /batch size translated/i })).toHaveValue(25);
    expect(within(root).getByRole('switch', { name: /push queue translated/i })).toHaveAttribute('aria-checked', 'true');
    expect(root).not.toHaveTextContent('Standard 5-field cron. Example: \'0 * * * *\' = hourly.');
  });

  it('renders D365 connection critical section, field, and dialog labels from injected i18n labels', async () => {
    const user = userEvent.setup();
    const connectionModulePath: string = '../d365-connection-form.client.tsx';
    const mod = await import(/* @vite-ignore */ connectionModulePath);
    const ConnectionForm = mod.default;
    const labels = {
      title: 'D365 connection',
      subtitle: 'Configure export-only D365 integration settings.',
      testConnection: 'Test connection translated',
      save: 'Save configuration',
      rotateSecret: 'Rotate secret',
      secretRotated: 'D365 client secret rotated',
      urlInvalid: 'URL_INVALID',
      loading: 'Loading D365 connection…',
      empty: 'D365 connection is not configured.',
      error: 'Unable to load D365 connection.',
      sections: { endpoint: 'Endpoint translated' },
      fields: { baseUrl: 'Base URL translated' },
      dialog: { testTitle: 'Test D365 connection translated', close: 'Close translated' },
    };

    render(
      React.createElement(ConnectionForm, {
        state: 'ready',
        config: connectionConfig,
        labels: labels as never,
        testD365Connection: vi.fn(async () => ({ ok: true as const })),
      }),
    );

    const root = screen.getByTestId('settings-d365-connection-screen');
    expect(within(root).getByText(/endpoint translated/i)).toBeInTheDocument();
    expect(within(root).getByRole('textbox', { name: /base url translated/i })).toHaveValue(connectionConfig.baseUrl);
    await user.click(within(root).getByRole('button', { name: /test connection translated/i }));
    expect(await screen.findByRole('dialog', { name: /test d365 connection translated/i })).toBeVisible();
    expect(root).not.toHaveTextContent('Running endpoint, Azure AD, and polling pre-flight checks.');
  });

  it("surfaces inline Zod-style cron validation and disables Submit for invalid cron '*/x * * * *'", async () => {
    const user = userEvent.setup();
    await renderD365SyncPage();

    const cron = screen.getByRole('textbox', { name: /pull schedule.*cron/i });
    const submit = screen.getByRole('button', { name: /save sync config|submit/i });
    expect(submit).toBeEnabled();

    await user.clear(cron);
    await user.type(cron, '*/x * * * *');
    await user.tab();

    await waitFor(() => expect(submit).toBeDisabled());
    const field = cron.closest('[data-field="pull_cron"]') ?? cron.parentElement ?? document.body;
    expect(within(field as HTMLElement).getByText(/invalid cron|valid cron expression|cron-parser/i)).toBeVisible();
  });

  it("calls T-030 updateD365SyncConfig with valid cron '0 * * * *', batch_size=100, max_attempts=3, then renders a success toast", async () => {
    const user = userEvent.setup();
    const updateD365SyncConfig = vi.fn(async () => ({ ok: true as const }));
    await renderD365SyncPage({ updateD365SyncConfig });

    await user.clear(screen.getByRole('textbox', { name: /pull schedule.*cron/i }));
    await user.type(screen.getByRole('textbox', { name: /pull schedule.*cron/i }), '0 * * * *');
    await user.clear(screen.getByRole('spinbutton', { name: /batch size/i }));
    await user.type(screen.getByRole('spinbutton', { name: /batch size/i }), '100');
    await user.clear(screen.getByRole('spinbutton', { name: /max attempts/i }));
    await user.type(screen.getByRole('spinbutton', { name: /max attempts/i }), '3');
    await user.click(screen.getByRole('button', { name: /save sync config|submit/i }));

    await waitFor(() => {
      expect(updateD365SyncConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_cron: '0 * * * *',
          batch_size: 100,
          max_attempts: 3,
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent(/d365 sync config saved|saved/i);
  });

  it('shows pending submit state while the owner save mutation is in flight', async () => {
    const user = userEvent.setup();
    let resolveSave!: (value: { ok: true }) => void;
    const updateD365SyncConfig = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    await renderD365SyncPage({ updateD365SyncConfig });

    await user.click(screen.getByRole('button', { name: /save sync config/i }));

    const submit = await screen.findByRole('button', { name: /saving/i });
    expect(submit).toBeDisabled();
    resolveSave({ ok: true });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/d365 sync config saved|saved/i));
  });

  it('surfaces server-action save errors in an alert without rendering a false success state', async () => {
    const user = userEvent.setup();
    const updateD365SyncConfig = vi.fn(async () => ({ ok: false as const, message: 'D365 capability is disabled for this org' }));
    await renderD365SyncPage({ updateD365SyncConfig });

    await user.click(screen.getByRole('button', { name: /save sync config/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/capability is disabled/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a 403 page and no mutation controls for non-owner callers', async () => {
    const updateD365SyncConfig = vi.fn(async () => ({ ok: true as const }));
    await renderD365SyncPage({ callerRole: 'admin', updateD365SyncConfig });

    expect(screen.getByRole('heading', { name: /403|forbidden|owner access required/i })).toBeInTheDocument();
    expect(screen.getByText(/owner/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save sync config|submit/i })).not.toBeInTheDocument();
    expect(updateD365SyncConfig).not.toHaveBeenCalled();
  });
});
