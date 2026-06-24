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
  WoShiftOption,
  WoLineOption,
} from '../../../_actions/get-wo-action-context';

export type { WoActionPermissions, WoReasonCategory, WoWasteCategory, WoShiftOption, WoLineOption };

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
 * E1 — the slice of the route response the success path may carry. The `outputs`
 * route returns `{ data: RegisterOutputResult }`; the Register-output modal reads
 * the created FG LP id/number from here to offer a [Print FG label] action. All
 * fields OPTIONAL — every other action route returns no `data` envelope and stays
 * a plain `{ ok: true }`.
 */
export type WoActionData = {
  /** Created/back-linked output LP id (uuid) — present on the outputs route. */
  lpId?: string | null;
  /** Created output LP human code (NEVER a raw uuid) — null on caller-supplied LP. */
  lpNumber?: string | null;
  massBalanceWarning?: {
    expected_input_kg: string;
    posted_consumption_kg: string;
    effective_yield_pct: string;
    warn_pct: number;
  } | null;
};

/**
 * Result of a single action attempt. `errorCode` is the VERBATIM handler error
 * string (e.g. 'invalid_state_transition', 'quality_hold_active', 'forbidden',
 * 'wo_not_recordable', 'already_recorded', 'closed_production_strict_failed',
 * 'esign_failed', 'invalid_input', 'concurrent_modification') — surfaced inline
 * in the modal so the operator sees exactly why the route refused.
 *
 * `data` (E1) is an OPTIONAL pass-through of the route's success body so the
 * Register-output modal can read the created FG LP for label printing. Existing
 * callers ignore it (additive, backward-compatible).
 */
export type WoActionResult =
  | { ok: true; data?: WoActionData }
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
    /** Placeholder for the line <Select> (D8 — line is a dropdown, not free text). */
    linePlaceholder: string;
    /** Empty-state copy when the org has no production lines configured. */
    noLines: string;
    shift: string;
    /** Placeholder for the shift <Select>. */
    shiftPlaceholder: string;
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
    /**
     * W9-L7 (OPTIONAL for older label fixtures) — "No PIN? Set it in Settings →"
     * link text rendered under the credential field; signEvent accepts the
     * e-sign PIN, or the account password while no PIN is enrolled.
     */
    pinHint?: string;
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
    /**
     * B-3 catch-weight additions (OPTIONAL — same staging pattern as the P0-UOM
     * keys above; keys live in _meta/i18n-staging/catch-weight.json until merged).
     * Rendered only when the WO's item.weight_mode === 'catch'. The qty field
     * (units) determines how many per-unit weight inputs render; the payload adds
     * catch_weight_kg_per_unit (decimal STRINGS).
     *
     *   sectionTitle / sectionHint — the per-unit capture region copy
     *   unitLabel — per-input aria label, "{n}" → 1-based index
     *   sumLabel — running total line, "{total}" → 3-dp kg sum ("Σ 12.450 kg")
     *   tooMany — over-cap message, "{max}" → 50
     *   baseTextarea{Label,Hint} — base-uom fallback (one weight per line)
     *   invalidWeights — client validation copy when a weight is non-positive
     */
    catchWeight?: {
      sectionTitle: string;
      sectionHint: string;
      unitLabel: string;
      sumLabel: string;
      tooMany: string;
      baseTextareaLabel: string;
      baseTextareaHint: string;
      invalidWeights: string;
    };
    /**
     * E1 — Register-output success state + [Print FG label] copy. OPTIONAL (same
     * staging pattern as the keys above) so older label fixtures still type-check;
     * the page injects EN fallbacks. `lpLine` is "FG label — {lp}" with the created
     * LP CODE (never a uuid).
     */
    print?: {
      successTitle: string;
      successBody: string;
      lpLine: string;
      action: string;
      printing: string;
      queued: string;
      sent: string;
      download: string;
      error: string;
      forbidden: string;
      close: string;
    };
    mass_balance_warning?: string;
  };
  waste: {
    title: string;
    subtitle: string;
    category: string;
    categoryPlaceholder: string;
    qty: string;
    shift: string;
    /** Placeholder for the shift <Select> (D8 — shift is a dropdown, not free text). */
    shiftPlaceholder: string;
    reasonCode: string;
    notes: string;
    noCategories: string;
  };
  /** Localized labels for the fixed shift enum (code → display name). */
  shifts: { morning: string; afternoon: string; night: string };
};
