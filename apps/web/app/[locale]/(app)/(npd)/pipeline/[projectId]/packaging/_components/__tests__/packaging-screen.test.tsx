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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── next/navigation: capture router.refresh for the revalidation assertion. ──
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/packaging',
  useSearchParams: () => new URLSearchParams(),
}));

// ── @monopilot/ui/Modal: render body/footer inline when open (jsdom-friendly). ──
vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open, modalId }: { children: React.ReactNode; open: boolean; modalId?: string }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;
  return { __esModule: true, default: Modal };
});

import {
  PackagingScreen,
  type PackagingLabels,
  type PackagingScreenData,
} from '../packaging-screen';
import type { PackagingComponentRow } from '../../_actions/shared';

beforeEach(() => {
  refreshMock.mockClear();
});
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
  colWastePct: 'Waste %',
  colStatus: 'Status',
  colActions: 'Actions',
  statusApproved: 'Approved',
  statusPendingArtwork: 'Pending artwork',
  statusDraft: 'Draft',
  artworkPreview: 'Preview',
  artworkNewVersion: 'New version',
  artworkNone: 'No artwork uploaded yet.',
  artworkUnavailable: 'Not available yet',
  fieldComponent: 'Component name',
  fieldMaterial: 'Material',
  fieldSupplier: 'Supplier',
  fieldSpec: 'Spec',
  fieldCostUnit: 'Cost per unit (€)',
  fieldScrapPct: 'Scrap %',
  fieldWastePct: 'Waste %',
  fieldQtyPerBox: 'Qty per full box',
  fieldQtyPerBoxHelp: 'Per full box',
  fieldPacksPerBox: 'Packs per box',
  fieldPacksPerBoxHelp: 'Shared with Brief',
  savePacksPerBox: 'Save packs per box',
  savingPacksPerBox: 'Saving…',
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
  pickerTrigger: '+ Pick from catalog',
  pickerSearchLabel: 'Search packaging items',
  pickerSearchPlaceholder: 'Search by code or name…',
  pickerLoading: 'Searching…',
  pickerEmpty: 'No matching packaging items',
  pickerCancel: 'Cancel',
  pickerError: 'Item search failed',
  pickedHint: 'Linked to {code}',
  pickerClear: 'Clear link',
  artworkUpload: 'Upload artwork',
  artworkUploading: 'Uploading…',
  artworkHistoryTitle: 'Version history',
  artworkCurrent: 'Current',
  artworkDownload: 'Download',
  artworkDelete: 'Delete',
  artworkDeleteConfirm: 'Remove this artwork version?',
  artworkTooLarge: 'File is larger than 20 MB.',
  artworkUnsupportedType: 'Unsupported file type. Allowed: PDF, PNG, JPG.',
  artworkUploadFailed: 'Could not upload the artwork. Please try again.',
  artworkDeleteFailed: 'Could not delete the artwork version. Please try again.',
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
    scrapPct: 0,
    wastePct: 2.5,
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
    scrapPct: 0,
    wastePct: 2.5,
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
    scrapPct: 0,
    wastePct: 2.5,
    status: 'approved',
    artworkFileId: null,
    artworkStatus: null,
    displayOrder: 0,
  },
];

const DATA: PackagingScreenData = {
  projectId: '99999999-9999-4999-8999-999999999999',
  productName: 'Sliced Ham 200g',
  packsPerCase: 12,
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
    expect(within(rows[0]).getByTestId('component-cost').textContent).toContain('£0.18');
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

const EMPTY_DATA: PackagingScreenData = {
  projectId: '99999999-9999-4999-8999-999999999999',
  productName: 'Sliced Ham 200g',
  primary: [],
  secondary: [],
  artwork: null,
};

describe('PackagingScreen — no-component CTA (dead-end fix)', () => {
  it('renders the inline empty hint AND an Add button when a write-capable project has zero components', () => {
    render(
      <PackagingScreen
        state="ready"
        data={EMPTY_DATA}
        labels={LABELS}
        canWrite
        onUpsert={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // The empty hint is rendered INSIDE the live table (not a bare dead-end card).
    expect(screen.getByTestId('packaging-empty-hint')).toHaveTextContent('No packaging components yet');
    // The header Add button AND the inline empty CTA are both present → no dead end.
    expect(screen.getByTestId('add-primary-component')).toBeInTheDocument();
    expect(screen.getByTestId('add-component-empty')).toBeInTheDocument();
  });

  it('opens the modal from the inline empty CTA', () => {
    render(
      <PackagingScreen
        state="ready"
        data={EMPTY_DATA}
        labels={LABELS}
        canWrite
        onUpsert={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('packaging-component-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-component-empty'));
    expect(screen.getByTestId('packaging-component-form')).toBeInTheDocument();
  });

  it('hides every Add affordance in the empty state when canWrite is false', () => {
    render(<PackagingScreen state="ready" data={EMPTY_DATA} labels={LABELS} canWrite={false} />);
    expect(screen.getByTestId('packaging-empty-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('add-primary-component')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-component-empty')).not.toBeInTheDocument();
  });
});

describe('PackagingScreen — add via modal calls the Server Action', () => {
  it('submitting the modal calls onUpsert with the schema-shaped payload, then refreshes', async () => {
    const onUpsert = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PackagingScreen
        state="ready"
        data={EMPTY_DATA}
        labels={LABELS}
        canWrite
        onUpsert={onUpsert}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-component-empty'));
    fireEvent.change(screen.getByTestId('field-component-name'), { target: { value: 'MAP tray' } });
    fireEvent.change(screen.getByTestId('field-material'), { target: { value: 'PET / PE 300µm' } });
    fireEvent.change(screen.getByTestId('field-cost'), { target: { value: '0.18' } });

    fireEvent.submit(screen.getByTestId('packaging-component-form'));

    await waitFor(() => expect(onUpsert).toHaveBeenCalledTimes(1));
    expect(onUpsert).toHaveBeenCalledWith({
      id: undefined,
      projectId: EMPTY_DATA.projectId,
      tier: 'primary',
      componentName: 'MAP tray',
      material: 'PET / PE 300µm',
      supplierCode: null,
      spec: null,
      costPerUnit: '0.18',
      // Scrap % defaults to 0 when the field is left untouched.
      scrapPct: 0,
      wastePct: 0,
      qtyPerPack: null,
      status: 'draft',
      // The optional catalog link defaults to null when no item is picked.
      itemId: null,
    });
    // After a successful upsert the RSC loader is re-run.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});

describe('PackagingScreen — artwork affordances track the storage backend', () => {
  // Storage backend exists now (npd-attachments bucket, mig 279). Preview stays
  // disabled only when the artwork has no signed URL; New version renders only
  // when the upload Server Action is injected. Wired flows are covered in
  // artwork-panel.test.tsx.
  it('disables Preview without a signed URL and hides New version without an upload action', () => {
    renderReady({ canWrite: true, onUpsert: vi.fn(), onDelete: vi.fn() });
    const preview = screen.getByTestId('artwork-preview');
    expect(preview).toBeDisabled();
    expect(preview).toHaveAttribute('title', 'Not available yet');
    expect(screen.queryByTestId('artwork-new-version')).toBeNull();
  });
});

describe('PackagingScreen — delete confirmation', () => {
  it('does NOT call onDelete when the confirm dialog is cancelled', () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderReady({ canWrite: true, onUpsert: vi.fn(), onDelete });

    const table = screen.getByTestId('primary-packaging-table');
    const firstRow = within(table).getAllByTestId('primary-component-row')[0];
    fireEvent.click(within(firstRow).getByTestId('delete-component'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('calls onDelete and refreshes when the confirm dialog is accepted', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderReady({ canWrite: true, onUpsert: vi.fn(), onDelete });

    const table = screen.getByTestId('primary-packaging-table');
    const firstRow = within(table).getAllByTestId('primary-component-row')[0];
    fireEvent.click(within(firstRow).getByTestId('delete-component'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith({ id: PRIMARY[0].id, projectId: DATA.projectId }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });
});

describe('PackagingScreen — optimistic delete', () => {
  it('optimistically removes a row, then restores it when the action fails', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    confirmSpy.mockRestore();
  });
});

describe('PackagingScreen — unit foundations (W1-L4)', () => {
  it('renders packs-per-box header bound to project.packs_per_case', () => {
    renderReady({ canWrite: true, onUpsert: vi.fn(), onUpdatePacksPerCase: vi.fn() });
    expect(screen.getByTestId('packaging-packs-per-box-header')).toBeInTheDocument();
    expect(screen.getByTestId('packaging-packs-per-box')).toHaveValue(12);
  });

  it('shows Waste % column values on primary rows', () => {
    renderReady();
    const table = screen.getByTestId('primary-packaging-table');
    const wasteCells = within(table).getAllByTestId('component-waste-pct');
    expect(wasteCells[0]).toHaveTextContent('2.5%');
  });

  it('calls onUpdatePacksPerCase when saving packs per box', async () => {
    const onUpdatePacksPerCase = vi.fn().mockResolvedValue({ ok: true });
    renderReady({ canWrite: true, onUpsert: vi.fn(), onUpdatePacksPerCase });

    fireEvent.change(screen.getByTestId('packaging-packs-per-box'), { target: { value: '24' } });
    fireEvent.click(screen.getByTestId('packaging-save-packs-per-box'));

    await waitFor(() =>
      expect(onUpdatePacksPerCase).toHaveBeenCalledWith({
        projectId: DATA.projectId,
        packsPerCase: 24,
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
