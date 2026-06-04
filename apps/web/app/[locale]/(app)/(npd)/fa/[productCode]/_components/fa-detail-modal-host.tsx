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

import Modal from '@monopilot/ui/Modal';
import { Button } from '@monopilot/ui/Button';

export type FaDetailModalHostLabels = {
  deptCloseTitle: string;
  deptCloseDeferred: string;
  d365BuildTitle: string;
  d365BuildDeferred: string;
  close: string;
};

export type FaDetailModalHostProps = {
  productCode: string;
  productName: string | null;
  labels: FaDetailModalHostLabels;
};

const OPEN_KEYS = ['deptClose', 'd365Build'] as const;
type OpenKey = (typeof OPEN_KEYS)[number];

function isOpenKey(value: string | null): value is OpenKey {
  return value !== null && (OPEN_KEYS as readonly string[]).includes(value);
}

export function FaDetailModalHost({ productCode, productName, labels }: FaDetailModalHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modal = searchParams?.get('modal') ?? null;
  const open = isOpenKey(modal);

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
    </div>
  );
}

export default FaDetailModalHost;
