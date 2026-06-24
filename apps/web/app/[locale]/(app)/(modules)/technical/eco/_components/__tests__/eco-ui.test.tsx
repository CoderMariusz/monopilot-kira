/**
 * N1-A — Change Control (ECO) screen: RTL parity + behaviour tests.
 *
 * Prototype anchors under test:
 *   - other-screens.jsx:132-180 (EcoScreen)        → page.tsx (list + pills + table)
 *   - modals.jsx:352-414 (EcoChangeRequestModal)   → create-eco-modal.client.tsx
 *   - modals.jsx:417-455 (EcoApprovalModal)        → approve transition in drawer
 *
 * The T2 server actions (page-data + create/get/approve/start/close) are mocked so
 * the UI is exercised in isolation; the actions themselves are covered by their
 * own adversarially-reviewed DB-gated suites. next-intl is mocked in
 * test-setup.ui.ts (keys resolve to the EN bundle; the Technical.eco.* keys are
 * not yet wired, so the in-component English fallbacks render and are asserted).
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EcoPageData } from '../../_actions/page-data';
import type { EcoDetail, EcoSummary } from '../../_actions/shared';

// ── Mocks ──────────────────────────────────────────────────────────────────────
const createMock = vi.fn();
const getMock = vi.fn();
const approveMock = vi.fn();
const startMock = vi.fn();
const closeMock = vi.fn();
const loadEcoPageMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

vi.mock('../../_actions/create-change-order', () => ({
  createChangeOrder: (...a: unknown[]) => createMock(...a),
}));
vi.mock('../../_actions/get-change-order', () => ({
  getChangeOrder: (...a: unknown[]) => getMock(...a),
}));
vi.mock('../../_actions/approve-change-order', () => ({
  approveChangeOrder: (...a: unknown[]) => approveMock(...a),
}));
vi.mock('../../_actions/start-change-order-implementation', () => ({
  startChangeOrderImplementation: (...a: unknown[]) => startMock(...a),
}));
vi.mock('../../_actions/close-change-order', () => ({
  closeChangeOrder: (...a: unknown[]) => closeMock(...a),
}));
vi.mock('../../_actions/page-data', () => ({
  loadEcoPage: (...a: unknown[]) => loadEcoPageMock(...a),
}));

// Imported AFTER the mocks so the components pick up the mocked modules.
const { CreateEcoButton } = await import('../create-eco-modal.client');
const { EcoDetailButton } = await import('../eco-detail-drawer.client');
const { EcoFilterPills } = await import('../eco-filter-pills.client');
const EcoPageModule = await import('../../page');
const EcoPage = EcoPageModule.default;

afterEach(() => {
  vi.clearAllMocks();
});

const items = [
  { id: 'item-1', itemCode: 'FG5101', name: 'Kielbasa slaska 450g' },
  { id: 'item-2', itemCode: 'RM3001', name: 'Pieprz czarny' },
];

function order(overrides: Partial<EcoSummary> = {}): EcoSummary {
  return {
    id: 'eco-1',
    code: 'ECO-2044',
    title: 'Redukcja soli -10%',
    status: 'draft',
    statusTone: 'muted',
    priority: 'high',
    changeType: 'spec',
    targetItemId: 'item-1',
    targetBomHeaderId: null,
    targetFactorySpecId: null,
    updatedAt: '2026-04-18T09:41:00.000Z',
    lineCount: 1,
    ...overrides,
  };
}

function pageData(overrides: Partial<EcoPageData> = {}): EcoPageData {
  return {
    changeOrders: [order()],
    items,
    counts: { draft: 3, approved: 1, implementing: 1, closed: 47, all: 52 },
    canWrite: true,
    canApprove: true,
    state: 'ready',
    ...overrides,
  };
}

function detail(overrides: Partial<EcoDetail> = {}): EcoDetail {
  return {
    ...order(),
    description: 'Reduce salt content by 10 percent across the sliced ham line.',
    requesterUserId: null,
    approverUserId: null,
    impactSummary: null,
    requestedEffectiveAt: null,
    approvedAt: null,
    implementingAt: null,
    closedAt: null,
    lines: [
      {
        id: 'line-1',
        lineNo: 1,
        action: 'change',
        targetType: 'item',
        targetId: 'item-1',
        fieldName: null,
        beforeValue: null,
        afterValue: null,
        rationale: 'Lower sodium target',
      },
    ],
    ...overrides,
  };
}

// ── List screen (page.tsx) ───────────────────────────────────────────────────────
describe('ECO list screen', () => {
  it('renders the change-order table from real loadEcoPage data', async () => {
    loadEcoPageMock.mockResolvedValue(pageData());
    render(await EcoPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'Change control (ECO)' })).toBeInTheDocument();
    expect(screen.getByText('ECO-2044')).toBeInTheDocument();
    expect(screen.getByText('Redukcja soli -10%')).toBeInTheDocument();
    // status + priority badges
    const row = screen.getByText('ECO-2044').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Draft')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('high')).toBeInTheDocument();
  });

  it('passes the status filter from the query param to loadEcoPage', async () => {
    loadEcoPageMock.mockResolvedValue(pageData({ changeOrders: [order({ status: 'closed' })] }));
    render(await EcoPage({ searchParams: Promise.resolve({ status: 'closed' }) }));
    expect(loadEcoPageMock).toHaveBeenCalledWith('closed');
  });

  it('renders the empty state when there are no change orders', async () => {
    loadEcoPageMock.mockResolvedValue(pageData({ changeOrders: [], state: 'empty' }));
    render(await EcoPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('No change orders')).toBeInTheDocument();
  });

  it('renders the error state when the load fails', async () => {
    loadEcoPageMock.mockResolvedValue(pageData({ changeOrders: [], state: 'error' }));
    render(await EcoPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('The change orders could not be loaded.')).toBeInTheDocument();
  });

  it('hides the create CTA and shows permission-denied when the caller lacks write', async () => {
    loadEcoPageMock.mockResolvedValue(
      pageData({ changeOrders: [], canWrite: false, canApprove: false, state: 'forbidden' }),
    );
    render(await EcoPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('button', { name: '+ New ECO' })).not.toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to view change control.'),
    ).toBeInTheDocument();
  });
});

// ── Filter pills ─────────────────────────────────────────────────────────────────
describe('ECO filter pills', () => {
  it('renders server-derived counts and marks the active filter', () => {
    render(
      <EcoFilterPills active="draft" counts={{ draft: 3, approved: 1, implementing: 1, closed: 47, all: 52 }} />,
    );
    const draftTab = screen.getByRole('tab', { name: /Draft 3/ });
    expect(draftTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /All 52/ })).toHaveAttribute('href', '?');
    expect(screen.getByRole('tab', { name: /Closed 47/ })).toHaveAttribute('href', '?status=closed');
  });
});

// ── Create modal ─────────────────────────────────────────────────────────────────
describe('ECO create modal', () => {
  it('submits a createChangeOrder payload matching the zod shape (incl. ≥1 line)', async () => {
    createMock.mockResolvedValue({ ok: true, data: { id: 'eco-new', status: 'draft' } });
    render(<CreateEcoButton items={items} label="+ New ECO" />);
    fireEvent.click(screen.getByRole('button', { name: '+ New ECO' }));

    fireEvent.change(screen.getByLabelText('ECO code'), { target: { value: 'ECO-3001' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Salt reduction' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Reduce salt by ten percent.' },
    });
    fireEvent.change(screen.getByLabelText('Target item'), { target: { value: 'item-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit ECO' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ECO-3001',
          title: 'Salt reduction',
          description: 'Reduce salt by ten percent.',
          changeType: 'engineering',
          priority: 'normal',
          targetItemId: 'item-1',
          lines: [
            expect.objectContaining({ lineNo: 1, targetType: 'item', targetId: 'item-1', action: 'change' }),
          ],
        }),
      ),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('keeps submit disabled until the required fields + a target item are present', () => {
    render(<CreateEcoButton items={items} label="+ New ECO" />);
    fireEvent.click(screen.getByRole('button', { name: '+ New ECO' }));
    expect(screen.getByRole('button', { name: 'Submit ECO' })).toBeDisabled();
  });

  it('surfaces a create action error inline (already_exists)', async () => {
    createMock.mockResolvedValue({ ok: false, error: 'already_exists' });
    render(<CreateEcoButton items={items} label="+ New ECO" />);
    fireEvent.click(screen.getByRole('button', { name: '+ New ECO' }));
    fireEvent.change(screen.getByLabelText('ECO code'), { target: { value: 'ECO-2044' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Duplicate code' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Duplicate of an existing ECO.' } });
    fireEvent.change(screen.getByLabelText('Target item'), { target: { value: 'item-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit ECO' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A change order with this code already exists.');
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

// ── Detail drawer: status-appropriate actions + RBAC ─────────────────────────────
describe('ECO detail drawer actions per status', () => {
  it('draft + approve permission → shows Approve and calls approveChangeOrder', async () => {
    getMock.mockResolvedValue({ ok: true, data: detail({ status: 'draft' }) });
    approveMock.mockResolvedValue({ ok: true, data: { id: 'eco-1', status: 'approved' } });
    render(<EcoDetailButton id="eco-1" canApprove openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(getMock).toHaveBeenCalledWith({ id: 'eco-1' }));
    const drawer = await screen.findByTestId('eco-detail-drawer');
    const approveBtn = within(drawer).getByRole('button', { name: 'Approve ECO' });
    fireEvent.click(approveBtn);
    await waitFor(() => expect(approveMock).toHaveBeenCalledWith({ id: 'eco-1' }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('draft WITHOUT approve permission → hides the Approve action (RBAC)', async () => {
    getMock.mockResolvedValue({ ok: true, data: detail({ status: 'draft' }) });
    render(<EcoDetailButton id="eco-1" canApprove={false} openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByTestId('eco-detail-drawer');
    expect(screen.queryByRole('button', { name: 'Approve ECO' })).not.toBeInTheDocument();
  });

  it('approved → shows Start implementation', async () => {
    getMock.mockResolvedValue({ ok: true, data: detail({ status: 'approved' }) });
    startMock.mockResolvedValue({ ok: true, data: { id: 'eco-1', status: 'implementing' } });
    render(<EcoDetailButton id="eco-1" canApprove openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const startBtn = await screen.findByRole('button', { name: 'Start implementation' });
    fireEvent.click(startBtn);
    await waitFor(() => expect(startMock).toHaveBeenCalledWith({ id: 'eco-1' }));
  });

  it('implementing → shows Close ECO', async () => {
    getMock.mockResolvedValue({ ok: true, data: detail({ status: 'implementing' }) });
    closeMock.mockResolvedValue({ ok: true, data: { id: 'eco-1', status: 'closed' } });
    render(<EcoDetailButton id="eco-1" canApprove openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const closeBtn = await screen.findByRole('button', { name: 'Close ECO' });
    fireEvent.click(closeBtn);
    await waitFor(() => expect(closeMock).toHaveBeenCalledWith({ id: 'eco-1' }));
  });

  it('closed → terminal, offers no workflow transition', async () => {
    getMock.mockResolvedValue({ ok: true, data: detail({ status: 'closed' }) });
    render(<EcoDetailButton id="eco-1" canApprove openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByTestId('eco-detail-drawer');
    expect(screen.queryByRole('button', { name: 'Approve ECO' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start implementation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close ECO' })).not.toBeInTheDocument();
  });

  it('handles invalid_state gracefully: surfaces the message and re-fetches', async () => {
    getMock
      .mockResolvedValueOnce({ ok: true, data: detail({ status: 'draft' }) })
      .mockResolvedValueOnce({ ok: true, data: detail({ status: 'approved' }) });
    approveMock.mockResolvedValue({ ok: false, error: 'invalid_state' });
    render(<EcoDetailButton id="eco-1" canApprove openLabel="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve ECO' }));

    expect(await screen.findByText(/no longer in the expected state/i)).toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });
});
