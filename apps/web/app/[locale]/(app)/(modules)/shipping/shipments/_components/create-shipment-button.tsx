'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { ALLOWED_CREATE_SHIPMENT_SO_STATUSES } from '../../_actions/so-transitions';

export type CreateShipmentLabels = {
  label: string;
  pending: string;
  noPermission: string;
  notPicked: string;
  notShippable: string;
  errors: Record<string, string>;
};

export type CreateShipmentResult = { ok: true; shipmentId: string } | { ok: false; error: string };

export function CreateShipmentButton({
  locale,
  soId,
  soStatus,
  canCreate,
  labels,
  createShipmentAction,
}: {
  locale: string;
  soId: string;
  soStatus: string;
  canCreate: boolean;
  labels: CreateShipmentLabels;
  createShipmentAction: (soId: string) => Promise<CreateShipmentResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const status = soStatus.toLowerCase() as Parameters<typeof ALLOWED_CREATE_SHIPMENT_SO_STATUSES.has>[0];
  const shippable = ALLOWED_CREATE_SHIPMENT_SO_STATUSES.has(status);
  const prePick = !shippable && ['allocated', 'partially_picked', 'confirmed', 'draft'].includes(status);
  const disabled = !canCreate || !shippable || pending;
  const tooltip = !canCreate
    ? labels.noPermission
    : prePick
      ? labels.notPicked
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
