/**
 * @vitest-environment jsdom
 * E1 — Warehouse Print-history screen (warehouse/print-history).
 *
 * RED phase: pins the four required UI states (loading / empty / error / data +
 * permission-denied), asserts the status filter + the table columns (entity /
 * status badge / copies / printer / created / download), the Reprint action wiring,
 * and that no raw UUIDs leak (entity shown via lp_code).
 */
import React from 'react';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../lib/auth/with-org-context', () => ({ withOrgContext: vi.fn() }));

vi.mock('../../../(admin)/settings/infra/printers/_actions/printers', () => ({
  listPrintJobs: vi.fn(),
  reprintFromHistory: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));

const JOB_SENT = '11111111-1111-4111-8111-111111111111';
const JOB_QUEUED = '22222222-2222-4222-8222-222222222222';
const JOB_FAILED = '33333333-3333-4333-8333-333333333333';
const NEW_JOB = '44444444-4444-4444-8444-444444444444';

type JobRow = {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  entity_type: string;
  entity_display: string;
  lp_code: string | null;
  copies: number;
  printer_name: string | null;
  result_url: string | null;
  created_at: string;
};
type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

type PrintHistoryPageProps = {
  params?: Promise<{ locale: string }>;
  jobs?: JobRow[];
  canManage?: boolean;
  state?: PageState;
  reprintFromHistory?: (jobId: string) => Promise<JobRow>;
};

type PrintHistoryPage = (props: PrintHistoryPageProps) => React.ReactNode | Promise<React.ReactNode>;

const jobs: JobRow[] = [
  {
    id: JOB_SENT,
    status: 'sent',
    entity_type: 'lp',
    entity_display: 'LP-0001',
    lp_code: 'LP-0001',
    copies: 2,
    printer_name: 'Dispatch PDF',
    result_url: 'data:text/plain;charset=utf-8,hello',
    created_at: '2026-06-23T10:05:00.000Z',
  },
  {
    id: JOB_QUEUED,
    status: 'queued',
    entity_type: 'lp',
    entity_display: 'LP-0002',
    lp_code: 'LP-0002',
    copies: 1,
    printer_name: 'Zebra ZD420',
    result_url: null,
    created_at: '2026-06-23T09:00:00.000Z',
  },
  {
    id: JOB_FAILED,
    status: 'failed',
    entity_type: 'lp',
    entity_display: 'LP-0003',
    lp_code: 'LP-0003',
    copies: 3,
    printer_name: null,
    result_url: null,
    created_at: '2026-06-22T08:00:00.000Z',
  },
];

async function loadPage(): Promise<PrintHistoryPage> {
  const mod = await import('./page.tsx');
  expect(mod.default, 'print-history page must default-export a renderable component').toEqual(expect.any(Function));
  return mod.default as PrintHistoryPage;
}

async function renderPage(overrides: Partial<PrintHistoryPageProps> = {}) {
  const Page = await loadPage();
  const reprintFromHistory = vi.fn(async (_jobId: string) => ({
    id: NEW_JOB,
    status: 'sent' as const,
    entity_type: 'lp',
    entity_display: 'LP-0001',
    lp_code: 'LP-0001',
    copies: 2,
    printer_name: 'Dispatch PDF',
    result_url: 'data:text/plain;charset=utf-8,reprinted',
    created_at: '2026-06-23T11:00:00.000Z',
  }));
  const props: PrintHistoryPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    jobs,
    canManage: true,
    state: 'ready',
    reprintFromHistory,
    ...overrides,
  };
  const node = await Page(props);
  return { props, reprintFromHistory, ...render(React.createElement(React.Fragment, null, node)) };
}

function expectNoRawUuids() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
}

describe('E1 print-history route contract', () => {
  it('implements the localized warehouse route under app/[locale]/(app)/(modules)/warehouse/print-history', () => {
    const canonical = path.join(process.cwd(), 'app/[locale]/(app)/(modules)/warehouse/print-history/page.tsx');
    expect(existsSync(canonical)).toBe(true);
  });
});

describe('E1 print-history screen', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the data state: jobs with entity refs (lp_code), status badges, copies, printer; download only when result_url present; no raw UUIDs', async () => {
    await renderPage();
    expect(screen.getByTestId('warehouse-print-history-screen')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /print history/i });
    expect(within(table).getByText('LP-0001')).toBeInTheDocument();
    expect(within(table).getByText('Dispatch PDF')).toBeInTheDocument();
    const rowSent = within(table).getByRole('row', { name: /LP-0001/i });
    expect(within(rowSent).getByRole('link', { name: /download/i })).toBeInTheDocument();
    const rowQueued = within(table).getByRole('row', { name: /LP-0002/i });
    expect(within(rowQueued).queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
    expectNoRawUuids();
  });

  it('renders the loading state', async () => {
    await renderPage({ state: 'loading', jobs: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading print history/i);
  });

  it('renders the empty state', async () => {
    await renderPage({ state: 'empty', jobs: [] });
    expect(screen.getByText(/no print jobs yet/i)).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    await renderPage({ state: 'error', jobs: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load print history/i);
  });

  it('renders the permission-denied state', async () => {
    await renderPage({ state: 'permission_denied', jobs: [], canManage: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
  });

  it('exposes a status filter and filters rows client-side', async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(screen.getByRole('option', { name: /^failed$/i }));
    const table = screen.getByRole('table', { name: /print history/i });
    expect(within(table).getByText('LP-0003')).toBeInTheDocument();
    expect(within(table).queryByText('LP-0001')).not.toBeInTheDocument();
  });

  it('reprints a job through the injected reprintFromHistory action', async () => {
    const user = userEvent.setup();
    const { reprintFromHistory } = await renderPage();
    const table = screen.getByRole('table', { name: /print history/i });
    const row = within(table).getByRole('row', { name: /LP-0001/i });
    await user.click(within(row).getByRole('button', { name: /reprint/i }));
    await waitFor(() => expect(reprintFromHistory).toHaveBeenCalledTimes(1));
    expect(reprintFromHistory).toHaveBeenCalledWith(JOB_SENT);
  });

  it('disables Reprint when manage permission is missing', async () => {
    await renderPage({ canManage: false, state: 'ready' });
    const table = screen.getByRole('table', { name: /print history/i });
    const row = within(table).getByRole('row', { name: /LP-0001/i });
    const reprint = within(row).getByRole('button', { name: /reprint/i });
    expect(reprint).toBeDisabled();
    expect(reprint).toHaveAccessibleName(/settings\.org\.update/i);
  });
});
