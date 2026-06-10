/**
 * P2-MODALS — state-appropriateness gating.
 *
 * Mirrors the state machine's legal transition table (wo-state-machine.ts
 * TRANSITIONS) + the output/waste recordable-states set + the e-sign close rule,
 * so the UI only ever OFFERS an action the handler can actually accept. This is
 * an affordance gate; the route re-validates server-side regardless.
 *
 *   planned      → start, cancel
 *   in_progress  → pause, complete, cancel, output, waste
 *   paused       → resume, cancel, output, waste
 *   completed    → close, cancel, output, waste
 *   closed       → (terminal)
 *   cancelled    → (terminal)
 *   null (no execution row yet) → treated as planned: start is the only verb.
 */

import type { WoActionKind, WoActionPermissions, WoState } from './types';

/** OUTPUT_RECORDABLE_STATES from lib/production/shared.ts. */
const RECORDABLE: ReadonlySet<WoState> = new Set<WoState>(['in_progress', 'paused', 'completed']);

/** Is the verb legal for this runtime status (null = no execution row = planned)? */
export function isActionAvailable(
  kind: WoActionKind,
  status: WoState | null,
): boolean {
  const s: WoState = status ?? 'planned';
  switch (kind) {
    case 'start':
      return s === 'planned';
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
): boolean {
  return isActionAvailable(kind, status) && permissions[PERMISSION_FOR[kind]];
}
