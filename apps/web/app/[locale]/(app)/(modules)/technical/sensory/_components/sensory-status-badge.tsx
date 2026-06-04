/**
 * T-092 — Sensory status badge.
 *
 * The single read-only status pill for the Technical-owned sensory read model
 * (required / pending / pass / fail / hold / not_required). This is BOTH the
 * verdict pill used in the sensory table AND the read-only badge NPD approval
 * surfaces — keeping one component guarantees Technical and NPD show the exact
 * same derived state.
 *
 * It is a pure presentational Server Component (no client state, no I/O): it maps
 * a SensoryStatus to a shadcn Badge variant + a localized label passed in by the
 * caller. NPD consumes it read-only; it never writes sensory and never owns the
 * gate.
 */

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import type { SensoryStatus } from '../../../../../../../lib/technical/sensory';

const STATUS_VARIANT: Record<SensoryStatus, BadgeVariant> = {
  required: 'info',
  pending: 'warning',
  pass: 'success',
  fail: 'danger',
  hold: 'warning',
  not_required: 'muted',
};

export type SensoryStatusLabels = Record<SensoryStatus, string>;

export function SensoryStatusBadge({
  status,
  labels,
}: {
  status: SensoryStatus;
  labels: SensoryStatusLabels;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} data-sensory-status={status}>
      {labels[status]}
    </Badge>
  );
}

export { STATUS_VARIANT as SENSORY_STATUS_VARIANT };
