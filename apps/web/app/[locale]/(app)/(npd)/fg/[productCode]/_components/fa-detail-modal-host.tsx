'use client';

/**
 * T-138 — FA detail modal host (query-trigger wiring).
 *
 * Maps the `?modal=` URL state pushed by the right-panel quick actions to the
 * correct dialog, using the SAME query-trigger pattern as the brief modals host
 * (T-035/T-121): the host never decides RBAC and never touches the DB — it only
 * turns URL state into the right injected modal and closes by stripping `?modal=`.
 *
 *   - `?modal=deptClose` → REAL Dept Close modal (T-022 `DeptCloseModal`).
 *   - `?modal=d365Build` → D365 Build modal (real dialog body is T-021 — deferred here).
 *
 * Dept Close (now real, not a stub):
 *   The host resolves the target dept from `?dept=` (explicit) or the active
 *   `?tab=` slug, fetches the per-dept required-field checklist via the
 *   `getRequiredFieldsForDept` Server Action (status loading → ready/error), and
 *   mounts the controlled `DeptCloseModal`. RBAC is NEVER client-trusted: when the
 *   server-resolved `canClose` is false the modal shows the forbidden state and no
 *   readiness probe runs. Confirm calls `closeDeptSection` (the server recomputes
 *   readiness) then strips `?modal=` and `router.refresh()`es the dept tabs.
 *
 * The Server Actions are imported directly into this client component — exactly
 * the pattern already used for `deleteFa` (Next serializes the 'use server'
 * reference across the boundary). No mock, no DB query in client code here.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';
import { deleteFa } from '../../../../../../(npd)/fa/actions/delete-fa';
import {
  DeptCloseModal,
  type DeptCloseConfirmInput,
  type DeptCloseModalStatus,
} from '../../../../../../(npd)/_modals/dept-close-modal';
import {
  getRequiredFieldsForDept,
  type Dept,
  type RequiredFieldsForDept,
} from '../../../../../../(npd)/fa/actions/get-required-fields-for-dept';
import { closeDeptSection } from '../../../../../../(npd)/fa/actions/close-dept-section';
import { reopenDeptSection } from '../../../../../../(npd)/fa/actions/reopen-dept-section';

/**
 * Map an FA detail tab slug (lower-case, T-136 FaTabs) to the canonical `Dept`
 * union the readiness/close actions accept. `bom`/`history` are not closeable
 * departments — they fall back to `Core` (the only dept always actionable).
 */
const TAB_SLUG_TO_DEPT: Record<string, Dept> = {
  core: 'Core',
  planning: 'Planning',
  commercial: 'Commercial',
  production: 'Production',
  technical: 'Technical',
  mrp: 'MRP',
  procurement: 'Procurement',
};

const DEPT_VALUES: readonly Dept[] = [
  'Core',
  'Planning',
  'Commercial',
  'Production',
  'Technical',
  'MRP',
  'Procurement',
];

function resolveDept(deptParam: string | null, tabParam: string | null): Dept {
  if (deptParam && (DEPT_VALUES as readonly string[]).includes(deptParam)) {
    return deptParam as Dept;
  }
  if (deptParam && TAB_SLUG_TO_DEPT[deptParam.toLowerCase()]) {
    return TAB_SLUG_TO_DEPT[deptParam.toLowerCase()];
  }
  if (tabParam && TAB_SLUG_TO_DEPT[tabParam.toLowerCase()]) {
    return TAB_SLUG_TO_DEPT[tabParam.toLowerCase()];
  }
  return 'Core';
}

export type FaDetailModalHostLabels = {
  deptCloseTitle: string;
  deptCloseDeferred: string;
  /** BUG 4a — Reopen-department confirm modal (counterpart of Dept Close). */
  deptReopenTitle: string;
  deptReopenIntro: string;
  deptReopenConfirm: string;
  deptReopenPending: string;
  deptReopenError: string;
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
  /**
   * Server-resolved `npd.fa.close` gate (the layout reads it once under
   * withOrgContext). When false the Dept Close modal renders its forbidden state
   * and never probes readiness — RBAC is never trusted client-side.
   */
  canClose: boolean;
  labels: FaDetailModalHostLabels;
};

const OPEN_KEYS = ['deptClose', 'deptReopen', 'd365Build', 'faDelete'] as const;
type OpenKey = (typeof OPEN_KEYS)[number];

function isOpenKey(value: string | null): value is OpenKey {
  return value !== null && (OPEN_KEYS as readonly string[]).includes(value);
}

export function FaDetailModalHost({ productCode, productName, canClose, labels }: FaDetailModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [typed, setTyped] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const rawModal = searchParams?.get('modal') ?? null;
  const modal = isOpenKey(rawModal) ? rawModal : null;

  // ── Dept Close readiness state machine ──────────────────────────────────────
  // The target dept is taken from ?dept= (explicit) or the active ?tab= slug.
  const deptParam = searchParams?.get('dept') ?? null;
  const tabParam = searchParams?.get('tab') ?? null;
  const dept = resolveDept(deptParam, tabParam);

  const deptCloseOpen = modal === 'deptClose';
  const [deptStatus, setDeptStatus] = React.useState<DeptCloseModalStatus>('loading');
  const [requiredFields, setRequiredFields] = React.useState<RequiredFieldsForDept | null>(null);

  React.useEffect(() => {
    if (!deptCloseOpen) {
      setDeptStatus('loading');
      setRequiredFields(null);
      return;
    }
    // RBAC is server-resolved: a caller without npd.fa.close gets the forbidden
    // state and we never run the readiness probe.
    if (!canClose) {
      setDeptStatus('forbidden');
      setRequiredFields(null);
      return;
    }
    let active = true;
    setDeptStatus('loading');
    setRequiredFields(null);
    getRequiredFieldsForDept(productCode, dept)
      .then((result) => {
        if (!active) return;
        setRequiredFields(result);
        setDeptStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setRequiredFields(null);
        setDeptStatus('error');
      });
    return () => {
      active = false;
    };
  }, [deptCloseOpen, canClose, productCode, dept]);

  function confirmDeptClose({ dept: confirmDept }: DeptCloseConfirmInput) {
    return closeDeptSection(productCode, confirmDept)
      .then(() => {
        closeModal();
        router.refresh();
      })
      .catch(() => {
        setDeptStatus('error');
      });
  }

  // ── Reopen-department confirm (BUG 4a) ──────────────────────────────────────
  // Counterpart of Dept Close: undo a dept-section close. RBAC
  // (`npd.closed_flag.unset`) is enforced SERVER-SIDE inside reopenDeptSection —
  // the host never client-trusts a permission flag; a forbidden caller surfaces
  // the action's error inline. Reuses the same `?dept=` resolution as deptClose.
  const deptReopenOpen = modal === 'deptReopen';
  const [reopenError, setReopenError] = React.useState<string | null>(null);
  const [reopenPending, startReopen] = React.useTransition();

  React.useEffect(() => {
    if (!deptReopenOpen) setReopenError(null);
  }, [deptReopenOpen]);

  function confirmDeptReopen() {
    setReopenError(null);
    startReopen(async () => {
      try {
        await reopenDeptSection(productCode, dept);
        closeModal();
        router.refresh();
      } catch (err) {
        setReopenError(err instanceof Error ? err.message : labels.deptReopenError);
      }
    });
  }

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
      <DeptCloseModal
        open={deptCloseOpen}
        dept={dept}
        fa={{ faCode: productCode, productName: productName ?? productCode }}
        requiredFields={requiredFields}
        status={deptStatus}
        onClose={closeModal}
        onConfirm={confirmDeptClose}
      />

      <Modal
        open={deptReopenOpen}
        onOpenChange={handleOpenChange}
        size="md"
        modalId="npd-fa-dept-reopen"
      >
        <Modal.Header title={labels.deptReopenTitle.replace('{dept}', dept)} />
        <p data-slot="dialog-subtitle" className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
        <Modal.Body>
          <p data-testid="fa-modal-deptReopen" className="py-2 text-sm text-slate-700">
            {labels.deptReopenIntro.replace('{dept}', dept)}
          </p>
          {reopenError ? (
            <div role="alert" className="alert alert-red text-sm">
              {reopenError}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={closeModal} disabled={reopenPending}>
            {labels.close}
          </Button>
          <Button
            type="button"
            className="btn-primary btn-sm"
            onClick={confirmDeptReopen}
            disabled={reopenPending}
            aria-disabled={reopenPending}
            data-testid="fa-modal-deptReopen-confirm"
          >
            {reopenPending ? labels.deptReopenPending : labels.deptReopenConfirm}
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
