'use client';

/**
 * T-138 — FA detail modal host (query-trigger wiring).
 *
 * Maps the `?modal=` URL state pushed by the right-panel quick actions to the
 * correct dialog, using the SAME query-trigger pattern as the brief modals host
 * (T-035/T-121): the host never decides RBAC and never touches the DB — it only
 * turns URL state into the right injected modal and closes by stripping `?modal=`.
 *
 *   - `?modal=deptClose` → Dept Close modal (real dialog body is T-022).
 *   - `?modal=d365Build` → D365 Build modal (real dialog body is T-021).
 *
 * STRICT SCOPE: the dialog bodies themselves are OUT OF SCOPE for T-138
 * (T-021 d365Build / T-022 deptClose). This host therefore mounts the real
 * @monopilot/ui Modal shell with a deferred body + the carried context (FA code,
 * dept), so the wiring (open/route/close) is exercised end-to-end while the
 * dialog content lands in its owning task. No mock, no DB write here.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import { deleteFa } from '../_actions/delete-fa';

export type FaDetailModalHostLabels = {
  deptCloseTitle: string;
  deptCloseDeferred: string;
  d365BuildTitle: string;
  d365BuildDeferred: string;
  deleteTitle: string;
  deleteIntro: string;
  deleteBlockedBuilt: string;
  deleteTypeToConfirm: string;
  deleteReason: string;
  deleteReasonPlaceholder: string;
  deleteConfirm: string;
  deletePending: string;
  deleteError: string;
  close: string;
};

export type FaDetailModalHostProps = {
  productCode: string;
  productName: string | null;
  labels: FaDetailModalHostLabels;
};

const OPEN_KEYS = ['deptClose', 'd365Build', 'faDelete'] as const;
type OpenKey = (typeof OPEN_KEYS)[number];

function isOpenKey(value: string | null): value is OpenKey {
  return value !== null && (OPEN_KEYS as readonly string[]).includes(value);
}

export function FaDetailModalHost({ productCode, productName, labels }: FaDetailModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [typed, setTyped] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const rawModal = searchParams?.get('modal') ?? null;
  const modal = isOpenKey(rawModal) ? rawModal : null;

  function closeModal() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('modal');
    params.delete('dept');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleOpenChange(next: boolean) {
    if (!next) closeModal();
  }

  const subtitle = `${productCode}${productName ? ` · ${productName}` : ''}`;
  const deleteValid = typed.trim().toUpperCase() === productCode.toUpperCase() && reason.trim().length >= 10;

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteFa({ productCode, reason });
        closeModal();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : labels.deleteError);
      }
    });
  }

  return (
    <div data-testid="fa-modal-host">
      <Modal
        open={modal === 'deptClose'}
        onOpenChange={handleOpenChange}
        size="md"
        modalId="npd-fa-dept-close"
      >
        <Modal.Header title={labels.deptCloseTitle} />
        <p data-slot="dialog-subtitle" className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
        <Modal.Body>
          <p data-testid="fa-modal-deptClose" role="status" className="py-4 text-sm text-slate-600">
            {labels.deptCloseDeferred}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
            {labels.close}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={modal === 'd365Build'}
        onOpenChange={handleOpenChange}
        size="md"
        modalId="npd-fa-d365-build"
      >
        <Modal.Header title={labels.d365BuildTitle} />
        <p data-slot="dialog-subtitle" className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
        <Modal.Body>
          <p data-testid="fa-modal-d365Build" role="status" className="py-4 text-sm text-slate-600">
            {labels.d365BuildDeferred}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
            {labels.close}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        open={modal === 'faDelete'}
        onOpenChange={handleOpenChange}
        size="md"
        modalId="npd-fa-delete"
      >
        <Modal.Header title={labels.deleteTitle.replace('{productCode}', productCode)} />
        <p data-slot="dialog-subtitle" className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
        <Modal.Body>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">{labels.deleteIntro}</p>
            <div className="alert alert-amber text-sm">{labels.deleteBlockedBuilt}</div>
            <label className="grid gap-1 text-sm">
              <span>{labels.deleteTypeToConfirm.replace('{productCode}', productCode)}</span>
              <input
                className="form-input font-mono"
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value.toUpperCase())}
                placeholder={productCode}
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{labels.deleteReason}</span>
              <textarea
                className="form-input min-h-20"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder={labels.deleteReasonPlaceholder}
              />
            </label>
            {error ? (
              <div role="alert" className="alert alert-red text-sm">
                {error}
              </div>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={closeModal} disabled={isPending}>
            {labels.close}
          </Button>
          <Button
            type="button"
            className="btn-danger btn-sm"
            onClick={confirmDelete}
            disabled={!deleteValid || isPending}
            aria-disabled={!deleteValid || isPending}
          >
            {isPending ? labels.deletePending : labels.deleteConfirm}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default FaDetailModalHost;
