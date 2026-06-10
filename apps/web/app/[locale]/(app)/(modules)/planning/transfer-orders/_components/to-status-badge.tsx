/**
 * P2-PLANNING — Transfer Order status badge.
 *
 * Prototype parity: TOStatus pill in
 *   prototypes/planning/to-screens.jsx:86,129 (PlanTOList / PlanTODetail). The
 * prototype maps each status to a coloured pill; production uses the
 * @monopilot/ui Badge with a variant derived from the status enum.
 *
 * Status values come from the reviewed action's TransferOrderStatusSchema
 * (draft / in_transit / received / cancelled — mig 263). The visible label is
 * always an i18n string resolved by the caller (Planning.transferOrders.toStatus.*),
 * never an inline literal — this component only maps status → colour band.
 *
 * Deviation: the prototype shows a richer status set (planned / partially_shipped
 * / shipped / partially_received / closed). The reviewed transfer_orders schema +
 * action only support draft / in_transit / received / cancelled, so we render the
 * honest live set. Colour is never the sole signal — the label text carries it.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'muted',
  in_transit: 'info',
  received: 'success',
  cancelled: 'danger',
};

export function ToStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`to-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
