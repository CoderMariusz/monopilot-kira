/**
 * P2-MODALS — state-appropriateness gating.
 *
 * Mirrors the state machine's legal transition table (wo-state-machine.ts
 * TRANSITIONS) + the output/waste recordable-states set + the e-sign close rule,
 * so the UI only ever OFFERS an action the handler can actually accept. This is
 * an affordance gate; the route re-validates server-side regardless.
 *
 *   draft        → release
 *   planned      → start, cancel
 *   in_progress  → pause, complete, cancel, output, waste
 *   paused       → resume, cancel, output, waste
 *   completed    → close, cancel, output, waste
 *   closed       → (terminal)
 *   cancelled    → (terminal)
 *   null (no execution row yet) → startable ONLY when the Planning header status is
 *     RELEASED (the list materializes that same RELEASED → `planned` and offers
 *     Start, so the detail must too — F13); a DRAFT WO must be released first.
 */

import type { WoActionKind, WoActionPermissions, WoState } from './types';

/** OUTPUT_RECORDABLE_STATES from lib/production/shared.ts. */
const RECORDABLE: ReadonlySet<WoState> = new Set<WoState>(['in_progress', 'paused', 'completed']);

/** Is the verb legal for this runtime status (null = no execution row, not startable here)? */
export function isActionAvailable(
  kind: WoActionKind,
  status: WoState | null,
  workOrderStatus?: string | null,
): boolean {
  const s: WoState = status ?? 'planned';
  switch (kind) {
    case 'release':
      return normalizeWorkOrderStatus(workOrderStatus) === 'DRAFT';
    case 'start':
      // Start is legal while the WO is planned AND not yet running. A validly
      // RELEASED work order with no execution row yet (status === null) IS startable
      // — the LIST materializes that same RELEASED state to `planned` and offers
      // Start, so the DETAIL must too (F13). Key off the Planning header status
      // (RELEASED) when there is no runtime row, and off the runtime status
      // (`planned`) once one exists. A DRAFT WO (null + not RELEASED) stays blocked.
      return s === 'planned' && (status !== null || normalizeWorkOrderStatus(workOrderStatus) === 'RELEASED');
    case 'pause':
      return s === 'in_progress';
    case 'resume':
      return s === 'paused';
    case 'complete':
      return s === 'in_progress';
    case 'close':
      return s === 'completed';
    case 'cancel':
      return s !== 'closed' && s !== 'cancelled';
    case 'output':
    case 'waste':
      return RECORDABLE.has(s);
    default:
      return false;
  }
}

const PERMISSION_FOR: Record<WoActionKind, keyof WoActionPermissions> = {
  release: 'release',
  start: 'start',
  pause: 'pause',
  resume: 'resume',
  cancel: 'cancel',
  complete: 'complete',
  close: 'close',
  output: 'outputWrite',
  waste: 'wasteWrite',
};

/** Render the action only when it is BOTH state-legal AND permission-granted. */
export function canOfferAction(
  kind: WoActionKind,
  status: WoState | null,
  permissions: WoActionPermissions,
  workOrderStatus?: string | null,
): boolean {
  return isActionAvailable(kind, status, workOrderStatus) && permissions[PERMISSION_FOR[kind]];
}

/**
 * Canonicalize a planning-lifecycle status string (DRAFT / RELEASED / …) for
 * case/whitespace-insensitive comparison. Exported (F13) so the WO detail header
 * reuses the SAME normalization the release-gate above relies on, instead of
 * re-implementing it.
 */
export function normalizeWorkOrderStatus(status?: string | null): string {
  return typeof status === 'string' ? status.trim().toUpperCase() : '';
}
