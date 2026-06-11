/**
 * @vitest-environment jsdom
 *
 * P0 UOM lane — Item Create wizard pack-hierarchy (migration 267).
 *
 * Prototype source (literal anchor, file length verified with
 *   `wc -l "prototypes/design/Monopilot Design System/technical/modals.jsx"` = 667):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:22-136
 *   (ProductCreateModal — Stepper + per-step Field grid + Summary review). The
 *   pack-hierarchy block extends the modal's "Weight & shelf life" step; no
 *   dedicated item-wizard prototype exists under prototypes/technical/.
 *
 * Asserts:
 *   - BASE/SECONDARY UoM are CLOSED Select dropdowns (no free-text input) offering
 *     exactly kg/g/l/ml/szt (szt labelled "pcs (each)"); secondary adds the empty —.
 *   - Output-unit Select offers Base / Each / Box.
 *   - Conditional reveal: 'each' shows Net content per each; 'box' adds Each per box;
 *     'base' shows neither.
 *   - Live conversion helper renders "1 box = 10 × 0.100 kg = 1.000 kg".
 *   - Client validation mirrors the DB CHECK: each ⇒ net>0; box ⇒ net>0 ∧ each_per_box>0
 *     (Next blocked + error shown).
 *   - Payload contract: createItem receives outputUom + netQtyPerEach + eachPerBox +
 *     boxesPerPallet; 'base' output omits the conversion fields.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const createItem = vi.fn();
const updateItem = vi.fn();
vi.mock('../../_actions/create-item', () => ({ createItem: (...a: unknown[]) => createItem(...a) }));
vi.mock('../../_actions/update-item', () => ({ updateItem: (...a: unknown[]) => updateItem(...a) }));

import { ItemWizard, DEFAULT_WIZARD_LABELS, emptyWizardForm } from '../item-create-wizard';

const L = DEFAULT_WIZARD_LABELS;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Seed onto the basic step (valid) and advance to the weight step. */
async function gotoWeight(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: L.next })); // → classification
  await user.click(screen.getByRole('button', { name: L.next })); // → weight
}

function renderWizard(initial?: Partial<ReturnType<typeof emptyWizardForm>>) {
  render(
    <ItemWizard
      open
      onClose={vi.fn()}
      mode={{ kind: 'create' }}
      initialForm={{ ...emptyWizardForm(), itemCode: 'FG-1', name: 'Kabanos', ...initial }}
    />,
  );
}

describe('UoM is a closed Select — no free text', () => {
  it('base UoM offers exactly kg/g/l/ml/szt (szt labelled "pcs (each)") and is a combobox, not a text input', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: L.next })); // → classification

    // No free-text input named uomBase/uomSecondary anywhere.
    expect(document.querySelector('input[name="uomBase"]')).toBeNull();
    expect(document.querySelector('input[name="uomSecondary"]')).toBeNull();

    const baseSelect = screen.getByRole('combobox', { name: L.fields.uomBase });
    await user.click(baseSelect);
    for (const u of ['kg', 'g', 'l', 'ml']) {
      expect(screen.getByRole('option', { name: u })).toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: 'pcs (each)' })).toBeInTheDocument();
    // The bug value "eac" is impossible — no such option.
    expect(screen.queryByRole('option', { name: 'eac' })).not.toBeInTheDocument();
  });

  it('secondary UoM offers the empty "—" option plus the canonical list', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: L.next })); // → classification
    const secSelect = screen.getByRole('combobox', { name: L.fields.uomSecondary });
    await user.click(secSelect);
    expect(screen.getByRole('option', { name: L.uomNone })).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'kg' }).length).toBeGreaterThan(0);
  });
});

describe('Packaging / output unit conditional fields', () => {
  it('base output shows no conversion fields', async () => {
    const user = userEvent.setup();
    renderWizard();
    await gotoWeight(user);
    expect(screen.queryByRole('spinbutton', { name: L.fields.netQtyPerEach })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: L.fields.eachPerBox })).not.toBeInTheDocument();
  });

  it('each output reveals Net content per each (but not Each per box)', async () => {
    const user = userEvent.setup();
    renderWizard();
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.each }));
    expect(screen.getByRole('spinbutton', { name: L.fields.netQtyPerEach })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: L.fields.eachPerBox })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.boxesPerPallet })).toBeInTheDocument();
  });

  it('box output reveals Net content per each AND Each per box', async () => {
    const user = userEvent.setup();
    renderWizard();
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.box }));
    expect(screen.getByRole('spinbutton', { name: L.fields.netQtyPerEach })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.eachPerBox })).toBeInTheDocument();
  });

  it('renders the live conversion helper for a box (1 box = 10 × 0.100 kg = 1.000 kg)', async () => {
    const user = userEvent.setup();
    renderWizard({ uomBase: 'kg' });
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.box }));
    await user.type(screen.getByRole('spinbutton', { name: L.fields.netQtyPerEach }), '0.1');
    await user.type(screen.getByRole('spinbutton', { name: L.fields.eachPerBox }), '10');
    const hint = document.querySelector('[data-conversion-hint]');
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent('1 Box = 10 × 0.100 kg = 1.000 kg');
  });
});

describe('Client validation mirrors the DB CHECK', () => {
  it('blocks Next when output=each and net is empty', async () => {
    const user = userEvent.setup();
    renderWizard();
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.each }));
    await user.click(screen.getByRole('button', { name: L.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.errors.netRequired);
    // still on weight step (output-unit combobox visible)
    expect(screen.getByRole('combobox', { name: L.fields.outputUom })).toBeInTheDocument();
  });

  it('blocks Next when output=box, net set but each_per_box empty', async () => {
    const user = userEvent.setup();
    renderWizard();
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.box }));
    await user.type(screen.getByRole('spinbutton', { name: L.fields.netQtyPerEach }), '0.1');
    await user.click(screen.getByRole('button', { name: L.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.errors.eachPerBoxRequired);
  });
});

describe('Payload contract', () => {
  it('sends the full box pack hierarchy to createItem', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'FG-1' } });
    renderWizard({ uomBase: 'kg' });
    await gotoWeight(user);
    await user.click(screen.getByRole('combobox', { name: L.fields.outputUom }));
    await user.click(screen.getByRole('option', { name: L.outputUomLabels.box }));
    await user.type(screen.getByRole('spinbutton', { name: L.fields.netQtyPerEach }), '0.1');
    await user.type(screen.getByRole('spinbutton', { name: L.fields.eachPerBox }), '10');
    await user.type(screen.getByRole('spinbutton', { name: L.fields.boxesPerPallet }), '48');
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({
      itemCode: 'FG-1',
      uomBase: 'kg',
      outputUom: 'box',
      netQtyPerEach: 0.1,
      eachPerBox: 10,
      boxesPerPallet: 48,
    });
  });

  it('omits conversion fields for base output (undefined, not 0)', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'FG-1' } });
    renderWizard();
    await gotoWeight(user);
    await user.click(screen.getByRole('button', { name: L.next })); // → review (base, valid)
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    const payload = createItem.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.outputUom).toBe('base');
    expect(payload.netQtyPerEach).toBeUndefined();
    expect(payload.eachPerBox).toBeUndefined();
    expect(payload.boxesPerPallet).toBeUndefined();
  });
});
