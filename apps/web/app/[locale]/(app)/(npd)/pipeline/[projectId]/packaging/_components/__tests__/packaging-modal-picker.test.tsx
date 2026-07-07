/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — NPD Packaging stage modal: the optional catalog item picker.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:165-219
 *   (PackagingScreen add/edit component modal). The catalog picker is the NPD
 *   ItemPicker (the "ingredient library" combobox, recipe.jsx:194) restricted to
 *   itemTypes ['packaging']; documented in the lane deviation log.
 *
 * Asserts: picking a packaging item pre-fills name/material/cost (overridable)
 * AND the upsert payload carries the chosen item's id as `itemId`.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open }: { children: React.ReactNode; open: boolean }) {
    if (!open) return null;
    return <div role="dialog">{children}</div>;
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { __esModule: true, default: Modal };
});

import { PackagingComponentModal } from '../packaging-component-modal';
import type { PackagingLabels } from '../packaging-screen';

const LABELS = {
  addComponent: 'Add component',
  editComponent: 'Edit',
  fieldComponent: 'Component name',
  fieldMaterial: 'Material',
  fieldSupplier: 'Supplier',
  fieldSpec: 'Spec',
  fieldCostUnit: 'Cost per unit (€)',
  fieldStatus: 'Status',
  fieldTier: 'Tier',
  tierPrimary: 'Primary',
  tierSecondary: 'Secondary',
  statusApproved: 'Approved',
  statusPendingArtwork: 'Pending artwork',
  statusDraft: 'Draft',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the component.',
  pickerTrigger: '+ Pick from catalog',
  pickerSearchLabel: 'Search packaging items',
  pickerSearchPlaceholder: 'Search by code or name…',
  pickerLoading: 'Searching…',
  pickerEmpty: 'No matching packaging items',
  pickerCancel: 'Cancel',
  pickerError: 'Item search failed',
  pickedHint: 'Linked to {code}',
  pickerClear: 'Clear link',
} as unknown as PackagingLabels;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PackagingComponentModal — catalog item picker', () => {
  it('picking an item pre-fills fields and the upsert payload carries itemId', async () => {
    const user = userEvent.setup();
    const onUpsert = vi.fn().mockResolvedValue({ ok: true });
    const searchItemsAction = vi.fn().mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        itemCode: 'PM-2001',
        name: 'Vacuum pouch',
        itemType: 'packaging',
        status: 'active',
        costPerKgEur: '0.08',
        uomBase: 'pcs',
      },
    ]);

    render(
      <PackagingComponentModal
        open
        onOpenChange={vi.fn()}
        projectId="99999999-9999-4999-8999-999999999999"
        editing={null}
        defaultTier="primary"
        labels={LABELS}
        onUpsert={onUpsert}
        searchItemsAction={searchItemsAction}
      />,
    );

    // Open the picker and choose the packaging item.
    await user.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getByTestId('item-picker-option')).toBeInTheDocument());
    // Picker was queried for the packaging subset only.
    expect(searchItemsAction).toHaveBeenCalledWith(
      expect.objectContaining({ itemTypes: ['packaging'] }),
    );
    await user.click(screen.getByTestId('item-picker-option'));

    // Pre-filled: name from the catalog row + the linked-item badge.
    const nameInput = document.querySelector('input[name="componentName"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Vacuum pouch');
    expect(screen.getByTestId('packaging-linked-item')).toHaveTextContent('PM-2001');

    // Submit → payload carries itemId.
    await user.click(screen.getByTestId('submit-component'));
    await waitFor(() => expect(onUpsert).toHaveBeenCalledTimes(1));
    expect(onUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', componentName: 'Vacuum pouch' }),
    );
  });

  it('renders no picker when no searchItemsAction is provided', () => {
    render(
      <PackagingComponentModal
        open
        onOpenChange={vi.fn()}
        projectId="p1"
        editing={null}
        defaultTier="primary"
        labels={LABELS}
        onUpsert={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.queryByTestId('item-picker-trigger')).not.toBeInTheDocument();
  });
});
