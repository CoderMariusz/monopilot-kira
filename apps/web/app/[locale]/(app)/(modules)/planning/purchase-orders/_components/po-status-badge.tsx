/**
 * P2-PLANNING — PO status badge (parity: POStatus pill in po-screens.jsx:116,172).
 * The prototype maps each status to a coloured pill; production uses the
 * @monopilot/ui Badge with a variant derived from the purchase_orders.status enum
 * (draft / sent / confirmed / partially_received / received / cancelled — the real
 * PurchaseOrderStatusSchema). The visible label is always an i18n string resolved by
 * the caller (Planning.purchaseOrders.poStatus.*), never an inline literal.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  sent: 'info',
  confirmed: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'danger',
};

export function PoStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`po-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
