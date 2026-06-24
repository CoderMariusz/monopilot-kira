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
 * Gating mirrors the SERVER guard in createShipment (pack-actions.ts): the action
 * only accepts an SO whose STATUS is in ALLOWED_CREATE_SO_STATUSES
 * ({ allocated, partially_allocated }). We gate on the same condition, so the button
 * is shown disabled + tooltip when (a) the user lacks ship.pack.close (the
 * `canCreate` server-side probe — never client-trusted; createShipment re-checks),
 * (b) the SO has not yet reached an allocated status (allocation in progress), or
 * (c) the SO is in a terminal / post-allocation status (shipped / delivered /
 * cancelled / picked / packed …) where a new shipment can no longer be raised. Case
 * (c) is the L2 state-machine leak: a delivered SO keeps allocation_status='allocated'
 * so gating on allocation alone left the button enabled, the server then rejected with
 * invalid_state, and the UI showed the misleading "not allocated" reason. We now gate
 * on the SO status (the real server condition) and surface the correct reason.
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
  /** Tooltip when disabled because the SO has not reached an allocated status yet. */
  notAllocated: string;
  /**
   * Tooltip when disabled because the SO is in a terminal / post-allocation status
   * (shipped / delivered / cancelled / picked / packed …) — a shipment can no longer
   * be raised from it. Mirrors the createShipment server guard.
   */
  notShippable: string;
  errors: Record<string, string>;
};

export type CreateShipmentResult = { ok: true; shipmentId: string } | { ok: false; error: string };

/**
 * The SO statuses createShipment accepts (pack-actions.ts ALLOWED_CREATE_SO_STATUSES).
 * Gating the button on the SO STATUS is the real server condition — allocation_status
 * alone stays 'allocated' through shipped/delivered and is NOT a sufficient gate.
 */
const SHIPPABLE_SO_STATUSES = new Set(['allocated', 'partially_allocated']);

export function CreateShipmentButton({
  locale,
  soId,
  soStatus,
  allocationStatus,
  canCreate,
  labels,
  createShipmentAction,
}: {
  locale: string;
  soId: string;
  /**
   * The sales order STATUS (the same field createShipment checks server-side). Gating
   * on this is what closes the L2 leak: a delivered/shipped/cancelled SO must NOT offer
   * an enabled [Create shipment].
   */
  soStatus: string;
  allocationStatus: string;
  canCreate: boolean;
  labels: CreateShipmentLabels;
  createShipmentAction: (soId: string) => Promise<CreateShipmentResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const status = soStatus.toLowerCase();
  const alloc = allocationStatus.toLowerCase();
  // The real server gate: the SO status must be allocated / partially_allocated.
  const shippable = SHIPPABLE_SO_STATUSES.has(status);
  // Distinguish "not yet allocated" (still working toward it) from "past the window"
  // (terminal / post-allocation) so the disabled tooltip + inline error tell the truth.
  const preAllocation = !shippable && alloc === 'unallocated';
  const disabled = !canCreate || !shippable || pending;
  const tooltip = !canCreate
    ? labels.noPermission
    : preAllocation
      ? labels.notAllocated
      : !shippable
        ? labels.notShippable
        : undefined;

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
