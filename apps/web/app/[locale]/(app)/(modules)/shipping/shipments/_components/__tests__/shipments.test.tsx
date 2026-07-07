/** @vitest-environment jsdom */
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
  seal: {
    submit: 'Seal shipment',
    submitting: 'Sealing…',
    noPermission: 'You do not have permission to seal this shipment.',
    needsBox: 'Pack at least one box before sealing.',
    invalidState: 'This shipment cannot be sealed in its current status.',
  },
  errors: {
    invalid_input: 'Enter a license plate code.',
    forbidden: "You don't have permission to do that.",
    invalid_state: 'This shipment cannot be packed in its current status.',
    no_boxes: 'Pack at least one box before sealing the shipment.',
    lp_not_found: 'That license plate was not found.',
    lp_not_allocated: 'That license plate is not allocated to this sales order.',
    already_packed: 'That license plate is already packed.',
    invalid_box: 'That box no longer exists.',
    not_found: 'That shipment no longer exists.',
    persistence_failed: 'Something went wrong saving. Please retry.',
  },
  ship: {
    status: statusLabels,
    lifecycle: {
      title: 'Lifecycle',
      stages: { packing: 'Packing', shipped: 'Shipped', delivered: 'Delivered' },
      shippedAt: 'Shipped at',
      deliveredAt: 'Delivered at',
      bolLink: 'BOL reference',
      signedBolLink: 'Signed BOL',
      notShipped: 'Not shipped yet',
      notDelivered: 'Not delivered yet',
    },
    ship: {
      title: 'Ship shipment',
      submit: 'Ship shipment',
      submitting: 'Shipping…',
      shipped: 'Shipment shipped.',
      noPermission: 'You do not have permission to ship this shipment.',
      needsBox: 'Pack at least one box before shipping.',
      needsSeal: 'Seal the shipment before shipping.',
      alreadyShipped: 'This shipment has already been shipped.',
      bolNotAvailable: 'A bill of lading can only be generated once the shipment is packed, until it is delivered.',
      podNotShipped: 'Proof of delivery can only be recorded for a shipment that has been shipped.',
      errors: {
        forbidden: "You don't have permission to do that.",
        invalid_state: 'This shipment cannot be shipped in its current status.',
        not_found: 'That shipment no longer exists.',
        persistence_failed: 'Something went wrong saving. Please retry.',
      },
    },
    bol: {
      trigger: 'Generate BOL',
      triggerRegenerate: 'Regenerate BOL',
      title: 'Generate BOL for {shipment}',
      description: 'Record the carrier, service level and tracking number for the bill of lading.',
      carrierLabel: 'Carrier',
      carrierPlaceholder: 'e.g. DHL Freight',
      serviceLevelLabel: 'Service level',
      serviceLevelPlaceholder: 'Select a service level',
      serviceLevelOptions: { standard: 'Standard', express: 'Express', economy: 'Economy', freight: 'Freight' },
      trackingLabel: 'Tracking number',
      trackingPlaceholder: 'Carrier tracking reference',
      cancel: 'Cancel',
      submit: 'Generate BOL',
      submitting: 'Generating…',
      noPermission: 'You do not have permission to ship this shipment.',
      errors: {
        forbidden: "You don't have permission to do that.",
        not_found: 'That shipment no longer exists.',
        persistence_failed: 'Something went wrong saving. Please retry.',
      },
    },
    pod: {
      trigger: 'Record POD',
      title: 'Record proof of delivery for {shipment}',
      description: 'Confirm delivery and attach the signed proof-of-delivery document.',
      signedUrlLabel: 'Signed POD document URL',
      signedUrlHelp: 'Link to the signed bill of lading / proof-of-delivery PDF.',
      signedUrlPlaceholder: 'https://…/signed-pod.pdf',
      reasonLabel: 'Delivery attestation',
      reasonPlaceholder: 'Describe how delivery was confirmed (carrier, receiver, etc.)',
      cancel: 'Cancel',
      submit: 'Mark delivered',
      submitting: 'Recording…',
      formIncomplete: 'Enter the signed POD URL, an attestation reason, and your e-sign PIN.',
      noPermission: 'You do not have permission to record delivery for this shipment.',
      esign: {
        title: 'Electronic signature',
        meaning:
          'Enter your e-sign PIN to attest this delivery — or your account password while you have no PIN enrolled.',
        password: 'E-sign PIN or account password',
        passwordPlaceholder: 'E-sign PIN or account password',
        passwordHelp: 'Your account password is accepted only while you have no e-sign PIN enrolled.',
      },
      errors: {
        forbidden: "You don't have permission to do that.",
        not_found: 'That shipment no longer exists.',
        invalid_input: 'Enter a valid signed POD document URL.',
        invalid_state: 'This shipment cannot be marked delivered in its current status.',
        esign_failed: 'Signature failed. Check your password and try again.',
        persistence_failed: 'Something went wrong saving. Please retry.',
      },
    },
    cancel: {
      trigger: 'Cancel shipment',
      title: 'Cancel shipment {shipment}',
      intro: 'Cancelling releases allocated stock and recomputes the sales order status.',
      reasonCode: 'Reason',
      reasonPlaceholder: 'Select a reason',
      reasonOptions: {
        customer_request: 'Customer request',
        order_error: 'Order error',
        stock_shortage: 'Stock shortage',
        duplicate_shipment: 'Duplicate shipment',
        other: 'Other',
      },
      note: 'Note',
      noteOptional: 'optional',
      notePlaceholder: 'Add context for the cancellation',
      esign: {
        title: 'Electronic signature',
        meaning:
          'Enter your e-sign PIN to sign this cancellation — or your account password while you have no PIN enrolled. Your identity and the server time are recorded.',
        password: 'E-sign PIN or account password',
        passwordPlaceholder: 'E-sign PIN or account password',
        passwordHelp: 'Your account password is accepted only while you have no e-sign PIN enrolled.',
      },
      cancel: 'Keep shipment',
      submit: 'Cancel shipment',
      submitting: 'Cancelling…',
      formIncomplete: 'Select a reason and enter your password.',
      noPermission: 'You do not have permission to cancel this shipment.',
      errors: {
        forbidden: "You don't have permission to do that.",
        not_found: 'That shipment no longer exists.',
        invalid_input: 'That input isn’t valid. Please review and try again.',
        invalid_state: 'This shipment can no longer be cancelled in its current status.',
        illegal_transition: 'The sales order cannot be returned to a valid status.',
        downstream_financial_record: 'This shipment has downstream financial records and cannot be cancelled.',
        esign_failed: 'Signature failed. Check your password and try again.',
        persistence_failed: 'Something went wrong saving. Please retry.',
        generic: 'Something went wrong. Please retry.',
      },
    },
  },
};

const createLabels: CreateShipmentLabels = {
  label: 'Create shipment',
  pending: 'Creating…',
  noPermission: 'You do not have permission to create shipments.',
  notAllocated: 'Allocate the sales order before creating a shipment.',
  notShippable: 'This sales order can no longer raise a shipment in its current status.',
  errors: {
    forbidden: "You don't have permission to do that.",
    invalid_state: 'This sales order can no longer raise a shipment in its current status.',
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
        sscc: '050123450000000428',
        contents: [
          { lpCode: 'LP-0001', itemCode: 'FG-100', itemName: 'Sausage roll', qty: '10' },
        ],
      },
    ],
    ...overrides,
  };
}

type ShipResult = { ok: true } | { ok: false; error: string };
type SealResult = { ok: true } | { ok: false; error: string };
type BolResult = { ok: true; bolRef: string } | { ok: false; error: string };
type PodResult = { ok: true } | { ok: false; error: string };

type CancelResult = { ok: true } | { ok: false; error: string };

function renderPack(
  detail: ShipmentDetail = makeDetail(),
  caps: { canPack: boolean; canShip?: boolean; canPod?: boolean; canCancel?: boolean } = { canPack: true },
  packAction?: (input: { shipmentId: string; lpId: string; boxId?: string }) => Promise<{ ok: true; boxId: string } | { ok: false; error: string }>,
  shipActions: {
    seal?: (id: string) => Promise<SealResult>;
    ship?: (id: string) => Promise<ShipResult>;
    bol?: (input: { shipmentId: string; carrier?: string; serviceLevel?: string; trackingNumber?: string }) => Promise<BolResult>;
    pod?: (input: {
      shipmentId: string;
      signedPdfUrl: string;
      reason: string;
      signature: { password: string };
    }) => Promise<PodResult>;
    cancel?: (input: { shipmentId: string; reasonCode?: string | null; note?: string | null; signature: { password: string } }) => Promise<CancelResult>;
  } = {},
) {
  const packLpIntoBoxAction = vi.fn(
    packAction ?? (async () => ({ ok: true, boxId: 'box-uuid-1' }) as { ok: true; boxId: string }),
  );
  const sealShipmentAction = vi.fn(shipActions.seal ?? (async () => ({ ok: true }) as SealResult));
  const shipShipmentAction = vi.fn(shipActions.ship ?? (async () => ({ ok: true }) as ShipResult));
  const generateBolAction = vi.fn(
    shipActions.bol ?? (async () => ({ ok: true, bolRef: 'a1b2c3d4e5f6a7b8' }) as BolResult),
  );
  const recordPodAction = vi.fn(shipActions.pod ?? (async () => ({ ok: true }) as PodResult));
  const cancelShipmentAction = vi.fn(shipActions.cancel ?? (async () => ({ ok: true }) as CancelResult));
  render(
    <ShipmentPackView
      locale="en"
      detail={detail}
      labels={packLabels}
      caps={{
        canPack: caps.canPack,
        canShip: caps.canShip ?? caps.canPack,
        canPod: caps.canPod ?? true,
        canCancel: caps.canCancel ?? caps.canPack,
      }}
      packLpIntoBoxAction={packLpIntoBoxAction}
      sealShipmentAction={sealShipmentAction}
      shipShipmentAction={shipShipmentAction}
      generateBolAction={generateBolAction}
      recordPodAction={recordPodAction}
      cancelShipmentAction={cancelShipmentAction}
    />,
  );
  return { packLpIntoBoxAction, sealShipmentAction, shipShipmentAction, generateBolAction, recordPodAction, cancelShipmentAction };
}

describe('ShipmentPackView — header, boxes+SSCC, contents, Pack-LP control', () => {
  it('renders the shipment header + each box with its SSCC-18 + contents (lp_code/item/qty), no raw UUID', () => {
    renderPack();
    const header = screen.getByTestId('shipment-pack-header');
    expect(header).toHaveTextContent('SH-202606-00001');
    expect(within(header).getByText('SO-202606-00001')).toBeInTheDocument();
    const box = screen.getByTestId('shipment-box-1');
    expect(within(box).getAllByText('050123450000000428').length).toBeGreaterThan(0);
    expect(screen.getByTestId('shipment-box-1-sscc-barcode')).toBeInTheDocument();
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

  it('calls sealShipment and refreshes when sealing a packing shipment with boxes', async () => {
    const { sealShipmentAction } = renderPack();
    const sealBtn = screen.getByTestId('shipment-seal-submit');
    expect(sealBtn).toHaveTextContent('Seal shipment');
    expect(sealBtn).not.toBeDisabled();
    fireEvent.click(sealBtn);
    await waitFor(() => expect(sealShipmentAction).toHaveBeenCalledWith(SHIPMENT_ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
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
      soStatus="allocated"
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

  it('is disabled with a "not allocated yet" tooltip when the SO has not been allocated (confirmed + unallocated)', () => {
    renderCreate({ soStatus: 'confirmed', allocationStatus: 'unallocated' });
    const btn = screen.getByTestId('so-action-create-shipment');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Allocate the sales order before creating a shipment.');
  });

  it('is enabled for a partially_allocated SO with permission', () => {
    renderCreate({ soStatus: 'partially_allocated', allocationStatus: 'partially_allocated' });
    expect(screen.getByTestId('so-action-create-shipment')).not.toBeDisabled();
  });

  // ── L2 state-machine leak: a delivered SO keeps allocation_status='allocated', so
  // gating on allocation alone left [Create shipment] ENABLED. It must now be disabled
  // (the server rejects createShipment with invalid_state for terminal SO statuses),
  // and the tooltip must tell the TRUTH (terminal), not the misleading "not allocated".
  it.each(['delivered', 'shipped', 'cancelled', 'picked', 'packed'])(
    'is DISABLED with a terminal-status tooltip when the SO status is %s (allocation_status still allocated)',
    (soStatus) => {
      renderCreate({ soStatus, allocationStatus: 'allocated' });
      const btn = screen.getByTestId('so-action-create-shipment');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute(
        'title',
        'This sales order can no longer raise a shipment in its current status.',
      );
    },
  );

  it('does NOT call createShipment when the SO is delivered (button disabled — server reject unreachable)', () => {
    const { createShipmentAction } = renderCreate({ soStatus: 'delivered', allocationStatus: 'allocated' });
    fireEvent.click(screen.getByTestId('so-action-create-shipment'));
    expect(createShipmentAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('surfaces an invalid_state error inline (truthful terminal reason) without navigating', async () => {
    const { createShipmentAction } = renderCreate({}, async () => ({ ok: false, error: 'invalid_state' }));
    fireEvent.click(screen.getByTestId('so-action-create-shipment'));
    expect(await screen.findByTestId('create-shipment-error')).toHaveTextContent(
      'This sales order can no longer raise a shipment in its current status.',
    );
    expect(createShipmentAction).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

// ── Ship / BOL / POD controls (pack-screens.jsx:191-216) ──
function packedDetail(status: ShipmentRow['status'] = 'packed'): ShipmentDetail {
  return makeDetail({ shipment: { ...rows[0], status, shippedAt: null } });
}

describe('ShipmentShipControls — [Ship] gate + lifecycle', () => {
  it('shows [Ship shipment] when packed (≥1 box) and not shipped, and calls shipShipment', async () => {
    const { shipShipmentAction } = renderPack(packedDetail());
    const shipBtn = screen.getByTestId('shipment-ship-submit');
    expect(shipBtn).toHaveTextContent('Ship shipment');
    expect(shipBtn).not.toBeDisabled();
    fireEvent.click(shipBtn);
    await waitFor(() => expect(shipShipmentAction).toHaveBeenCalledWith(SHIPMENT_ID));
    // On success the shipped status note appears.
    expect(await screen.findByTestId('shipment-ship-done')).toHaveTextContent('Shipment shipped.');
    // No raw shipment UUID leaks into the rail.
    expect(document.body.textContent).not.toContain(SHIPMENT_ID);
  });

  it('disables [Ship] with a needs-box tooltip when no boxes are packed', () => {
    renderPack(makeDetail({ shipment: { ...rows[0], status: 'packed' }, boxes: [] }));
    const shipBtn = screen.getByTestId('shipment-ship-submit');
    expect(shipBtn).toBeDisabled();
    expect(shipBtn).toHaveAttribute('title', 'Pack at least one box before shipping.');
  });

  it('disables [Ship] with a permission tooltip when the user lacks ship.pack.close', () => {
    renderPack(packedDetail(), { canPack: false });
    const shipBtn = screen.getByTestId('shipment-ship-submit');
    expect(shipBtn).toBeDisabled();
    expect(shipBtn).toHaveAttribute('title', 'You do not have permission to ship this shipment.');
  });

  it('surfaces a forbidden ship result inline without crashing', async () => {
    const { shipShipmentAction } = renderPack(packedDetail(), { canPack: true, canShip: true }, undefined, {
      ship: async () => ({ ok: false, error: 'forbidden' }),
    });
    fireEvent.click(screen.getByTestId('shipment-ship-submit'));
    expect(await screen.findByTestId('shipment-ship-error')).toHaveTextContent(
      "You don't have permission to do that.",
    );
    expect(shipShipmentAction).toHaveBeenCalled();
    // Still in packing/packed lifecycle — not flipped to shipped.
    expect(screen.queryByTestId('shipment-ship-done')).not.toBeInTheDocument();
  });

  it('hides [Ship] and shows the shipped lifecycle when the shipment is already shipped', () => {
    renderPack(makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }));
    expect(screen.queryByTestId('shipment-ship-submit')).not.toBeInTheDocument();
    expect(screen.getByTestId('shipment-stage-shipped')).toHaveAttribute('data-active', 'true');
    // shipped_at stamp surfaced (getShipment returns shippedAt).
    expect(screen.getByTestId('shipment-shipped-at')).not.toHaveTextContent('Not shipped yet');
  });
});

describe('GenerateBolModal — carrier/service/tracking → generateBol', () => {
  it('opens, exposes carrier + tracking, calls generateBol and shows the BOL reference link', async () => {
    const bol = vi.fn(async () => ({ ok: true, bolRef: 'a1b2c3d4e5f6deadbeef' }) as BolResult);
    renderPack(packedDetail(), { canPack: true }, undefined, { bol });
    fireEvent.click(screen.getByTestId('shipment-generate-bol-trigger'));
    const form = await screen.findByTestId('shipment-generate-bol-form');
    fireEvent.change(within(form).getByTestId('shipment-bol-carrier'), { target: { value: 'DHL Freight' } });
    fireEvent.change(within(form).getByTestId('shipment-bol-tracking'), { target: { value: 'TRK-123' } });
    fireEvent.click(screen.getByTestId('shipment-bol-submit'));
    await waitFor(() =>
      expect(bol).toHaveBeenCalledWith(
        expect.objectContaining({ shipmentId: SHIPMENT_ID, carrier: 'DHL Freight', trackingNumber: 'TRK-123' }),
      ),
    );
    // The returned bolRef is surfaced in the lifecycle rail (truncated, no raw UUID).
    expect(await screen.findByTestId('shipment-bol-ref')).toHaveTextContent('a1b2c3d4e5f6');
    expect(document.body.textContent).not.toContain(SHIPMENT_ID);
  });

  it('disables the BOL trigger with a permission tooltip when the user cannot ship', () => {
    renderPack(packedDetail(), { canPack: false });
    const trigger = screen.getByTestId('shipment-generate-bol-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'You do not have permission to ship this shipment.');
  });

  // ── L2 state-machine leak: Generate BOL must be DISABLED on a terminal shipment
  // (delivered / cancelled / exception) — it is only applicable in the packed→shipped
  // ship-confirm window. The user has ship.pack.close here; the gate is the status.
  it('DISABLES the BOL trigger with a status tooltip when the shipment is delivered (terminal)', () => {
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'delivered', deliveredAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true },
    );
    const trigger = screen.getByTestId('shipment-generate-bol-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      'title',
      'A bill of lading can only be generated once the shipment is packed, until it is delivered.',
    );
  });

  it('keeps the BOL trigger ENABLED for a shipped shipment (still inside its window)', () => {
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true },
    );
    expect(screen.getByTestId('shipment-generate-bol-trigger')).not.toBeDisabled();
  });

  it('surfaces a generateBol error inline without crashing', async () => {
    renderPack(packedDetail(), { canPack: true }, undefined, {
      bol: async () => ({ ok: false, error: 'not_found' }),
    });
    fireEvent.click(screen.getByTestId('shipment-generate-bol-trigger'));
    await screen.findByTestId('shipment-generate-bol-form');
    fireEvent.click(screen.getByTestId('shipment-bol-submit'));
    expect(await screen.findByTestId('shipment-bol-error')).toHaveTextContent('That shipment no longer exists.');
  });

  // ── Regression: "BOL reference: BOL reference" placeholder. getShipment surfaces the
  // serialized BOL payload in bolPdfUrl (NOT a browsable URL, NOT the SHA hash). On
  // first paint after a reload bolRef is null, so the rail must render an honest em-dash
  // as the value — NEVER the label text ("BOL reference") as its own value.
  it('renders an em-dash (not the label as its value) when a non-URL BOL payload is persisted and no in-session ref exists', () => {
    renderPack(
      makeDetail({
        shipment: {
          ...rows[0],
          status: 'shipped',
          shippedAt: '2026-06-21T14:00:00Z',
          // Persisted bol_pdf_url is the serialized JSON payload, not a URL.
          bolPdfUrl: '{"shipmentId":"…","generatedAt":"2026-06-21T14:00:00Z"}',
        },
      }),
    );
    const ref = screen.getByTestId('shipment-bol-ref');
    expect(ref).toHaveTextContent('—');
    // The value node must NOT echo the field label.
    expect(ref).not.toHaveTextContent('BOL reference');
    // No clickable BOL link is rendered for a non-URL payload.
    expect(screen.queryByTestId('shipment-bol-link')).not.toBeInTheDocument();
  });

  // ── Hydration stability (React #418): the shipped/delivered timestamps are formatted
  // with an explicit UTC timeZone so SSR (server tz = UTC) and client (browser tz) agree.
  // We assert the rendered stamp is the UTC wall-clock time regardless of the test
  // runner's local timezone (14:00Z must read "2:00 PM", never shifted by the host tz).
  it('formats the shipped-at stamp in UTC (hydration-stable, not host-tz shifted)', () => {
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }),
    );
    expect(screen.getByTestId('shipment-shipped-at')).toHaveTextContent('2:00');
  });
});

describe('RecordPodModal — signed POD url → recordPod', () => {
  it('opens, calls recordPod with the signed url, reason, and e-sign then stamps delivered + shows the signed BOL link', async () => {
    const pod = vi.fn(async () => ({ ok: true }) as PodResult);
    renderPack(makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }), { canPack: true }, undefined, { pod });
    fireEvent.click(screen.getByTestId('shipment-record-pod-trigger'));
    const form = await screen.findByTestId('shipment-record-pod-form');
    fireEvent.change(within(form).getByTestId('shipment-pod-signed-url'), {
      target: { value: 'https://files.example/signed-pod.pdf' },
    });
    fireEvent.change(within(form).getByTestId('shipment-pod-reason'), {
      target: { value: 'Carrier POD received with receiver signature.' },
    });
    fireEvent.change(within(form).getByTestId('shipment-pod-password'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByTestId('shipment-pod-submit'));
    await waitFor(() =>
      expect(pod).toHaveBeenCalledWith({
        shipmentId: SHIPMENT_ID,
        signedPdfUrl: 'https://files.example/signed-pod.pdf',
        reason: 'Carrier POD received with receiver signature.',
        signature: { password: '1234' },
      }),
    );
    // delivered_at stamped + signed BOL link surfaced.
    await waitFor(() =>
      expect(screen.getByTestId('shipment-delivered-at')).not.toHaveTextContent('Not delivered yet'),
    );
    const link = await screen.findByTestId('shipment-signed-bol-link');
    expect(link).toHaveAttribute('href', 'https://files.example/signed-pod.pdf');
    expect(screen.getByTestId('shipment-stage-delivered')).toHaveAttribute('data-active', 'true');
  });

  it('disables the POD trigger with a permission tooltip when the user lacks ship.bol.sign', () => {
    // Shipment read (ship.dashboard.view) without ship.bol.sign: the page must pass
    // canPod:false so the trigger is disabled before submit, not only on recordPod.
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true, canPod: false },
    );
    const trigger = screen.getByTestId('shipment-record-pod-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'You do not have permission to record delivery for this shipment.');
  });

  // ── L2 state-machine leak: Record POD must be DISABLED unless the shipment is
  // 'shipped' (server: recordPod requires status === 'shipped'). A delivered shipment
  // (terminal) and a packed shipment (not yet shipped) must both block it.
  it('DISABLES the POD trigger with a status tooltip when the shipment is delivered (terminal)', () => {
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'delivered', deliveredAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true, canPod: true },
    );
    const trigger = screen.getByTestId('shipment-record-pod-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      'title',
      'Proof of delivery can only be recorded for a shipment that has been shipped.',
    );
  });

  it('DISABLES the POD trigger with a status tooltip when the shipment is only packed (not shipped)', () => {
    renderPack(packedDetail(), { canPack: true, canPod: true });
    const trigger = screen.getByTestId('shipment-record-pod-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute(
      'title',
      'Proof of delivery can only be recorded for a shipment that has been shipped.',
    );
  });

  it('keeps the POD trigger ENABLED for a shipped shipment with permission', () => {
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true, canPod: true },
    );
    expect(screen.getByTestId('shipment-record-pod-trigger')).not.toBeDisabled();
  });

  it('surfaces a recordPod error inline without crashing', async () => {
    // The POD trigger is only enabled while the shipment is 'shipped' (its valid
    // window), so exercise the error path from there.
    renderPack(
      makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } }),
      { canPack: true },
      undefined,
      {
        pod: async () => ({ ok: false, error: 'forbidden' }),
      },
    );
    fireEvent.click(screen.getByTestId('shipment-record-pod-trigger'));
    await screen.findByTestId('shipment-record-pod-form');
    fireEvent.change(screen.getByTestId('shipment-pod-signed-url'), {
      target: { value: 'https://files.example/signed-pod.pdf' },
    });
    fireEvent.change(screen.getByTestId('shipment-pod-reason'), {
      target: { value: 'Carrier confirmed delivery.' },
    });
    fireEvent.change(screen.getByTestId('shipment-pod-password'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByTestId('shipment-pod-submit'));
    expect(await screen.findByTestId('shipment-pod-error')).toHaveTextContent(
      "You don't have permission to do that.",
    );
  });
});

/**
 * Wave-R reversibility — Cancel-shipment e-sign reverse button wired to cancelShipment.
 *
 * Prototype parity: the danger reverse action mirrors the right-rail ship action group
 * (shipping/pack-screens.jsx:211-216, V-SHIP-SHIP) + the per-status danger button
 * pattern; the e-sign confirm is spec-driven off the in-repo void-output precedent
 * (production/wos/[id]/_components/void-correction-modal.tsx). Asserts: parity
 * (trigger present in the ship action group only for shipped shipments / hidden when
 * the loaded status would be rejected), all 5 states (idle form, optimistic submit, error, permission-denied via
 * disabled+tooltip, success→refresh), the exact e-sign payload shape, and NO raw UUID.
 */
describe('CancelShipmentModal — ship.so.cancel e-sign reverse', () => {
  function shippedDetail(): ShipmentDetail {
    return makeDetail({ shipment: { ...rows[0], status: 'shipped', shippedAt: '2026-06-21T14:00:00Z' } });
  }

  async function pickReason(label: string) {
    fireEvent.click(within(screen.getByTestId('shipment-cancel-reason')).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: label }));
  }

  it('renders the [Cancel shipment] trigger for a shipped shipment, no raw UUID', () => {
    renderPack(shippedDetail());
    const trigger = screen.getByTestId('shipment-cancel-trigger');
    expect(trigger).toHaveTextContent('Cancel shipment');
    expect(document.body.textContent).not.toContain(SHIPMENT_ID);
  });

  it.each(['packing', 'packed', 'manifested'] as const)(
    'hides the [Cancel shipment] trigger when the loaded shipment status is %s',
    (status) => {
      renderPack(makeDetail({ shipment: { ...rows[0], status } }));
      expect(screen.queryByTestId('shipment-cancel-trigger')).not.toBeInTheDocument();
    },
  );

  it('hides the [Cancel shipment] trigger when the shipment is already delivered', () => {
    renderPack(makeDetail({ shipment: { ...rows[0], status: 'delivered', deliveredAt: '2026-06-21T14:00:00Z' } }));
    expect(screen.queryByTestId('shipment-cancel-trigger')).not.toBeInTheDocument();
  });

  it('disables the trigger with a permission tooltip when the user lacks ship.so.cancel', () => {
    renderPack(shippedDetail(), { canPack: true, canCancel: false });
    const trigger = screen.getByTestId('shipment-cancel-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'You do not have permission to cancel this shipment.');
  });

  it('requires a reason + password (e-sign) before submit is enabled', async () => {
    renderPack(shippedDetail());
    fireEvent.click(screen.getByTestId('shipment-cancel-trigger'));
    await screen.findByTestId('shipment-cancel-form');
    // e-sign block present (mirrors the void-output precedent).
    expect(screen.getByTestId('shipment-cancel-esign')).toBeInTheDocument();
    const submit = screen.getByTestId('shipment-cancel-submit');
    expect(submit).toBeDisabled();
    await pickReason('Customer request');
    expect(submit).toBeDisabled(); // still no password
    fireEvent.change(screen.getByTestId('shipment-cancel-password'), { target: { value: 'pw' } });
    expect(submit).not.toBeDisabled();
  });

  it('submits the exact { shipmentId, reasonCode, note, signature:{ password } } payload and refreshes on success', async () => {
    const { cancelShipmentAction } = renderPack(shippedDetail());
    fireEvent.click(screen.getByTestId('shipment-cancel-trigger'));
    await screen.findByTestId('shipment-cancel-form');
    await pickReason('Customer request');
    fireEvent.change(screen.getByTestId('shipment-cancel-note'), { target: { value: 'customer cancelled' } });
    fireEvent.change(screen.getByTestId('shipment-cancel-password'), { target: { value: 'pw123' } });
    fireEvent.click(screen.getByTestId('shipment-cancel-submit'));
    await waitFor(() =>
      expect(cancelShipmentAction).toHaveBeenCalledWith({
        shipmentId: SHIPMENT_ID,
        reasonCode: 'customer_request',
        note: 'customer cancelled',
        signature: { password: 'pw123' },
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces the invalid_state error inline (delivered blocked server-side) without crashing', async () => {
    renderPack(shippedDetail(), { canPack: true }, undefined, {
      cancel: async () => ({ ok: false, error: 'invalid_state' }),
    });
    fireEvent.click(screen.getByTestId('shipment-cancel-trigger'));
    await screen.findByTestId('shipment-cancel-form');
    await pickReason('Customer request');
    fireEvent.change(screen.getByTestId('shipment-cancel-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('shipment-cancel-submit'));
    expect(await screen.findByTestId('shipment-cancel-error')).toHaveTextContent(
      'This shipment can no longer be cancelled in its current status.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
