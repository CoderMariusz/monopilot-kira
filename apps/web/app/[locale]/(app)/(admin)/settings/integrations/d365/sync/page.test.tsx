/**
 * @vitest-environment jsdom
 * T-111 / SET-082 — D365 Sync Config RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
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
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'settings.integrations.d365.sync.title': 'D365 sync config',
      'settings.integrations.d365.sync.subtitle': 'Pull schedule, push queue, retry policy, and dead-letter queue access.',
      'settings.integrations.d365.sync.save': 'Save sync config',
      'settings.integrations.d365.sync.saved': 'D365 sync config saved',
      'settings.integrations.d365.sync.forbiddenTitle': '403 — Owner access required',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
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

  it('renders a 403 page and no mutation controls for non-owner callers', async () => {
    const updateD365SyncConfig = vi.fn(async () => ({ ok: true as const }));
    await renderD365SyncPage({ callerRole: 'admin', updateD365SyncConfig });

    expect(screen.getByRole('heading', { name: /403|forbidden|owner access required/i })).toBeInTheDocument();
    expect(screen.getByText(/owner/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save sync config|submit/i })).not.toBeInTheDocument();
    expect(updateD365SyncConfig).not.toHaveBeenCalled();
  });
});
