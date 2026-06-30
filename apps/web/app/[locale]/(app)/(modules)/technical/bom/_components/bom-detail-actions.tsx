'use client';

/**
 * TW1-bom — BOM detail action bar (client island).
 *
 * Prototype parity:
 *   `prototypes/design/Monopilot Design System/technical/bom-detail.jsx:37-42`
 *     (sticky header CTA cluster — secondary actions + a primary Edit) →
 *     translated to the SSOT-backed actions the shared BOM model actually has:
 *       · Add component  → MODAL-03 ComponentAddModal (real createBomDraft)
 *       · Save version   → MODAL-02 VersionSaveModal   (real createBomDraft)
 *       · Approve        → real approveBom (draft|in_review → technical_approved)
 *   Modal chrome already matches `modals.jsx:168-243` (.modal-* / .ff / .form-input).
 *
 * Why this island exists: before this lane the detail screen (BomDetailScreen)
 * rendered ZERO action buttons, so the wired ComponentAddModal / VersionSaveModal /
 * approveBom were unreachable dead code. This island mounts them behind the header
 * CTAs and is gated by server-resolved RBAC (canCreate / canApprove) — never
 * trusted from the client.
 *
 * Real data — NO mocks. Clone-on-write: Add component / Save version always create
 * a NEW draft via createBomDraft; released rows are never mutated in place.
 *
 * Delete version calls the real deleteBomVersion Server Action. The action is
 * server-authoritative for draft-only, only-version, and snapshot guards.
 */

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  ComponentAddModal,
  VersionSaveModal,
  type BomEditCoProduct,
  type BomEditContext,
  type BomEditLine,
} from './bom-edit-dialog';
import { DeleteBomVersionModal, type DeleteVersionLabels } from './delete-version-modal';
import { deleteBomVersion } from '../_actions/delete-bom-version';
import { approveBom, publishBom } from '../_actions/workflow';
import type { BomRmUsabilityFailure, BomStatus } from '../_actions/shared';

type EditLine = BomEditLine;

export function BomDetailActions({
  productId,
  productName,
  currentVersion,
  status,
  bomHeaderId,
  snapshotCount,
  lines,
  coProducts,
  yieldPct,
  canCreate,
  canApprove,
  canPublish,
}: {
  productId: string;
  productName: string | null;
  currentVersion: number;
  status: BomStatus;
  /** Selected version's bom_headers.id — keys the in-place append (F-B01). */
  bomHeaderId?: string;
  snapshotCount: number;
  lines: EditLine[];
  /** Source version co-products — carried into a clone-on-write fork. */
  coProducts?: BomEditCoProduct[];
  /** Source version yield_pct — preserved on fork. */
  yieldPct?: number;
  canCreate: boolean;
  canApprove: boolean;
  canPublish: boolean;
}) {
  const t = useTranslations('technical.bom.actions');
  const tApproveErr = useTranslations('technical.bom.approveErrors');
  const tDelete = useTranslations('technical.bomDelete');
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';

  const [addOpen, setAddOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [approveState, setApproveState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [approveMsg, setApproveMsg] = React.useState<string | null>(null);
  /**
   * Structured per-component sourcing failures from the approve preflight. Kept
   * separate from `approveMsg` so a real validation block renders as the alert
   * card below, while non-validation errors (forbidden / generic) keep the plain
   * fallback message.
   */
  const [approveFailures, setApproveFailures] = React.useState<BomRmUsabilityFailure[] | null>(null);
  const [publishState, setPublishState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [publishMsg, setPublishMsg] = React.useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const ctx: BomEditContext = {
    productId,
    productName: productName ?? undefined,
    currentVersion,
    sourceStatus: status,
    // F-B01: hand the modal everything it needs to either APPEND in place
    // (editable draft) or fork COMPLETELY (released → all lines + co-products).
    bomHeaderId,
    existingLines: lines,
    coProducts,
    yieldPct,
  };

  // Approve only makes sense for a draft / in_review version.
  const approvable = status === 'draft' || status === 'in_review';
  // Publish (technical_approved -> active) only makes sense once approved.
  const publishable = status === 'technical_approved';
  const deletable = status === 'draft';
  const deleteLabels: DeleteVersionLabels = {
    title: tDelete('title'),
    subtitle: tDelete('subtitle'),
    warning: tDelete.raw('warning'),
    blockedBySnapshots: tDelete.raw('blockedBySnapshots'),
    blockedByStatus: tDelete('blockedByStatus'),
    confirmLabel: tDelete.raw('confirmLabel'),
    cancel: tDelete('cancel'),
    delete: tDelete('delete'),
  };

  function onApprove() {
    setApproveState('pending');
    setApproveMsg(null);
    setApproveFailures(null);
    startTransition(async () => {
      const res = await approveBom({ productId, version: currentVersion });
      if (res.ok) {
        setApproveState('idle');
        router.refresh();
      } else {
        setApproveState('error');
        // A sourcing-validation block carries the structured per-component
        // failures → render the alert card. Anything else (forbidden / generic)
        // keeps the plain fallback message and renders no card.
        const failures = res.rmUsabilityFailures ?? null;
        setApproveFailures(failures && failures.length > 0 ? failures : null);
        setApproveMsg(
          failures && failures.length > 0
            ? null
            : res.error === 'forbidden'
              ? t('approveForbidden')
              : res.message ?? t('approveError'),
        );
      }
    });
  }

  function onPublish() {
    setPublishState('pending');
    setPublishMsg(null);
    startTransition(async () => {
      const res = await publishBom({ productId, version: currentVersion });
      if (res.ok) {
        setPublishState('idle');
        router.refresh();
      } else {
        setPublishState('error');
        setPublishMsg(
          res.error === 'forbidden'
            ? t('publishForbidden')
            : res.message ?? t('publishError'),
        );
      }
    });
  }

  function onDelete() {
    setDeleteMsg(null);
    startTransition(async () => {
      const res = await deleteBomVersion({ productId, version: currentVersion });
      if (res.ok) {
        router.push(`/${locale}/technical/bom`);
        router.refresh();
        return;
      }
      setDeleteMsg(
        res.error === 'forbidden'
          ? t('deleteForbidden')
          : res.error === 'snapshot_referenced'
            ? t('deleteSnapshotBlocked')
            : res.error === 'only_version'
              ? t('deleteOnlyVersion')
              : res.error === 'not_draft'
                ? t('deleteStatusBlocked')
                : res.message ?? t('deleteError'),
      );
    });
  }

  // Map a machine reason code to a friendly, translated label. Falls back to the
  // raw code for any unmapped / not-yet-localised code so we never throw on a
  // locale that lacks the key (ro/uk are mirrored by the i18n script).
  function reasonLabel(code: string): string {
    return tApproveErr.has(`reasons.${code}`) ? tApproveErr(`reasons.${code}`) : code;
  }

  if (!canCreate && !canApprove && !canPublish) return null;

  return (
    <div className="flex w-full flex-col items-stretch gap-2" data-testid="bom-detail-actions">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {canCreate ? (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="bom-add-component-cta"
            onClick={() => setAddOpen(true)}
          >
            {t('addComponent')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="bom-save-version-cta"
            disabled={lines.length === 0}
            onClick={() => setSaveOpen(true)}
          >
            {t('saveVersion')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="bom-delete-version-cta"
            disabled={pending}
            onClick={() => setDeleteOpen(true)}
          >
            {t('deleteVersion')}
          </button>
        </>
      ) : null}

      {canApprove && approvable ? (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="bom-approve-cta"
          disabled={pending || approveState === 'pending'}
          onClick={onApprove}
        >
          {approveState === 'pending' || pending ? t('approving') : t('approve')}
        </button>
      ) : null}

      {canPublish && publishable ? (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="bom-publish-cta"
          disabled={pending || publishState === 'pending'}
          onClick={onPublish}
        >
          {publishState === 'pending' || pending ? t('publishing') : t('publish')}
        </button>
      ) : null}
      </div>

      {/* Sourcing-validation block — structured per-component failures rendered
          as the app's standard danger alert, full-width BELOW the CTA strip
          (no longer a raw machine string jammed into the button row). */}
      {approveState === 'error' && approveFailures && approveFailures.length > 0 ? (
        <div role="alert" className="alert alert-red" data-testid="bom-approve-failures">
          <div className="alert-title">{tApproveErr('title')}</div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {tApproveErr('intro')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px]">
            {approveFailures.map((failure) => (
              <li key={failure.componentCode} data-component-code={failure.componentCode}>
                <strong className="mono">{failure.componentCode}</strong>
                {' — '}
                {failure.reasons.map((code) => reasonLabel(code)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : approveState === 'error' && approveMsg ? (
        <div role="alert" className="alert alert-red" data-testid="bom-approve-error">
          <div className="alert-title">{approveMsg}</div>
        </div>
      ) : null}
      {publishState === 'error' && publishMsg ? (
        <div role="alert" className="alert alert-red" data-testid="bom-publish-error">
          <div className="alert-title">{publishMsg}</div>
        </div>
      ) : null}
      {deleteMsg ? (
        <div role="alert" className="alert alert-red" data-testid="bom-delete-error">
          <div className="alert-title">{deleteMsg}</div>
        </div>
      ) : null}

      {canCreate && addOpen ? (
        <ComponentAddModal open={addOpen} onClose={() => setAddOpen(false)} context={ctx} />
      ) : null}
      {canCreate && saveOpen ? (
        <VersionSaveModal open={saveOpen} onClose={() => setSaveOpen(false)} context={ctx} lines={lines} />
      ) : null}
      {canCreate && deleteOpen ? (
        <DeleteBomVersionModal
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          versionLabel={`v${currentVersion}`}
          snapshotCount={snapshotCount}
          deletable={deletable}
          labels={deleteLabels}
          onConfirm={onDelete}
        />
      ) : null}
    </div>
  );
}

export default BomDetailActions;
