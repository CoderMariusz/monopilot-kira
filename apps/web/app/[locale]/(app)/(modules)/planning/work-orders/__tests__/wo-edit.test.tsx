/**
 * P2-PLANNING (Wave R1 reversibility) — WO DRAFT edit affordance: RTL parity tests.
 *
 * Prototype: wo-detail.jsx:10 (draft action map includes "Edit"). The edit modal
 * mirrors create-wo (product picker, qty + conversion-preview pattern, line/machine,
 * schedule, notes) and carries the honest re-snapshot note (EN+PL).
 *
 * Tests the client detail view + edit modal against the updateWorkOrder Server Action
 * SEAM:
 *   - Edit affordance renders only on DRAFT (non-draft hides it);
 *   - "Edit" opens the modal PREFILLED (qty/line/machine/notes/schedule);
 *   - the honest "rebuilds components + operations" note is shown;
 *   - submit sends the updateWorkOrder payload (no productId when product unchanged);
 *   - changing the product sends productId (re-snapshot) + the converted base qty;
 *   - invalid_state error mapping.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WoDetailView, type WoDetailLabels } from '../_components/wo-detail-view';
import type { GetPlanningWorkOrderResult, ReleaseWorkOrderResult } from '../_actions/shared';
import type { FgProductOption, ProductionResources } from '../_actions/wo-form-data';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

type Wo = Extract<GetPlanningWorkOrderResult, { ok: true }>['workOrder'];

const resources: ProductionResources = {
  lines: [{ id: 'line-1', code: 'L1', name: 'Line One' }],
};

const editModalLabels: NonNullable<WoDetailLabels['edit']>['modal'] = {
  title: 'Edit work order',
  resnapshotNote: 'Changing the product or quantity rebuilds components and operations.',
  productLabel: 'Product',
  changeProduct: 'Change product',
  picker: {
    trigger: 'Change product',
    searchLabel: 'Search products',
    searchPlaceholder: 'Search…',
    loading: 'Searching…',
    empty: 'No matches',
    cancel: 'Cancel',
    error: 'Search failed',
  },
  quantityLabel: 'Planned quantity',
  quantityPlaceholder: '0',
  quantityUom: { base: 'kg', each: 'each', box: 'box' },
  conversionPreview: '{qty} {unit} = {kg} {base}',
  orderUnitLabel: 'Order unit',
  scheduledStartLabel: 'Scheduled start',
  lineLabel: 'Production line',
  machineLabel: 'Machine',
  noneOption: '— None —',
  notesLabel: 'Notes',
  notesPlaceholder: 'Optional',
  submit: 'Save changes',
  submitting: 'Saving…',
  cancel: 'Cancel',
  errors: {
    quantityRequired: 'Enter a quantity.',
    invalid_input: 'invalid',
    forbidden: 'no permission',
    not_found: 'gone',
    invalid_state: 'no longer a draft',
    uom_conversion_unavailable: 'missing pack data',
    persistence_failed: 'save failed',
  },
};

const labels: WoDetailLabels = {
  status: { draft: 'Draft', released: 'Released', in_progress: 'In progress', on_hold: 'On hold', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled' },
  summary: { product: 'Product', qty: 'Qty', scheduledStart: 'Start', scheduledEnd: 'End', line: 'Line', priority: 'Priority', source: 'Source' },
  tabs: { overview: 'Overview', outputs: 'Outputs', dependencies: 'Dependencies', reservations: 'Reservations', sequencing: 'Sequencing', history: 'History', d365: 'D365' },
  materials: { title: 'Materials', seq: '#', name: 'Name', required: 'Required', source: 'Source', empty: 'No materials.' },
  snapshot: {
    title: 'Pinned BOM / factory spec',
    bomHeaderId: 'BOM header ID',
    bomVersion: 'BOM version',
    factorySpecId: 'Factory spec ID',
    factorySpecVersion: 'Factory spec version',
    none: '—',
  },
  operations: { title: 'Operations', seq: '#', op: 'Op', expDur: 'Dur', expYield: 'Yield', status: 'Status', empty: 'No operations.' },
  outputs: { title: 'Outputs', role: 'Role', product: 'Product', planned: 'Planned', allocation: 'Alloc', disposition: 'Disp', empty: 'No outputs.' },
  dependencies: { title: 'Dependencies', direction: 'Dir', wo: 'WO', requiredQty: 'Qty', materialLink: 'Link', empty: 'No deps.' },
  history: { title: 'History', from: 'From', to: 'To', timestamp: 'When', user: 'User', action: 'Action', empty: 'No history.' },
  notLive: { reservations: 'Not live', sequencing: 'Not live', d365: 'Not live' },
  minutes: 'min',
  edit: { editButton: 'Edit', modal: editModalLabels },
  deleteDraft: {
    button: 'Delete draft',
    pending: 'Deleting...',
    confirm: 'Delete draft work order {wo}?',
    error: 'Could not delete this draft work order.',
  },
  cancelChain: {
    button: 'Cancel chain',
    pending: 'Cancelling...',
    confirm: 'Cancel the whole chain for {wo}?',
    error: 'Could not cancel this chain.',
  },
  release: {
    button: 'Release',
    pending: 'Releasing…',
    confirm: 'Release work order {wo}? This commits it to production.',
    error: {
      forbidden: 'no permission',
      not_found: 'gone',
      invalid_state: 'invalid state',
      invalid_input: 'invalid',
      persistence_failed: 'release failed',
      pack_hierarchy_incomplete: 'pack incomplete',
    },
  },
};

function makeWo(over: Partial<Wo> = {}): Wo {
  return {
    id: 'wo-1',
    woNumber: 'WO-DRAFT-1',
    productId: 'prod-1',
    itemCode: 'FG-001',
    itemTypeAtCreation: 'fg',
    plannedQuantity: '250',
    producedQuantity: null,
    uom: 'kg',
    status: 'DRAFT',
    scheduledStartTime: '2026-07-05T00:00:00.000Z',
    scheduledEndTime: null,
    productionLineId: 'line-1',
    priority: 'normal',
    sourceOfDemand: 'manual',
    sourceReference: null,
    notes: 'keep cold',
    qtyEntered: null,
    qtyEnteredUom: null,
    uomSnapshot: null,
    activeBomHeaderId: null,
    activeBomVersion: null,
    activeFactorySpecId: null,
    activeFactorySpecVersion: null,
    activeFactorySpecCode: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    materials: [],
    operations: [],
    schedules: [],
    dependencies: [],
    statusHistory: [],
    ...over,
  } as Wo;
}

const fgRow: FgProductOption = {
  id: 'prod-2',
  itemCode: 'FG-002',
  name: 'New FG',
  uomBase: 'kg',
  outputUom: 'base',
  netQtyPerEach: null,
  eachPerBox: null,
  boxesPerPallet: null,
  weightMode: 'fixed',
};

function renderDetail(over: {
  wo?: Wo;
  update?: ReturnType<typeof vi.fn>;
  deleteDraft?: ReturnType<typeof vi.fn>;
  release?: ReturnType<typeof vi.fn>;
} = {}) {
  const update = over.update ?? vi.fn().mockResolvedValue({ ok: true, workOrder: {} });
  const search = vi.fn().mockResolvedValue([fgRow]);
  const deleteDraft = over.deleteDraft ?? vi.fn().mockResolvedValue({ ok: true, id: 'wo-1' });
  const release = over.release ?? vi.fn().mockResolvedValue({ ok: true, workOrder: {} });
  const utils = render(
    <WoDetailView
      workOrder={over.wo ?? makeWo()}
      labels={labels}
      locale="en"
      resources={resources}
      searchFgProductsAction={search}
      updateWorkOrderAction={update}
      deleteDraftWorkOrderAction={deleteDraft}
      releaseWorkOrderAction={release}
    />,
  );
  return { ...utils, update, search, deleteDraft, release };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('WO DRAFT edit affordance (Wave R1)', () => {
  it('hides the Edit button on a non-draft WO', () => {
    renderDetail({ wo: makeWo({ status: 'RELEASED' }) });
    expect(screen.queryByTestId('wo-edit-order')).not.toBeInTheDocument();
  });

  it('shows the Edit button on a DRAFT WO', () => {
    renderDetail();
    expect(screen.getByTestId('wo-edit-order')).toBeInTheDocument();
  });

  it('hides Delete on a chained draft and keeps it on a standalone draft', () => {
    renderDetail({
      wo: makeWo({
        dependencies: [{
          id: 'dep-1',
          parentWoId: 'wo-parent',
          childWoId: 'wo-1',
          materialLink: null,
          requiredQty: '100',
          createdAt: '2026-06-01T00:00:00.000Z',
        }],
      }),
    });
    expect(screen.queryByTestId('wo-delete-draft')).not.toBeInTheDocument();

    renderDetail();
    expect(screen.getByTestId('wo-delete-draft')).toBeInTheDocument();
  });

  it('opens the modal PREFILLED with the honest re-snapshot note', async () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    const form = await screen.findByTestId('edit-wo-form');
    expect(within(form).getByTestId('edit-wo-resnapshot-note')).toHaveTextContent('rebuilds components and operations');
    expect(within(form).getByTestId('edit-wo-quantity')).toHaveValue('250');
    expect(within(form).getByTestId('edit-wo-scheduled-start')).toHaveValue('2026-07-05');
    expect(within(form).getByTestId('edit-wo-notes')).toHaveValue('keep cold');
    expect(within(form).getByTestId('edit-wo-product')).toHaveTextContent('FG-001');
  });

  it('submits updateWorkOrder WITHOUT productId when the product is unchanged', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    await screen.findByTestId('edit-wo-form');
    fireEvent.change(screen.getByTestId('edit-wo-quantity'), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('edit-wo-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const payload = update.mock.calls[0][0];
    expect(payload).toMatchObject({ id: 'wo-1', plannedQuantity: '300', notes: 'keep cold' });
    expect(payload.productId).toBeUndefined();
    expect(payload.productionLineId).toBeUndefined();
    expect(payload.scheduledStartTime).toBeUndefined();
  });

  it('B1b: sends civil-date UTC midnight when scheduled start changes', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    await screen.findByTestId('edit-wo-form');
    fireEvent.change(screen.getByTestId('edit-wo-scheduled-start'), { target: { value: '2026-07-15' } });
    fireEvent.click(screen.getByTestId('edit-wo-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].scheduledStartTime).toBe('2026-07-15T00:00:00.000Z');
  });

  it('sends productId (re-snapshot) when the product changes', async () => {
    const { update } = renderDetail();
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    await screen.findByTestId('edit-wo-form');
    // change product via the picker
    fireEvent.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getAllByTestId('item-picker-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('item-picker-option')[0]);
    await waitFor(() => expect(screen.getByTestId('edit-wo-product')).toHaveTextContent('FG-002'));

    fireEvent.change(screen.getByTestId('edit-wo-quantity'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('edit-wo-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ id: 'wo-1', productId: 'prod-2', plannedQuantity: '120' });
  });

  it('maps invalid_state (no longer a draft)', async () => {
    const update = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_state' });
    renderDetail({ update });
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    await screen.findByTestId('edit-wo-form');
    fireEvent.click(screen.getByTestId('edit-wo-submit'));
    expect(await screen.findByTestId('edit-wo-error')).toHaveTextContent('no longer a draft');
  });

  it('C063: prefills the original order UoM (box) instead of base-only quantity', async () => {
    const { update } = renderDetail({
      wo: makeWo({
        plannedQuantity: '3.000',
        qtyEntered: '2',
        qtyEnteredUom: 'box',
        uomSnapshot: {
          outputUom: 'box',
          uomBase: 'kg',
          netQtyPerEach: 1.5,
          eachPerBox: 1,
          boxesPerPallet: null,
          weightMode: 'fixed',
        },
      }),
    });
    fireEvent.click(screen.getByTestId('wo-edit-order'));
    const form = await screen.findByTestId('edit-wo-form');
    expect(within(form).getByTestId('edit-wo-quantity')).toHaveValue('2');
    expect(within(form).getByText('Planned quantity (box)')).toBeInTheDocument();
    expect(within(form).getByTestId('edit-wo-conversion')).toHaveTextContent('2 box = 3.000 kg');

    fireEvent.change(screen.getByTestId('edit-wo-quantity'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('edit-wo-submit'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ id: 'wo-1', plannedQuantity: '6' });
  });
});

describe('WO dependency direction badges (C064)', () => {
  const ROOT_ID = 'root-wo-id';
  const CHILD_ID = 'child-wo-id';

  async function openDependenciesTab(wo: Wo) {
    const user = userEvent.setup();
    renderDetail({ wo });
    await user.click(screen.getByTestId('wo-tab-dependencies'));
    return screen.findByTestId('wo-dependencies-table');
  }

  it('labels a WIP child as upstream when the current WO is the consuming FG parent', async () => {
    const table = await openDependenciesTab(makeWo({
      id: ROOT_ID,
      dependencies: [{
        id: 'dep-1',
        parentWoId: ROOT_ID,
        childWoId: CHILD_ID,
        materialLink: 'mat-1',
        requiredQty: '25.452',
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
    }));
    expect(within(table).getByText('upstream')).toBeInTheDocument();
    expect(within(table).queryByText('downstream')).not.toBeInTheDocument();
    expect(within(table).getByText(CHILD_ID.slice(0, 8))).toBeInTheDocument();
  });

  it('labels the consuming FG root as downstream when the current WO is the WIP child', async () => {
    const table = await openDependenciesTab(makeWo({
      id: CHILD_ID,
      dependencies: [{
        id: 'dep-1',
        parentWoId: ROOT_ID,
        childWoId: CHILD_ID,
        materialLink: 'mat-1',
        requiredQty: '25.452',
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
    }));
    expect(within(table).getByText('downstream')).toBeInTheDocument();
    expect(within(table).queryByText('upstream')).not.toBeInTheDocument();
    expect(within(table).getByText(ROOT_ID.slice(0, 8))).toBeInTheDocument();
  });
});

describe('WO detail summary — line resolves to a human label, never a raw UUID (parity: wo-detail.jsx:60 {w.lineCode})', () => {
  it('renders the production line CODE in the summary, not the productionLineId UUID', () => {
    renderDetail();
    const summary = screen.getByTestId('wo-detail-summary');
    // resources.lines = [{ id: 'line-1', code: 'L1', name: 'Line One' }]; makeWo().productionLineId === 'line-1'.
    expect(within(summary).getByText('L1')).toBeInTheDocument();
    // The raw UUID must NOT leak into the rendered Line cell.
    expect(within(summary).queryByText('line-1')).not.toBeInTheDocument();
  });

  it('falls back to em-dash when the WO has no production line', () => {
    renderDetail({ wo: makeWo({ productionLineId: null }) });
    const summary = screen.getByTestId('wo-detail-summary');
    expect(within(summary).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the raw id only when the line is not in the loaded resources (honest fallback)', () => {
    renderDetail({ wo: makeWo({ productionLineId: 'unknown-line-xyz' }) });
    const summary = screen.getByTestId('wo-detail-summary');
    expect(within(summary).getByText('unknown-line-xyz')).toBeInTheDocument();
  });
});

describe('WoDetailView — draft Release action (C066)', () => {
  it('shows Release only on DRAFT work orders', () => {
    renderDetail({ wo: makeWo({ status: 'DRAFT' }) });
    expect(screen.getByTestId('wo-detail-release')).toBeInTheDocument();
    expect(screen.getByTestId('wo-detail-release')).toHaveTextContent('Release');
  });

  it('hides Release on non-draft work orders', () => {
    renderDetail({ wo: makeWo({ status: 'RELEASED' }) });
    expect(screen.queryByTestId('wo-detail-release')).toBeNull();
  });

  it('confirms then calls releaseWorkOrderAction and refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const release = vi.fn<[], Promise<ReleaseWorkOrderResult>>().mockResolvedValue({ ok: true, workOrder: {} as any });
    renderDetail({ release });

    fireEvent.click(screen.getByTestId('wo-detail-release'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(release).toHaveBeenCalledWith({ id: 'wo-1' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
