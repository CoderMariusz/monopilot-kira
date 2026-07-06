/**
 * @vitest-environment jsdom
 *
 * T-033 — TEC-011 Item Create Wizard (4-step) RTL tests (RED-first).
 *
 * Prototype source (literal anchor, verified with `wc -l "…/technical/modals.jsx"` = 656):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:22-136
 *   (ProductCreateModal — Stepper + per-step fields + Summary review + foot
 *   Next/Back/Cancel/Create). PRD TEC-011 (docs/prd/03-TECHNICAL-PRD.md:629):
 *   4 steps = basic + classification + weight mode + review.
 *
 * Parity + behaviour checklist:
 *   - role="dialog" + aria-modal + labelled title; role="tablist" stepper with 4 tabs.
 *   - Next gated by basic-step validation (code + name + uom required).
 *   - weight step: choosing weight_mode='catch' reveals nominal/gross/variance fields (V-TEC-02).
 *   - review step shows a summary + Create button.
 *   - createItem Server Action invoked with the assembled payload on submit (create mode).
 *   - updateItem invoked in edit mode; item code field is read-only.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const createItem = vi.fn();
const updateItem = vi.fn();
const createItemSupplierSpec = vi.fn();
vi.mock('../../_actions/create-item', () => ({ createItem: (...a: unknown[]) => createItem(...a) }));
vi.mock('../../_actions/update-item', () => ({ updateItem: (...a: unknown[]) => updateItem(...a) }));
vi.mock('../../_actions/supplier-spec-actions', () => ({
  createItemSupplierSpec: (...a: unknown[]) => createItemSupplierSpec(...a),
}));

import { ItemWizard, DEFAULT_WIZARD_LABELS, emptyWizardForm } from '../item-create-wizard';

const L = DEFAULT_WIZARD_LABELS;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function inputByName(name: string): HTMLInputElement {
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"]`);
  return el as HTMLInputElement;
}

async function fillBasicAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(inputByName('itemCode'), 'RM-2002');
  await user.type(inputByName('name'), 'Cure salt');
  await user.click(screen.getByRole('button', { name: L.next }));
}

function renderWizard(props: React.ComponentProps<typeof ItemWizard>) {
  return render(React.createElement(ItemWizard, props));
}

describe('ItemWizard create mode (TEC-011)', () => {
  it('renders a labelled dialog with a 4-step tablist', () => {
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent(L.steps.basic);
    expect(tabs[3]).toHaveTextContent(L.steps.review);
  });

  it('blocks Next on the basic step until code + name are present', async () => {
    const user = userEvent.setup();
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    await user.click(screen.getByRole('button', { name: L.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.errors.codeRequired);
  });

  it('offers Co-product and By-product in the item-type dropdown (legal per mig 248/255)', async () => {
    const user = userEvent.setup();
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('combobox', { name: L.fields.itemType }));
    expect(screen.getByRole('option', { name: L.typeLabels.co_product })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: L.typeLabels.byproduct })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: L.typeLabels.packaging })).toBeInTheDocument();
    // and selecting co_product sticks
    await user.click(screen.getByRole('option', { name: L.typeLabels.co_product }));
    expect(screen.getByRole('combobox', { name: L.fields.itemType })).toHaveTextContent(L.typeLabels.co_product);
  });

  it('includes all item status values in create mode', async () => {
    const user = userEvent.setup();
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    await fillBasicAndAdvance(user); // → classification

    await user.click(screen.getByRole('combobox', { name: L.fields.status }));

    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Blocked' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deprecated' })).toBeInTheDocument();
  });

  it('reveals catch-weight fields when weight_mode = catch', async () => {
    const user = userEvent.setup();
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('button', { name: L.next })); // → weight

    // initially fixed → no catch reveal
    expect(screen.queryByRole('spinbutton', { name: L.fields.nominalWeight })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: L.fields.weightMode }));
    await user.click(screen.getByRole('option', { name: 'Catch weight' }));

    expect(screen.getByText(L.catchHint)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.nominalWeight })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.varianceTolerance })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: L.fields.tareWeight })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: L.fields.grossWeightMax })).not.toBeInTheDocument();
  });

  it('renders an OPTIONAL supplier dropdown in the classification step, populated from threaded options', async () => {
    const user = userEvent.setup();
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'create' },
      supplierOptions: [
        { value: 'SUP-001', label: 'SUP-001 — Acme Foods' },
        { value: 'SUP-002', label: 'SUP-002 — Bravo Spices' },
      ],
    });
    await fillBasicAndAdvance(user); // → classification

    const supplierField = screen.getByRole('combobox', { name: L.fields.supplier });
    expect(supplierField).toBeInTheDocument();
    // helper hint rendered under the field
    expect(screen.getByText(L.fields.supplierHelp)).toBeInTheDocument();

    await user.click(supplierField);
    // the empty "none" option + the two threaded suppliers
    expect(screen.getByRole('option', { name: L.supplierNone })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SUP-001 — Acme Foods' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SUP-002 — Bravo Spices' })).toBeInTheDocument();
  });

  it('passes the selected supplier CODE (not name/id) in the createItem payload', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'RM-2002' } });
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'create' },
      supplierOptions: [{ value: 'SUP-001', label: 'SUP-001 — Acme Foods' }],
    });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('combobox', { name: L.fields.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-001 — Acme Foods' }));
    await user.click(screen.getByRole('button', { name: L.next })); // → weight
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({ itemCode: 'RM-2002', supplierCode: 'SUP-001' });
  });

  it('omits supplierCode when no supplier is selected', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'RM-2002' } });
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'create' },
      supplierOptions: [{ value: 'SUP-001', label: 'SUP-001 — Acme Foods' }],
    });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('button', { name: L.next })); // → weight
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).not.toHaveProperty('supplierCode');
  });

  it('submits createItem with the assembled payload from the review step', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'RM-2002' } });
    renderWizard({ open: true, onClose: vi.fn(), mode: { kind: 'create' } });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('button', { name: L.next })); // → weight
    await user.type(screen.getByLabelText(L.fields.gs1Gtin), '01234567890123');
    await user.click(screen.getByRole('combobox', { name: L.fields.weightMode }));
    await user.click(screen.getByRole('option', { name: 'Catch weight' }));
    await user.type(screen.getByRole('spinbutton', { name: L.fields.nominalWeight }), '0.2500');
    await user.type(screen.getByRole('spinbutton', { name: L.fields.varianceTolerance }), '5');
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({
      itemCode: 'RM-2002',
      name: 'Cure salt',
      itemType: 'rm',
      uomBase: 'kg',
      weightMode: 'catch',
      gs1Gtin: '01234567890123',
      nominalWeight: 0.25,
      varianceTolerancePct: 5,
    });
  });

  // F5 — a successful create (WITH a supplier attached) must surface NO error and
  // close the modal. createItem is the single atomic write (it also creates the
  // approved supplier_spec), so the wizard must NOT fire a redundant second
  // createItemSupplierSpec whose failure previously false-errored an already-
  // succeeded create.
  it('closes with no error on a successful create + supplier, and makes no redundant spec write (F5)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'RM-2002' } });
    // If the wizard wrongly called this and it "failed", the old code surfaced a
    // false generic error. Make it fail to prove the wizard no longer calls it.
    createItemSupplierSpec.mockResolvedValue({ ok: false, error: 'item_not_found' });
    renderWizard({
      open: true,
      onClose,
      onSaved,
      mode: { kind: 'create' },
      supplierOptions: [{ value: 'SUP-001', label: 'SUP-001 — Acme Foods' }],
      supplierIdByCode: { 'SUP-001': '00000000-0000-4000-8000-000000000001' },
    });
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('combobox', { name: L.fields.supplier }));
    await user.click(screen.getByRole('option', { name: 'SUP-001 — Acme Foods' }));
    await user.click(screen.getByRole('button', { name: L.next })); // → weight
    await user.type(inputByName('supplierUnitPrice'), '5.20');
    await user.type(inputByName('listPriceGbp'), '12.50');
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({
      supplierCode: 'SUP-001',
      supplierUnitPrice: 5.2,
      listPriceGbp: 12.5,
    });
    // No redundant post-success spec write on the create path.
    expect(createItemSupplierSpec).not.toHaveBeenCalled();
    // No false error surfaced.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Modal-close signal fired.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('ItemWizard edit mode (TEC-013 reuse)', () => {
  it('uses updateItem and renders the code as read-only', async () => {
    const user = userEvent.setup();
    updateItem.mockResolvedValue({ ok: true, data: { id: 'abc' } });
    const initial = {
      ...emptyWizardForm(),
      itemCode: 'RM-9',
      name: 'Existing',
      weightMode: 'catch' as const,
      nominalWeight: '0.2500',
      gs1Gtin: '01234567890123',
    };
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'edit', itemId: 'abc-id' },
      initialForm: initial,
    });
    // code is read-only on the basic step
    const codeInput = screen.getByDisplayValue('RM-9');
    expect(codeInput).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: L.next })); // classification
    await user.click(screen.getByRole('button', { name: L.next })); // weight
    await user.click(screen.getByRole('button', { name: L.next })); // review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem.mock.calls[0][0]).toMatchObject({
      id: 'abc-id',
      name: 'Existing',
      nominalWeight: 0.25,
      gs1Gtin: '01234567890123',
    });
  });

  it('excludes blocked from the status dropdown when editing a non-blocked item', async () => {
    const user = userEvent.setup();
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'edit', itemId: 'abc-id' },
      initialForm: { ...emptyWizardForm(), itemCode: 'RM-9', name: 'Existing', status: 'active' },
    });

    await user.click(screen.getByRole('button', { name: L.next })); // classification
    await user.click(screen.getByRole('combobox', { name: L.fields.status }));

    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Blocked' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deprecated' })).toBeInTheDocument();
  });

  it('keeps blocked in the status dropdown when editing a blocked item', async () => {
    const user = userEvent.setup();
    renderWizard({
      open: true,
      onClose: vi.fn(),
      mode: { kind: 'edit', itemId: 'abc-id' },
      initialForm: { ...emptyWizardForm(), itemCode: 'RM-9', name: 'Existing', status: 'blocked' },
    });

    await user.click(screen.getByRole('button', { name: L.next })); // classification
    await user.click(screen.getByRole('combobox', { name: L.fields.status }));

    expect(screen.getByRole('option', { name: 'Blocked' })).toBeInTheDocument();
  });
});
