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

const ROUTINGS_WITH_EDITABLE_OPERATIONS = {
  ok: true as const,
  data: {
    routings: [
      {
        id: 'r-edit',
        itemId: ITEMS[0].id,
        version: 4,
        status: 'draft' as const,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
        operationCount: 1,
        operations: [
          {
            opNo: 1,
            opCode: 'MIX-10',
            opName: 'Mix brine',
            lineId: 'l1',
            machineId: null,
            setupTimeMin: 45,
            runTimePerUnitSec: '12.50',
            costPerHour: '80.00',
            manufacturingOperationName: 'Cutting',
            isProduction: true,
          },
        ],
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

  it('edit modal: opens with existing operations pre-filled and preserves numeric setup on save', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    updateRouting.mockResolvedValue({ ok: true, data: { id: 'r-edit' } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} machines={MACHINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    expect(within(table).getByText('v4')).toBeInTheDocument();
    expect(within(table).getByText('1')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit routing v4')).toBeInTheDocument();
    expect(within(dialog).getByText('Operation 1')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Operation name')).toHaveValue('Mix brine');
    expect(within(dialog).getByLabelText('Op code')).toHaveValue('MIX-10');
    expect(within(dialog).getByLabelText('Setup (min)')).toHaveValue(45);
    expect(dialog.querySelector('[aria-label="Operation 1 Line"]')).toHaveTextContent('LINE-A · Line A');

    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));

    await waitFor(() => expect(updateRouting).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const arg = updateRouting.mock.calls[0][0];
    expect(arg.routingId).toBe('r-edit');
    expect(arg.operations[0]).toMatchObject({
      opNo: 1,
      opName: 'Mix brine',
      opCode: 'MIX-10',
      lineId: 'l1',
      setupTimeMin: 45,
    });
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

describe('W9-L5 FIX 3 — routings label bundle survives the RSC boundary (2026-06-11 clickthrough §2)', () => {
  it('keeps ROUTINGS_DEFAULT_LABELS in a PLAIN module so the Server Component page can Object.keys() it', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    // The labels module must NOT be a client module — importing a const from a
    // 'use client' file into page.tsx yields a client-reference proxy whose
    // Object.keys() are not the label keys (the empty-labels bug).
    const labelsSource = await fs.readFile(path.join(__dirname, '..', 'routings-labels.ts'), 'utf8');
    expect(labelsSource).not.toMatch(/['"]use client['"]/);

    const pageSource = await fs.readFile(path.join(__dirname, '..', '..', 'page.tsx'), 'utf8');
    expect(pageSource).toContain("from './_components/routings-labels'");
    expect(pageSource).not.toMatch(
      /import\s*\{[^}]*ROUTINGS_DEFAULT_LABELS[^}]*\}\s*from\s*'\.\/_components\/routings-manager\.client'/,
    );

    const { ROUTINGS_DEFAULT_LABELS } = await import('../routings-labels');
    const entries = Object.entries(ROUTINGS_DEFAULT_LABELS);
    expect(entries.length).toBeGreaterThanOrEqual(72);
    for (const [key, value] of entries) {
      expect(value, `default label "${key}" must be a non-empty string`).toBeTruthy();
    }
  });

  it('builder renders non-empty headers/buttons and no "undefined" interpolation in op aria-labels', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    render(
      <RoutingsManager items={ITEMS} lines={LINES} machines={MACHINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    // Non-empty list chrome: table label, column headers, CTA.
    const table = await screen.findByRole('table', { name: 'Routing versions' });
    for (const header of ['Version', 'Operations', 'Status', 'Effective from', 'Effective to', 'Actions']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: '+ New routing' }));

    // The op-row resource selector aria-label interpolates operationLabel +
    // index + fResourceType — was "undefined1 undefined" before the fix.
    // (The Select component puts aria-label on its wrapper div, so assert on
    // the attribute rather than an accessible role name.)
    expect(document.querySelector('[aria-label="Operation 1 Resource type"]')).not.toBeNull();
    expect(document.querySelector('[aria-label*="undefined"]')).toBeNull();
    expect(screen.getByText('Operation name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save routing' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('undefined');
  });
});
