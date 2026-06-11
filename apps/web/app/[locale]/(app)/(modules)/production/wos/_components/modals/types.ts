/**
 * P2-MODALS — shared contracts for the WO execution action modals.
 *
 * The modals are PURE client components: they own only transient form state and
 * call back through `onSubmit` (the action runner). They never fetch, never read
 * a permission, never compose a URL. The runner (use-wo-action.ts) owns the
 * transport (relative POST to the EXISTING route handlers), a fresh
 * crypto.randomUUID() transactionId per attempt, and VERBATIM error-code mapping.
 */

import type {
  WoActionPermissions,
  WoReasonCategory,
  WoWasteCategory,
} from '../../../_actions/get-wo-action-context';

export type { WoActionPermissions, WoReasonCategory, WoWasteCategory };

// Runtime WO lifecycle state. Re-exported HERE (a directive-free module) — a
// bare `export type { X };` clause inside the 'use server' action file breaks
// the turbopack Vercel build ("only async functions may be exported").
export type { WoState } from '../../../../../../../../lib/production/shared';

/** The lifecycle verbs + the two recording actions wired by this lane. */
export type WoActionKind =
  | 'start'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'complete'
  | 'close'
  | 'output'
  | 'waste';

/**
 * Result of a single action attempt. `errorCode` is the VERBATIM handler error
 * string (e.g. 'invalid_state_transition', 'quality_hold_active', 'forbidden',
 * 'wo_not_recordable', 'already_recorded', 'closed_production_strict_failed',
 * 'esign_failed', 'invalid_input', 'concurrent_modification') — surfaced inline
 * in the modal so the operator sees exactly why the route refused.
 */
export type WoActionResult =
  | { ok: true }
  | { ok: false; errorCode: string; httpStatus: number };

/** The runner signature every modal receives. */
export type RunWoAction = (kind: WoActionKind, body: Record<string, unknown>) => Promise<WoActionResult>;

/** i18n labels shared by all action modals (resolved server-side, passed as a prop). */
export type WoModalLabels = {
  /** Common modal chrome. */
  cancel: string;
  confirm: string;
  submitting: string;
  /** Per-error-code copy keyed by the VERBATIM handler error string. */
  errors: Record<string, string>;
  /** Generic fallback for an unmapped/unknown error code. */
  errorFallback: string;

  start: { title: string; subtitle: string; line: string; shift: string; optional: string };
  pause: {
    title: string;
    subtitle: string;
    reason: string;
    reasonPlaceholder: string;
    line: string;
    shift: string;
    notes: string;
    noCategories: string;
  };
  resume: { title: string; subtitle: string; duration: string; durationHint: string };
  cancelWo: { title: string; subtitle: string; reasonCode: string; notes: string };
  complete: { title: string; subtitle: string; override: string; overrideHint: string };
  close: {
    title: string;
    subtitle: string;
    password: string;
    reason: string;
    legal: string;
  };
  output: {
    title: string;
    subtitle: string;
    type: string;
    types: { primary: string; co_product: string; by_product: string };
    product: string;
    qty: string;
    batch: string;
    batchHint: string;
    /**
     * P0-UOM additions (OPTIONAL so the existing buildWoModalLabels bundle still
     * type-checks until the staged keys land — see _meta/i18n-staging/wo-uom.json).
     * When present, the Register-output modal labels the qty field in the WO's
     * output unit, shows an optional actual-weighed-kg input, and surfaces the
     * uom_conversion_unavailable error verbatim like the other codes.
     *
     *   qtyUom.{base,each,box} — unit suffix for the qty label ("Quantity (box)")
     *   actualWeight / actualWeightHint — the optional weighed-kg input copy
     *   conversionPreview — "{qty} {unit} = {kg} {base}" template (filled client-side)
     */
    qtyUom?: { base: string; each: string; box: string };
    actualWeight?: string;
    actualWeightHint?: string;
    conversionPreview?: string;
  };
  waste: {
    title: string;
    subtitle: string;
    category: string;
    categoryPlaceholder: string;
    qty: string;
    shift: string;
    reasonCode: string;
    notes: string;
    noCategories: string;
  };
};
