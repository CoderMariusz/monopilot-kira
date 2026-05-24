/**
 * @vitest-environment jsdom
 * T-114 / SET-054 — Reference Audit Trail screen RED tests.
 * Source of truth: docs/prd/02-SETTINGS-PRD.md §8.6/§5.6 and
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:223-351.
 * RED scope: tests only; missing production page falls back to an empty placeholder
 * so failures report required row-scoped UI/RBAC behavior instead of module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ReferenceAuditAction = 'insert' | 'update' | 'delete';

type ReferenceAuditEntry = {
  id: string;
  tableCode: string;
  rowKey: string;
  createdAt: string;
  actorName: string;
  actorEmail?: string;
  action: ReferenceAuditAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

type CallerAccess = {
  permissions: string[];
  roleCodes: string[];
};

type ReferenceHistoryPageProps = {
  params?: Promise<{ locale: string; table_code: string; row_key: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  entries?: ReferenceAuditEntry[];
  callerAccess?: CallerAccess;
  currentSnapshot?: Record<string, unknown> | null;
};

type ReferenceHistoryPage = (props: ReferenceHistoryPageProps) => React.ReactNode | Promise<React.ReactNode>;

const allowedCaller: CallerAccess = {
  permissions: ['settings.audit.read'],
  roleCodes: ['settings_admin'],
};

const seededEntries: ReferenceAuditEntry[] = [
  {
    id: 'audit-insert-gluten',
    tableCode: 'allergens',
    rowKey: 'gluten',
    createdAt: '2026-05-20T08:00:00.000Z',
    actorName: 'Alicja Nowak',
    actorEmail: 'alicja@example.test',
    action: 'insert',
    oldValue: null,
    newValue: { label: 'Gluten', severity: 'medium', active: true, sort_order: 10 },
  },
  {
    id: 'audit-update-gluten-1',
    tableCode: 'allergens',
    rowKey: 'gluten',
    createdAt: '2026-05-22T09:15:00.000Z',
    actorName: 'Bogdan Ionescu',
    actorEmail: 'bogdan@example.test',
    action: 'update',
    oldValue: { label: 'Gluten', severity: 'medium', active: true, sort_order: 10 },
    newValue: { label: 'Gluten / wheat protein', severity: 'high', active: true, sort_order: 10 },
  },
  {
    id: 'audit-update-gluten-2',
    tableCode: 'allergens',
    rowKey: 'gluten',
    createdAt: '2026-05-23T14:45:00.000Z',
    actorName: 'Carlos Vega',
    actorEmail: 'carlos@example.test',
    action: 'update',
    oldValue: { label: 'Gluten / wheat protein', severity: 'high', active: true, sort_order: 10, notes: 'legacy wording' },
    newValue: { label: 'Gluten / wheat protein', severity: 'critical', active: false, sort_order: 20, regulatory_flag: 'EU-1169' },
  },
  {
    id: 'audit-other-row',
    tableCode: 'allergens',
    rowKey: 'soy',
    createdAt: '2026-05-24T10:00:00.000Z',
    actorName: 'Wrong Row',
    action: 'update',
    oldValue: { label: 'Soy', active: true },
    newValue: { label: 'Soy', active: false },
  },
];

const latestSnapshot = {
  row_key: 'gluten',
  label: 'Gluten / wheat protein',
  severity: 'critical',
  active: false,
  sort_order: 20,
  regulatory_flag: 'EU-1169',
};

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      title: 'Reference audit trail',
      forbiddenTitle: '403 — Forbidden',
      forbiddenMessage: 'You do not have permission to read Settings audit history.',
    };
    const template = labels[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
  }),
}));

async function loadReferenceHistoryPage(): Promise<ReferenceHistoryPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: ReferenceHistoryPage };
    expect(
      mod.default,
      'SET-054 reference audit history must default-export a renderable Server Component at app/[locale]/(app)/(admin)/settings/reference/[table_code]/[row_key]/history/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as ReferenceHistoryPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot find module|failed to load url|\.\/page\.tsx/i.test(message)) {
      throw error;
    }
    return function MissingReferenceHistoryPage() {
      return React.createElement('main', { 'data-testid': 'missing-reference-history-page' });
    };
  }
}

async function renderReferenceHistory(overrides: Partial<ReferenceHistoryPageProps> = {}) {
  const Page = await loadReferenceHistoryPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en', table_code: 'allergens', row_key: 'gluten' }),
    searchParams: Promise.resolve({}),
    entries: seededEntries,
    callerAccess: allowedCaller,
    currentSnapshot: latestSnapshot,
    ...overrides,
  });
  return render(<>{node}</>);
}

function historyTable() {
  return screen.getByRole('table', { name: /reference audit trail|row history/i });
}

describe('SET-054 reference row audit trail screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/reference/allergens/gluten/history');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders exactly the row-scoped audit_log entries in created_at DESC order with action badges', async () => {
    await renderReferenceHistory();

    const root = screen.getByTestId('settings-reference-history-screen');
    expect(root).toHaveAttribute('data-table-code', 'allergens');
    expect(root).toHaveAttribute('data-row-key', 'gluten');
    expect(screen.getByRole('heading', { name: /reference audit trail/i })).toBeInTheDocument();
    const header = screen.getByRole('region', { name: /current reference row|header strip/i });
    expect(within(header).getByText(/allergens/i)).toBeInTheDocument();
    expect(within(header).getByText(/gluten/i)).toBeInTheDocument();

    const table = historyTable();
    for (const header of ['Created at', 'Actor', 'Action', 'Changes']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument();
    }

    const rows = Array.from(table.querySelectorAll('tbody > tr[data-audit-id]')) as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('data-audit-id'))).toEqual([
      'audit-update-gluten-2',
      'audit-update-gluten-1',
      'audit-insert-gluten',
    ]);
    expect(screen.queryByText(/Wrong Row/i), 'history must be scoped to the requested table_code + row_key tuple').not.toBeInTheDocument();

    for (const [row, action] of [
      [rows[0], 'update'],
      [rows[1], 'update'],
      [rows[2], 'insert'],
    ] as const) {
      const badge = within(row).getByText(new RegExp(`^${action}$`, 'i'));
      expect(badge).toHaveAttribute('data-slot', 'badge');
    }
  });

  it('expands the most recent update row and renders side-by-side diff cells with changed, added, and removed highlighting', async () => {
    const user = userEvent.setup();
    await renderReferenceHistory();

    const updateRow = within(historyTable()).getByRole('row', { name: /carlos vega.*update/i });
    const diffToggle = within(updateRow).getByText(/view diff|expand/i).closest('summary');
    expect(diffToggle, 'diff disclosure must use runtime-safe native details/summary, not stripped Server Component handlers').not.toBeNull();
    const diffDisclosure = diffToggle?.closest('details');
    expect(diffDisclosure).not.toHaveAttribute('open');
    await user.click(diffToggle as HTMLElement);
    expect(diffDisclosure).toHaveAttribute('open');

    const diffPanel = within(updateRow).getByRole('region', { name: /field diff audit-update-gluten-2/i });
    expect(within(diffPanel).getByText('severity')).toBeInTheDocument();
    expect(within(diffPanel).getByTestId('diff-severity-old')).toHaveTextContent('high');
    expect(within(diffPanel).getByTestId('diff-severity-old')).toHaveAttribute('data-change-kind', 'changed');
    expect(within(diffPanel).getByTestId('diff-severity-new')).toHaveTextContent('critical');
    expect(within(diffPanel).getByTestId('diff-severity-new')).toHaveAttribute('data-change-kind', 'changed');

    expect(within(diffPanel).getByTestId('diff-regulatory_flag-old')).toHaveTextContent('—');
    expect(within(diffPanel).getByTestId('diff-regulatory_flag-new')).toHaveTextContent('EU-1169');
    expect(within(diffPanel).getByTestId('diff-regulatory_flag-new')).toHaveAttribute('data-change-kind', 'added');

    expect(within(diffPanel).getByTestId('diff-notes-old')).toHaveTextContent('legacy wording');
    expect(within(diffPanel).getByTestId('diff-notes-old')).toHaveAttribute('data-change-kind', 'removed');
    expect(within(diffPanel).getByTestId('diff-notes-new')).toHaveTextContent('—');
  });

  it('renders an active-row header strip with a collapsible current snapshot JSON section reflecting latest values', async () => {
    const user = userEvent.setup();
    await renderReferenceHistory();

    const header = screen.getByRole('region', { name: /current reference row|header strip/i });
    expect(within(header).getByText(/active/i)).toHaveAttribute('data-slot', 'badge');
    expect(within(header).getByText(/allergens/i)).toBeInTheDocument();
    expect(within(header).getByText(/gluten/i)).toBeInTheDocument();

    const toggle = screen.getByText(/current snapshot json|snapshot/i).closest('summary');
    expect(toggle, 'snapshot disclosure must use runtime-safe native details/summary, not stripped Server Component handlers').not.toBeNull();
    const snapshotDisclosure = toggle?.closest('details');
    expect(snapshotDisclosure).not.toHaveAttribute('open');
    await user.click(toggle as HTMLElement);
    expect(snapshotDisclosure).toHaveAttribute('open');

    const snapshot = screen.getByRole('region', { name: /current snapshot json/i });
    expect(snapshot).toHaveTextContent('"severity": "critical"');
    expect(snapshot).toHaveTextContent('"active": false');
    expect(snapshot).toHaveTextContent('"regulatory_flag": "EU-1169"');
  });

  it('renders 403 when settings.audit.read is absent even if a role code is named settings.audit.read', async () => {
    await renderReferenceHistory({
      callerAccess: {
        permissions: [],
        roleCodes: ['settings.audit.read', 'owner'],
      },
    });

    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read|permission/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-reference-history-screen')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /reference audit trail|row history/i })).not.toBeInTheDocument();
  });
});
