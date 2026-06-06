/**
 * @vitest-environment jsdom
 * NPD PACKAGING stage — PackagingScreen component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:165-219
 *
 * Asserts the parity checklist (Primary packaging table with the 6 spec columns
 * + status badge tones, Secondary packaging panel, Artwork panel), the five UI
 * states (loading / empty / error / permission-denied / ready+optimistic),
 * RBAC-gated write affordances (canWrite), the NO "LEGACY" banner rule, the
 * optimistic delete, and that visible strings come from injected i18n labels.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PackagingScreen,
  type PackagingLabels,
  type PackagingScreenData,
} from '../packaging-screen';
import type { PackagingComponentRow } from '../../_actions/shared';

afterEach(() => cleanup());

const LABELS: PackagingLabels = {
  title: 'Packaging',
  subtitle: 'Primary & secondary packaging specification and artwork.',
  breadcrumb: 'NPD / Packaging',
  primaryTitle: 'Primary packaging',
  secondaryTitle: 'Secondary packaging',
  artworkTitle: 'Artwork',
  addComponent: '+ Add component',
  editComponent: 'Edit',
  deleteComponent: 'Delete',
  colComponent: 'Component',
  colMaterial: 'Material',
  colSupplier: 'Supplier',
  colSpec: 'Spec',
  colCostUnit: 'Cost / unit',
  colStatus: 'Status',
  colActions: 'Actions',
  statusApproved: 'Approved',
  statusPendingArtwork: 'Pending artwork',
  statusDraft: 'Draft',
  artworkPreview: 'Preview',
  artworkNewVersion: 'New version',
  artworkNone: 'No artwork uploaded yet.',
  fieldComponent: 'Component name',
  fieldMaterial: 'Material',
  fieldSupplier: 'Supplier',
  fieldSpec: 'Spec',
  fieldCostUnit: 'Cost per unit (€)',
  fieldStatus: 'Status',
  fieldTier: 'Tier',
  tierPrimary: 'Primary',
  tierSecondary: 'Secondary',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the component.',
  confirmDelete: 'Remove this component?',
  emDash: '—',
  loading: 'Loading packaging data…',
  empty: 'No packaging components yet',
  emptyBody: 'Add a primary or secondary packaging component to get started.',
  error: 'Unable to load packaging data.',
  forbidden: 'You do not have permission to view packaging data.',
};

const PRIMARY: PackagingComponentRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tier: 'primary',
    componentName: 'MAP tray',
    material: 'PET / PE 300µm',
    supplierCode: 'Coveris',
    spec: '160×110×35mm',
    costPerUnit: '0.1800',
    status: 'approved',
    artworkFileId: null,
    artworkStatus: null,
    displayOrder: 0,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tier: 'primary',
    componentName: 'Label',
    material: 'Paper self-adhesive',
    supplierCode: 'UPM Raflatac',
    spec: '60×40mm',
    costPerUnit: '0.0200',
    status: 'pending_artwork',
    artworkFileId: null,
    artworkStatus: null,
    displayOrder: 1,
  },
];

const SECONDARY: PackagingComponentRow[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    tier: 'secondary',
    componentName: 'Inner case',
    material: 'Cardboard box, 12 packs',
    supplierCode: null,
    spec: '320×240×80mm',
    costPerUnit: '0.2200',
    status: 'approved',
    artworkFileId: null,
    artworkStatus: null,
    displayOrder: 0,
  },
];

const DATA: PackagingScreenData = {
  projectId: '99999999-9999-4999-8999-999999999999',
  productName: 'Sliced Ham 200g',
  primary: PRIMARY,
  secondary: SECONDARY,
  artwork: { fileName: 'artwork-v2.pdf', uploadedAt: '2025-12-08', fileSize: '3.2 MB' },
};

function renderReady(extra?: Partial<React.ComponentProps<typeof PackagingScreen>>) {
  return render(<PackagingScreen state="ready" data={DATA} labels={LABELS} {...extra} />);
}

describe('PackagingScreen — parity', () => {
  it('renders the Primary packaging table with the 6 spec columns', () => {
    renderReady();
    const table = screen.getByTestId('primary-packaging-table');
    expect(within(table).getByText('Component')).toBeInTheDocument();
    expect(within(table).getByText('Material')).toBeInTheDocument();
    expect(within(table).getByText('Supplier')).toBeInTheDocument();
    expect(within(table).getByText('Spec')).toBeInTheDocument();
    expect(within(table).getByText('Cost / unit')).toBeInTheDocument();
    expect(within(table).getByText('Status')).toBeInTheDocument();
    const rows = within(table).getAllByTestId('primary-component-row');
    expect(rows).toHaveLength(2);
  });

  it('renders money from NUMERIC strings (never a JS float)', () => {
    renderReady();
    const rows = within(screen.getByTestId('primary-packaging-table')).getAllByTestId('primary-component-row');
    expect(within(rows[0]).getByTestId('component-cost').textContent).toContain('€0.18');
  });

  it('renders the status badges with the correct tones (approved=green, pending=amber)', () => {
    renderReady();
    const rows = within(screen.getByTestId('primary-packaging-table')).getAllByTestId('primary-component-row');
    const approved = within(rows[0]).getByTestId('component-status');
    const pending = within(rows[1]).getByTestId('component-status');
    expect(approved.className).toContain('badge-green');
    expect(approved.textContent).toContain('Approved');
    expect(pending.className).toContain('badge-amber');
    expect(pending.textContent).toContain('Pending artwork');
  });

  it('renders the Secondary packaging panel + Artwork panel', () => {
    renderReady();
    expect(screen.getByTestId('secondary-packaging-card')).toBeInTheDocument();
    expect(within(screen.getByTestId('secondary-packaging-table')).getByText('Inner case')).toBeInTheDocument();
    expect(screen.getByTestId('artwork-filename').textContent).toBe('artwork-v2.pdf');
    expect(screen.getByTestId('artwork-meta').textContent).toContain('2025-12-08');
  });

  it('does NOT render a LEGACY deprecation banner (product-owner: all stages real)', () => {
    renderReady();
    expect(screen.queryByText(/LEGACY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase 2 deprecation/i)).not.toBeInTheDocument();
  });

  it('uses injected i18n labels (no default leak when overridden)', () => {
    render(
      <PackagingScreen
        state="ready"
        data={DATA}
        labels={{ ...LABELS, primaryTitle: 'Opakowanie podstawowe' }}
      />,
    );
    expect(screen.getByText('Opakowanie podstawowe')).toBeInTheDocument();
  });
});

describe('PackagingScreen — RBAC affordances', () => {
  it('hides Add/Edit/Delete when canWrite is false', () => {
    renderReady({ canWrite: false });
    expect(screen.queryByTestId('add-primary-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-component')).not.toBeInTheDocument();
  });

  it('shows Add/Edit/Delete when canWrite is true', () => {
    renderReady({ canWrite: true, onUpsert: vi.fn(), onDelete: vi.fn() });
    expect(screen.getByTestId('add-primary-component')).toBeInTheDocument();
    expect(screen.getAllByTestId('edit-component').length).toBeGreaterThan(0);
  });
});

describe('PackagingScreen — UI states', () => {
  it('renders the loading state', () => {
    render(<PackagingScreen state="loading" data={null} labels={LABELS} />);
    expect(screen.getByTestId('packaging-loading')).toHaveTextContent('Loading packaging data…');
  });

  it('renders the empty state', () => {
    render(<PackagingScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByTestId('packaging-empty')).toHaveTextContent('No packaging components yet');
  });

  it('renders the error state', () => {
    render(<PackagingScreen state="error" data={null} labels={LABELS} />);
    expect(screen.getByTestId('packaging-error')).toHaveTextContent('Unable to load packaging data.');
  });

  it('renders the permission-denied state', () => {
    render(<PackagingScreen state="permission_denied" data={null} labels={LABELS} />);
    expect(screen.getByTestId('packaging-forbidden')).toHaveTextContent(
      'You do not have permission to view packaging data.',
    );
  });
});

describe('PackagingScreen — optimistic delete', () => {
  it('optimistically removes a row, then restores it when the action fails', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    renderReady({ canWrite: true, onUpsert: vi.fn(), onDelete });

    const table = screen.getByTestId('primary-packaging-table');
    expect(within(table).getAllByTestId('primary-component-row')).toHaveLength(2);

    const firstRow = within(table).getAllByTestId('primary-component-row')[0];
    fireEvent.click(within(firstRow).getByTestId('delete-component'));

    // Optimistically removed.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('primary-packaging-table')).getAllByTestId('primary-component-row'),
      ).toHaveLength(1),
    );

    // Action failed → restored.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('primary-packaging-table')).getAllByTestId('primary-component-row'),
      ).toHaveLength(2),
    );
    expect(onDelete).toHaveBeenCalledWith({
      id: PRIMARY[0].id,
      projectId: DATA.projectId,
    });
  });
});
