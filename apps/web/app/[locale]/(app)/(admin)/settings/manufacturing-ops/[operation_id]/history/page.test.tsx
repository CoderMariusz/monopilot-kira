/**
 * @vitest-environment jsdom
 * T-115 / SET-057 — Manufacturing Operation Audit Trail screen RED tests.
 * Source of truth: docs/prd/02-SETTINGS-PRD.md §8.9.11-§8.9.12 and
 * prototypes/design/Monopilot Design System/settings/manufacturing-ops.jsx:271-404.
 * RED scope: tests only; missing production page falls back to an empty placeholder
 * so failures report required UI/RBAC behavior instead of module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type OperationAuditAction = 'create' | 'update' | 'delete';

type OperationAuditChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

type OperationAuditEntry = {
  id: string;
  operationId: string;
  occurredAt: string;
  userName: string;
  userEmail?: string;
  action: OperationAuditAction;
  changes: OperationAuditChange[];
};

type CallerAccess = {
  permissions: string[];
  roleCodes: string[];
};

type OperationHistoryQueryInput = {
  operationId: string;
  datePreset: 'all' | '7d' | '30d' | 'custom';
  from?: string;
  to?: string;
};

type OperationHistoryPageProps = {
  params?: Promise<{ locale: string; operation_id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  entries?: OperationAuditEntry[];
  callerAccess?: CallerAccess;
  now?: string;
  queryOperationHistory?: (input: OperationHistoryQueryInput) => Promise<OperationAuditEntry[]>;
};

type OperationHistoryPage = (props: OperationHistoryPageProps) => React.ReactNode | Promise<React.ReactNode>;

const allowedCaller: CallerAccess = {
  permissions: ['manufacturing_operations.view', 'settings.audit.read'],
  roleCodes: ['settings_admin'],
};

const seededEntries: OperationAuditEntry[] = [
  {
    id: 'audit-delete-old',
    operationId: 'op_789',
    occurredAt: '2026-05-08T09:00:00.000Z',
    userName: 'Carlos Vega',
    userEmail: 'carlos@example.test',
    action: 'delete',
    changes: [{ field: 'is_active', oldValue: true, newValue: false }],
  },
  {
    id: 'audit-create',
    operationId: 'op_789',
    occurredAt: '2026-05-22T08:30:00.000Z',
    userName: 'Alicja Nowak',
    userEmail: 'alicja@example.test',
    action: 'create',
    changes: [
      { field: 'operation_name', oldValue: null, newValue: 'Fermentation' },
      { field: 'is_active', oldValue: null, newValue: true },
    ],
  },
  {
    id: 'audit-update',
    operationId: 'op_789',
    occurredAt: '2026-05-23T14:15:00.000Z',
    userName: 'Bogdan Ionescu',
    userEmail: 'bogdan@example.test',
    action: 'update',
    changes: [
      { field: 'is_active', oldValue: true, newValue: false },
      { field: 'operation_seq', oldValue: 20, newValue: 30 },
    ],
  },
];

async function loadOperationHistoryPage(): Promise<OperationHistoryPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: OperationHistoryPage };
    expect(
      mod.default,
      'SET-057 operation audit history must default-export a renderable Server Component at app/[locale]/(app)/(admin)/settings/manufacturing-ops/[operation_id]/history/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as OperationHistoryPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot find module|failed to load url|\.\/page\.tsx/i.test(message)) {
      throw error;
    }
    return function MissingOperationHistoryPage() {
      return React.createElement('main', { 'data-testid': 'missing-operation-history-page' });
    };
  }
}

async function renderOperationHistory(overrides: Partial<OperationHistoryPageProps> = {}) {
  const Page = await loadOperationHistoryPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en', operation_id: 'op_789' }),
    searchParams: Promise.resolve({}),
    entries: seededEntries,
    callerAccess: allowedCaller,
    now: '2026-05-24T12:00:00.000Z',
    ...overrides,
  });
  return render(<>{node}</>);
}

function historyTable() {
  return screen.getByRole('table', { name: /manufacturing operation audit history/i });
}

describe('SET-057 manufacturing operation audit trail screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/manufacturing-ops/op_789/history');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the operation-scoped history rows in timestamp DESC order with action badges', async () => {
    await renderOperationHistory();

    const root = screen.getByTestId('manufacturing-operation-history-screen');
    expect(root).toHaveAttribute('data-operation-id', 'op_789');
    expect(screen.getByRole('heading', { name: /manufacturing operation history/i })).toBeInTheDocument();

    const table = historyTable();
    for (const header of ['Timestamp', 'User', 'Action', 'Field diff']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument();
    }

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('data-audit-id'))).toEqual([
      'audit-update',
      'audit-create',
      'audit-delete-old',
    ]);

    for (const [row, action] of [
      [rows[0], 'update'],
      [rows[1], 'create'],
      [rows[2], 'delete'],
    ] as const) {
      const badge = within(row).getByText(new RegExp(`^${action}$`, 'i'));
      expect(badge).toHaveAttribute('data-slot', 'badge');
    }
  });

  it('expands the update row and renders changed fields as old-to-new diff pairs', async () => {
    const user = userEvent.setup();
    await renderOperationHistory();

    const updateRow = within(historyTable()).getByRole('row', { name: /bogdan ionescu.*update/i });
    await user.click(within(updateRow).getByRole('button', { name: /view diff|expand/i }));

    const diffPanel = screen.getByRole('region', { name: /field diff.*update/i });
    expect(within(diffPanel).getByText('is_active')).toBeInTheDocument();
    expect(within(diffPanel).getByTestId('diff-is_active-old')).toHaveTextContent('true');
    expect(within(diffPanel).getByTestId('diff-is_active-new')).toHaveTextContent('false');
    expect(within(diffPanel).getByText('operation_seq')).toBeInTheDocument();
    expect(within(diffPanel).getByTestId('diff-operation_seq-old')).toHaveTextContent('20');
    expect(within(diffPanel).getByTestId('diff-operation_seq-new')).toHaveTextContent('30');
  });

  it("filters by date range 'last 7 days' and removes entries outside that window", async () => {
    const user = userEvent.setup();
    const queryOperationHistory = vi.fn(async (input: OperationHistoryQueryInput) => {
      expect(input).toEqual(
        expect.objectContaining({
          operationId: 'op_789',
          datePreset: '7d',
          from: '2026-05-17',
          to: '2026-05-24',
        }),
      );
      return seededEntries.filter((entry) => entry.occurredAt >= '2026-05-17T00:00:00.000Z');
    });

    await renderOperationHistory({ entries: undefined, queryOperationHistory });
    await user.click(screen.getByRole('button', { name: /last 7 days|last 7d/i }));

    expect(queryOperationHistory, 'page must query/filter the operation-scoped audit log, not render fixed prototype rows').toHaveBeenCalled();
    const rows = within(historyTable()).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.getAttribute('data-audit-id'))).toEqual(['audit-update', 'audit-create']);
    expect(screen.queryByText(/carlos vega/i)).not.toBeInTheDocument();
  });

  it('renders 403 when either manufacturing_operations.view or settings.audit.read is not granted by permissions', async () => {
    for (const callerAccess of [
      { permissions: ['settings.audit.read'], roleCodes: ['manufacturing_operations.view', 'owner'] },
      { permissions: ['manufacturing_operations.view'], roleCodes: ['settings.audit.read', 'owner'] },
    ]) {
      cleanup();
      await renderOperationHistory({ callerAccess });

      expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
      expect(screen.getByText(/manufacturing_operations\.view/i)).toBeInTheDocument();
      expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
      expect(screen.queryByTestId('manufacturing-operation-history-screen')).not.toBeInTheDocument();
      expect(screen.queryByRole('table', { name: /manufacturing operation audit history/i })).not.toBeInTheDocument();
    }
  });
});
