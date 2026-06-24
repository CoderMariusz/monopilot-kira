/**
 * Wave-shipping — Customer status badge.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/shipping/
 *   customer-screens.jsx:111 — Active = green pill, Inactive = grey pill.
 *
 * The visible label is always an i18n string resolved by the caller
 * (Shipping.customers.status.*); this component only maps active → colour band.
 */
import { Badge } from '@monopilot/ui/Badge';

export function CustomerStatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge variant={active ? 'success' : 'muted'} data-testid={`customer-status-${active ? 'active' : 'inactive'}`}>
      {label}
    </Badge>
  );
}
