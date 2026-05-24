/**
 * @vitest-environment jsdom
 * T-112 / SET-083 — D365 Sync Audit RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'settings.integrations.d365.audit.title': 'D365 sync audit',
      'settings.integrations.d365.audit.subtitle': 'Last sync results, raw error payloads, filters, and owner-triggered manual runs.',
      'settings.integrations.d365.audit.runNow': 'Run sync now',
      'settings.integrations.d365.audit.viewErrors': 'View errors',
      'settings.integrations.d365.audit.ownerRequired': 'Owner role required to run D365 sync now',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

type D365SyncStatus = 'ok' | 'partial' | 'failed';
type D365SyncDirection = 'pull' | 'push';

type D365SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  direction: D365SyncDirection;
  status: D365SyncStatus;
  source: string;
  records_in: number;
  records_out: number;
  errors: unknown[];
};

type D365AuditPageProps = {
  params?: Promise<{ locale: string }>;
  callerRole?: 'owner' | 'admin' | 'planner' | 'viewer';
  runs?: D365SyncRun[];
  runSyncNow?: () => Promise<{ ok: true } | { ok: false; message: string }>;
};

type D365AuditPage = (props: D365AuditPageProps) => React.ReactNode | Promise<React.ReactNode>;

const syncRuns: D365SyncRun[] = [
  {
    id: 'run-old-ok-pull',
    started_at: '2026-05-21T08:00:00.000Z',
    finished_at: '2026-05-21T08:01:00.000Z',
    direction: 'pull',
    status: 'ok',
    source: 'items',
    records_in: 12,
    records_out: 0,
    errors: [],
  },
  {
    id: 'run-failed-push-mid',
    started_at: '2026-05-22T09:30:00.000Z',
    finished_at: '2026-05-22T09:31:00.000Z',
    direction: 'push',
    status: 'failed',
    source: 'standard_costs',
    records_in: 0,
    records_out: 2,
    errors: [
      { code: 'D365_DIMENSION_MISSING', field: 'mainAccount', value: '5100-APEX' },
      { code: 'HTTP_429', retryAfterSeconds: 60 },
    ],
  },
  {
    id: 'run-partial-push-later',
    started_at: '2026-05-23T10:00:00.000Z',
    finished_at: '2026-05-23T10:02:00.000Z',
    direction: 'push',
    status: 'partial',
    source: 'inventory',
    records_in: 0,
    records_out: 18,
    errors: [{ code: 'PARTIAL_BATCH', failedKeys: ['LP-1002'] }],
  },
  {
    id: 'run-failed-pull-newer',
    started_at: '2026-05-24T07:45:00.000Z',
    finished_at: '2026-05-24T07:46:00.000Z',
    direction: 'pull',
    status: 'failed',
    source: 'customers',
    records_in: 0,
    records_out: 0,
    errors: [{ code: 'D365_TIMEOUT', endpoint: '/customers' }],
  },
  {
    id: 'run-latest-ok-push',
    started_at: '2026-05-24T11:15:00.000Z',
    finished_at: '2026-05-24T11:16:00.000Z',
    direction: 'push',
    status: 'ok',
    source: 'sales_orders',
    records_in: 0,
    records_out: 9,
    errors: [],
  },
];

async function loadD365AuditPage(): Promise<D365AuditPage> {
  const routeCandidates = [
    join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx'),
    join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx'),
  ];

  if (!routeCandidates.some((candidate) => existsSync(candidate))) {
    return function MissingD365AuditPage() {
      return React.createElement('main', { 'data-testid': 'missing-d365-audit-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'T-112 D365 sync audit page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as D365AuditPage;
}

async function renderD365AuditPage(overrides: Partial<D365AuditPageProps> = {}) {
  const Page = await loadD365AuditPage();
  const props: D365AuditPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    callerRole: 'owner',
    runs: syncRuns,
    runSyncNow: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function auditScreen() {
  return screen.getByTestId('settings-d365-audit-screen');
}

function auditTable() {
  return screen.getByRole('table', { name: /d365 sync runs|sync audit/i });
}

function runRows() {
  return within(auditTable()).getAllByTestId('d365-sync-run-row');
}

describe('T-112 D365 sync audit localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/integrations/d365/audit route under the AppShell route group only', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/integrations/d365/audit/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/integrations/d365/audit/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-112 must implement /en/settings/integrations/d365/audit under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });

  it('keeps page.tsx server-rendered and sources visible copy through next-intl server translations', () => {
    const routePath = join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx');
    const source = readFileSync(routePath, 'utf8');

    expect(source.startsWith("'use client'"), 'App Router page.tsx must not be a Client Component').toBe(false);
    expect(source).toContain("import { getTranslations } from 'next-intl/server'");
    expect(source).toContain('settings.integrations.d365.audit');
    expect(source).toContain('readAuditData');
    expect(source).not.toContain('React.useState');
    expect(source).not.toContain('onClick=');
    expect(existsSync(join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/audit/d365-audit-screen.client.tsx'))).toBe(true);
  });
});

describe('T-112 D365 sync audit behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/integrations/d365/audit');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders five mixed-status sync runs sorted by started_at descending with status badges', async () => {
    await renderD365AuditPage();

    const root = auditScreen();
    expect(root).toHaveAttribute('data-route', '/settings/integrations/d365/audit');
    expect(root).toHaveAttribute('data-prototype-source', 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217');
    expect(screen.getByRole('heading', { name: /d365 sync audit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run sync now/i })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByRole('combobox', { name: /direction/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByLabelText(/start date/i)).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText(/end date/i)).toHaveAttribute('type', 'date');

    expect(runRows()).toHaveLength(5);
    expect(runRows().map((row) => row.getAttribute('data-run-id'))).toEqual([
      'run-latest-ok-push',
      'run-failed-pull-newer',
      'run-partial-push-later',
      'run-failed-push-mid',
      'run-old-ok-pull',
    ]);

    expect(screen.getAllByText(/^ok$/i).every((badge) => badge.getAttribute('data-slot') === 'badge')).toBe(true);
    expect(screen.getAllByText(/^partial$/i).every((badge) => badge.getAttribute('data-slot') === 'badge')).toBe(true);
    expect(screen.getAllByText(/^failed$/i).every((badge) => badge.getAttribute('data-slot') === 'badge')).toBe(true);
  });

  it("filters status='failed' and direction='push' down to only failed push runs", async () => {
    const user = userEvent.setup();
    await renderD365AuditPage();

    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(screen.getByRole('option', { name: /^failed$/i }));
    await user.click(screen.getByRole('combobox', { name: /direction/i }));
    await user.click(screen.getByRole('option', { name: /^push$/i }));
    await user.type(screen.getByLabelText(/start date/i), '2026-05-22');
    await user.type(screen.getByLabelText(/end date/i), '2026-05-22');

    expect(runRows()).toHaveLength(1);
    const filteredRow = runRows()[0];
    expect(filteredRow).toHaveAttribute('data-run-id', 'run-failed-push-mid');
    expect(within(filteredRow).getByText(/^failed$/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(filteredRow).getByText(/^push$/i)).toBeInTheDocument();
    expect(within(auditTable()).queryByText(/customers/i)).not.toBeInTheDocument();
  });

  it('opens View errors modal for a failed row and renders raw errors[] JSON read-only', async () => {
    const user = userEvent.setup();
    await renderD365AuditPage();

    const failedPushRow = runRows().find((row) => row.getAttribute('data-run-id') === 'run-failed-push-mid');
    expect(failedPushRow, 'failed push fixture row must render before modal assertions run').toBeTruthy();

    await user.click(within(failedPushRow as HTMLElement).getByRole('button', { name: /view errors/i }));

    const dialog = await screen.findByRole('dialog', { name: /errors.*run-failed-push-mid|sync run errors/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const rawJson = within(dialog).getByTestId('d365-sync-errors-json');
    expect(rawJson).toHaveAttribute('aria-readonly', 'true');
    expect(rawJson.textContent).toBe(JSON.stringify(syncRuns[1].errors, null, 2));
    expect(rawJson).toHaveTextContent('D365_DIMENSION_MISSING');
    expect(rawJson).toHaveTextContent('HTTP_429');
    expect(within(dialog).queryByText(/category|categorized|summary/i)).not.toBeInTheDocument();
  });

  it('keeps Run sync now disabled for non-owner callers with an explanatory aria-label', async () => {
    const runSyncNow = vi.fn(async () => ({ ok: true as const }));
    await renderD365AuditPage({ callerRole: 'admin', runSyncNow });

    const trigger = screen.getByRole('button', { name: /run sync now/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleName(/run sync now/i);
    expect(trigger).toHaveAttribute('aria-label', expect.stringMatching(/owner role required|insufficient permissions/i));
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(runSyncNow).not.toHaveBeenCalled();
  });
});
