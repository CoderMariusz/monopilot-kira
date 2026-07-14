'use client';

/**
 * Wave-shipping — Generate BOL modal (client island).
 *
 * Prototype parity: shipping/pack-screens.jsx:211-216 — the right-rail
 * Generate-BOL action in the ship-confirm region (V-SHIP-SHIP). The prototype
 * renders BOL/packing-slip/confirm as bare buttons in the summary rail; here the
 * BOL action opens a small form modal collecting the carrier + service level +
 * tracking number, then wires the reviewed generateBol Server Action (imported by
 * the page, passed as a seam here — never authored).
 *
 * RBAC: gated by ship.ship.confirm + ship.bol.sign server-side inside generateBol;
 * `canBol` is an advisory server probe used ONLY to disable + tooltip the trigger,
 * never trusted for authorisation. A forbidden result is surfaced inline ({ ok:false,
 * error:'forbidden' }) — never crashes.
 *
 * NO raw UUIDs are rendered: the modal shows the (mono) shipment NUMBER only; the
 * shipmentId is carried in component state and sent to the action, never displayed.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

import type { GenerateBolActionInput, GenerateBolResult } from './shipment-ship-types';

export type GenerateBolLabels = {
  trigger: string;
  triggerRegenerate: string;
  title: string;
  description: string;
  carrierLabel: string;
  carrierPlaceholder: string;
  serviceLevelLabel: string;
  serviceLevelPlaceholder: string;
  /** Keyed service-level option labels; the key is the value sent to the action. */
  serviceLevelOptions: Record<string, string>;
  trackingLabel: string;
  trackingPlaceholder: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  /** Tooltip when the trigger is disabled because the user lacks ship.pack.close. */
  noPermission: string;
  esign: {
    title: string;
    meaning: string;
    password: string;
    passwordPlaceholder: string;
    passwordHelp: string;
  };
  errors: Record<string, string>;
};

const SERVICE_LEVELS = ['standard', 'express', 'economy', 'freight'] as const;

export function GenerateBolModal({
  shipmentNumber,
  shipmentId,
  hasBol,
  canBol,
  statusReady = true,
  statusTooltip,
  labels,
  generateBolAction,
}: {
  shipmentNumber: string;
  shipmentId: string;
  /** Whether a BOL already exists (toggles the trigger copy to "Regenerate"). */
  hasBol: boolean;
  canBol: boolean;
  /**
   * Whether the shipment STATUS is inside the ship-confirm window (packed / shipped).
   * Defaults to true so existing callers/tests are unaffected; the controls rail passes
   * the real condition so a terminal shipment cannot offer an enabled Generate BOL.
   */
  statusReady?: boolean;
  /** Tooltip shown when the trigger is disabled because of the shipment status. */
  statusTooltip?: string;
  labels: GenerateBolLabels;
  generateBolAction: (input: GenerateBolActionInput) => Promise<GenerateBolResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [carrier, setCarrier] = React.useState('');
  const [serviceLevel, setServiceLevel] = React.useState('');
  const [tracking, setTracking] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const disabled = !canBol || !statusReady;
  const tooltip = !canBol ? labels.noPermission : !statusReady ? statusTooltip : undefined;
  const valid = reason.trim().length > 0 && password.trim().length > 0;

  function reset() {
    setCarrier('');
    setServiceLevel('');
    setTracking('');
    setReason('');
    setPassword('');
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) reset();
    setOpen(next);
  }

  async function onSubmit() {
    if (pending || !valid) return;
    setPending(true);
    setError(null);
    try {
      const result = await generateBolAction({
        shipmentId,
        carrier: carrier.trim() || undefined,
        serviceLevel: serviceLevel || undefined,
        trackingNumber: tracking.trim() || undefined,
        reason: reason.trim(),
        signature: { password },
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

  const serviceOptions = [
    { value: '', label: labels.serviceLevelPlaceholder },
    ...SERVICE_LEVELS.map((lvl) => ({ value: lvl, label: labels.serviceLevelOptions[lvl] ?? lvl })),
  ];

  return (
    <>
      <button
        type="button"
        data-testid="shipment-generate-bol-trigger"
        className="btn btn--secondary w-full"
        disabled={disabled}
        title={tooltip}
        onClick={() => onOpenChange(true)}
      >
        {hasBol ? labels.triggerRegenerate : labels.trigger}
      </button>

      <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="shipment_generate_bol" dismissible={!pending}>
        <Modal.Header title={labels.title.replace('{shipment}', shipmentNumber || '—')} />
        <Modal.Body>
          <div data-testid="shipment-generate-bol-form" className="flex flex-col gap-4 text-sm">
            <p className="text-xs text-slate-500">{labels.description}</p>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.carrierLabel}</span>
              <Input
                data-testid="shipment-bol-carrier"
                value={carrier}
                placeholder={labels.carrierPlaceholder}
                disabled={pending}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span id="shipment-bol-service-label" className="font-medium text-slate-700">
                {labels.serviceLevelLabel}
              </span>
              <div data-testid="shipment-bol-service">
                <Select
                  aria-labelledby="shipment-bol-service-label"
                  value={serviceLevel}
                  onValueChange={setServiceLevel}
                  placeholder={labels.serviceLevelPlaceholder}
                  disabled={pending}
                  options={serviceOptions}
                />
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">{labels.trackingLabel}</span>
              <Input
                data-testid="shipment-bol-tracking"
                value={tracking}
                placeholder={labels.trackingPlaceholder}
                disabled={pending}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">
                {labels.reasonLabel} <span aria-hidden className="text-red-500">*</span>
              </span>
              <textarea
                data-testid="shipment-bol-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={labels.reasonPlaceholder}
                rows={2}
                disabled={pending}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <div data-testid="shipment-bol-esign" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.esign.title}</div>
              <p className="mt-1 text-[11px] text-slate-500">{labels.esign.meaning}</p>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">
                  {labels.esign.password} <span aria-hidden className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  data-testid="shipment-bol-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={labels.esign.passwordPlaceholder}
                  autoComplete="current-password"
                  disabled={pending}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 focus:border-slate-400 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">{labels.esign.passwordHelp}</p>
            </div>

            {error ? (
              <p role="alert" data-testid="shipment-bol-error" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            data-testid="shipment-bol-cancel"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            data-testid="shipment-bol-submit"
            onClick={() => void onSubmit()}
            disabled={pending || !valid}
            aria-busy={pending}
            title={!valid ? labels.formIncomplete : undefined}
            className="btn btn--primary"
          >
            {pending ? labels.submitting : labels.submit}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
