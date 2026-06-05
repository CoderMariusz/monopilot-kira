/**
 * @vitest-environment jsdom
 *
 * T-051 + T-052 — RoutingsManager RTL tests (real component, mocked actions).
 *
 * Prototype anchors (verified with `wc -l` = 1659 / modals.jsx = 655):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34 (RoutingsScreen)
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:1270-1287 (routing versions tab)
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:271-304 (RoutingStepAddModal)
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585 (CostingScreen breakdown)
 *
 * Covers: routing version list, the create modal (ordered ops + line/machine
 * Select, never raw <select>), the NUMERIC-exact cost preview + resource
 * utilization, and the empty / permission-denied states.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listRoutings = vi.fn();
const createRouting = vi.fn();
const updateRouting = vi.fn();
const approveRouting = vi.fn();
const publishRouting = vi.fn();
const routingCostPreview = vi.fn();

vi.mock('../../_actions/list-routings', () => ({ listRoutings: (...a: unknown[]) => listRoutings(...a) }));
vi.mock('../../_actions/create-routing', () => ({ createRouting: (...a: unknown[]) => createRouting(...a) }));
vi.mock('../../_actions/update-routing', () => ({ updateRouting: (...a: unknown[]) => updateRouting(...a) }));
vi.mock('../../_actions/approve-routing', () => ({
  approveRouting: (...a: unknown[]) => approveRouting(...a),
  publishRouting: (...a: unknown[]) => publishRouting(...a),
}));
vi.mock('../../_actions/cost-preview', () => ({
  routingCostPreview: (...a: unknown[]) => routingCostPreview(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RoutingsManager } from '../routings-manager.client';
import type { RoutingItemOption, ResourceOption } from '../../_actions/list-routing-items';

const ITEMS: RoutingItemOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', itemCode: 'FG-2001', name: 'Sausage' },
];
const LINES: ResourceOption[] = [{ id: 'l1', code: 'LINE-A', name: 'Line A' }];
const MACHINES: ResourceOption[] = [{ id: 'm1', code: 'CUT-02', name: 'Cutter 2' }];
const OP_NAMES = ['Cutting', 'Smoking'];

const ROUTINGS = {
  ok: true as const,
  data: {
    routings: [
      {
        id: 'r1',
        itemId: ITEMS[0].id,
        version: 2,
        status: 'active' as const,
        effectiveFrom: '2026-05-01',
        effectiveTo: null,
        operationCount: 3,
      },
      {
        id: 'r0',
        itemId: ITEMS[0].id,
        version: 1,
        status: 'superseded' as const,
        effectiveFrom: '2026-04-01',
        effectiveTo: '2026-04-30',
        operationCount: 2,
      },
    ],
  },
};

const COST_PREVIEW = {
  ok: true as const,
  data: {
    routingId: 'r1',
    volume: '100',
    operations: [
      { opNo: 1, opCode: 'OP-01', opName: 'Cut', setupCost: '30.00', runCost: '16.67', opCost: '46.67' },
      { opNo: 2, opCode: 'OP-02', opName: 'Smoke', setupCost: '10.00', runCost: '5.00', opCost: '15.00' },
    ],
    totalCost: '61.67',
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoutingsManager — T-051/T-052 (routings + cost preview)', () => {
  it('parity: item picker is a combobox (no raw <select>), routing versions table renders status badges', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite
        canApprove
      />,
    );

    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    expect(document.querySelector('select')).toBeNull();

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    expect(within(table).getByText('v2')).toBeInTheDocument();
    expect(within(table).getByText('v1')).toBeInTheDocument();
    // Status chips now render a semantic glyph + label (MON-design-system badges).
    expect(within(table).getByText(/Active/)).toBeInTheDocument();
    expect(within(table).getByText(/Superseded/)).toBeInTheDocument();
  });

  it('cost preview: Compute cost calls routingCostPreview and shows NUMERIC-exact per-op + total cost', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager items={ITEMS} lines={LINES} machines={MACHINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(screen.getByRole('button', { name: 'Compute cost' }));

    await waitFor(() => expect(routingCostPreview).toHaveBeenCalledTimes(1));
    expect(routingCostPreview).toHaveBeenCalledWith({ routingId: 'r1', volume: '100' });

    expect(await screen.findByTestId('routing-total-cost')).toHaveTextContent('61.67');
    const previewTable = screen.getByRole('table', { name: /Cost preview operations/ });
    expect(within(previewTable).getByText('46.67')).toBeInTheDocument();
    expect(within(previewTable).getByText('16.67')).toBeInTheDocument();
    // resource utilization bars rendered
    expect(screen.getByText('Resource utilization (cost share)')).toBeInTheDocument();
  });

  it('edit modal: + New routing opens the operation editor with line/machine Selects (no raw <select>) and calls createRouting', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    createRouting.mockResolvedValue({ ok: true, data: { id: 'r2', itemId: ITEMS[0].id, version: 3, status: 'draft' } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} machines={MACHINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(screen.getByRole('button', { name: '+ New routing' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('New routing')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /raw/ })).toBeNull();
    expect(dialog.querySelector('select')).toBeNull();
    // resource Select present (combobox)
    expect(within(dialog).getAllByRole('combobox').length).toBeGreaterThan(0);

    await user.type(within(dialog).getByLabelText('Operation name'), 'Cutting step');
    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));

    await waitFor(() => expect(createRouting).toHaveBeenCalledTimes(1));
    const arg = createRouting.mock.calls[0][0];
    expect(arg.itemId).toBe(ITEMS[0].id);
    expect(arg.operations[0].opNo).toBe(1);
    expect(arg.operations[0].opName).toBe('Cutting step');
  });

  it('state: permission-denied hides authoring CTAs and shows the read-only notice', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite={false}
        canApprove={false}
      />,
    );
    await screen.findByRole('table', { name: 'Routing versions' });
    expect(screen.queryByRole('button', { name: '+ New routing' })).not.toBeInTheDocument();
    // Permission-denied now renders a design-system .alert (alert-title text).
    expect(
      screen.getByText(
        (content, el) =>
          el?.classList.contains('alert-title') === true &&
          content === 'You can view routings but do not have permission to author them (technical.bom.create).',
      ),
    ).toBeInTheDocument();
  });

  it('state: empty routings renders the empty message', async () => {
    listRoutings.mockResolvedValue({ ok: true, data: { routings: [] } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} machines={MACHINES} operationNames={OP_NAMES} canWrite canApprove />,
    );
    // Empty routings now render a design-system .empty-state (title + body).
    expect(await screen.findByText('No routings yet')).toBeInTheDocument();
    expect(screen.getByText(/Create the first routing version/)).toBeInTheDocument();
  });
});
