'use client';

/**
 * T-086 — ComplianceDocsScreen (SCR-10 Compliance documents, per-FA).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:6-53 (ComplianceDocsScreen)
 *
 * Translation notes (prototype → production):
 *   - window.NPD_DOCS[fa.fa_code]        → server-side withOrgContext read of public.compliance_docs
 *                                          (page.tsx → listDocs, owned by T-084 — imported, never authored here)
 *   - openModal('docUpload', {fa})        → DocUploadModal (wired to the T-084 uploadDoc action)
 *   - flat <table> (Type/File/Version/…)  → shadcn Table primitives, GROUPED per doc_type (one
 *                                          table per group) per AC#1 grouping requirement
 *   - <a> filename + Download button       → signed-URL Download button (T-084 getSignedUrl)
 *   - Delete button                        → soft-delete (T-084 softDeleteDoc) when canWrite
 *   - EmptyState (§3.8)                     → @monopilot/ui EmptyState
 *   - alert-blue "File types…" note        → footer note (i18n)
 *
 * Expiry status (T-085 expiry-scan formula, computed live from expires_at so the badge
 * never lags the nightly scan):
 *   - expires_at IS NULL          → Valid   (success / green)
 *   - expires_at <  today         → Expired (danger / red)
 *   - expires_at <= today + 30d   → Expiring (warning / amber)
 *   - else                        → Valid   (success / green)
 * Status is conveyed by an icon glyph + text label inside the Badge — color is never the
 * sole signal (a11y).
 *
 * RBAC: `canWrite` is resolved server-side (page.tsx via listDocs FORBIDDEN gate) and never
 * trusted from the client — Upload / Download / Delete controls are omitted when false
 * (no render-then-disable info leak).
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { DocUploadModal } from './doc-upload-modal';
import type { UploadDocAction } from './doc-upload-modal';

export type DocType = 'CoA' | 'SDS' | 'Spec' | 'Cert' | 'Other';
export type ExpiryStatus = 'Valid' | 'Expiring' | 'Expired';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

// Canonical doc-type render order (matches the DB CHECK enum on compliance_docs).
export const DOC_TYPE_ORDER: DocType[] = ['CoA', 'SDS', 'Spec', 'Cert', 'Other'];

export type ComplianceDocRow = {
  id: string;
  productCode: string;
  docType: DocType | string;
  title: string;
  versionNumber: number;
  uploadedAt: string;
  expiresAt: string | null;
};

export type GetSignedUrlAction = (input: { productCode: string; docId: string }) => Promise<
  ({ ok: true; url: string; expiresInSeconds: number } | { ok: false; code: string })
>;

export type SoftDeleteDocAction = (input: { productCode: string; docId: string }) => Promise<
  ({ ok: true; docId: string } | { ok: false; code: string })
>;

export type ComplianceDocsLabels = {
  title: string;
  subtitle: string;
  upload: string;
  colType: string;
  colTitle: string;
  colVersion: string;
  colUploaded: string;
  colExpires: string;
  colStatus: string;
  colActions: string;
  download: string;
  delete: string;
  noExpiry: string;
  statusValid: string;
  statusExpiring: string;
  statusExpired: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  fileTypesNote: string;
  docTypeCoA: string;
  docTypeSDS: string;
  docTypeSpec: string;
  docTypeCert: string;
  docTypeOther: string;
  // modal labels (passed through to DocUploadModal)
  modalTitle: string;
  modalSubtitle: string;
  fieldDocType: string;
  fieldTitle: string;
  fieldTitleHint: string;
  fieldFile: string;
  fieldFileHint: string;
  fieldExpires: string;
  fieldExpiresHint: string;
  cancel: string;
  uploadAction: string;
  errorTitleRequired: string;
  errorTitleTooLong: string;
  errorFileRequired: string;
  errorFileTooLarge: string;
  errorFileType: string;
  errorUpload: string;
};

/**
 * Live expiry classification — same thresholds as the T-085 SECURITY DEFINER scan
 * (public.compliance_docs_expiry_scan): null→Valid, <today→Expired, <=today+30→Expiring.
 */
export function classifyExpiry(expiresAt: string | null, now: Date = new Date()): ExpiryStatus {
  if (!expiresAt) return 'Valid';
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expiry = new Date(`${expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime())) return 'Valid';
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  if (expiry < today) return 'Expired';
  if (expiry <= horizon) return 'Expiring';
  return 'Valid';
}

function statusVariant(status: ExpiryStatus): BadgeVariant {
  switch (status) {
    case 'Expired':
      return 'danger';
    case 'Expiring':
      return 'warning';
    default:
      return 'success';
  }
}

function statusGlyph(status: ExpiryStatus): string {
  switch (status) {
    case 'Expired':
      return '✕';
    case 'Expiring':
      return '⚠';
    default:
      return '✓';
  }
}

function statusLabel(status: ExpiryStatus, labels: ComplianceDocsLabels): string {
  switch (status) {
    case 'Expired':
      return labels.statusExpired;
    case 'Expiring':
      return labels.statusExpiring;
    default:
      return labels.statusValid;
  }
}

function docTypeLabel(docType: string, labels: ComplianceDocsLabels): string {
  switch (docType) {
    case 'CoA':
      return labels.docTypeCoA;
    case 'SDS':
      return labels.docTypeSDS;
    case 'Spec':
      return labels.docTypeSpec;
    case 'Cert':
      return labels.docTypeCert;
    case 'Other':
      return labels.docTypeOther;
    default:
      return docType;
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // Render the leading date portion only (compliance dates are date-granular).
  return value.slice(0, 10);
}

// Design-system badge tone class (the @monopilot/ui Badge BEM `.badge--*` variant is
// unstyled in globals.css; the explicit `.badge-{tone}` class carries the real color).
function statusBadgeClass(status: ExpiryStatus): string {
  switch (status) {
    case 'Expired':
      return 'badge-red';
    case 'Expiring':
      return 'badge-amber';
    default:
      return 'badge-green';
  }
}

/** Status badge — color is paired with a glyph + text label so status is never color-only (a11y). */
function ExpiryStatusBadge({ status, labels }: { status: ExpiryStatus; labels: ComplianceDocsLabels }) {
  const label = statusLabel(status, labels);
  return (
    <Badge
      variant={statusVariant(status)}
      className={statusBadgeClass(status)}
      data-testid="doc-status-badge"
      data-status={status}
      aria-label={label}
    >
      <span aria-hidden="true">{statusGlyph(status)}</span> {label}
    </Badge>
  );
}

function StateNotice({ state, labels }: { state: PageState; labels: ComplianceDocsLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function ComplianceDocsScreen({
  productCode,
  rows,
  labels,
  canWrite,
  state = 'ready',
  uploadDocAction,
  getSignedUrlAction,
  softDeleteDocAction,
}: {
  productCode: string;
  rows: ComplianceDocRow[];
  labels: ComplianceDocsLabels;
  canWrite: boolean;
  state?: PageState;
  uploadDocAction?: UploadDocAction;
  getSignedUrlAction?: GetSignedUrlAction;
  softDeleteDocAction?: SoftDeleteDocAction;
}) {
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [busyDownloadId, setBusyDownloadId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Group docs by doc_type in canonical order; only groups with docs are rendered.
  const groups = React.useMemo(() => {
    const byType = new Map<string, ComplianceDocRow[]>();
    for (const row of rows) {
      const list = byType.get(row.docType) ?? [];
      list.push(row);
      byType.set(row.docType, list);
    }
    const ordered: Array<{ docType: string; docs: ComplianceDocRow[] }> = [];
    for (const docType of DOC_TYPE_ORDER) {
      const docs = byType.get(docType);
      if (docs && docs.length > 0) ordered.push({ docType, docs });
    }
    // Any unknown doc_type values (defensive) appended in stable order.
    for (const [docType, docs] of byType) {
      if (!DOC_TYPE_ORDER.includes(docType as DocType)) ordered.push({ docType, docs });
    }
    return ordered;
  }, [rows]);

  const dataLoaded = state === 'ready' || state === 'empty';

  async function handleDownload(docId: string) {
    if (!getSignedUrlAction) return;
    setActionError(null);
    setBusyDownloadId(docId);
    try {
      const result = await getSignedUrlAction({ productCode, docId });
      if (result.ok) {
        // Open the short-lived signed URL in a new tab (no client storage of the URL).
        if (typeof window !== 'undefined') window.open(result.url, '_blank', 'noopener,noreferrer');
      } else {
        setActionError(labels.error);
      }
    } catch {
      setActionError(labels.error);
    } finally {
      setBusyDownloadId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!softDeleteDocAction) return;
    setActionError(null);
    try {
      const result = await softDeleteDocAction({ productCode, docId });
      if (!result.ok) setActionError(labels.error);
    } catch {
      setActionError(labels.error);
    }
  }

  return (
    <main
      data-testid="compliance-docs-screen"
      aria-labelledby="compliance-docs-title"
      className="card"
    >
      <div className="card-head">
        <div>
          <nav aria-label="breadcrumb" className="muted" style={{ fontSize: 11 }}>
            NPD / <span className="mono">{productCode}</span> / {labels.title}
          </nav>
          <h1 id="compliance-docs-title" className="card-title" style={{ marginTop: 2 }}>
            {labels.title}
          </h1>
          <div className="muted" style={{ fontSize: 11 }}>{labels.subtitle}</div>
        </div>
        {canWrite ? (
          <Button
            type="button"
            className="btn-secondary btn-sm"
            aria-label={labels.upload}
            onClick={() => setUploadOpen(true)}
          >
            {labels.upload}
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div role="alert" className="alert alert-red">
          {actionError}
        </div>
      ) : null}

      {!dataLoaded ? (
        <StateNotice state={state} labels={labels} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📄"
          title={labels.empty}
          body={labels.emptyBody}
          action={
            canWrite
              ? { label: labels.upload, onClick: () => setUploadOpen(true) }
              : (<span className="muted">—</span> as React.ReactElement)
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(({ docType, docs }) => (
            <div key={docType} data-testid={`doc-group-${docType}`} data-doc-type={docType}>
              <h2 style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge variant="muted" className="badge-gray" aria-hidden="true">
                  {docTypeLabel(docType, labels)}
                </Badge>
                <span className="sr-only">{docTypeLabel(docType, labels)}</span>
                <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>({docs.length})</span>
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <Table aria-label={`${docTypeLabel(docType, labels)} — ${labels.title}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.colType}</TableHead>
                      <TableHead scope="col">{labels.colTitle}</TableHead>
                      <TableHead scope="col" style={{ textAlign: 'center' }}>{labels.colVersion}</TableHead>
                      <TableHead scope="col">{labels.colUploaded}</TableHead>
                      <TableHead scope="col">{labels.colExpires}</TableHead>
                      <TableHead scope="col">{labels.colStatus}</TableHead>
                      <TableHead scope="col">{labels.colActions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map((doc) => {
                      const status = classifyExpiry(doc.expiresAt);
                      const expiresText = formatDate(doc.expiresAt);
                      return (
                        <TableRow
                          key={doc.id}
                          data-testid={`doc-row-${doc.id}`}
                          data-doc-type={doc.docType}
                          data-status={status}
                        >
                          <TableCell>
                            <Badge variant="muted" className="badge-gray" aria-label={docTypeLabel(doc.docType, labels)}>
                              {docTypeLabel(doc.docType, labels)}
                            </Badge>
                          </TableCell>
                          <TableCell style={{ fontWeight: 500 }}>
                            <span aria-hidden="true">📄</span>{' '}
                            <span style={{ color: 'var(--blue)' }}>{doc.title}</span>
                          </TableCell>
                          <TableCell className="mono" style={{ textAlign: 'center', fontSize: 12 }}>
                            v{doc.versionNumber}
                          </TableCell>
                          <TableCell className="mono" style={{ fontSize: 12 }}>
                            {formatDate(doc.uploadedAt) ?? <span className="muted">—</span>}
                          </TableCell>
                          <TableCell className="mono" style={{ fontSize: 12 }}>
                            {expiresText ?? <span className="muted">{labels.noExpiry}</span>}
                          </TableCell>
                          <TableCell>
                            <ExpiryStatusBadge status={status} labels={labels} />
                          </TableCell>
                          <TableCell style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Button
                                type="button"
                                className="btn-ghost btn-sm"
                                aria-label={`${labels.download} ${doc.title}`}
                                disabled={busyDownloadId === doc.id || !getSignedUrlAction}
                                onClick={() => handleDownload(doc.id)}
                              >
                                {labels.download}
                              </Button>
                              {canWrite && softDeleteDocAction ? (
                                <Button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  style={{ color: 'var(--red)' }}
                                  aria-label={`${labels.delete} ${doc.title}`}
                                  onClick={() => handleDelete(doc.id)}
                                >
                                  {labels.delete}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="alert alert-blue" style={{ marginTop: 12 }}>{labels.fileTypesNote}</div>

      {uploadOpen ? (
        <DocUploadModal
          open
          productCode={productCode}
          labels={labels}
          onClose={() => setUploadOpen(false)}
          uploadDocAction={uploadDocAction}
        />
      ) : null}
    </main>
  );
}

export default ComplianceDocsScreen;
