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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ComponentAddModal, VersionSaveModal, type BomEditContext } from './bom-edit-dialog';
import { DeleteBomVersionModal, type DeleteVersionLabels } from './delete-version-modal';
import { deleteBomVersion } from '../_actions/delete-bom-version';
import { approveBom, publishBom } from '../_actions/workflow';
import type { BomStatus } from '../_actions/shared';

type EditLine = {
  itemId?: string;
  componentCode: string;
  quantity: number;
  uom: string;
  scrapPct?: number;
  manufacturingOperationName?: string;
};

export function BomDetailActions({
  productId,
  productName,
  currentVersion,
  status,
  snapshotCount,
  lines,
  canCreate,
  canApprove,
  canPublish,
}: {
  productId: string;
  productName: string | null;
  currentVersion: number;
  status: BomStatus;
  snapshotCount: number;
  lines: EditLine[];
  canCreate: boolean;
  canApprove: boolean;
  canPublish: boolean;
}) {
  const t = useTranslations('technical.bom.actions');
  const tDelete = useTranslations('technical.bomDelete');
  const router = useRouter();

  const [addOpen, setAddOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [approveState, setApproveState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [approveMsg, setApproveMsg] = React.useState<string | null>(null);
  const [publishState, setPublishState] = React.useState<'idle' | 'pending' | 'error'>('idle');
  const [publishMsg, setPublishMsg] = React.useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const ctx: BomEditContext = {
    productId,
    productName: productName ?? undefined,
    currentVersion,
    sourceStatus: status,
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
    startTransition(async () => {
      const res = await approveBom({ productId, version: currentVersion });
      if (res.ok) {
        setApproveState('idle');
        router.refresh();
      } else {
        setApproveState('error');
        setApproveMsg(
          res.error === 'forbidden'
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
        router.push('/technical/bom');
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

  if (!canCreate && !canApprove && !canPublish) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2" data-testid="bom-detail-actions">
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

      {approveState === 'error' && approveMsg ? (
        <span role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
          {approveMsg}
        </span>
      ) : null}
      {publishState === 'error' && publishMsg ? (
        <span role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
          {publishMsg}
        </span>
      ) : null}
      {deleteMsg ? (
        <span role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
          {deleteMsg}
        </span>
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
