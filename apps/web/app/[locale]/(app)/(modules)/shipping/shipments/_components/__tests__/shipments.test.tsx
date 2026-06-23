/**
 * Wave-shipping — Shipments list + pack screen + Create-shipment button:
 * RTL parity + state tests (RED-first).
 *
 * Prototype anchors:
 *   - pack screen: shipping/pack-screens.jsx:48-220 (ShPackStation) — box builder
 *     (scan/enter LP → active box), closed-boxes table with SSCC, right-rail
 *     shipment summary.
 *   - shipments list: spec-driven (no JSX list of shipments exists; the nearest
 *     reusable pattern is the SO list dense table — shipping/so-screens.jsx:92-168).
 *
 * The async RSC pages read Supabase via withOrgContext and are exercised live
 * (manual + Playwright). Here we test the client views against Server Action SEAMS:
 *   - list: status filter, empty / loading-less render, rows deep-link to the pack
 *     screen, NO raw UUID leak (shipment_number / so_number / customer shown);
 *   - pack: header + boxes (each with SSCC-18) + box contents (lp_code / item / qty),
 *     the Pack-LP control builds the { shipmentId, lpId } payload and refreshes on
 *     success, surfaces an error inline, all 4 states, NO raw UUID leak;
 *   - create-shipment button: calls createShipment(soId) → navigates, and is gated
 *     (disabled + tooltip) when the user lacks ship.pack.close or the SO isn't
 *     allocated.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShipmentsListView, type ShipmentsListLabels } from '../shipments-list-view';
import { ShipmentPackView, type ShipmentPackLabels } from '../shipment-pack-view';
import { CreateShipmentButton, type CreateShipmentLabels } from '../create-shipment-button';
import type { ShipmentRow, ShipmentDetail } from '../../_actions/shipments-data';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ── UUID-shaped ids to assert no leak into the rendered output ──
const SHIPMENT_ID = '11111111-1111-4111-8111-111111111111';
const SHIPMENT_ID_2 = '22222222-2222-4222-8222-222222222222';
const SO_ID = '33333333-3333-4333-8333-333333333333';

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  packing: 'Packing',
  packed: 'Packed',
  manifested: 'Manifested',
  shipped: 'Shipped',
  delivered: 'Delivered',
  exception: 'Exception',
};

const listLabels: ShipmentsListLabels = {
  statusFilterLabel: 'Status',
  allStatuses: 'All statuses',
  rowsCount: '{n} shipments',
  status: statusLabels,
  columns: {
    shipment: 'Shipment',
    salesOrder: 'Sales order',
    customer: 'Customer',
    status: 'Status',
    boxes: 'Boxes',
    weight: 'Weight',
    actions: 'Actions',
  },
  view: 'Open',
  empty: { title: 'No shipments yet', body: 'Create a shipment from an allocated sales order.' },
  weightUnit: 'kg',
  noWeight: '—',
};

const packLabels: ShipmentPackLabels = {
  status: statusLabels,
  summary: {
    title: 'Shipment summary',
    shipment: 'Shipment',
    salesOrder: 'Sales order',
    customer: 'Customer',
    status: 'Status',
    boxes: 'Boxes',
  },
  boxes: {
    title: 'Boxes',
    empty: 'No boxes packed yet. Scan or enter a license plate to start the first box.',
    boxLabel: 'Box {n}',
    ssccLabel: 'SSCC',
    noSscc: 'Not generated',
    contentsEmpty: 'This box is empty.',
    colLp: 'License plate',
    colItem: 'Item',
    colQty: 'Qty',
  },
  pack: {
    title: 'Pack a license plate',
    lpLabel: 'License plate code',
    lpPlaceholder: 'Scan or type LP code…',
    boxLabel: 'Box',
    newBox: 'New box',
    submit: 'Pack',
    submitting: 'Packing…',
    success: 'Packed into box {n}.',
    noPermission: 'You do not have permission to pack this shipment.',
  },
  errors: {
    invalid_input: 'Enter a license plate code.',
    forbidden: "You don't have permission to do that.",
    invalid_state: 'This shipment cannot be packed in its current status.',
    lp_not_allocated: 'That license plate is not allocated to this sales order.',
    already_packed: 'That license plate is already packed.',
    invalid_box: 'That box no longer exists.',
    not_found: 'That shipment no longer exists.',
    persistence_failed: 'Something went wrong saving. Please retry.',
  },
};

const createLabels: CreateShipmentLabels = {
  label: 'Create shipment',
  pending: 'Creating…',
  noPermission: 'You do not have permission to create shipments.',
  notAllocated: 'Allocate the sales order before creating a shipment.',
  errors: {
    forbidden: "You don't have permission to do that.",
    invalid_state: 'Allocate the sales order before creating a shipment.',
    persistence_failed: 'Something went wrong saving. Please retry.',
  },
};

const rows: ShipmentRow[] = [
  {
    id: SHIPMENT_ID,
    shipmentNumber: 'SH-202606-00001',
    status: 'packing',
    salesOrderNumber: 'SO-202606-00001',
    customerName: 'Acme Foods',
    customerCode: 'CUST-01',
    boxCount: 2,
    weight: '24.5',
    createdAt: '2026-06-20T10:00:00Z',
    packedAt: null,
    shippedAt: null,
  },
  {
    id: SHIPMENT_ID_2,
    shipmentNumber: 'SH-202606-00002',
    status: 'shipped',
    salesOrderNumber: 'SO-202606-00002',
    customerName: 'Bistro Co',
    customerCode: 'CUST-02',
    boxCount: 1,
    weight: null,
    createdAt: '2026-06-21T10:00:00Z',
    packedAt: '2026-06-21T12:00:00Z',
    shippedAt: '2026-06-21T14:00:00Z',
  },
];

function renderList(overrides: Partial<React.ComponentProps<typeof ShipmentsListView>> = {}) {
  render(<ShipmentsListView locale="en" shipments={rows} labels={listLabels} {...overrides} />);
}

describe('ShipmentsListView — list states + parity + no-UUID', () => {
  it('renders shipment_number, so_number, customer, status badge, box count, weight (no raw UUID)', () => {
    renderList();
    const table = screen.getByTestId('shipments-list-table');
    expect(within(table).getByText('SH-202606-00001')).toBeInTheDocument();
    expect(within(table).getByText('SO-202606-00001')).toBeInTheDocument();
    expect(within(table).getByText('Acme Foods')).toBeInTheDocument();
    expect(screen.getByTestId('shipment-status-packing')).toBeInTheDocument();
    expect(screen.getByTestId('shipment-status-shipped')).toBeInTheDocument();
    // box count + weight
    expect(within(table).getByText('24.5 kg')).toBeInTheDocument();
    // No raw shipment / SO UUID anywhere on screen.
    expect(document.body.textContent).not.toContain(SHIPMENT_ID);
    expect(document.body.textContent).not.toContain(SHIPMENT_ID_2);
  });

  it('deep-links each row to /<locale>/shipping/shipments/<shipmentId>', () => {
    renderList();
    const link = screen.getByTestId(`shipment-link-${SHIPMENT_ID}`);
    expect(link).toHaveAttribute('href', `/en/shipping/shipments/${SHIPMENT_ID}`);
  });

  it('filters by status (client filter over the org-scoped dataset)', () => {
    renderList();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Shipped' }));
    const table = screen.getByTestId('shipments-list-table');
    expect(within(table).queryByText('SH-202606-00001')).not.toBeInTheDocument();
    expect(within(table).getByText('SH-202606-00002')).toBeInTheDocument();
  });

  it('renders the empty state when there are no shipments', () => {
    renderList({ shipments: [] });
    expect(screen.getByText('No shipments yet')).toBeInTheDocument();
    expect(screen.queryByTestId('shipments-list-table')).not.toBeInTheDocument();
  });
});

// ── Pack screen ──
function makeDetail(overrides: Partial<ShipmentDetail> = {}): ShipmentDetail {
  return {
    shipment: rows[0],
    boxes: [
      {
        boxNumber: 1,
        sscc: '050123450000000425',
        contents: [
          { lpCode: 'LP-0001', itemCode: 'FG-100', itemName: 'Sausage roll', qty: '10' },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPack(
  detail: ShipmentDetail = makeDetail(),
  caps: { canPack: boolean } = { canPack: true },
  packAction?: (input: { shipmentId: string; lpId: string; boxId?: string }) => Promise<{ ok: true; boxId: string } | { ok: false; error: string }>,
) {
  const packLpIntoBoxAction = vi.fn(
    packAction ?? (async () => ({ ok: true, boxId: 'box-uuid-1' }) as { ok: true; boxId: string }),
  );
  render(
    <ShipmentPackView
      locale="en"
      detail={detail}
      labels={packLabels}
      caps={caps}
      packLpIntoBoxAction={packLpIntoBoxAction}
    />,
  );
  return { packLpIntoBoxAction };
}

describe('ShipmentPackView — header, boxes+SSCC, contents, Pack-LP control', () => {
  it('renders the shipment header + each box with its SSCC-18 + contents (lp_code/item/qty), no raw UUID', () => {
    renderPack();
    const header = screen.getByTestId('shipment-pack-header');
    expect(header).toHaveTextContent('SH-202606-00001');
    expect(within(header).getByText('SO-202606-00001')).toBeInTheDocument();
    const box = screen.getByTestId('shipment-box-1');
    expect(within(box).getByText('050123450000000425')).toBeInTheDocument();
    expect(within(box).getByText('LP-0001')).toBeInTheDocument();
    expect(within(box).getByText('Sausage roll')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SHIPMENT_ID);
  });

  it('renders the empty-boxes state when no boxes packed yet', () => {
    renderPack(makeDetail({ boxes: [] }));
    expect(screen.getByTestId('shipment-boxes-empty')).toBeInTheDocument();
  });

  it('Pack-LP submits { shipmentId, lpId } to packLpIntoBox and refreshes on success', async () => {
    const { packLpIntoBoxAction } = renderPack();
    fireEvent.change(screen.getByTestId('pack-lp-input'), { target: { value: 'LP-0002' } });
    fireEvent.click(screen.getByTestId('pack-lp-submit'));
    await waitFor(() =>
      expect(packLpIntoBoxAction).toHaveBeenCalledWith({ shipmentId: SHIPMENT_ID, lpId: 'LP-0002' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('blocks submit with no LP code (no action call)', async () => {
    const { packLpIntoBoxAction } = renderPack();
    fireEvent.click(screen.getByTestId('pack-lp-submit'));
    expect(await screen.findByTestId('pack-lp-error')).toHaveTextContent('Enter a license plate code.');
    expect(packLpIntoBoxAction).not.toHaveBeenCalled();
  });

  it('surfaces a lp_not_allocated error inline without crashing', async () => {
    const { packLpIntoBoxAction } = renderPack(makeDetail(), { canPack: true }, async () => ({
      ok: false,
      error: 'lp_not_allocated',
    }));
    fireEvent.change(screen.getByTestId('pack-lp-input'), { target: { value: 'LP-9999' } });
    fireEvent.click(screen.getByTestId('pack-lp-submit'));
    expect(await screen.findByTestId('pack-lp-error')).toHaveTextContent(
      'That license plate is not allocated to this sales order.',
    );
    expect(packLpIntoBoxAction).toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables the Pack-LP control with a tooltip when the user cannot pack (permission denied)', () => {
    renderPack(makeDetail(), { canPack: false });
    const submit = screen.getByTestId('pack-lp-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('title', 'You do not have permission to pack this shipment.');
  });
});

// ── Create-shipment button (SO detail) ──
function renderCreate(
  props: Partial<React.ComponentProps<typeof CreateShipmentButton>> = {},
  action?: (soId: string) => Promise<{ ok: true; shipmentId: string } | { ok: false; error: string }>,
) {
  const createShipmentAction = vi.fn(
    action ?? (async () => ({ ok: true, shipmentId: SHIPMENT_ID }) as { ok: true; shipmentId: string }),
  );
  render(
    <CreateShipmentButton
      locale="en"
      soId={SO_ID}
      allocationStatus="allocated"
      canCreate
      labels={createLabels}
      createShipmentAction={createShipmentAction}
      {...props}
    />,
  );
  return { createShipmentAction };
}

describe('CreateShipmentButton — gated create on the SO detail', () => {
  it('calls createShipment(soId) and navigates to the new pack screen on success', async () => {
    const { createShipmentAction } = renderCreate();
    fireEvent.click(screen.getByTestId('so-action-create-shipment'));
    await waitFor(() => expect(createShipmentAction).toHaveBeenCalledWith(SO_ID));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/en/shipping/shipments/${SHIPMENT_ID}`),
    );
  });

  it('is disabled with a permission tooltip when the user lacks ship.pack.close', () => {
    renderCreate({ canCreate: false });
    const btn = screen.getByTestId('so-action-create-shipment');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'You do not have permission to create shipments.');
  });

  it('is disabled with a status tooltip when the SO is not allocated', () => {
    renderCreate({ allocationStatus: 'unallocated' });
    const btn = screen.getByTestId('so-action-create-shipment');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Allocate the sales order before creating a shipment.');
  });

  it('is enabled for a partially_allocated SO with permission', () => {
    renderCreate({ allocationStatus: 'partially_allocated' });
    expect(screen.getByTestId('so-action-create-shipment')).not.toBeDisabled();
  });

  it('surfaces an invalid_state error inline without navigating', async () => {
    const { createShipmentAction } = renderCreate({}, async () => ({ ok: false, error: 'invalid_state' }));
    fireEvent.click(screen.getByTestId('so-action-create-shipment'));
    expect(await screen.findByTestId('create-shipment-error')).toHaveTextContent(
      'Allocate the sales order before creating a shipment.',
    );
    expect(createShipmentAction).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
