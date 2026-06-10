'use client';

/**
 * NPD PACKAGING stage — PackagingScreen.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:165-219
 *   (PackagingScreen — Primary packaging table + Secondary packaging panel +
 *    Artwork panel). The prototype's "LEGACY — Phase 2 deprecation" banner is
 *    DELIBERATELY NOT rendered (product-owner decision: all 8 stages are real).
 *
 * Translation notes:
 *   - Primary packaging <table> (COMPONENT/MATERIAL/SUPPLIER/SPEC/COST-UNIT/STATUS)
 *       → @monopilot/ui Table; status badge "✓ Approved" green / "○ Pending
 *         artwork" amber (.badge-green / .badge-amber design-system tones).
 *   - "+ Add component"            → @monopilot/ui Button → opens the add/edit Modal.
 *   - Secondary packaging panel    → label/value rows (no raw <select>).
 *   - Artwork panel                → thumbnail + filename + uploaded date/size +
 *                                    Preview / New version buttons.
 *
 * Money renders straight from NUMERIC decimal STRINGS (never JS floats). RBAC
 * (`permission_denied`) is resolved server-side in page.tsx and NEVER trusted
 * from the client. The mutation Server Actions are passed in as props across the
 * RSC boundary (Next16 function-prop crash guard — never raw closures).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { PackagingComponentModal } from './packaging-component-modal';
import type { ItemSearchFn } from '../../../../_components/item-picker';
import type {
  PackagingComponentRow,
  PackagingStatus,
  PackagingTier,
} from '../_actions/shared';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type ArtworkView = {
  fileName: string;
  uploadedAt: string;
  fileSize: string;
};

export type PackagingScreenData = {
  projectId: string;
  productName: string;
  primary: PackagingComponentRow[];
  secondary: PackagingComponentRow[];
  /** Optional artwork metadata (nullable until a file is attached). */
  artwork: ArtworkView | null;
};

export type PackagingLabels = {
  title: string;
  subtitle: string;
  breadcrumb: string;
  primaryTitle: string;
  secondaryTitle: string;
  artworkTitle: string;
  addComponent: string;
  editComponent: string;
  deleteComponent: string;
  colComponent: string;
  colMaterial: string;
  colSupplier: string;
  colSpec: string;
  colCostUnit: string;
  colStatus: string;
  colActions: string;
  statusApproved: string;
  statusPendingArtwork: string;
  statusDraft: string;
  artworkPreview: string;
  artworkNewVersion: string;
  artworkNone: string;
  artworkUnavailable: string;
  // Modal field labels.
  fieldComponent: string;
  fieldMaterial: string;
  fieldSupplier: string;
  fieldSpec: string;
  fieldCostUnit: string;
  fieldStatus: string;
  fieldTier: string;
  tierPrimary: string;
  tierSecondary: string;
  save: string;
  saving: string;
  cancel: string;
  saveError: string;
  confirmDelete: string;
  emDash: string;
  // Catalog item picker (optional packaging-item link).
  pickerTrigger: string;
  pickerSearchLabel: string;
  pickerSearchPlaceholder: string;
  pickerLoading: string;
  pickerEmpty: string;
  pickerCancel: string;
  pickerError: string;
  pickedHint: string; // "Linked to {code}"
  pickerClear: string;
  // States.
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

export type UpsertCall = {
  id?: string;
  projectId: string;
  tier: PackagingTier;
  componentName: string;
  material: string | null;
  supplierCode: string | null;
  spec: string | null;
  costPerUnit: string | null;
  status: PackagingStatus;
  /** Optional FK to a `packaging` item in the catalog (item picker). */
  itemId?: string | null;
};
export type MutationOutcome = { ok: boolean; error?: string };

const CURRENCY = '€';

/** Format a decimal STRING for display (string slicing only — no float math). */
function formatMoney(value: string | null, emDash: string): string {
  if (value === null || value.trim() === '') return emDash;
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  return `${negative ? '-' : ''}${CURRENCY}${intPart}.${frac}`;
}

function statusVariant(status: PackagingStatus): BadgeVariant {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending_artwork':
      return 'warning';
    default:
      return 'muted';
  }
}

/** Design-system tone class (.badge-green / .badge-amber carry colour). */
function statusToneClass(status: PackagingStatus): string {
  switch (status) {
    case 'approved':
      return 'badge-green';
    case 'pending_artwork':
      return 'badge-amber';
    default:
      return 'badge-gray';
  }
}

function statusLabel(status: PackagingStatus, labels: PackagingLabels): string {
  switch (status) {
    case 'approved':
      return labels.statusApproved;
    case 'pending_artwork':
      return labels.statusPendingArtwork;
    default:
      return labels.statusDraft;
  }
}

function statusGlyph(status: PackagingStatus): string {
  switch (status) {
    case 'approved':
      return '✓ ';
    case 'pending_artwork':
      return '○ ';
    default:
      return '';
  }
}

function StateNotice({ state, labels }: { state: PageState; labels: PackagingLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state" data-testid="packaging-loading">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state" data-testid="packaging-empty">
        <div className="empty-state-icon" aria-hidden="true">📦</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" data-testid="packaging-error">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" data-testid="packaging-forbidden">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function PackagingScreen({
  state = 'ready',
  data,
  labels,
  canWrite = false,
  onUpsert,
  onDelete,
  searchItemsAction,
}: {
  state?: PageState;
  data: PackagingScreenData | null;
  labels: PackagingLabels;
  /** Server-resolved write capability (page.tsx) — never trusted from client. */
  canWrite?: boolean;
  onUpsert?: (call: UpsertCall) => Promise<MutationOutcome>;
  onDelete?: (call: { id: string; projectId: string }) => Promise<MutationOutcome>;
  /** Org-scoped item search seam for the optional packaging catalog picker. */
  searchItemsAction?: ItemSearchFn;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PackagingComponentRow | null>(null);
  const [defaultTier, setDefaultTier] = React.useState<PackagingTier>('primary');
  // Optimistic: ids currently being deleted are visually dimmed/removed.
  const [pendingDeletes, setPendingDeletes] = React.useState<Set<string>>(new Set());

  // After a successful mutation the write Server Action has already
  // revalidatePath'd on the server; router.refresh() re-runs the RSC loader so
  // the freshly inserted/edited row appears (mirrors the gate screen pattern).
  const handleMutated = React.useCallback(() => {
    router.refresh();
  }, [router]);

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="packaging-screen"
        aria-labelledby="packaging-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="packaging-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  function openAdd(tier: PackagingTier) {
    setEditing(null);
    setDefaultTier(tier);
    setModalOpen(true);
  }

  function openEdit(row: PackagingComponentRow) {
    setEditing(row);
    setDefaultTier(row.tier);
    setModalOpen(true);
  }

  async function handleDelete(row: PackagingComponentRow) {
    if (!onDelete) return;
    // Confirm before a destructive delete (parity: row action guard).
    if (typeof window !== 'undefined' && !window.confirm(labels.confirmDelete)) {
      return;
    }
    // Optimistic remove — restore on failure.
    setPendingDeletes((prev) => new Set(prev).add(row.id));
    const result = await onDelete({ id: row.id, projectId: data!.projectId });
    if (result.ok) {
      handleMutated();
    } else {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  const visiblePrimary = data.primary.filter((r) => !pendingDeletes.has(r.id));
  const visibleSecondary = data.secondary.filter((r) => !pendingDeletes.has(r.id));
  // A populated project with zero components still renders the tables + the
  // "+ Add component" affordances; this inline hint replaces the old dead-end
  // empty card so a write-capable user is never stranded with no buttons.
  const noComponents = visiblePrimary.length === 0 && visibleSecondary.length === 0;
  const primaryColSpan = canWrite ? 7 : 6;

  return (
    <main
      data-testid="packaging-screen"
      aria-labelledby="packaging-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          {labels.breadcrumb}
        </nav>
        <h1 id="packaging-title" className="page-title mt-1">
          {labels.title} — {data.productName}
        </h1>
        <p className="mt-1 text-sm muted">{labels.subtitle}</p>
      </header>

      {/* ── Primary packaging table ─────────────────────────────────────────── */}
      <Card data-testid="primary-packaging-card">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{labels.primaryTitle}</CardTitle>
          {canWrite && (
            <Button
              type="button"
              className="btn-primary btn-sm"
              data-testid="add-primary-component"
              onClick={() => openAdd('primary')}
            >
              {labels.addComponent}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table data-testid="primary-packaging-table">
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colComponent}</TableHead>
                <TableHead>{labels.colMaterial}</TableHead>
                <TableHead>{labels.colSupplier}</TableHead>
                <TableHead>{labels.colSpec}</TableHead>
                <TableHead>{labels.colCostUnit}</TableHead>
                <TableHead>{labels.colStatus}</TableHead>
                {canWrite && <TableHead>{labels.colActions}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {noComponents && (
                <TableRow data-testid="packaging-empty-row">
                  <TableCell colSpan={primaryColSpan}>
                    <div className="empty-state" data-testid="packaging-empty-hint">
                      <div className="empty-state-icon" aria-hidden="true">📦</div>
                      <div className="empty-state-title">{labels.empty}</div>
                      <div className="empty-state-body">{labels.emptyBody}</div>
                      {canWrite && (
                        <div style={{ marginTop: 10 }}>
                          <Button
                            type="button"
                            className="btn-primary btn-sm"
                            data-testid="add-component-empty"
                            onClick={() => openAdd('primary')}
                          >
                            {labels.addComponent}
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {visiblePrimary.map((row) => (
                <TableRow key={row.id} data-testid="primary-component-row">
                  <TableCell data-testid="component-name" style={{ fontWeight: 500 }}>
                    {row.componentName}
                  </TableCell>
                  <TableCell>{row.material ?? labels.emDash}</TableCell>
                  <TableCell>{row.supplierCode ?? labels.emDash}</TableCell>
                  <TableCell className="mono">{row.spec ?? labels.emDash}</TableCell>
                  <TableCell className="mono num" data-testid="component-cost">
                    {formatMoney(row.costPerUnit, labels.emDash)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant(row.status)}
                      className={statusToneClass(row.status)}
                      data-testid="component-status"
                    >
                      {statusGlyph(row.status)}
                      {statusLabel(row.status, labels)}
                    </Badge>
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="edit-component"
                          onClick={() => openEdit(row)}
                        >
                          {labels.editComponent}
                        </Button>
                        <Button
                          type="button"
                          className="btn-ghost btn-sm"
                          data-testid="delete-component"
                          onClick={() => handleDelete(row)}
                        >
                          {labels.deleteComponent}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* ── Secondary packaging panel ───────────────────────────────────────── */}
        <Card data-testid="secondary-packaging-card">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{labels.secondaryTitle}</CardTitle>
            {canWrite && (
              <Button
                type="button"
                className="btn-primary btn-sm"
                data-testid="add-secondary-component"
                onClick={() => openAdd('secondary')}
              >
                {labels.addComponent}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table data-testid="secondary-packaging-table">
              <TableBody>
                {visibleSecondary.map((row) => (
                  <TableRow key={row.id} data-testid="secondary-component-row">
                    <TableCell className="muted">{row.componentName}</TableCell>
                    <TableCell style={{ fontWeight: 500 }}>{row.material ?? labels.emDash}</TableCell>
                    <TableCell className="mono">{row.spec ?? labels.emDash}</TableCell>
                    <TableCell className="mono num">{formatMoney(row.costPerUnit, labels.emDash)}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            className="btn-ghost btn-sm"
                            data-testid="edit-secondary-component"
                            onClick={() => openEdit(row)}
                          >
                            {labels.editComponent}
                          </Button>
                          <Button
                            type="button"
                            className="btn-ghost btn-sm"
                            data-testid="delete-secondary-component"
                            onClick={() => handleDelete(row)}
                          >
                            {labels.deleteComponent}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Artwork panel ───────────────────────────────────────────────────── */}
        <Card data-testid="artwork-card">
          <CardHeader>
            <CardTitle>{labels.artworkTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.artwork ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 120,
                    height: 90,
                    background: 'linear-gradient(135deg, #fde68a, #f59e0b)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    color: '#78350f',
                    textAlign: 'center',
                  }}
                  data-testid="artwork-thumbnail"
                >
                  {data.productName}
                </div>
                <div>
                  <div style={{ fontWeight: 500 }} data-testid="artwork-filename">
                    {data.artwork.fileName}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }} data-testid="artwork-meta">
                    {data.artwork.uploadedAt} · {data.artwork.fileSize}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    {/* Artwork file store is a future deliverable (mig 232 leaves
                        artwork_file_id a soft nullable ref). These buttons stay
                        visible but disabled until that backend exists — never an
                        invented artwork API. */}
                    <Button
                      type="button"
                      className="btn-ghost btn-sm"
                      data-testid="artwork-preview"
                      disabled
                      title={labels.artworkUnavailable}
                    >
                      {labels.artworkPreview}
                    </Button>
                    {canWrite && (
                      <Button
                        type="button"
                        className="btn-secondary btn-sm"
                        data-testid="artwork-new-version"
                        disabled
                        title={labels.artworkUnavailable}
                      >
                        {labels.artworkNewVersion}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="muted" data-testid="artwork-none">
                {labels.artworkNone}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canWrite && onUpsert && (
        <PackagingComponentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          projectId={data.projectId}
          editing={editing}
          defaultTier={defaultTier}
          labels={labels}
          onUpsert={onUpsert}
          onMutated={handleMutated}
          searchItemsAction={searchItemsAction}
        />
      )}
    </main>
  );
}
