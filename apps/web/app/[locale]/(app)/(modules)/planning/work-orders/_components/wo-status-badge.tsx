/**
 * P2-PLANNING — WO planning status badge (parity: WOPlanStatus in wo-list.jsx /
 * wo-detail.jsx). The prototype maps each status to a coloured pill; production
 * uses the @monopilot/ui Badge with a variant derived from the status enum.
 *
 * Status values come from public.work_orders.status (DRAFT / RELEASED /
 * IN_PROGRESS / ON_HOLD / COMPLETED / CLOSED / CANCELLED). The visible label is
 * always an i18n string resolved by the caller (Planning.woStatus.*), never an
 * inline literal — this component only maps status → colour band.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: 'muted',
  RELEASED: 'info',
  IN_PROGRESS: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  CLOSED: 'success',
  CANCELLED: 'danger',
};

export function WoStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toUpperCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`wo-status-${status.toUpperCase()}`}>
      {label}
    </Badge>
  );
}
