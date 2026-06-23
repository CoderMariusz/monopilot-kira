/**
 * Wave-shipping — Sales Order status badge.
 *
 * Parity: the SOStatus pill in so-screens.jsx:98,218,236. The prototype maps each
 * status to a coloured pill; production uses the @monopilot/ui Badge with a variant
 * derived from the REAL sales_orders.status enum (so-actions.ts SalesOrderStatus:
 * draft / confirmed / allocated / partially_picked / picked / partially_packed /
 * packed / manifested / shipped / partially_delivered / delivered / cancelled). The
 * visible label is always an i18n string resolved by the caller
 * (Shipping.salesOrders.soStatus.*), never an inline literal.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  confirmed: 'info',
  allocated: 'info',
  partially_picked: 'warning',
  picked: 'warning',
  partially_packed: 'warning',
  packed: 'info',
  manifested: 'info',
  shipped: 'success',
  partially_delivered: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

export function SoStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`so-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}

const ALLOCATION_VARIANT: Record<string, BadgeVariant> = {
  unallocated: 'muted',
  partially_allocated: 'warning',
  allocated: 'success',
};

/** Allocation badge for the SO header + per-line allocation_status (so-actions.ts
 *  AllocationStatus: unallocated / partially_allocated / allocated). */
export function AllocationBadge({ status, label }: { status: string; label: string }) {
  const variant = ALLOCATION_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`so-alloc-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
