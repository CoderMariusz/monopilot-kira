/**
 * @vitest-environment jsdom
 *
 * FgCandidateModal — RED → GREEN component test.
 *
 * Wires the existing-but-unused createOrMapFgCandidateAtG3 Server Action to a real
 * UI (owner "Finished Good not found" dead-end fix). The modal implements the
 * owner-decided ASK-with-suggested-code UX:
 *   - mode toggle Create new FG (default) vs Link existing FG
 *   - Create mode: code input PRE-FILLED with the suggested `FG-{projectCode}`,
 *     editable (never silent)
 *   - Link mode: code input for an existing FG/product code
 *   - submit → createOrMapFgCandidateAtG3({ projectId, mode, productCode })
 *   - success → onCreated(returnedProductCode) (host maps to router.push /fa/<code>)
 *   - error → inline friendly message mapped from the action's error code (never throw)
 *
 * Asserts parity + all the states required by UI-PROTOTYPE-PARITY-POLICY:
 *   loading/pending (optimistic), error, permission-denied, i18n (labels only),
 *   plus the suggested-code prefill + the create/map mode toggle.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FgCandidateModal,
  type FgCandidateLabels,
  type CreateOrMapFgCandidateAction,
} from '../fg-candidate-modal';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: FgCandidateLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  modeCreate: 'lbl.modeCreate',
  modeMap: 'lbl.modeMap',
  fieldCreateCode: 'lbl.fieldCreateCode',
  fieldCreateCodeHint: 'lbl.fieldCreateCodeHint',
  fieldMapCode: 'lbl.fieldMapCode',
  fieldMapCodeHint: 'lbl.fieldMapCodeHint',
  cancel: 'lbl.cancel',
  submitCreate: 'lbl.submitCreate',
  submitMap: 'lbl.submitMap',
  submitting: 'lbl.submitting',
  errorInvalidInput: 'lbl.errorInvalidInput',
  errorG3Only: 'lbl.errorG3Only',
  errorFgAlreadyLinked: 'lbl.errorFgAlreadyLinked',
  errorForbidden: 'lbl.errorForbidden',
  errorNotFound: 'lbl.errorNotFound',
  errorGeneric: 'lbl.errorGeneric',
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof FgCandidateModal>> = {},
) {
  const action: CreateOrMapFgCandidateAction = vi.fn(async () => ({
    ok: true as const,
    data: { projectId: 'p1', productCode: 'FG-NPD-100', created: true, mapped: true },
  }));
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <FgCandidateModal
      open
      projectId="11111111-1111-4111-8111-111111111111"
      projectCode="NPD-100"
      suggestedCode="FG-NPD-100"
      labels={LABELS}
      action={action}
      onCreated={onCreated}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { action, onCreated, onClose, ...utils };
}

describe('FgCandidateModal — parity + structure', () => {
  it('uses the shadcn Modal primitive (no raw select / native dialog) and renders labels not inline strings', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('select')).toBeNull();
    expect(screen.getByText(LABELS.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.subtitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.cancel })).toBeInTheDocument();
  });

  it('defaults to Create mode and pre-fills the code input with the suggested FG-{projectCode}', () => {
    renderModal();
    const code = screen.getByLabelText(new RegExp(LABELS.fieldCreateCode)) as HTMLInputElement;
    expect(code.value).toBe('FG-NPD-100');
    // Create submit visible by default.
    expect(screen.getByRole('button', { name: LABELS.submitCreate })).toBeInTheDocument();
  });

  it('switches to Link mode and shows the existing-code field + Map submit', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('radio', { name: LABELS.modeMap }));
    expect(screen.getByLabelText(new RegExp(LABELS.fieldMapCode))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.submitMap })).toBeInTheDocument();
  });
});

describe('FgCandidateModal — submit + success', () => {
  it('Create mode calls the action with { mode: create, productCode } and onCreated(<code>)', async () => {
    const user = userEvent.setup();
    const action: CreateOrMapFgCandidateAction = vi.fn(async () => ({
      ok: true as const,
      data: { projectId: 'p1', productCode: 'FG-EDITED', created: true, mapped: true },
    }));
    const onCreated = vi.fn();
    renderModal({ action, onCreated });

    const code = screen.getByLabelText(new RegExp(LABELS.fieldCreateCode));
    await user.clear(code);
    await user.type(code, 'FG-EDITED');
    await user.click(screen.getByRole('button', { name: LABELS.submitCreate }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        projectId: '11111111-1111-4111-8111-111111111111',
        mode: 'create',
        productCode: 'FG-EDITED',
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('FG-EDITED'));
  });

  it('Link mode calls the action with { mode: map, productCode }', async () => {
    const user = userEvent.setup();
    const action: CreateOrMapFgCandidateAction = vi.fn(async () => ({
      ok: true as const,
      data: { projectId: 'p1', productCode: 'FA5609', created: false, mapped: true },
    }));
    renderModal({ action });

    await user.click(screen.getByRole('radio', { name: LABELS.modeMap }));
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldMapCode)), 'FA5609');
    await user.click(screen.getByRole('button', { name: LABELS.submitMap }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        projectId: '11111111-1111-4111-8111-111111111111',
        mode: 'map',
        productCode: 'FA5609',
      }),
    );
  });
});

describe('FgCandidateModal — error mapping (never throws)', () => {
  it('maps FG_ALREADY_LINKED to a friendly inline message and does not navigate', async () => {
    const user = userEvent.setup();
    const action: CreateOrMapFgCandidateAction = vi.fn(async () => ({
      ok: false as const,
      error: 'FG_ALREADY_LINKED',
      status: 409,
    }));
    const onCreated = vi.fn();
    renderModal({ action, onCreated });

    await user.click(screen.getByRole('button', { name: LABELS.submitCreate }));

    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.errorFgAlreadyLinked);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('maps G3_ONLY to a friendly inline message', async () => {
    const user = userEvent.setup();
    const action: CreateOrMapFgCandidateAction = vi.fn(async () => ({
      ok: false as const,
      error: 'G3_ONLY',
      status: 409,
    }));
    renderModal({ action });
    await user.click(screen.getByRole('button', { name: LABELS.submitCreate }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.errorG3Only);
  });

  it('falls back to the generic error for an unknown code and surfaces a thrown error too', async () => {
    const user = userEvent.setup();
    const action: CreateOrMapFgCandidateAction = vi.fn(async () => {
      throw new Error('boom');
    });
    renderModal({ action });
    await user.click(screen.getByRole('button', { name: LABELS.submitCreate }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.errorGeneric);
  });
});

describe('FgCandidateModal — permission-denied + pending states', () => {
  it('disables submit when no action is injected (RBAC: server did not grant it)', () => {
    renderModal({ action: undefined });
    expect(screen.getByRole('button', { name: LABELS.submitCreate })).toBeDisabled();
  });

  it('shows the pending label and disables submit while the action is in flight', async () => {
    const user = userEvent.setup();
    let resolve: (v: { ok: true; data: { projectId: string; productCode: string; created: boolean; mapped: boolean } }) => void = () => {};
    const action: CreateOrMapFgCandidateAction = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderModal({ action });

    await user.click(screen.getByRole('button', { name: LABELS.submitCreate }));
    expect(await screen.findByRole('button', { name: LABELS.submitting })).toBeDisabled();

    resolve({ ok: true, data: { projectId: 'p1', productCode: 'FG-NPD-100', created: true, mapped: true } });
  });
});
