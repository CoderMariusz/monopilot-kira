/**
 * QA-003 / QA-003b — TYPE CONTRACT for the spec Server Actions.
 *
 * The runtime implementations live in `quality/_actions/spec-actions.ts`, OWNED BY
 * THE PARALLEL CODEX LANE (T2). This UI lane must NOT author or edit `_actions/**`.
 * These types are ADAPTED to match the REAL shipped action signatures (re-checked
 * 2026-06 against the landed file): client islands type their action props against
 * these so the page can pass the real, server-side actions down unchanged.
 *
 * Result shape mirrors the reviewed ActionResult union:
 *   { ok: true; data: T } | { ok: false; reason: 'forbidden' | 'error'; message?: string }
 *
 * IMPORTANT contract facts the UI adapts to (deviations from the prototype noted in
 * the components):
 *   - listSpecs rows do NOT carry appliesTo, parameterCount or criticalCount, and
 *     productCode/productName are nullable. The list therefore filters by STATUS
 *     only (the applies-to filter + parameter-count column are deviations).
 *   - createSpec input does NOT take appliesTo and uses OPTIONAL string params
 *     (targetValue?/minValue?/maxValue?/unit?) with no sortOrder (server derives it
 *     from array index). createSpec always inserts applies_to='all', status='draft'.
 *   - getSpecDetail returns the list row + appliesTo + approvalSignatureHash +
 *     parameters[] (each with id; numeric values are DECIMAL STRINGS or null).
 */

export type SpecStatus = 'draft' | 'under_review' | 'active' | 'expired' | 'superseded';
export type SpecParameterType =
  | 'visual'
  | 'measurement'
  | 'attribute'
  | 'microbiological'
  | 'chemical'
  | 'sensory'
  | 'equipment';

export type SpecActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
export type SpecActionResult<T> = { ok: true; data: T } | SpecActionFailure;

/** Row shape returned by listSpecs (exact landed contract). */
export type SpecListRow = {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  specCode: string;
  version: number;
  status: SpecStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  supersededBy: string | null;
  createdAt: string;
};

/** A single parameter row in getSpecDetail. Numeric fields are DECIMAL STRINGS. */
export type SpecParameterDetail = {
  id: string;
  parameterName: string;
  parameterType: SpecParameterType;
  targetValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  unit: string | null;
  isCritical: boolean;
  sortOrder: number;
};

export type SpecDetail = SpecListRow & {
  appliesTo: string;
  approvalSignatureHash: string | null;
  parameters: SpecParameterDetail[];
};

/** A parameter row in a createSpec payload — OPTIONAL decimal strings, no sortOrder. */
export type CreateSpecParameter = {
  parameterName: string;
  parameterType: SpecParameterType;
  targetValue?: string;
  minValue?: string;
  maxValue?: string;
  unit?: string;
  isCritical?: boolean;
};

export type CreateSpecInput = {
  productId: string;
  specCode: string;
  parameters: CreateSpecParameter[];
};

export type ListSpecsFn = (input?: {
  status?: SpecStatus;
  search?: string;
  limit?: number;
}) => Promise<SpecActionResult<SpecListRow[]>>;

export type GetSpecDetailFn = (specId: string) => Promise<SpecActionResult<SpecDetail | null>>;

export type CreatedSpec = { id: string; specCode: string; version: number; status: 'draft' };
export type UpdatedSpecStatus = { id: string; status: SpecStatus; approvalSignatureHash?: string | null };
export type SupersededSpec = { id: string; status: 'superseded'; supersededBy: string };

export type CreateSpecFn = (input: CreateSpecInput) => Promise<SpecActionResult<CreatedSpec>>;
export type SubmitSpecForReviewFn = (input: { specId: string }) => Promise<SpecActionResult<UpdatedSpecStatus>>;
export type ApproveSpecFn = (input: {
  specId: string;
  signature: { password: string };
}) => Promise<SpecActionResult<UpdatedSpecStatus>>;
export type SupersedeSpecFn = (input: {
  specId: string;
  bySpecId: string;
}) => Promise<SpecActionResult<SupersededSpec>>;
