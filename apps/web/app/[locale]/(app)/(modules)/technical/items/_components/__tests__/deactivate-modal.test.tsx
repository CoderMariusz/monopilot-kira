/**
 * @vitest-environment jsdom
 *
 * T-035 — TEC-081 Item Deactivate modal RTL tests (RED-first).
 *
 * Prototype source (literal anchor, verified with `wc -l "…/technical/modals.jsx"` = 656):
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:138-163
 *   (ArchiveProductModal — red warning banner, required Reason, confirm gate).
 *   PRD TEC-081 (docs/prd/03-TECHNICAL-PRD.md:650 / V-TEC-05): reason enum
 *   {Discontinued, Recipe Change, D365 Mismatch, Other}, notes required on Other.
 *
 * Parity + behaviour checklist:
 *   - role="dialog" + aria-modal + labelled title; red warning banner naming the item.
 *   - Reason Select with the four enum options; confirm disabled until reason + code match.
 *   - reason='other' reveals a Notes field; confirm stays blocked until ≥10 chars.
 *   - Type-to-confirm: confirm enabled only when the typed code === item code.
 *   - deactivateItem Server Action invoked with { id, reason, notes } on confirm.
 *   - permission/error path: action error renders role="alert".
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const deactivateItem = vi.fn();
vi.mock('../../_actions/deactivate-item', () => ({
  deactivateItem: (...args: unknown[]) => deactivateItem(...args),
}));

import { DeactivateItemModal, DEFAULT_DEACTIVATE_LABELS } from '../deactivate-modal';

function inputByName(name: string): HTMLInputElement {
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"]`);
  return el as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(props?: Partial<React.ComponentProps<typeof DeactivateItemModal>>) {
  return render(
    <DeactivateItemModal
      open
      onClose={vi.fn()}
      itemId="11111111-1111-1111-1111-111111111111"
      itemCode="RM-1001"
      itemName="Pork shoulder"
      {...props}
    />,
  );
}

describe('DeactivateItemModal (TEC-081)', () => {
  it('renders a labelled dialog with the warning banner naming the item', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-modal-id', 'TEC-081');
    expect(screen.getByRole('heading', { name: DEFAULT_DEACTIVATE_LABELS.title })).toBeInTheDocument();
    expect(screen.getByText(/Pork shoulder/)).toBeInTheDocument();
  });

  it('keeps confirm disabled until a reason is picked AND the code is typed', async () => {
    const user = userEvent.setup();
    renderModal();
    const confirm = screen.getByRole('button', { name: DEFAULT_DEACTIVATE_LABELS.confirm });
    expect(confirm).toBeDisabled();

    // pick a reason
    await user.click(screen.getByRole('combobox', { name: DEFAULT_DEACTIVATE_LABELS.reason }));
    await user.click(screen.getByRole('option', { name: DEFAULT_DEACTIVATE_LABELS.reasons.discontinued }));
    // still blocked — code not typed
    expect(confirm).toBeDisabled();

    // type the exact code
    await user.type(screen.getByRole('textbox'), 'RM-1001');
    expect(confirm).toBeEnabled();
  });

  it('requires ≥10-char notes when reason is Other', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('combobox', { name: DEFAULT_DEACTIVATE_LABELS.reason }));
    await user.click(screen.getByRole('option', { name: DEFAULT_DEACTIVATE_LABELS.reasons.other }));

    // notes field appears (reason = other)
    const notes = inputByName('notes');
    const codeBox = inputByName('confirmCode');
    await user.type(codeBox, 'RM-1001');
    const confirm = screen.getByRole('button', { name: DEFAULT_DEACTIVATE_LABELS.confirm });
    expect(confirm).toBeDisabled(); // notes empty

    await user.type(notes, 'short');
    expect(confirm).toBeDisabled(); // <10

    await user.type(notes, ' but now long enough');
    expect(confirm).toBeEnabled();
  });

  it('invokes deactivateItem with id + reason + notes on confirm', async () => {
    const user = userEvent.setup();
    deactivateItem.mockResolvedValue({ ok: true, data: { id: 'x', status: 'blocked' } });
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('combobox', { name: DEFAULT_DEACTIVATE_LABELS.reason }));
    await user.click(screen.getByRole('option', { name: DEFAULT_DEACTIVATE_LABELS.reasons.recipe_change }));
    await user.type(screen.getByRole('textbox'), 'RM-1001');
    await user.click(screen.getByRole('button', { name: DEFAULT_DEACTIVATE_LABELS.confirm }));

    expect(deactivateItem).toHaveBeenCalledWith({
      id: '11111111-1111-1111-1111-111111111111',
      reason: 'recipe_change',
      notes: undefined,
    });
  });

  it('surfaces an action error as role=alert', async () => {
    const user = userEvent.setup();
    deactivateItem.mockResolvedValue({ ok: false, error: 'forbidden' });
    renderModal();

    await user.click(screen.getByRole('combobox', { name: DEFAULT_DEACTIVATE_LABELS.reason }));
    await user.click(screen.getByRole('option', { name: DEFAULT_DEACTIVATE_LABELS.reasons.discontinued }));
    await user.type(screen.getByRole('textbox'), 'RM-1001');
    await user.click(screen.getByRole('button', { name: DEFAULT_DEACTIVATE_LABELS.confirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      DEFAULT_DEACTIVATE_LABELS.actionErrors.forbidden,
    );
  });
});
