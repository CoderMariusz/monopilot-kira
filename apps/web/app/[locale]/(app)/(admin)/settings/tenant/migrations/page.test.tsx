/**
 * @vitest-environment jsdom
 * T-109 / SET-064 — Migration History RED tests.
 * Source of truth: docs/prd/02-SETTINGS-PRD.md §9.7, §5.4.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TenantMigrationStatus = 'canary' | 'completed' | 'rolled_back';

type TenantMigrationRow = {
  id: string;
  startedAt: string;
  status: TenantMigrationStatus;
  type: 'schema_upgrade' | 'settings_rollout' | 'rules_migration';
  initiatedByUser: string;
  snapshotBefore: unknown;
  snapshotAfter: unknown;
};

type CallerAccess = {
  permissions: string[];
  roleCodes: string[];
};

type TenantMigrationHistoryProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  migrations?: TenantMigrationRow[];
  callerAccess?: CallerAccess;
  now?: string;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type TenantMigrationHistoryPage = (
  props: TenantMigrationHistoryProps,
) => React.ReactNode | Promise<React.ReactNode>;

const tenantMigrationRows: TenantMigrationRow[] = [
  {
    id: 'mig-001-canary',
    startedAt: '2026-05-23T08:15:00.000Z',
    status: 'canary',
    type: 'schema_upgrade',
    initiatedByUser: 'Alicja Nowak',
    snapshotBefore: { tenant: { mode: 'baseline', rules: ['v1'] }, rows: 118 },
    snapshotAfter: { tenant: { mode: 'canary', rules: ['v1', 'v2'] }, rows: 118 },
  },
  {
    id: 'mig-002-completed',
    startedAt: '2026-05-20T11:30:00.000Z',
    status: 'completed',
    type: 'settings_rollout',
    initiatedByUser: 'Bogdan Ionescu',
    snapshotBefore: { feature_flags: { npd_post_release_edit: false } },
    snapshotAfter: { feature_flags: { npd_post_release_edit: true } },
  },
  {
    id: 'mig-003-rolled-back-recent',
    startedAt: '2026-05-10T14:45:00.000Z',
    status: 'rolled_back',
    type: 'rules_migration',
    initiatedByUser: 'Olena Petrenko',
    snapshotBefore: {
      rules: {
        wo_release_gate: { variant: 'v1', thresholdKg: 250 },
      },
    },
    snapshotAfter: {
      rules: {
        wo_release_gate: { variant: 'v2', thresholdKg: 200 },
      },
      rollback_reason: 'Canary failure on QA hold regression',
    },
  },
  {
    id: 'mig-004-rolled-back-old',
    startedAt: '2026-03-30T09:00:00.000Z',
    status: 'rolled_back',
    type: 'schema_upgrade',
    initiatedByUser: 'Mariusz Admin',
    snapshotBefore: { columns: ['legacy_code'] },
    snapshotAfter: { columns: ['legacy_code', 'legacy_note'] },
  },
  {
    id: 'mig-005-completed',
    startedAt: '2026-05-01T16:20:00.000Z',
    status: 'completed',
    type: 'settings_rollout',
    initiatedByUser: 'Jane QA',
    snapshotBefore: { modules: { quality: 'disabled' } },
    snapshotAfter: { modules: { quality: 'enabled' } },
  },
];

const auditReader: CallerAccess = {
  permissions: ['settings.audit.read'],
  roleCodes: ['settings_admin'],
};

const roleNamedLikePermissionButNotGranted: CallerAccess = {
  permissions: [],
  roleCodes: ['settings.audit.read', 'owner'],
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

async function loadTenantMigrationHistoryPage(): Promise<TenantMigrationHistoryPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'SET-064 tenant migration history page must default-export a renderable React component at app/[locale]/(app)/(admin)/settings/tenant/migrations/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as TenantMigrationHistoryPage;
  } catch {
    return function MissingTenantMigrationHistoryPage() {
      return React.createElement('main', { 'data-testid': 'missing-tenant-migration-history-page' });
    };
  }
}

async function renderTenantMigrationHistory(overrides: Partial<TenantMigrationHistoryProps> = {}) {
  const Page = await loadTenantMigrationHistoryPage();
  const props: TenantMigrationHistoryProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    migrations: tenantMigrationRows,
    callerAccess: auditReader,
    now: '2026-05-24T12:00:00.000Z',
    state: 'ready',
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function historyRoot() {
  return screen.getByTestId('settings-tenant-migration-history-screen');
}

function migrationsTable() {
  return screen.getByRole('table', { name: /tenant migration history/i });
}

function dataRows() {
  return within(migrationsTable()).getAllByRole('row').slice(1);
}

function rowFor(id: string) {
  return dataRows().find((row) => within(row).queryByText(id));
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

describe('SET-064 tenant migration history UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/tenant/migrations');
  });

  afterEach(() => {
    cleanup();
  });

  it('lists all 5 tenant_migrations rows with started_at, status, type, initiated_by_user columns populated', async () => {
    await renderTenantMigrationHistory();

    const root = historyRoot();
    expect(root).toHaveAttribute('data-route', '/settings/tenant/migrations');
    expect(root).toHaveAttribute('data-screen', 'tenant-migration-history');
    expect(root).toHaveAttribute('data-ux-source', 'SET-064');
    expect(screen.getByRole('heading', { name: /^Migration History$/i })).toBeInTheDocument();

    expect(
      within(migrationsTable()).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    ).toEqual(['Started At', 'Status', 'Type', 'Initiated By User', 'Actions']);

    expect(dataRows()).toHaveLength(5);
    for (const migration of tenantMigrationRows) {
      const row = rowFor(migration.id);
      expect(row, `tenant_migrations row ${migration.id} must be visible`).toBeTruthy();
      expect(within(row!).getByText(migration.startedAt)).toBeInTheDocument();
      expect(within(row!).getByText(migration.status)).toBeInTheDocument();
      expect(within(row!).getByText(migration.type)).toBeInTheDocument();
      expect(within(row!).getByText(migration.initiatedByUser)).toBeInTheDocument();
      expect(within(row!).getByRole('button', { name: new RegExp(`view snapshot.*${migration.id}`, 'i') })).toBeInTheDocument();
    }

    expect(root.querySelector('[data-screen="migration-orchestration-controls"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /promote|rollback|run migration|start canary/i })).not.toBeInTheDocument();
  });

  it("filters status='rolled_back' and date_range='last_30_days' to only recent rolled_back rows", async () => {
    await renderTenantMigrationHistory({
      searchParams: Promise.resolve({ status: 'rolled_back', date_range: 'last_30_days' }),
    });

    expect(screen.getByRole('combobox', { name: /status filter/i })).toHaveValue('rolled_back');
    expect(screen.getByRole('combobox', { name: /date range filter/i })).toHaveValue('last_30_days');

    expect(dataRows()).toHaveLength(1);
    const row = rowFor('mig-003-rolled-back-recent');
    expect(row).toBeTruthy();
    expect(within(row!).getByText('rolled_back')).toBeInTheDocument();
    expect(within(row!).getByText('2026-05-10T14:45:00.000Z')).toBeInTheDocument();
    expect(screen.queryByText('mig-004-rolled-back-old')).not.toBeInTheDocument();
    expect(screen.queryByText('mig-002-completed')).not.toBeInTheDocument();
    expect(screen.queryByText('mig-001-canary')).not.toBeInTheDocument();
  });

  it('opens View snapshot modal with two collapsible JSON panes rendering stored before/after snapshots exactly', async () => {
    const user = userEvent.setup();
    await renderTenantMigrationHistory();

    const target = tenantMigrationRows[2];
    const row = rowFor(target.id);
    expect(row).toBeTruthy();
    await user.click(within(row!).getByRole('button', { name: /view snapshot.*mig-003-rolled-back-recent/i }));

    const dialog = screen.getByRole('dialog', { name: /migration snapshot.*mig-003-rolled-back-recent/i });
    const beforePane = within(dialog).getByRole('region', { name: /before snapshot json/i });
    const afterPane = within(dialog).getByRole('region', { name: /after snapshot json/i });

    expect(beforePane).toHaveAttribute('data-collapsible', 'true');
    expect(afterPane).toHaveAttribute('data-collapsible', 'true');
    expect(within(beforePane).getByTestId('snapshot-json-before').textContent).toBe(prettyJson(target.snapshotBefore));
    expect(within(afterPane).getByTestId('snapshot-json-after').textContent).toBe(prettyJson(target.snapshotAfter));
    expect(dialog).not.toHaveTextContent(/diff view|side-by-side diff|changed fields/i);
  });

  it('renders a 403 page when the caller lacks settings.audit.read even if a role code is named like that permission', async () => {
    await renderTenantMigrationHistory({ callerAccess: roleNamedLikePermissionButNotGranted });

    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-tenant-migration-history-screen')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /tenant migration history/i })).not.toBeInTheDocument();
  });
});
