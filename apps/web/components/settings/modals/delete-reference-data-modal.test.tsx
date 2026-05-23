/**
 * T-056 / SM-10 — DeleteReferenceDataModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:513-532
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type ReferenceDataRow = {
  id: string;
  code: string;
  name?: string;
  name_en?: string;
};

type DeleteReferenceDataPrecheck = {
  affected_count: number;
};

type DeleteReferenceDataResult =
  | { ok: true }
  | { ok: false; error: 'REFERENCE_IN_USE' | 'PERMISSION_DENIED' | string };

type DeleteReferenceDataModalProps = {
  open: boolean;
  table: string;
  row: ReferenceDataRow;
  precheckDeleteReferenceData: (input: { table: string; code: string }) => Promise<DeleteReferenceDataPrecheck>;
  deleteReferenceData: (input: { table: string; rowId: string; code: string }) => Promise<DeleteReferenceDataResult>;
  onOpenChange: (open: boolean) => void;
};

const referenceRow: ReferenceDataRow = {
  id: 'allergen-a99',
  code: 'A99',
  name_en: 'Example',
};

async function loadDeleteReferenceDataModal() {
  const target = './delete-reference-data-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/delete-reference-data-modal.tsx should exist and export SM-10 DeleteReferenceDataModal',
  ).not.toBeNull();

  const component = module?.DeleteReferenceDataModal ?? module?.default;
  expect(component, 'DeleteReferenceDataModal must be exported as a renderable React component').toEqual(expect.any(Function));
  return component as React.ComponentType<DeleteReferenceDataModalProps>;
}

async function renderDeleteReferenceDataModal(overrides: Partial<DeleteReferenceDataModalProps> = {}) {
  const DeleteReferenceDataModal = await loadDeleteReferenceDataModal();
  const props: DeleteReferenceDataModalProps = {
    open: true,
    table: 'allergens_reference',
    row: referenceRow,
    precheckDeleteReferenceData: vi.fn().mockResolvedValue({ affected_count: 0 }),
    deleteReferenceData: vi.fn().mockResolvedValue({ ok: true }),
    onOpenChange: vi.fn(),
    ...overrides,
  };

  render(<DeleteReferenceDataModal {...props} />);
  return props;
}

function getDialog() {
  return screen.getByRole('dialog', { name: /delete A99\?/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.replace(/\s+/g, ' ').trim() || button.getAttribute('aria-label') || '')
    .filter((name: string) => !/^close$/i.test(name));
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  const alert = scoped.getByRole('alert');
  const confirmInput = scoped.getByLabelText(/type DELETE to confirm/i);
  const cancel = scoped.getByRole('button', { name: /^cancel$/i });
  const deleteButton = scoped.getByRole('button', { name: /^delete permanently$/i });

  return {
    modalId: dialog.getAttribute('data-modal-id'),
    title: scoped.getByRole('heading', { name: /delete A99\?/i }).textContent,
    size: dialog.getAttribute('data-size'),
    dismissibleCloseButtonCount: within(dialog).queryAllByRole('button', { name: /^close$/i }).length,
    alertPrimitive: alert.getAttribute('data-slot') ?? 'alert',
    alertText: alert.textContent?.replace(/\s+/g, ' ').trim(),
    formLabels: [confirmInput.getAttribute('aria-label') ?? scoped.getByText(/type DELETE to confirm/i).textContent],
    inputPlaceholder: confirmInput.getAttribute('placeholder'),
    inputPrimitive: confirmInput.closest('[data-slot="input"]')?.getAttribute('data-slot') ?? confirmInput.getAttribute('data-slot'),
    footerButtons: visibleFooterButtonNames(dialog),
    destructiveConfirm:
      deleteButton.getAttribute('data-variant') === 'destructive' || deleteButton.className.includes('btn-danger'),
    confirmDisabledBeforeExactText: deleteButton.hasAttribute('disabled'),
    cancelPrimitive: cancel.closest('[data-slot="button"]')?.getAttribute('data-slot'),
    confirmPrimitive: deleteButton.closest('[data-slot="button"]')?.getAttribute('data-slot'),
  };
}

describe('SM-10 DeleteReferenceDataModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the SM-10 destructive type-to-confirm dialog structure, shadcn primitives, footer order, disabled rule, focus order, a11y, and RTL outline snapshot', async () => {
    const user = userEvent.setup();
    const precheckDeleteReferenceData = vi.fn().mockResolvedValue({ affected_count: 0 });
    await renderDeleteReferenceDataModal({ precheckDeleteReferenceData });

    const dialog = getDialog();
    await assertModalA11y(dialog);
    await waitFor(() => expect(precheckDeleteReferenceData).toHaveBeenCalledWith({ table: 'allergens_reference', code: 'A99' }));

    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "alertPrimitive": "alert",
        "alertText": "This action cannot be undone. A99 — Example will be permanently removed from allergens_reference. 0 rows referencing this code will be orphaned.",
        "cancelPrimitive": "button",
        "confirmDisabledBeforeExactText": true,
        "confirmPrimitive": "button",
        "destructiveConfirm": true,
        "dismissibleCloseButtonCount": 0,
        "footerButtons": [
          "Cancel",
          "Delete permanently",
        ],
        "formLabels": [
          "Type DELETE to confirm",
        ],
        "inputPlaceholder": "DELETE",
        "inputPrimitive": "input",
        "modalId": "SM-10",
        "size": "sm",
        "title": "Delete A99?",
      }
    `);

    const confirmInput = within(dialog).getByLabelText(/type DELETE to confirm/i);
    const cancel = within(dialog).getByRole('button', { name: /^cancel$/i });
    const deleteButton = within(dialog).getByRole('button', { name: /^delete permanently$/i });

    expect(confirmInput).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(deleteButton).toHaveFocus();
  });

  it("keeps Delete permanently disabled when Confirm is checked but typed input is not exactly 'DELETE'", async () => {
    const user = userEvent.setup();
    const deleteReferenceData = vi.fn().mockResolvedValue({ ok: true });
    await renderDeleteReferenceDataModal({ deleteReferenceData });

    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/type DELETE to confirm/i);
    const confirmCheckbox = within(dialog).getByRole('checkbox', { name: /^confirm$/i });
    const deleteButton = within(dialog).getByRole('button', { name: /^delete permanently$/i });

    await user.type(input, 'delete');
    await user.click(confirmCheckbox);
    await user.click(deleteButton);

    expect(deleteButton).toBeDisabled();
    expect(deleteReferenceData).not.toHaveBeenCalled();
  });

  it("enables the destructive action only after exact DELETE text plus Confirm, then calls the Server Action and closes on success", async () => {
    const user = userEvent.setup();
    let resolveDelete!: (value: DeleteReferenceDataResult) => void;
    const deleteReferenceData = vi.fn(
      () => new Promise<DeleteReferenceDataResult>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const DeleteReferenceDataModal = await loadDeleteReferenceDataModal();

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <DeleteReferenceDataModal
          open={open}
          table="allergens_reference"
          row={referenceRow}
          precheckDeleteReferenceData={vi.fn().mockResolvedValue({ affected_count: 0 })}
          deleteReferenceData={deleteReferenceData}
          onOpenChange={setOpen}
        />
      );
    }

    render(<Harness />);
    const dialog = getDialog();
    await user.type(within(dialog).getByLabelText(/type DELETE to confirm/i), 'DELETE');
    await user.click(within(dialog).getByRole('checkbox', { name: /^confirm$/i }));
    await user.click(within(dialog).getByRole('button', { name: /^delete permanently$/i }));

    await waitFor(() =>
      expect(deleteReferenceData).toHaveBeenCalledWith({ table: 'allergens_reference', rowId: 'allergen-a99', code: 'A99' }),
    );
    expect(within(dialog).getByRole('button', { name: /deleting/i })).toBeDisabled();

    resolveDelete({ ok: true });

    expect(await screen.findByText('Reference data deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /delete A99\?/i })).not.toBeInTheDocument());
  });

  it("renders affected-count precheck text when the modal opens and keeps the dialog open with a loud error state when delete fails", async () => {
    const user = userEvent.setup();
    const deleteReferenceData = vi.fn().mockResolvedValue({ ok: false, error: 'REFERENCE_IN_USE' });
    await renderDeleteReferenceDataModal({
      precheckDeleteReferenceData: vi.fn().mockResolvedValue({ affected_count: 5 }),
      deleteReferenceData,
    });

    const dialog = getDialog();
    expect(await within(dialog).findByText(/5 rows referencing this code will be orphaned/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/type DELETE to confirm/i), 'DELETE');
    await user.click(within(dialog).getByRole('checkbox', { name: /^confirm$/i }));
    await user.click(within(dialog).getByRole('button', { name: /^delete permanently$/i }));

    await waitFor(() => expect(deleteReferenceData).toHaveBeenCalled());
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('REFERENCE_IN_USE');
    expect(screen.getByRole('dialog', { name: /delete A99\?/i })).toBeInTheDocument();
  });
});
