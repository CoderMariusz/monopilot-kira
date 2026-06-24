/**
 * WAVE W11 — UI-side result token set for the direct stock-adjustment form.
 *
 * applyDirectAdjustment (direct-adjust-actions.ts, backend lane) returns a
 * discriminated `{ ok: true; data } | { ok: false; error: { code; message } }`.
 * The form island maps each `error.code` to an i18n string; this union pins the
 * codes the action actually emits so the mapping is exhaustive and a raw machine
 * code is never leaked to the UI. The page passes the action straight through
 * (no adapter needed — the action already returns a result, never throws on
 * domain failure), so this is purely the client's mapping contract.
 */
export type DirectAdjustErrorCode =
  | 'forbidden'
  | 'supervisor_self_approval'
  | 'supervisor_pin_required'
  | 'supervisor_pin_invalid'
  | 'supervisor_pin_not_enrolled'
  | 'supervisor_pin_locked'
  | 'supervisor_forbidden'
  | 'insufficient_unreserved'
  | 'insufficient_stock'
  | 'use_count_session'
  | 'invalid_quantity'
  | 'invalid_expiry_date'
  | 'invalid_input'
  | 'esign_failed'
  | 'error';

/** Stable codes the form's error-copy map knows (a superset of the action's). */
export const DIRECT_ADJUST_ERROR_CODES: readonly DirectAdjustErrorCode[] = [
  'forbidden',
  'supervisor_self_approval',
  'supervisor_pin_required',
  'supervisor_pin_invalid',
  'supervisor_pin_not_enrolled',
  'supervisor_pin_locked',
  'supervisor_forbidden',
  'insufficient_unreserved',
  'insufficient_stock',
  'use_count_session',
  'invalid_quantity',
  'invalid_expiry_date',
  'invalid_input',
  'esign_failed',
  'error',
];

/** Map a raw action error code to a known token (e-sign throw → esign_failed). */
export function toDirectAdjustErrorCode(code: string | undefined): DirectAdjustErrorCode {
  const c = (code ?? '').toLowerCase();
  if ((DIRECT_ADJUST_ERROR_CODES as readonly string[]).includes(c)) {
    return c as DirectAdjustErrorCode;
  }
  // The action wraps unexpected throws as { code: 'error', message: <throwMsg> };
  // a failed signature surfaces via signEvent throwing → message mentions pin /
  // password / signature.
  if (c.includes('pin') || c.includes('password') || c.includes('signature') || c.includes('esign')) {
    return 'esign_failed';
  }
  return 'error';
}
