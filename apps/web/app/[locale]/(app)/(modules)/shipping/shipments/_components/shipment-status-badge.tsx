/**
 * Wave-shipping — Shipment status badge.
 *
 * Parity: the ShipStatus pill in shipping/pack-screens.jsx:64,184. The prototype maps
 * each shipment status to a coloured pill; production uses the @monopilot/ui Badge with
 * a variant derived from the REAL ShipmentStatus union (pack-actions.ts: pending /
 * packing / packed / manifested / shipped / delivered / exception). The visible label
 * is always an i18n string resolved by the caller (Shipping.shipments.status.*), never
 * an inline literal.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: 'muted',
  packing: 'warning',
  packed: 'info',
  manifested: 'info',
  shipped: 'success',
  delivered: 'success',
  exception: 'danger',
};

export function ShipmentStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`shipment-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
