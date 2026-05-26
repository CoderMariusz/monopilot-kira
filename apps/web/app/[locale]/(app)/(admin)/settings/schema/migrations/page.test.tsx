/**
 * @vitest-environment jsdom
 * T-099 / SET-033 — Schema Migrations Queue RED tests.
 * Source of truth: prototypes/design/02-SETTINGS-UX.md SET-033 / schema-migrations.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MigrationStatus = 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'rolled_back';

type SchemaMigrationRow = {
  migrationId: string;
  tableCode: string;
  columnCode: string;
  action: 'promote_l2_to_l1' | 'add' | 'edit' | 'deprecate';
  requestedByName: string;
  requestedAt: string;
  approvedByName: string | null;
  status: MigrationStatus;
  migrationScript: string;
  resultNotes: string | null;
  timeline: Array<{ status: MigrationStatus; at: string; actor: string }>;
};

type SchemaMigrationsQueueProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  migrations?: SchemaMigrationRow[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type SchemaMigrationsQueuePage = (
  props: SchemaMigrationsQueueProps,
) => React.ReactNode | Promise<React.ReactNode>;

const migrations: SchemaMigrationRow[] = [
  {
    migrationId: '11111111-aaaa-4aaa-8aaa-111111111111',
    tableCode: 'main_table',
    columnCode: 'shelf_life_days',
    action: 'promote_l2_to_l1',
    requestedByName: 'Alicja Nowak',
    requestedAt: '2026-05-20T10:15:00.000Z',
    approvedByName: null,
    status: 'pending',
    migrationScript:
      'alter table public.main_table add column shelf_life_days integer;\ncreate index concurrently if not exists main_table_shelf_life_days_idx on public.main_table (org_id, shelf_life_days);',
    resultNotes: 'Awaiting Monopilot superadmin review.',
    timeline: [{ status: 'pending', at: '2026-05-20T10:15:00.000Z', actor: 'Alicja Nowak' }],
  },
  {
    migrationId: '22222222-bbbb-4bbb-8bbb-222222222222',
    tableCode: 'partners',
    columnCode: 'supplier_cert_expiry',
    action: 'add',
    requestedByName: 'Bogdan Ionescu',
    requestedAt: '2026-05-19T08:30:00.000Z',
    approvedByName: 'MonoPilot Ops',
    status: 'completed',
    migrationScript: 'alter table public.partners add column supplier_cert_expiry date;',
    resultNotes: 'Completed by background migration job.',
    timeline: [
      { status: 'pending', at: '2026-05-19T08:30:00.000Z', actor: 'Bogdan Ionescu' },
      { status: 'completed', at: '2026-05-19T09:00:00.000Z', actor: 'MonoPilot Ops' },
    ],
  },
  {
    migrationId: '33333333-cccc-4ccc-8ccc-333333333333',
    tableCode: 'production_batch',
    columnCode: 'allergen_risk_score',
    action: 'edit',
    requestedByName: 'Olena Petrenko',
    requestedAt: '2026-05-18T12:00:00.000Z',
    approvedByName: 'MonoPilot Ops',
    status: 'failed',
    migrationScript: 'alter table public.production_batch alter column allergen_risk_score type numeric(7,4);',
    resultNotes: 'Failed during validation; rollback SQL recorded by migration worker.',
    timeline: [
      { status: 'pending', at: '2026-05-18T12:00:00.000Z', actor: 'Olena Petrenko' },
      { status: 'failed', at: '2026-05-18T12:20:00.000Z', actor: 'Migration worker' },
    ],
  },
];

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

async function loadSchemaMigrationsQueuePage(): Promise<SchemaMigrationsQueuePage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'SET-033 schema migrations queue page must default-export a renderable React component at the localized AppShell route',
    ).toEqual(expect.any(Function));
    return mod.default as SchemaMigrationsQueuePage;
  } catch {
    return function MissingSchemaMigrationsQueuePage() {
      return React.createElement('main', { 'data-testid': 'missing-schema-migrations-queue-page' });
    };
  }
}

async function renderSchemaMigrationsQueue(overrides: Partial<SchemaMigrationsQueueProps> = {}) {
  const Page = await loadSchemaMigrationsQueuePage();
  const props: SchemaMigrationsQueueProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({ status: 'all' }),
    migrations,
    state: 'ready',
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function queueRoot() {
  return screen.getByTestId('settings-schema-migrations-queue-screen');
}

function migrationsTable() {
  return screen.getByRole('table', { name: /schema migrations queue/i });
}

function tableRows() {
  return within(migrationsTable()).getAllByRole('row').slice(1);
}

function rowContaining(text: string) {
  return tableRows().find((row) => within(row).queryByText(text));
}

describe('SET-033 schema migrations queue UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/schema/migrations');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the spec-driven SettingsLayout queue, status filter, required columns, badges, and read-only actions', async () => {
    await renderSchemaMigrationsQueue();

    const root = queueRoot();
    expect(root).toHaveAttribute('data-route', '/settings/schema/migrations');
    expect(root).toHaveAttribute('data-screen', 'schema-migrations-queue');
    expect(root).toHaveAttribute('data-ux-source', 'SET-033');
    expect(screen.getByRole('heading', { name: /^Schema Migrations Queue$/i })).toBeInTheDocument();

    const statusFilter = screen.getByRole('combobox', { name: /status filter/i });
    for (const option of ['All', 'pending', 'approved', 'running', 'completed', 'failed', 'rolled_back']) {
      expect(within(statusFilter).getByRole('option', { name: new RegExp(option, 'i') })).toBeInTheDocument();
    }

    expect(
      within(migrationsTable()).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    ).toEqual([
      'Migration ID',
      'Table / Column',
      'Action',
      'Requested By',
      'Requested At',
      'Approved By',
      'Status',
      'Actions',
    ]);

    expect(rowContaining('main_table / shelf_life_days')).toBeTruthy();
    expect(screen.getByText('pending')).toHaveAttribute('data-status-tone', 'amber');
    expect(screen.getByText('completed')).toHaveAttribute('data-status-tone', 'green');
    expect(screen.getByText('failed')).toHaveAttribute('data-status-tone', 'red');
    expect(screen.getAllByRole('button', { name: /view migration script/i })).toHaveLength(migrations.length);
    expect(screen.queryByRole('button', { name: /approve|execute|run migration|apply/i })).not.toBeInTheDocument();
    expect(root.querySelector('[data-screen="promotions"]')).not.toBeInTheDocument();
  });

  it("filters status='pending' to pending rows only and keeps a read-only View migration script action on every row", async () => {
    await renderSchemaMigrationsQueue({ searchParams: Promise.resolve({ status: 'pending' }) });

    const rows = tableRows();
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/11111111/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('main_table / shelf_life_days')).toBeInTheDocument();
    expect(within(rows[0]).getByText('pending')).toHaveAttribute('data-status-tone', 'amber');
    expect(within(rows[0]).getByRole('button', { name: /view migration script/i })).toBeInTheDocument();
    expect(screen.queryByText('partners / supplier_cert_expiry')).not.toBeInTheDocument();
    expect(screen.queryByText('production_batch / allergen_risk_score')).not.toBeInTheDocument();
  });

  it('opens row detail with migration_script in a read-only CodeMirror SQL view, result notes, and status timeline', async () => {
    const user = userEvent.setup();
    await renderSchemaMigrationsQueue({ searchParams: Promise.resolve({ status: 'pending' }) });

    const pendingRow = rowContaining('main_table / shelf_life_days');
    expect(pendingRow).toBeTruthy();
    await user.click(within(pendingRow!).getByRole('button', { name: /view migration script/i }));

    const detail = screen.getByRole('region', { name: /migration script detail/i });
    const codeMirror = within(detail).getByTestId('migration-script-codemirror');
    expect(codeMirror).toHaveAttribute('data-language', 'sql');
    expect(codeMirror).toHaveAttribute('aria-readonly', 'true');
    expect(codeMirror).toHaveTextContent(/alter table public\.main_table add column shelf_life_days integer/i);
    expect(codeMirror).toHaveTextContent(/create index concurrently/i);
    expect(within(detail).getByText(/Awaiting Monopilot superadmin review/i)).toBeInTheDocument();
    expect(within(detail).getByRole('list', { name: /status timeline/i })).toHaveTextContent(/pending/i);
    expect(within(detail).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps the detail panel closed until the operator chooses a specific row script and then shows that row SQL', async () => {
    const user = userEvent.setup();
    await renderSchemaMigrationsQueue({ searchParams: Promise.resolve({ status: 'all' }) });

    expect(screen.queryByRole('region', { name: /migration script detail/i })).not.toBeInTheDocument();

    const completedRow = rowContaining('partners / supplier_cert_expiry');
    expect(completedRow).toBeTruthy();
    await user.click(within(completedRow!).getByRole('button', { name: /view migration script/i }));

    const detail = screen.getByRole('region', { name: /migration script detail/i });
    const codeMirror = within(detail).getByTestId('migration-script-codemirror');
    expect(codeMirror).toHaveAttribute('data-language', 'sql');
    expect(codeMirror).toHaveAttribute('aria-readonly', 'true');
    expect(codeMirror).toHaveTextContent(/alter table public\.partners add column supplier_cert_expiry date/i);
    expect(codeMirror).not.toHaveTextContent(/shelf_life_days/i);
  });

  it('renders empty and loading states named by the UX spec without silently skipping evidence', async () => {
    await renderSchemaMigrationsQueue({ migrations: [], state: 'empty' });
    expect(screen.getByRole('status')).toHaveTextContent(/^No migration requests\.$/i);
    cleanup();

    await renderSchemaMigrationsQueue({ state: 'loading' });
    expect(screen.getByTestId('schema-migrations-queue-loading')).toBeInTheDocument();
  });
});
