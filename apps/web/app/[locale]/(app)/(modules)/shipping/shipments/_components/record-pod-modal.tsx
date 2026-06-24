'use client';

/**
 * Wave-shipping — Record POD (proof of delivery) modal (client island).
 *
 * Spec-driven (no dedicated POD region in pack-screens.jsx — the nearest reusable
 * pattern is the right-rail ship-confirm action group at pack-screens.jsx:211-216
 * and the e-sign / signed-doc modals at quality/modals.jsx). A delivered shipment
 * captures the signed-POD document URL; recordPod stamps delivered_at + stores the
 * signed-BOL url. Wires the reviewed recordPod Server Action (passed as a seam —
 * never authored).
 *
 * RBAC: gated by ship.dashboard.view server-side inside recordPod; `canPod` is an
 * advisory server probe used ONLY to disable + tooltip the trigger. A forbidden
 * result is surfaced inline — never crashes.
 *
 * NO raw UUIDs: the modal shows the shipment NUMBER only.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';

import type { RecordPodResult } from './shipment-ship-types';

export type RecordPodLabels = {
  trigger: string;
  title: string;
  description: string;
  signedUrlLabel: string;
  signedUrlHelp: string;
  signedUrlPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  /** Tooltip when the trigger is disabled because the user lacks ship.dashboard.view. */
  noPermission: string;
  errors: Record<string, string>;
};

export function RecordPodModal({
  shipmentNumber,
  shipmentId,
  canPod,
  statusReady = true,
  statusTooltip,
  labels,
  recordPodAction,
}: {
  shipmentNumber: string;
  shipmentId: string;
  canPod: boolean;
  /**
   * Whether the shipment STATUS allows recording a POD (server: status === 'shipped').
   * Defaults to true so existing callers/tests that don't gate by status are unaffected;
   * the controls rail passes the real condition to close the state-machine leak.
   */
  statusReady?: boolean;
  /** Tooltip shown when the trigger is disabled because of the shipment status. */
  statusTooltip?: string;
  labels: RecordPodLabels;
  recordPodAction: (input: { shipmentId: string; signedPdfUrl?: string }) => Promise<RecordPodResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [signedUrl, setSignedUrl] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const disabled = !canPod || !statusReady;
  const tooltip = !canPod ? labels.noPermission : !statusReady ? statusTooltip : undefined;

  function reset() {
    setSignedUrl('');
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) reset();
    setOpen(next);
  }

  async function onSubmit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await recordPodAction({
        shipmentId,
        signedPdfUrl: signedUrl.trim() || undefined,
      });
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setError(labels.errors.persistence_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="shipment-record-pod-trigger"
        className="btn btn--secondary w-full"
        disabled={disabled}
        title={tooltip}
        onClick={() => onOpenChange(true)}
      >
        {labels.trigger}
      </button>

      <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="shipment_record_pod" dismissible={!pending}>
        <Modal.Header title={labels.title.replace('{shipment}', shipmentNumber || '—')} />
        <Modal.Body>
          <div data-testid="shipment-record-pod-form" className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-slate-500">{labels.description}</p>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.signedUrlLabel}</span>
              <Input
                type="url"
                data-testid="shipment-pod-signed-url"
                value={signedUrl}
                placeholder={labels.signedUrlPlaceholder}
                disabled={pending}
                onChange={(e) => setSignedUrl(e.target.value)}
              />
              <span className="text-xs text-slate-400">{labels.signedUrlHelp}</span>
            </label>

            {error ? (
              <p role="alert" data-testid="shipment-pod-error" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="shipment-pod-cancel"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            data-testid="shipment-pod-submit"
            onClick={() => void onSubmit()}
            disabled={pending}
            aria-busy={pending}
            className="btn btn--primary"
          >
            {pending ? labels.submitting : labels.submit}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
