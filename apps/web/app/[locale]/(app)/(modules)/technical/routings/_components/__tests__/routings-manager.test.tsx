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
 * Covers: routing version list, the create modal (ordered ops + line
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
const deleteRouting = vi.fn();
const routingCostPreview = vi.fn();

vi.mock('../../_actions/list-routings', () => ({ listRoutings: (...a: unknown[]) => listRoutings(...a) }));
vi.mock('../../_actions/create-routing', () => ({ createRouting: (...a: unknown[]) => createRouting(...a) }));
vi.mock('../../_actions/update-routing', () => ({ updateRouting: (...a: unknown[]) => updateRouting(...a) }));
vi.mock('../../_actions/approve-routing', () => ({
  approveRouting: (...a: unknown[]) => approveRouting(...a),
  publishRouting: (...a: unknown[]) => publishRouting(...a),
}));
vi.mock('../../_actions/delete-routing', () => ({ deleteRouting: (...a: unknown[]) => deleteRouting(...a) }));
vi.mock('../../_actions/cost-preview', () => ({
  routingCostPreview: (...a: unknown[]) => routingCostPreview(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RoutingsManager } from '../routings-manager.client';
import type { RoutingItemOption, ResourceOption } from '../../_actions/list-routing-items';

/**
 * Options of ONE open Select, resolved through the trigger's `aria-controls`.
 * getAllByRole('option') is document-wide, so it cannot tell two operations'
 * pickers apart — and telling them apart is exactly what R-9 is about.
 */
function openListboxOptions(triggerLabel: string): string[] {
  const trigger = screen.getByRole('combobox', { name: triggerLabel });
  const listboxId = trigger.getAttribute('aria-controls');
  expect(listboxId, `expected ${triggerLabel} to be open`).toBeTruthy();
  const listbox = document.getElementById(listboxId!);
  expect(listbox, `expected a listbox for ${triggerLabel}`).not.toBeNull();
  return within(listbox!)
    .getAllByRole('option')
    .map((el) => el.textContent ?? '');
}

const ITEMS: RoutingItemOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', itemCode: 'FG-2001', name: 'Sausage' },
];
// PF-R06-07: the reported ambiguity — the SAME line code in two plants, plus an
// org-wide line with no site at all.
const SITE_WAW = 'site-waw';
const SITE_KRK = 'site-krk';
const LINES: ResourceOption[] = [
  { id: 'l1', code: 'LINE-A', name: 'Line A', siteId: SITE_WAW, siteCode: 'WAW', siteName: 'Warsaw Plant' },
  { id: 'l2', code: 'LINE-A', name: 'Line A', siteId: SITE_KRK, siteCode: 'KRK', siteName: 'Krakow Plant' },
  { id: 'l3', code: 'LINE-Z', name: 'Line Z', siteId: null, siteCode: null, siteName: null },
];
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
            setupTimeMin: '45',
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

// PF-R06-05: a draft with several operations — the routing you actually need to
// reorder. op_no comes back from the DB in order, so the modal must render it in
// that order and let the user change it.
const ROUTINGS_WITH_THREE_OPERATIONS = {
  ok: true as const,
  data: {
    routings: [
      {
        id: 'r-order',
        itemId: ITEMS[0].id,
        version: 5,
        status: 'draft' as const,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
        operationCount: 3,
        operations: [
          {
            opNo: 1,
            opCode: 'MIX-10',
            opName: 'Mix brine',
            lineId: 'l1',
            setupTimeMin: '45',
            runTimePerUnitSec: '12.50',
            costPerHour: '80.00',
            manufacturingOperationName: 'Cutting',
            isProduction: true,
          },
          {
            opNo: 2,
            opCode: 'SMK-20',
            opName: 'Smoke',
            lineId: 'l1',
            setupTimeMin: '30',
            runTimePerUnitSec: '20.00',
            costPerHour: '80.00',
            manufacturingOperationName: 'Smoking',
            isProduction: true,
          },
          {
            opNo: 3,
            opCode: 'PCK-30',
            opName: 'Pack',
            lineId: 'l1',
            setupTimeMin: '5',
            runTimePerUnitSec: '3.00',
            costPerHour: '80.00',
            manufacturingOperationName: 'Cutting',
            isProduction: true,
          },
        ],
      },
    ],
  },
};

// PF-R06-07 — a draft that has not been pinned to a site yet (the state every
// routing starts in). The picker must keep offering every line here.
const ROUTINGS_UNPINNED_DRAFT = {
  ok: true as const,
  data: {
    routings: [
      {
        ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0],
        id: 'r-unpinned',
        siteId: null,
      },
    ],
  },
};

// PF-R06-07 — a draft already pinned to Krakow: V-TEC-64 rejects every line that
// is not Krakow's, org-wide lines included.
const ROUTINGS_PINNED_TO_KRK = {
  ok: true as const,
  data: {
    routings: [
      {
        ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0],
        id: 'r-krk',
        siteId: SITE_KRK,
        operations: [
          { ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0].operations[0], lineId: 'l2' },
        ],
      },
    ],
  },
};

// R-9 — a routing pinned to Krakow that INHERITED an operation on a Warsaw line
// (site backfills predate the pin). The Warsaw line must stay reachable in the
// row that holds it and appear nowhere else.
const ROUTINGS_PINNED_TO_KRK_TWO_OPS = {
  ok: true as const,
  data: {
    routings: [
      {
        ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0],
        id: 'r-krk-2',
        siteId: SITE_KRK,
        operationCount: 2,
        operations: [
          { ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0].operations[0], opNo: 1, lineId: 'l2' },
          {
            ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0].operations[0],
            opNo: 2,
            opCode: 'PCK-20',
            opName: 'Pack',
            lineId: 'l1',
          },
        ],
      },
    ],
  },
};

// R-10 — production_lines.site_id is a soft reference with no FK: a NON-NULL id
// whose site row is gone arrives with siteCode/siteName null, exactly like an
// org-wide line. The database still treats it as site-specific.
const GHOST_SITE_ID = 'site-deleted-0001';
const LINES_WITH_GHOST_SITE: ResourceOption[] = [
  ...LINES,
  { id: 'l4', code: 'LINE-Q', name: 'Line Q', siteId: GHOST_SITE_ID, siteCode: null, siteName: null },
];

// R-2 — a value numeric(18,6) stores exactly but a JS double cannot.
const EXACT_18_DIGITS = '999999999999.123456';
const ROUTINGS_WITH_EXACT_SETUP = {
  ok: true as const,
  data: {
    routings: [
      {
        ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0],
        id: 'r-exact',
        operations: [
          { ...ROUTINGS_WITH_EDITABLE_OPERATIONS.data.routings[0].operations[0], setupTimeMin: EXACT_18_DIGITS },
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
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
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

  it('edit modal: + New routing opens the operation editor with line Select (no raw <select>) and calls createRouting', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    createRouting.mockResolvedValue({ ok: true, data: { id: 'r2', itemId: ITEMS[0].id, version: 3, status: 'draft' } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
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
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
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
    // Decimal control (PF-R06-09) — the value is the exact string, not a float.
    expect(within(dialog).getByLabelText('Setup (min)')).toHaveValue('45');
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
      setupTimeMin: '45',
    });
  });

  it('PF-R06-05: an operation can be moved up and the saved op_no sequence follows the new order', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_THREE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    updateRouting.mockResolvedValue({ ok: true, data: { id: 'r-order' } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');

    const opNames = () =>
      within(dialog)
        .getAllByLabelText('Operation name')
        .map((el) => (el as HTMLInputElement).value);
    expect(opNames()).toEqual(['Mix brine', 'Smoke', 'Pack']);

    // Boundaries: the first operation cannot go up, the last cannot go down.
    expect(within(dialog).queryByRole('button', { name: 'Operation 1 Move up' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Operation 3 Move down' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Operation 1 Move down' })).toBeInTheDocument();

    // Move "Pack" (op 3) one slot up → Mix, Pack, Smoke.
    await user.click(within(dialog).getByRole('button', { name: 'Operation 3 Move up' }));
    expect(opNames()).toEqual(['Mix brine', 'Pack', 'Smoke']);

    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));
    await waitFor(() => expect(updateRouting).toHaveBeenCalledTimes(1));

    const arg = updateRouting.mock.calls[0][0] as {
      routingId: string;
      operations: Array<{ opNo: number; opName: string; opCode: string }>;
    };
    expect(arg.routingId).toBe('r-order');
    // The whole row moves, not just the visible name.
    expect(arg.operations.map((op) => op.opName)).toEqual(['Mix brine', 'Pack', 'Smoke']);
    expect(arg.operations.map((op) => op.opCode)).toEqual(['MIX-10', 'PCK-30', 'SMK-20']);
    // V-TEC-60: op_no stays contiguous 1..N after the move.
    expect(arg.operations.map((op) => op.opNo)).toEqual([1, 2, 3]);
  });

  it('PF-R06-05: the move controls are reachable by keyboard', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_THREE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');

    const moveDown = within(dialog).getByRole('button', { name: 'Operation 1 Move down' });
    moveDown.focus();
    expect(moveDown).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(
      within(dialog)
        .getAllByLabelText('Operation name')
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Smoke', 'Mix brine', 'Pack']);
  });

  it('PF-R06-09: a fractional setup time is submitted verbatim (no silent Number() coercion)', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    updateRouting.mockResolvedValue({ ok: true, data: { id: 'r-edit' } });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');

    const setup = within(dialog).getByLabelText('Setup (min)');
    // jsdom never runs native constraint validation, so the browser's silent
    // block cannot be reproduced at this layer — assert the integer-stepped
    // number control is gone (type="number" with no `step` = implicit step 1,
    // which made 12.345 stepMismatch and killed the submit before onSubmit ran).
    expect(setup).not.toHaveAttribute('type', 'number');

    await user.clear(setup);
    await user.type(setup, '12.345');
    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));

    await waitFor(() => expect(updateRouting).toHaveBeenCalledTimes(1));
    const arg = updateRouting.mock.calls[0][0] as {
      operations: Array<{ setupTimeMin: unknown }>;
    };
    expect(arg.operations[0].setupTimeMin).toBe('12.345');
  });

  it('PF-R06-09: a rejected save renders a visible localized alert outside the scrolling modal body', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    updateRouting.mockResolvedValue({ ok: false, error: 'invalid_input' });
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));

    await waitFor(() => expect(updateRouting).toHaveBeenCalledTimes(1));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Please check the operation values and try again.');

    // Reachability, not mere existence: `.modal-body` is the only scrolling
    // region (globals.css `overflow-y:auto; flex:1`), so an alert rendered there
    // sits below the fold on a long routing and the save still looks like a
    // no-op. `.modal-foot` is a flex sibling inside a max-height:86vh column —
    // on screen whenever the dialog is, next to the button just pressed.
    expect(dialog.querySelector('.modal-foot')).toContainElement(alert);
    expect(dialog.querySelector('.modal-body')).not.toContainElement(alert);
    // and the modal stays open so the operation values can be corrected
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // ── PF-R06-07 — the line picker must name the site and must not offer lines
  // the server will reject, without ever blocking a routing that has no site yet.
  it('PF-R06-07: every line option names its site, so two same-code lines are tellable apart', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(screen.getByRole('button', { name: '+ New routing' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation 1 Line' }));

    const optionLabels = screen.getAllByRole('option').map((el) => el.textContent);
    // Without the site qualifier these two options were the identical string —
    // the operator could not tell which plant owned the line.
    expect(optionLabels).toContain('LINE-A · Line A — WAW');
    expect(optionLabels).toContain('LINE-A · Line A — KRK');
    // An org-wide line (site_id null) is labelled, not hidden.
    expect(optionLabels).toContain('LINE-Z · Line Z — All sites');
  });

  it('PF-R06-07 anti-regression: a routing with no site pinned still offers every active line', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_UNPINNED_DRAFT);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation 1 Line' }));

    // siteId null = brand-new / not yet pinned. Narrowing here would make the
    // first operation of the first routing impossible to bind.
    expect(screen.getAllByRole('option')).toHaveLength(LINES.length);
  });

  it('PF-R06-07: a routing pinned to one site does not offer lines from another site', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_PINNED_TO_KRK);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation 1 Line' }));

    const optionLabels = screen.getAllByRole('option').map((el) => el.textContent);
    expect(optionLabels).toEqual(['LINE-A · Line A — KRK']);
    // V-TEC-64 rejects a Warsaw line AND an org-wide line for a site-pinned
    // routing, so offering either would be a promise the server does not keep.
    expect(optionLabels).not.toContain('LINE-A · Line A — WAW');
    expect(optionLabels).not.toContain('LINE-Z · Line Z — All sites');
  });

  // ── R-9 — `lineOptions` was ONE list for the whole form: every already-bound
  // line was unioned into it, so a single inherited out-of-site operation
  // published its line to the pickers of all the other operations. The picker
  // promised a line the server then rejected with v_tec_64_cross_site_lines.
  it('R-9: an out-of-site line stays inside the operation that holds it', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_PINNED_TO_KRK_TWO_OPS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));

    // Operation 1 sits on the Krakow line — the Warsaw line of operation 2 must
    // not be on offer here.
    await user.click(screen.getByRole('combobox', { name: 'Operation 1 Line' }));
    const op1Options = openListboxOptions('Operation 1 Line');
    expect(op1Options).toEqual(['LINE-A · Line A — KRK']);
    expect(op1Options).not.toContain('LINE-A · Line A — WAW');

    // Operation 2 inherited the Warsaw line: it stays listed for THIS row, or
    // the control would blank out and hide the very row that needs fixing.
    await user.click(screen.getByRole('combobox', { name: 'Operation 2 Line' }));
    const op2Options = openListboxOptions('Operation 2 Line');
    expect(op2Options).toContain('LINE-A · Line A — WAW');
    expect(op2Options).toContain('LINE-A · Line A — KRK');
  });

  it('R-9 anti-over-blocking: an unpinned routing still offers every line in every operation', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_UNPINNED_DRAFT);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));

    // Add a second, empty operation: per-operation options must not mean
    // "only the line this row already has".
    await user.click(screen.getByRole('button', { name: '+ Add operation' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation 2 Line' }));
    expect(openListboxOptions('Operation 2 Line')).toHaveLength(LINES.length);
  });

  // ── R-10 — "All sites" is a claim about the data (site_id IS NULL), never the
  // fallback for a site reference that failed to resolve.
  it('R-10: a line whose site_id does not resolve is named, not passed off as org-wide', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager items={ITEMS} lines={LINES_WITH_GHOST_SITE} operationNames={OP_NAMES} canWrite canApprove />,
    );

    await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(screen.getByRole('button', { name: '+ New routing' }));
    await user.click(screen.getByRole('combobox', { name: 'Operation 1 Line' }));
    const optionLabels = openListboxOptions('Operation 1 Line');

    // The line the database still treats as site-specific:
    expect(optionLabels).toContain(`LINE-Q · Line Q — Unknown site ${GHOST_SITE_ID}`);
    // …and it must not be dressed up as the org-wide option, which is what made
    // an operator pin a routing to an invisible uuid believing it was org-wide.
    expect(optionLabels).not.toContain('LINE-Q · Line Q — All sites');
    // The genuinely org-wide line (site_id null) still reads "All sites".
    expect(optionLabels).toContain('LINE-Z · Line Z — All sites');
  });

  // ── R-2 — read → open → save must not round the stored value.
  it('R-2: an 18-digit setup time survives being opened and saved unchanged', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EXACT_SETUP);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    updateRouting.mockResolvedValue({ ok: true, data: { id: 'r-exact' } });
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');

    // Rendered verbatim — String(Number(…)) would already have dropped digits here.
    expect(within(dialog).getByLabelText('Setup (min)')).toHaveValue(EXACT_18_DIGITS);
    expect(String(Number(EXACT_18_DIGITS))).not.toBe(EXACT_18_DIGITS);

    // The operator changes nothing and saves. Before the fix this alone rewrote
    // the operation set with the rounded value.
    await user.click(within(dialog).getByRole('button', { name: 'Save routing' }));
    await waitFor(() => expect(updateRouting).toHaveBeenCalledTimes(1));
    const arg = updateRouting.mock.calls[0][0] as { operations: Array<{ setupTimeMin: unknown }> };
    expect(arg.operations[0].setupTimeMin).toBe(EXACT_18_DIGITS);
  });

  // ── PF-R06-06 — a draft created by mistake used to be permanent.
  it('PF-R06-06: only a draft row offers Delete', async () => {
    listRoutings.mockResolvedValue(ROUTINGS); // active v2 + superseded v1
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    await screen.findByRole('table', { name: 'Routing versions' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    cleanup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS); // draft v4
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    expect(within(table).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('PF-R06-06: delete is confirmed by typing the version label, then calls deleteRouting', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    deleteRouting.mockResolvedValue({ ok: true, data: { id: 'r-edit', itemId: ITEMS[0].id, version: 4 } });
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete routing v4')).toBeInTheDocument();
    // Irreversible: public.routings has no soft delete, so the warning is shown
    // and the confirm stays disabled until the exact version label is typed.
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/cannot be undone/i);
    const confirm = within(dialog).getByRole('button', { name: 'Delete routing' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Type v4 to confirm'), 'v4');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(deleteRouting).toHaveBeenCalledTimes(1));
    expect(deleteRouting).toHaveBeenCalledWith({ routingId: 'r-edit' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('PF-R06-06: a refused delete keeps the dialog open with the named reason', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    deleteRouting.mockResolvedValue({ ok: false, error: 'version_referenced' });
    render(<RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />);

    const table = await screen.findByRole('table', { name: 'Routing versions' });
    await user.click(within(table).getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Type v4 to confirm'), 'v4');
    await user.click(within(dialog).getByRole('button', { name: 'Delete routing' }));

    await waitFor(() => expect(deleteRouting).toHaveBeenCalledTimes(1));
    // Named refusal, not a bare "error" and not a silent close that reads as success.
    await waitFor(() =>
      expect(
        within(dialog).getByText(/still referenced by a work order or a change order/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('PF-R06-06: without technical.bom.create there is no Delete affordance', async () => {
    listRoutings.mockResolvedValue(ROUTINGS_WITH_EDITABLE_OPERATIONS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        operationNames={OP_NAMES}
        canWrite={false}
        canApprove={false}
      />,
    );

    await screen.findByRole('table', { name: 'Routing versions' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('state: permission-denied hides authoring CTAs and shows the read-only notice', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
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
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
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
    expect(entries.length).toBeGreaterThanOrEqual(68);
    for (const [key, value] of entries) {
      expect(value, `default label "${key}" must be a non-empty string`).toBeTruthy();
    }
  });

  it('builder renders non-empty headers/buttons and no "undefined" interpolation in op aria-labels', async () => {
    const user = userEvent.setup();
    listRoutings.mockResolvedValue(ROUTINGS);
    render(
      <RoutingsManager items={ITEMS} lines={LINES} operationNames={OP_NAMES} canWrite canApprove />,
    );

    // Non-empty list chrome: table label, column headers, CTA.
    const table = await screen.findByRole('table', { name: 'Routing versions' });
    for (const header of ['Version', 'Operations', 'Status', 'Effective from', 'Effective to', 'Actions']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: '+ New routing' }));

    // The op-row line selector aria-label interpolates operationLabel + index + fLine.
    expect(document.querySelector('[aria-label="Operation 1 Line"]')).not.toBeNull();
    expect(document.querySelector('[aria-label*="undefined"]')).toBeNull();
    expect(screen.getByText('Operation name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save routing' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('undefined');
  });
});
