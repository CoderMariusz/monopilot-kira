/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — parity evidence for the NPD packaging-stage catalog item picker.
 * Anchor: npd/other-stages.jsx:165-219 (PackagingScreen add/edit modal); the
 * picker reuses the NPD ItemPicker (recipe.jsx:194) restricted to ['packaging'].
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open }: { children: React.ReactNode; open: boolean }) {
    return open ? <div role="dialog">{children}</div> : null;
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { __esModule: true, default: Modal };
});

import { PackagingComponentModal } from '../packaging-component-modal';
import type { PackagingLabels } from '../packaging-screen';

const OUT = join(__dirname, '../../../../../../../../../../../_meta/parity-evidence/taxonomy-packaging-picker');
function dump(name: string, html: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `<!doctype html><html><body>${html}</body></html>`, 'utf8');
}

const LABELS = {
  addComponent: 'Add component', editComponent: 'Edit',
  fieldComponent: 'Component name', fieldMaterial: 'Material', fieldSupplier: 'Supplier',
  fieldSpec: 'Spec', fieldCostUnit: 'Cost per unit (€)', fieldStatus: 'Status', fieldTier: 'Tier',
  tierPrimary: 'Primary', tierSecondary: 'Secondary',
  statusApproved: 'Approved', statusPendingArtwork: 'Pending artwork', statusDraft: 'Draft',
  save: 'Save', saving: 'Saving…', cancel: 'Cancel', saveError: 'Could not save.',
  pickerTrigger: '+ Pick from catalog', pickerSearchLabel: 'Search packaging items',
  pickerSearchPlaceholder: 'Search by code or name…', pickerLoading: 'Searching…',
  pickerEmpty: 'No matching packaging items', pickerCancel: 'Cancel', pickerError: 'Item search failed',
  pickedHint: 'Linked to {code}', pickerClear: 'Clear link',
} as unknown as PackagingLabels;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Packaging picker — parity evidence', () => {
  it('captures the modal with the catalog picker and a linked item', async () => {
    const user = userEvent.setup();
    const searchItemsAction = vi.fn().mockResolvedValue([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', itemCode: 'PM-2001', name: 'Vacuum pouch', itemType: 'packaging', status: 'active', costPerKgEur: '0.08', uomBase: 'pcs' },
    ]);
    const { container } = render(
      <PackagingComponentModal open onOpenChange={vi.fn()} projectId="p1" editing={null} defaultTier="primary"
        labels={LABELS} onUpsert={vi.fn().mockResolvedValue({ ok: true })} searchItemsAction={searchItemsAction} />,
    );
    dump('modal-with-picker.html', container.innerHTML);
    await user.click(screen.getByTestId('item-picker-trigger'));
    await waitFor(() => expect(screen.getByTestId('item-picker-option')).toBeTruthy());
    dump('picker-open-options.html', container.innerHTML);
    await user.click(screen.getByTestId('item-picker-option'));
    dump('item-linked-prefilled.html', container.innerHTML);
  });
});
