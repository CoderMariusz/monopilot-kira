/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_actions/checklist-template-mutations', () => ({
  addChecklistTemplateItem: vi.fn(async () => ({ ok: true })),
  updateChecklistTemplateItem: vi.fn(async () => ({ ok: true })),
  deleteChecklistTemplateItem: vi.fn(async () => ({ ok: true })),
  reorderChecklistTemplateItem: vi.fn(async () => ({ ok: true })),
}));

vi.mock('./_actions/propagate-checklist-templates', () => ({
  propagateChecklistTemplates: vi.fn(async () => ({
    ok: true,
    projectsTouched: 2,
    itemsInserted: 1,
    itemsUpdated: 3,
    itemsDeleted: 0,
  })),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import NpdChecklistScreen, { type NpdChecklistScreenLabels } from './npd-checklist-screen.client';

const labels: NpdChecklistScreenLabels = {
  title: 'Gate checklists',
  subtitle: 'Manage templates',
  readOnlyNotice: 'Read only',
  forbidden: 'Forbidden',
  loadError: 'Load error',
  propagate: 'Propagate to open projects',
  propagating: 'Propagating…',
  propagateSuccess: 'Propagated to {projects} open project(s): {inserted} inserted, {updated} updated, {deleted} unchecked removed.',
  propagateError: 'Propagate failed',
  addItem: 'Add item',
  addItemTitle: 'Add checklist item',
  deleteItem: 'Delete',
  deleteItemTitle: 'Delete checklist item',
  deleteItemBody: 'Confirm delete',
  deleteConfirm: 'Delete',
  deleteCancel: 'Cancel',
  deleting: 'Deleting…',
  save: 'Save',
  cancel: 'Cancel',
  create: 'Add',
  saving: 'Saving…',
  actionError: 'Action failed',
  emptyGate: 'No items',
  columnText: 'Item',
  columnCategory: 'Category',
  columnRequired: 'Required',
  columnActions: 'Actions',
  fieldGate: 'Gate',
  fieldCategory: 'Category',
  fieldText: 'Item text',
  fieldRequired: 'Required',
  requiredYes: 'Yes',
  requiredNo: 'No',
  moveUp: 'Move up',
  moveDown: 'Move down',
  editText: 'Edit',
  validationTextRequired: 'Item text is required.',
  gateLabels: {
    G0: 'G0 — Idea',
    G1: 'G1 — Feasibility',
    G2: 'G2 — Business case',
    G3: 'G3 — Development',
    G4: 'G4 — Testing / handoff',
  },
  categoryLabels: {
    business: 'Business',
    technical: 'Technical',
    compliance: 'Compliance',
  },
};

const templates = {
  G0: [
    {
      templateId: 'APEX_DEFAULT',
      gateCode: 'G0' as const,
      sequence: 1,
      categoryCode: 'business' as const,
      itemText: 'Product concept documented',
      required: true,
    },
  ],
  G1: [],
  G2: [],
  G3: [],
  G4: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NpdChecklistScreen', () => {
  it('renders gate groups G0–G4', () => {
    render(<NpdChecklistScreen templates={templates} canEdit labels={labels} />);
    expect(screen.getByTestId('npd-checklist-gate-G0')).toBeInTheDocument();
    expect(screen.getByTestId('npd-checklist-gate-G4')).toBeInTheDocument();
    expect(screen.getByText('Product concept documented')).toBeInTheDocument();
    expect(screen.getByTestId('npd-checklist-empty-G1')).toHaveTextContent('No items');
  });

  it('validates the add dialog when item text is empty', async () => {
    render(<NpdChecklistScreen templates={templates} canEdit labels={labels} />);
    fireEvent.click(screen.getByTestId('npd-checklist-add-G0'));
    expect(screen.getByTestId('npd-checklist-add-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('npd-checklist-add-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('npd-checklist-add-validation')).toHaveTextContent('Item text is required.');
    });
  });

  it('calls propagate action from the toolbar button', async () => {
    const propagateAction = vi.fn(async () => ({
      ok: true as const,
      projectsTouched: 2,
      itemsInserted: 1,
      itemsUpdated: 3,
      itemsDeleted: 0,
    }));
    render(
      <NpdChecklistScreen templates={templates} canEdit labels={labels} propagateAction={propagateAction} />,
    );
    fireEvent.click(screen.getByTestId('npd-checklist-propagate'));
    await waitFor(() => {
      expect(propagateAction).toHaveBeenCalledWith({});
    });
    expect(screen.getByTestId('npd-checklist-propagate-result')).toHaveTextContent('Propagated to 2 open project(s)');
  });
});
