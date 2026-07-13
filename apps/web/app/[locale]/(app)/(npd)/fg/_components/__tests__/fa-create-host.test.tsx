/**
 * @vitest-environment jsdom
 * G-1 fix — FA create wiring test (RED → GREEN).
 *
 * Closes G-1: the "+ Create FG" button was DEAD (FaCreateModal had zero
 * consumers). Asserts the full wiring:
 *  - the FG list "+ Create FG" button pushes `?modal=faCreate` (opens the modal);
 *  - the FaCreateModalHost reads `?modal=faCreate` and renders FaCreateModal;
 *  - a valid submit calls the injected createFa action and, on success,
 *    navigates to the canonical FG detail route `/{locale}/fg/{code}`;
 *  - a DuplicateError surfaces a destructive Alert and does NOT navigate;
 *  - RBAC: the button is hidden when canCreate is false (no render-then-disable),
 *    and the action is absent on the host (Create disabled) when forbidden.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:9-43 (FACreateModal)
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:204 openModal("faCreate")
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// next/navigation is driven by both the list button and the modal host.
const pushMock = vi.fn();
let currentParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/fg',
  useSearchParams: () => currentParams,
}));

import { FaCreateModalHost } from '../fa-create-modal-host';
import { FaListTable, type FaListLabels, type FaListRow } from '../fa-list-table';
import type { FaCreateLabels } from '../../../../../../(npd)/fa/_components/fa-create-modal';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
  currentParams = new URLSearchParams();
});

const MODAL_LABELS: FaCreateLabels = {
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

const LIST_LABELS: FaListLabels = new Proxy(
  { createFa: 'lbl.createFa' } as Partial<FaListLabels>,
  { get: (target, prop: string) => (prop in target ? (target as Record<string, string>)[prop] : `lbl.${prop}`) },
) as FaListLabels;

const ROWS: FaListRow[] = [];

describe('G-1 — "+ Create FG" button opens the modal (trigger)', () => {
  it('pushes ?modal=faCreate when the Create button is clicked', async () => {
    const user = userEvent.setup();
    render(<FaListTable rows={ROWS} labels={LIST_LABELS} canCreate state="empty" />);
    await user.click(screen.getByRole('button', { name: LIST_LABELS.createFa }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(String(pushMock.mock.calls[0][0])).toContain('modal=faCreate');
  });

  it('hides the Create button when canCreate is false (no render-then-disable)', () => {
    render(<FaListTable rows={ROWS} labels={LIST_LABELS} canCreate={false} state="empty" />);
    expect(screen.queryByRole('button', { name: LIST_LABELS.createFa })).toBeNull();
  });
});

describe('G-1 — FaCreateModalHost maps ?modal=faCreate to the modal', () => {
  it('renders the modal closed when ?modal is absent', () => {
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={action} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the modal open when ?modal=faCreate', () => {
    currentParams = new URLSearchParams('modal=faCreate');
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={action} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('G-1 — create → navigate', () => {
  it('calls createFa then navigates to /{locale}/fg/{code} on success', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={action} forceOpen />);

    const code = screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductName)), 'Pulled Chicken Shawarma');
    await user.click(screen.getByRole('button', { name: MODAL_LABELS.create }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ productCode: 'FA5609', productName: 'Pulled Chicken Shawarma' }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fg/FA5609'));
  });

  it('surfaces a destructive Alert and does NOT navigate on DuplicateError', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => {
      const err = new Error('dup') as Error & { code?: string };
      err.name = 'DuplicateError';
      err.code = 'DUPLICATE_PRODUCT_CODE';
      throw err;
    });
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={action} forceOpen />);

    const code = screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductName)), 'Duplicate code');
    await user.click(screen.getByRole('button', { name: MODAL_LABELS.create }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MODAL_LABELS.errorDuplicate);
    expect(pushMock).not.toHaveBeenCalled();
  });

  // BOUNDARY-SAFE duplicate: the production adapter RETURNS the duplicate as data
  // (a thrown custom error is flattened across the RSC→client boundary). The host
  // must show the friendly "already exists" Alert and NOT navigate.
  it('surfaces the friendly duplicate Alert and does NOT navigate when the action returns { ok:false, error:"already_exists" }', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ ok: false as const, error: 'already_exists' as const }));
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={action} forceOpen />);

    const code = screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(MODAL_LABELS.fieldProductName)), 'Duplicate code');
    await user.click(screen.getByRole('button', { name: MODAL_LABELS.create }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(MODAL_LABELS.errorDuplicate);
    expect(alert).not.toHaveTextContent(MODAL_LABELS.errorGeneric);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('G-1 — RBAC on the host (forbidden = no injected action)', () => {
  it('keeps Create disabled when no createFaAction is injected (forbidden)', () => {
    render(<FaCreateModalHost labels={MODAL_LABELS} createFaAction={undefined} forceOpen />);
    expect(screen.getByRole('button', { name: MODAL_LABELS.create })).toBeDisabled();
  });
});
