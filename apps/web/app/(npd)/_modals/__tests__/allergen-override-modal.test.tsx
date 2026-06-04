/**
 * @vitest-environment jsdom
 * T-040 — AllergenOverrideModal component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:389-428 (allergen_override_modal)
 *
 * Asserts:
 *  - Parity AC2: 3 controls — allergen (preselected, read-only), action selector
 *    (add=Include / remove=Exclude), reason Textarea — built from @monopilot/ui
 *    Modal + ReasonInput + Button (no raw <select>).
 *  - AC3: reason length 8 → Submit disabled + 'min 10' FormMessage visible; the
 *    setAllergenOverride Server Action is NOT invoked while reason < 10.
 *  - i18n: renders LABELS, never inline English literals.
 *  - Audit-trail Alert (prototype amber alert) surfaces.
 *  - Happy path: reason ≥10 → submit calls setAllergenOverride with the right shape.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AllergenOverrideModal,
  type AllergenOverrideLabels,
} from '../allergen-override-modal';

afterEach(() => cleanup());

const LABELS: AllergenOverrideLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  auditWarning: 'lbl.auditWarning',
  fieldAllergen: 'lbl.fieldAllergen',
  fieldCurrent: 'lbl.fieldCurrent',
  fieldAction: 'lbl.fieldAction',
  actionAdd: 'lbl.actionAdd',
  actionRemove: 'lbl.actionRemove',
  fieldReason: 'lbl.fieldReason',
  reasonPlaceholder: 'lbl.reasonPlaceholder',
  reasonTooShort: 'lbl.reasonTooShort',
  cancel: 'lbl.cancel',
  save: 'lbl.save',
  error: 'lbl.error',
  statusContains: 'lbl.statusContains',
  statusAbsent: 'lbl.statusAbsent',
};

function renderModal(overrides?: {
  setAllergenOverrideAction?: ReturnType<typeof vi.fn>;
  onClose?: () => void;
}) {
  const setAllergenOverrideAction = overrides?.setAllergenOverrideAction ?? vi.fn();
  const onClose = overrides?.onClose ?? vi.fn();
  render(
    <AllergenOverrideModal
      open
      productCode="FG-001"
      allergenCode="soybeans"
      allergenLabel="Soybeans"
      currentlyPresent={false}
      labels={LABELS}
      onClose={onClose}
      setAllergenOverrideAction={setAllergenOverrideAction}
    />,
  );
  return { setAllergenOverrideAction, onClose };
}

describe('AllergenOverrideModal — parity + validation', () => {
  it('renders the 3 controls + audit alert (parity AC2)', () => {
    renderModal();
    // allergen preselected + read-only.
    expect(screen.getByText(LABELS.fieldAllergen)).toBeInTheDocument();
    const allergenField = screen.getByTestId('override-allergen');
    expect(allergenField).toHaveValue('Soybeans');
    expect(allergenField).toHaveAttribute('readonly');

    // action selector (Include / Exclude) — no raw <select>.
    expect(screen.getByRole('button', { name: LABELS.actionAdd })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.actionRemove })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();

    // reason textarea.
    expect(screen.getByText(LABELS.fieldReason)).toBeInTheDocument();

    // audit-trail alert.
    expect(screen.getByText(LABELS.auditWarning)).toBeInTheDocument();
  });

  it('disables Save and shows min-10 message when reason length is 8 (AC3)', async () => {
    const { setAllergenOverrideAction } = renderModal();
    const user = userEvent.setup();
    const reason = screen.getByTestId('override-reason');
    await user.type(reason, '12345678'); // length 8

    const save = screen.getByRole('button', { name: LABELS.save });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    // Attempting to submit must NOT call the Server Action.
    fireEvent.submit(save.closest('form')!);
    await waitFor(() => {
      expect(screen.getByText(LABELS.reasonTooShort)).toBeInTheDocument();
    });
    expect(setAllergenOverrideAction).not.toHaveBeenCalled();
  });

  it('submits via setAllergenOverride when reason ≥10 (happy path)', async () => {
    const setAllergenOverrideAction = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    renderModal({ setAllergenOverrideAction, onClose });
    const user = userEvent.setup();

    // currentlyPresent=false → default action is "add" (Include). Provide valid reason.
    await user.type(screen.getByTestId('override-reason'), 'Lab confirmed cross-contact risk in line');

    fireEvent.submit(screen.getByRole('button', { name: LABELS.save }).closest('form')!);

    await waitFor(() => expect(setAllergenOverrideAction).toHaveBeenCalledTimes(1));
    expect(setAllergenOverrideAction).toHaveBeenCalledWith(
      'FG-001',
      'soybeans',
      'add',
      'Lab confirmed cross-contact risk in line',
    );
  });
});
