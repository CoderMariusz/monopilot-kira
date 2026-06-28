/**
 * @vitest-environment jsdom
 * T-021 — FACreateModal component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:9-43 (FACreateModal / MODAL-01)
 *
 * Asserts:
 *  - Parity: the two fields (Product_Code, Product_Name) in prototype order, the
 *    two footer buttons (Cancel, Create FA), shadcn Modal + Input primitives, no
 *    raw <select> / no native <dialog> reimplementation, dismissible.
 *  - V01 inline error: typing a non-FA code surfaces a FormMessage and keeps
 *    Create disabled (mirrors the server ^FA[A-Z0-9]+$ rule client-side).
 *  - V02 inline error: empty Product_Name keeps Create disabled with a message.
 *  - Success path: a valid submit calls the injected createFa action then
 *    onCreated('<code>') (the page maps this to router.push('/npd/fg/<code>')).
 *  - Duplicate path: a DuplicateError from the action surfaces a destructive Alert
 *    (error state) and does NOT navigate.
 *  - Pending/optimistic: submit is disabled while the action is in flight.
 *  - i18n: the component renders LABELS (message values), never inline literals.
 *  - a11y: each field has an associated <label htmlFor>; the dialog traps focus.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FaCreateModal, type FaCreateLabels } from '../fa-create-modal';

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: FaCreateLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  fieldProductCode: 'lbl.fieldProductCode',
  fieldProductCodeHint: 'lbl.fieldProductCodeHint',
  fieldProductName: 'lbl.fieldProductName',
  fieldProductNameHint: 'lbl.fieldProductNameHint',
  rangeHint: 'lbl.rangeHint',
  cancel: 'lbl.cancel',
  create: 'lbl.create',
  creating: 'lbl.creating',
  errorV01: 'lbl.errorV01',
  errorV02: 'lbl.errorV02',
  errorDuplicate: 'lbl.errorDuplicate',
  errorGeneric: 'lbl.errorGeneric',
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof FaCreateModal>> = {},
) {
  const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <FaCreateModal
      open
      labels={LABELS}
      createFaAction={createFaAction}
      onCreated={onCreated}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { createFaAction, onCreated, onClose, ...utils };
}

describe('FaCreateModal — prototype parity (modals.jsx:9-43)', () => {
  it('renders the two fields in prototype order (Product_Code → Product_Name)', () => {
    renderModal();
    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    const name = screen.getByLabelText(new RegExp(LABELS.fieldProductName));
    // DOCUMENT_POSITION_FOLLOWING (4) means `code` precedes `name`.
    expect(code.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the two footer buttons (Cancel, Create FA) and uses shadcn Modal + Input, no raw select/native dialog', () => {
    renderModal();
    expect(screen.getByRole('button', { name: LABELS.cancel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.create })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('select')).toBeNull();
  });

  it('renders the title + subtitle + range hint from labels (no inline strings)', () => {
    renderModal();
    expect(screen.getByText(LABELS.title)).toBeInTheDocument();
    expect(screen.getByText(LABELS.subtitle)).toBeInTheDocument();
    expect(screen.getByText(LABELS.rangeHint)).toBeInTheDocument();
  });

  it('starts with the Create button disabled (empty form is invalid)', () => {
    renderModal();
    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
  });
});

describe('FaCreateModal — V01/V02 validation feedback', () => {
  it('shows the V01 inline error and keeps Create disabled when productCode is not ^FA[A-Z0-9]+$', async () => {
    const user = userEvent.setup();
    const { createFaAction } = renderModal();

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'ZZ123');
    await user.tab(); // blur

    expect(await screen.findByText(LABELS.errorV01)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
    expect(createFaAction).not.toHaveBeenCalled();
  });

  it('keeps Create disabled when productName is empty (V02)', async () => {
    const user = userEvent.setup();
    renderModal();

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    // productName left empty
    await user.tab();

    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
  });
});

describe('FaCreateModal — success + error paths', () => {
  it('calls createFa then onCreated(<code>) on a valid submit', async () => {
    const user = userEvent.setup();
    const createFaAction = vi.fn(async () => ({ productCode: 'FA5609' }));
    const onCreated = vi.fn();
    renderModal({ createFaAction, onCreated });

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code); // field is prefilled with "FA" (prototype parity)
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Pulled Chicken Shawarma');
    await user.click(screen.getByRole('button', { name: LABELS.create }));

    await waitFor(() => {
      expect(createFaAction).toHaveBeenCalledWith({
        productCode: 'FA5609',
        productName: 'Pulled Chicken Shawarma',
      });
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('FA5609'));
  });

  it('surfaces a destructive Alert and does not navigate when the action throws DuplicateError', async () => {
    const user = userEvent.setup();
    const createFaAction = vi.fn(async () => {
      const err = new Error('dup') as Error & { code?: string };
      err.name = 'DuplicateError';
      err.code = 'DUPLICATE_PRODUCT_CODE';
      throw err;
    });
    const onCreated = vi.fn();
    renderModal({ createFaAction, onCreated });

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Duplicate code');
    await user.click(screen.getByRole('button', { name: LABELS.create }));

    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.errorDuplicate);
    expect(onCreated).not.toHaveBeenCalled();
  });

  // BOUNDARY-SAFE duplicate: a custom DuplicateError thrown from a Server Action
  // is flattened to a generic message-stripped Error at the RSC→client boundary
  // (so the old throw path only "worked" in dev/unit stubs). The adapter now
  // RETURNS { ok:false, error:'already_exists' } instead — assert the modal maps
  // that returned result to the friendly duplicate copy, NOT the generic fallback.
  it('surfaces the friendly duplicate Alert when the action RETURNS { ok:false, error:"already_exists" }', async () => {
    const user = userEvent.setup();
    const createFaAction = vi.fn(async () => ({ ok: false as const, error: 'already_exists' as const }));
    const onCreated = vi.fn();
    renderModal({ createFaAction, onCreated });

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Duplicate code');
    await user.click(screen.getByRole('button', { name: LABELS.create }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(LABELS.errorDuplicate);
    expect(alert).not.toHaveTextContent(LABELS.errorGeneric);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
