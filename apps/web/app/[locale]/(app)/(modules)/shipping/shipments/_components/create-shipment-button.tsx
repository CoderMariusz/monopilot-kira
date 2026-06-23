'use client';

/**
 * Wave-shipping — [Create shipment] button for the SO detail.
 *
 * Prototype parity: the Create / progress-to-pack control on the SO detail action
 * group (shipping/so-screens.jsx:217-224) and the pack-screen entry point
 * (pack-screens.jsx:38 open-station button). The reviewed createShipment(soId) raises a
 * shipment from an allocated SO and we navigate straight to its pack screen.
 *
 * Additive only: this renders ALONGSIDE S2's existing allocate/confirm/cancel buttons
 * in the SO detail action group — it never replaces them.
 *
 * Gating: shown disabled + tooltip when (a) the user lacks ship.pack.close (the
 * `canCreate` server-side probe — never client-trusted; createShipment re-checks), or
 * (b) the SO allocation_status is not allocated / partially_allocated (the reviewed
 * createShipment only accepts those states).
 *
 * Action states: optimistic (pending — button disabled + busy), error (inline alert
 * keyed off the action error code), success (router.push to the new pack screen). NO
 * raw UUID is rendered (the soId is passed to the action only; the resulting shipment
 * id is used solely to build the pack-screen URL).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

export type CreateShipmentLabels = {
  label: string;
  pending: string;
  /** Tooltip when disabled because the user lacks ship.pack.close. */
  noPermission: string;
  /** Tooltip when disabled because the SO is not (partially) allocated. */
  notAllocated: string;
  errors: Record<string, string>;
};

export type CreateShipmentResult = { ok: true; shipmentId: string } | { ok: false; error: string };

const ALLOCATED_STATES = new Set(['allocated', 'partially_allocated']);

export function CreateShipmentButton({
  locale,
  soId,
  allocationStatus,
  canCreate,
  labels,
  createShipmentAction,
}: {
  locale: string;
  soId: string;
  allocationStatus: string;
  canCreate: boolean;
  labels: CreateShipmentLabels;
  createShipmentAction: (soId: string) => Promise<CreateShipmentResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allocated = ALLOCATED_STATES.has(allocationStatus.toLowerCase());
  const disabled = !canCreate || !allocated || pending;
  const tooltip = !canCreate ? labels.noPermission : !allocated ? labels.notAllocated : undefined;

  async function onClick() {
    if (disabled) return;
    setPending(true);
    setError(null);
    try {
      const result = await createShipmentAction(soId);
      if (!result.ok) {
        setError(labels.errors[result.error] ?? labels.errors.persistence_failed);
        setPending(false);
        return;
      }
      router.push(`/${locale}/shipping/shipments/${result.shipmentId}`);
    } catch {
      setError(labels.errors.persistence_failed);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="btn--primary"
        data-testid="so-action-create-shipment"
        disabled={disabled}
        aria-busy={pending}
        title={tooltip}
        onClick={() => void onClick()}
      >
        {pending ? labels.pending : labels.label}
      </Button>
      {error ? (
        <div
          role="alert"
          data-testid="create-shipment-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
