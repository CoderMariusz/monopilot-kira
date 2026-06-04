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
vi.mock('../../_actions/create-item', () => ({ createItem: (...a: unknown[]) => createItem(...a) }));
vi.mock('../../_actions/update-item', () => ({ updateItem: (...a: unknown[]) => updateItem(...a) }));

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

describe('ItemWizard create mode (TEC-011)', () => {
  it('renders a labelled dialog with a 4-step tablist', () => {
    render(<ItemWizard open onClose={vi.fn()} mode={{ kind: 'create' }} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent(L.steps.basic);
    expect(tabs[3]).toHaveTextContent(L.steps.review);
  });

  it('blocks Next on the basic step until code + name are present', async () => {
    const user = userEvent.setup();
    render(<ItemWizard open onClose={vi.fn()} mode={{ kind: 'create' }} />);
    await user.click(screen.getByRole('button', { name: L.next }));
    expect(await screen.findByRole('alert')).toHaveTextContent(L.errors.codeRequired);
  });

  it('reveals catch-weight fields when weight_mode = catch', async () => {
    const user = userEvent.setup();
    render(<ItemWizard open onClose={vi.fn()} mode={{ kind: 'create' }} />);
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('button', { name: L.next })); // → weight

    // initially fixed → no catch reveal
    expect(screen.queryByRole('spinbutton', { name: L.fields.nominalWeight })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: L.fields.weightMode }));
    await user.click(screen.getByRole('option', { name: 'Catch weight' }));

    expect(screen.getByText(L.catchHint)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.nominalWeight })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.grossWeightMax })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: L.fields.varianceTolerance })).toBeInTheDocument();
  });

  it('submits createItem with the assembled payload from the review step', async () => {
    const user = userEvent.setup();
    createItem.mockResolvedValue({ ok: true, data: { id: 'x', itemCode: 'RM-2002' } });
    render(<ItemWizard open onClose={vi.fn()} mode={{ kind: 'create' }} />);
    await fillBasicAndAdvance(user); // → classification
    await user.click(screen.getByRole('button', { name: L.next })); // → weight
    await user.click(screen.getByRole('button', { name: L.next })); // → review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(createItem).toHaveBeenCalledTimes(1);
    expect(createItem.mock.calls[0][0]).toMatchObject({
      itemCode: 'RM-2002',
      name: 'Cure salt',
      itemType: 'rm',
      uomBase: 'kg',
      weightMode: 'fixed',
    });
  });
});

describe('ItemWizard edit mode (TEC-013 reuse)', () => {
  it('uses updateItem and renders the code as read-only', async () => {
    const user = userEvent.setup();
    updateItem.mockResolvedValue({ ok: true, data: { id: 'abc' } });
    const initial = { ...emptyWizardForm(), itemCode: 'RM-9', name: 'Existing' };
    render(
      <ItemWizard
        open
        onClose={vi.fn()}
        mode={{ kind: 'edit', itemId: 'abc-id' }}
        initialForm={initial}
      />,
    );
    // code is read-only on the basic step
    const codeInput = screen.getByDisplayValue('RM-9');
    expect(codeInput).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: L.next })); // classification
    await user.click(screen.getByRole('button', { name: L.next })); // weight
    await user.click(screen.getByRole('button', { name: L.next })); // review
    await user.click(screen.getByRole('button', { name: L.create }));

    expect(updateItem).toHaveBeenCalledTimes(1);
    expect(updateItem.mock.calls[0][0]).toMatchObject({ id: 'abc-id', name: 'Existing' });
  });
});
