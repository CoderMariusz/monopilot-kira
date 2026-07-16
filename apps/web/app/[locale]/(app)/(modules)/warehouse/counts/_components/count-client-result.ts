/**
 * WAVE E10 — UI-side result adapter for the stock-count client islands.
 *
 * The backend count actions (count-actions.ts, owned by the backend lane) THROW
 * on error and return plain values. The client islands must surface
 * forbidden / not-found / generic errors INLINE (never a thrown overlay), so the
 * RSC pages wrap each action in a thin try/catch adapter Server Action that maps
 * the throw to this discriminated result and the success to `{ ok: true, data }`.
 *
 * This type is a UI concern, NOT a backend contract — the pages author the
 * adapters (legitimate wiring), they do not author data access. The error `code`
 * is a stable token the island maps to an i18n string; raw error messages /
 * stacks are never surfaced.
 */
export type CountErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'already_applied'
  | 'esign_failed'
  | 'invalid_input'
  | 'no_stock'
  | 'supervisor_self_approval'
  | 'supervisor_pin_required'
  | 'supervisor_pin_invalid'
  | 'supervisor_pin_not_enrolled'
  | 'supervisor_pin_locked'
  | 'supervisor_forbidden'
  | 'error';

export type CountClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CountErrorCode };

const SUPERVISOR_ERROR_CODES = [
  'supervisor_self_approval',
  'supervisor_pin_required',
  'supervisor_pin_invalid',
  'supervisor_pin_not_enrolled',
  'supervisor_pin_locked',
  'supervisor_forbidden',
] as const satisfies readonly CountErrorCode[];

/** Map a thrown error's message to a stable client error code. */
export function toCountErrorCode(message: string | undefined): CountErrorCode {
  const m = (message ?? '').toLowerCase();
  for (const code of SUPERVISOR_ERROR_CODES) {
    if (m.includes(code)) return code;
  }
  if (m.includes('forbidden')) return 'forbidden';
  if (m.includes('count_no_stock') || m.includes('no_stock')) return 'no_stock';
  if (m.includes('not_found')) return 'not_found';
  if (m.includes('already') && m.includes('appl')) return 'already_applied';
  if (m.includes('esign') || m.includes('signature') || m.includes('password')) return 'esign_failed';
  if (m.startsWith('invalid_') || m.includes('invalid')) return 'invalid_input';
  return 'error';
}
