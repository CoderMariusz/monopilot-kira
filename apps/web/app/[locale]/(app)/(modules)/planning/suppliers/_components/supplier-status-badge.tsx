/**
 * P2-PLANNING — Supplier status badge.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:122-126 (list) + 186-188 (detail) — Active = green pill,
 *   Inactive = grey pill. The reviewed backend (SupplierStatusSchema in
 *   procurement-shared.ts) is a 3-state enum active/inactive/blocked, so we add a
 *   danger band for `blocked` (no prototype-side equivalent — see deviation log).
 *
 * The visible label is always an i18n string resolved by the caller
 * (Planning.suppliers.status.*); this component only maps status → colour band.
 */
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  inactive: 'muted',
  blocked: 'danger',
};

export function SupplierStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = STATUS_VARIANT[status.toLowerCase()] ?? 'default';
  return (
    <Badge variant={variant} data-testid={`supplier-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
