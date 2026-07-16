/**
 * T-074 — RM usability validation: shared DECISION SERVICE (pure).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.1, §7.6.
 *
 * Centralises the single semantics for "is this raw-material item usable as a
 * BOM component?". One service, called at every enforcement seam (BOM line
 * add/edit, factory_spec bundle approval, PO-receipt review, Production material
 * issue) so the gating logic is NOT re-implemented ad-hoc per consumer.
 *
 * It checks, in priority order:
 *   1. item is active                    → ITEM_NOT_ACTIVE
 *   2. supplier is approved              → SUPPLIER_NOT_APPROVED
 *   3. an active, approved, in-date
 *      supplier_spec exists              → SUPPLIER_SPEC_NOT_ACTIVE
 *   4. RM allergens don't conflict with
 *      the target FG allergen constraints→ ALLERGEN_CONFLICT (+ codes)
 *   5. cost review done                  → COST_REVIEW_PENDING
 *   6. spec review done                  → SPEC_REVIEW_PENDING
 *   7. required QC release present       → QC_RELEASE_MISSING
 *
 * The service is PURE: callers fetch the inputs (item, supplier specs, allergen
 * profile, the Quality-owned lab/QC read model, the target FG allergen
 * constraints) and hand them in. No DB, no clock — `now` is injected so checks
 * are deterministic.
 *
 * Red lines honoured:
 *   - Does NOT own the lab workflow — consumes the Quality read model (qcRelease)
 *     read-only; absence is a typed warning/block, never a silent pass.
 *   - Never silently approves unknown supplier/spec data — missing inputs block.
 *   - Returns TYPED reason codes (not free strings) so UI panels + APIs can act.
 *   - UI-only warnings never replace this server-side hard-block contract.
 *   - FG canonical — no FA aliases.
 */

// ── Reason codes ──────────────────────────────────────────────────────────────

export const RM_USABILITY_REASON_CODES = [
  'ITEM_NOT_ACTIVE',
  'SUPPLIER_NOT_APPROVED',
  'SUPPLIER_SPEC_NOT_ACTIVE',
  'ALLERGEN_CONFLICT',
  'COST_REVIEW_PENDING',
  'SPEC_REVIEW_PENDING',
  'QC_RELEASE_MISSING',
] as const;
export type RmUsabilityReasonCode = (typeof RM_USABILITY_REASON_CODES)[number];

/** Severity: a `block` fails usability; a `warn` is advisory (context-dependent). */
export type CheckSeverity = 'block' | 'warn' | 'pass';

/** Validation context — decides whether a soft signal blocks or merely warns. */
export const RM_USABILITY_CONTEXTS = [
  'bom_edit',
  'factory_spec_approval',
  'po_receipt',
  'material_issue',
] as const;
export type RmUsabilityContext = (typeof RM_USABILITY_CONTEXTS)[number];

// ── Report row (AC7: label, code, severity, source, remediation_href, evidence ts)

export interface RmUsabilityCheckRow {
  /** Stable machine code (one of RmUsabilityReasonCode) or 'OK' for a green row. */
  code: RmUsabilityReasonCode | 'OK';
  /** Human label for the check. */
  label: string;
  severity: CheckSeverity;
  /** Where the evidence came from (table / read-model name) for traceability. */
  source: string;
  /** Deep-link a UI can use to fix the problem (null when nothing to fix). */
  remediationHref: string | null;
  /** ISO timestamp of the evidence the check evaluated (AC4/AC7). */
  evidenceAt: string | null;
  /** Allergen codes when code === 'ALLERGEN_CONFLICT' (AC3). */
  allergenCodes?: string[];
}

export interface RmUsabilityVerdict {
  usable: boolean;
  context: RmUsabilityContext;
  itemId: string;
  /** All blocking reason codes, in priority order (empty when usable). */
  blockingReasons: RmUsabilityReasonCode[];
  /** Advisory (non-blocking) reason codes for this context. */
  warnings: RmUsabilityReasonCode[];
  /** Full per-check report (AC4: all-green w/ sources; AC7: report shape). */
  checks: RmUsabilityCheckRow[];
  evaluatedAt: string;
}

// ── Inputs (caller fetches these from real Supabase data) ─────────────────────

export interface RmItemInput {
  id: string;
  /** items.status ∈ draft|active|deprecated|blocked. */
  status: string;
  updatedAt?: string | null;
}

export interface RmSupplierSpecInput {
  supplierCode: string;
  /** supplier_specs.supplier_status ∈ pending|approved|blocked. */
  supplierStatus: string;
  /** supplier_specs.lifecycle_status ∈ draft|active|expired|superseded|blocked. */
  lifecycleStatus: string;
  /** supplier_specs.review_status ∈ pending|approved|rejected|blocked. */
  reviewStatus: string;
  /** ISO date (effective_from). */
  effectiveFrom?: string | null;
  /** ISO date (expiry_date) — null = no expiry. */
  expiryDate?: string | null;
  costReviewBlocked: boolean;
  specReviewBlocked: boolean;
  updatedAt?: string | null;
}

/** One allergen the RM `contains` (intensity 'contains' from item_allergen_profiles). */
export interface RmAllergenInput {
  allergenCode: string;
  /** item_allergen_profiles.intensity ∈ contains|may_contain|trace. */
  intensity: string;
}

/** The Quality-owned QC/release read-model answer for this RM (read-only). */
export interface RmQcReleaseInput {
  /** Whether org/context policy requires a QC release for this RM. */
  required: boolean;
  /** Quality-calculated release status; 'released' is the only passing value. */
  status?: string | null;
  evidenceAt?: string | null;
}

export interface RmUsabilityRequest {
  context: RmUsabilityContext;
  item: RmItemInput | null;
  supplier: RmSupplierSpecInput | null;
  /** Allergens the RM carries (typically the `contains` set). */
  rmAllergens: RmAllergenInput[];
  /** Allergen codes the TARGET FG forbids/constrains (free-from claims etc.). */
  targetFgForbiddenAllergens: string[];
  qcRelease: RmQcReleaseInput;
  /**
   * When false, supplier/spec/cost-review gates are skipped — internally manufactured
   * intermediate (WIP) components are not purchased materials. Defaults to true.
   */
  supplierSourcingRequired?: boolean;
  /** Injected clock for deterministic in-date / evidence checks. */
  now?: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function row(
  code: RmUsabilityCheckRow['code'],
  label: string,
  severity: CheckSeverity,
  source: string,
  opts: { remediationHref?: string | null; evidenceAt?: string | null; allergenCodes?: string[] } = {},
): RmUsabilityCheckRow {
  return {
    code,
    label,
    severity,
    source,
    remediationHref: opts.remediationHref ?? null,
    evidenceAt: opts.evidenceAt ?? null,
    ...(opts.allergenCodes ? { allergenCodes: opts.allergenCodes } : {}),
  };
}

/**
 * QC_RELEASE_MISSING is a hard block for factory_spec_approval and material_issue
 * (release-critical seams) but only a warning for bom_edit / po_receipt where the
 * component may legitimately not yet have a QC release. AC6 requires the code to
 * appear in the response either way ("blocked or warned according to rule").
 */
function qcReleaseSeverityForContext(context: RmUsabilityContext): 'block' | 'warn' {
  return context === 'factory_spec_approval' || context === 'material_issue' ? 'block' : 'warn';
}

/**
 * PRODUCT DECISION (BOM draft authoring, locked 2026-06-11): a BOM under draft /
 * non-released authoring must be FREELY editable, so the supplier-readiness checks
 * downgrade from `block` to `warn` in the `bom_edit` context. A freshly created
 * item (no supplier_specs, no cost/spec review) MUST be addable to a draft BOM;
 * its missing-readiness states render as VISIBLE WARNING badges, never hard blocks.
 *
 * What still HARD-BLOCKS in `bom_edit`:
 *   - ITEM_NOT_ACTIVE  — the component picker only lists active org items, and a
 *     blocked/deprecated/draft item is never a legitimate BOM component.
 *   - ALLERGEN_CONFLICT — a genuine food-safety incompatibility with the target
 *     FG's free-from claims, not a "not-yet-ready" gap. Never silently downgraded.
 *
 * The HARD enforcement of supplier readiness stays DOWNSTREAM and UNCHANGED:
 *   - `factory_spec_approval` (BOM approve preflight, workflow.ts) and
 *     `material_issue` keep every supplier-readiness reason as a `block`.
 * This is a single source of truth: every enforcement seam (client validate gate,
 * createBomDraft server action, approve workflow) routes through this matrix, so
 * the relaxation is server-enforced, not client-cosmetic.
 *
 * Reasons that are advisory-only while authoring a draft BOM (bom_edit context).
 */
const BOM_EDIT_SOFT_READINESS: ReadonlySet<RmUsabilityReasonCode> = new Set<RmUsabilityReasonCode>([
  'SUPPLIER_NOT_APPROVED',
  'SUPPLIER_SPEC_NOT_ACTIVE',
  'COST_REVIEW_PENDING',
  'SPEC_REVIEW_PENDING',
]);

/**
 * Resolve the effective severity of a failing supplier-readiness reason for the
 * given context. In `bom_edit` the soft-readiness set warns (draft is editable);
 * everywhere else (factory_spec_approval / material_issue / po_receipt) the
 * historical hard-block contract is preserved unchanged.
 */
function readinessSeverityForContext(
  reason: RmUsabilityReasonCode,
  context: RmUsabilityContext,
): 'block' | 'warn' {
  if (context === 'bom_edit' && BOM_EDIT_SOFT_READINESS.has(reason)) return 'warn';
  return 'block';
}

/** Push a failing reason onto blocking-vs-warning bucket per its effective severity. */
function recordReason(
  reason: RmUsabilityReasonCode,
  severity: 'block' | 'warn',
  blockingReasons: RmUsabilityReasonCode[],
  warnings: RmUsabilityReasonCode[],
): void {
  if (severity === 'block') blockingReasons.push(reason);
  else warnings.push(reason);
}

// ── The decision ───────────────────────────────────────────────────────────────

export function validateRmUsability(req: RmUsabilityRequest): RmUsabilityVerdict {
  const now = req.now ?? new Date();
  const nowIso = now.toISOString();
  const checks: RmUsabilityCheckRow[] = [];
  const blockingReasons: RmUsabilityReasonCode[] = [];
  const warnings: RmUsabilityReasonCode[] = [];

  const itemId = req.item?.id ?? 'unknown';
  const supplierSourcingRequired = req.supplierSourcingRequired !== false;

  // 1. Item active (AC1).
  if (!req.item || req.item.status !== 'active') {
    blockingReasons.push('ITEM_NOT_ACTIVE');
    checks.push(
      row('ITEM_NOT_ACTIVE', 'Item is active', 'block', 'public.items.status', {
        remediationHref: req.item ? `/technical/items/${req.item.id}` : null,
        evidenceAt: req.item?.updatedAt ?? null,
      }),
    );
  } else {
    checks.push(row('OK', 'Item is active', 'pass', 'public.items.status', { evidenceAt: req.item.updatedAt ?? null }));
  }

  const spec = req.supplier;

  // 2–3, 5–6. Supplier/spec sourcing — purchased RM/ingredient/intermediate only.
  if (!supplierSourcingRequired) {
    checks.push(
      row('OK', 'Supplier sourcing not required (manufactured WIP)', 'pass', 'public.items.item_type', {
        evidenceAt: req.item?.updatedAt ?? null,
      }),
    );
    checks.push(
      row('OK', 'Supplier spec sourcing not required (manufactured WIP)', 'pass', 'public.items.item_type', {
        evidenceAt: req.item?.updatedAt ?? null,
      }),
    );
    checks.push(row('OK', 'Cost review complete', 'pass', 'public.supplier_specs.cost_review_blocked'));
    checks.push(row('OK', 'Spec review complete', 'pass', 'public.supplier_specs.spec_review_blocked'));
  } else {
    // 2. Supplier approved (AC2 family — never silently approve unknown supplier).
    if (!req.supplier || req.supplier.supplierStatus !== 'approved') {
      const sev = readinessSeverityForContext('SUPPLIER_NOT_APPROVED', req.context);
      recordReason('SUPPLIER_NOT_APPROVED', sev, blockingReasons, warnings);
      checks.push(
        row('SUPPLIER_NOT_APPROVED', 'Supplier approval is missing', sev, 'public.supplier_specs.supplier_status', {
          remediationHref: req.supplier ? `/technical/suppliers/${req.supplier.supplierCode}` : null,
          evidenceAt: req.supplier?.updatedAt ?? null,
        }),
      );
    } else {
      checks.push(
        row('OK', 'Supplier is approved', 'pass', 'public.supplier_specs.supplier_status', {
          evidenceAt: req.supplier.updatedAt ?? null,
        }),
      );
    }

    // 3. Active + approved + in-date supplier_spec (AC2).
    const specActive =
      !!spec &&
      spec.lifecycleStatus === 'active' &&
      spec.reviewStatus === 'approved' &&
      !isSpecExpired(spec, now);
    if (!specActive) {
      const sev = readinessSeverityForContext('SUPPLIER_SPEC_NOT_ACTIVE', req.context);
      recordReason('SUPPLIER_SPEC_NOT_ACTIVE', sev, blockingReasons, warnings);
      checks.push(
        row('SUPPLIER_SPEC_NOT_ACTIVE', 'Supplier spec is active and in-date', sev, 'public.supplier_specs', {
          remediationHref: spec ? `/technical/suppliers/${spec.supplierCode}/spec` : null,
          evidenceAt: spec?.expiryDate ?? spec?.updatedAt ?? null,
        }),
      );
    } else {
      checks.push(
        row('OK', 'Supplier spec is active and in-date', 'pass', 'public.supplier_specs', {
          evidenceAt: spec.expiryDate ?? spec.updatedAt ?? null,
        }),
      );
    }

    // 5. Cost review done (AC: cost/spec review done before usable).
    if (spec?.costReviewBlocked) {
      const sev = readinessSeverityForContext('COST_REVIEW_PENDING', req.context);
      recordReason('COST_REVIEW_PENDING', sev, blockingReasons, warnings);
      checks.push(
        row('COST_REVIEW_PENDING', 'Cost review complete', sev, 'public.supplier_specs.cost_review_blocked', {
          remediationHref: `/technical/items/${itemId}/cost`,
          evidenceAt: spec.updatedAt ?? null,
        }),
      );
    } else {
      checks.push(row('OK', 'Cost review complete', 'pass', 'public.supplier_specs.cost_review_blocked'));
    }

    // 6. Spec review done.
    if (spec?.specReviewBlocked) {
      const sev = readinessSeverityForContext('SPEC_REVIEW_PENDING', req.context);
      recordReason('SPEC_REVIEW_PENDING', sev, blockingReasons, warnings);
      checks.push(
        row('SPEC_REVIEW_PENDING', 'Spec review complete', sev, 'public.supplier_specs.spec_review_blocked', {
          remediationHref: spec ? `/technical/suppliers/${spec.supplierCode}/spec` : null,
          evidenceAt: spec.updatedAt ?? null,
        }),
      );
    } else {
      checks.push(row('OK', 'Spec review complete', 'pass', 'public.supplier_specs.spec_review_blocked'));
    }
  }

  // 4. Allergen conflict (AC3) — RM `contains` ∩ target FG forbidden set.
  const forbidden = new Set(req.targetFgForbiddenAllergens.map((c) => c.toUpperCase()));
  const conflicting = Array.from(
    new Set(
      req.rmAllergens
        .filter((a) => a.intensity === 'contains' || a.intensity === 'may_contain')
        .map((a) => a.allergenCode.toUpperCase())
        .filter((code) => forbidden.has(code)),
    ),
  ).sort();
  if (conflicting.length > 0) {
    blockingReasons.push('ALLERGEN_CONFLICT');
    checks.push(
      row('ALLERGEN_CONFLICT', 'RM allergens compatible with target FG', 'block', 'public.item_allergen_profiles', {
        remediationHref: `/technical/items/${itemId}/allergens`,
        evidenceAt: nowIso,
        allergenCodes: conflicting,
      }),
    );
  } else {
    checks.push(
      row('OK', 'RM allergens compatible with target FG', 'pass', 'public.item_allergen_profiles', {
        evidenceAt: nowIso,
      }),
    );
  }

  // 7. QC/release present when required (AC6) — read-only Quality consume.
  const qc = req.qcRelease;
  const qcReleased = qc.status === 'released';
  if (qc.required && !qcReleased) {
    const severity = qcReleaseSeverityForContext(req.context);
    if (severity === 'block') blockingReasons.push('QC_RELEASE_MISSING');
    else warnings.push('QC_RELEASE_MISSING');
    checks.push(
      row('QC_RELEASE_MISSING', 'QC release present', severity, 'quality.lab_results (read model)', {
        remediationHref: `/quality/releases?item=${itemId}`,
        evidenceAt: qc.evidenceAt ?? null,
      }),
    );
  } else {
    checks.push(
      row('OK', 'QC release present', 'pass', 'quality.lab_results (read model)', {
        evidenceAt: qc.evidenceAt ?? null,
      }),
    );
  }

  return {
    usable: blockingReasons.length === 0,
    context: req.context,
    itemId,
    blockingReasons,
    warnings,
    checks,
    evaluatedAt: nowIso,
  };
}

function isSpecExpired(spec: RmSupplierSpecInput, now: Date): boolean {
  if (!spec.expiryDate) return false;
  const expiry = new Date(spec.expiryDate);
  if (Number.isNaN(expiry.getTime())) return true; // unparsable expiry → treat as not in-date
  // expiry_date is a DATE; a spec is valid through the end of its expiry day.
  return now.getTime() > expiry.getTime() + 24 * 60 * 60 * 1000 - 1;
}
