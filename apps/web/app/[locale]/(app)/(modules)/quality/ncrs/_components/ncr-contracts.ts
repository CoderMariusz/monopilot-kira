/**
 * QA-009 / QA-009a — NCR Server Action CONTRACT mirror (UI side).
 *
 * The real Server Actions live in quality/_actions/ncr-actions.ts (owned by the
 * PARALLEL Codex T2 lane — do NOT author them here). That file keeps its row/detail
 * types module-PRIVATE (not exported), so these types mirror the published shapes
 * 1:1 (RECONCILED against ncr-actions.ts after it landed). The pages import the
 * REAL action functions and pass them to the islands as props; the islands type
 * those props against the shapes below so the UI compiles independently and the
 * RTL tests mock the actions against the exact same shapes.
 *
 * RECONCILIATION NOTES (vs ncr-actions.ts as published):
 *   - NcrStatus is the backend's 7-value union (adds awaiting_capa + reopened).
 *   - NcrListRow.title is a non-null string; the row carries productId/productName
 *     and has NO description/escalated/assignedTo. The §3.3 attention partition
 *     needs an "overdue" signal the backend does not surface, so the LIST PAGE
 *     mapper DERIVES `overdue` honestly from responseDueAt < now (UI-only flag,
 *     never faked data) and `escalated` is dropped (no backend source).
 *   - NcrDetail extends the list row: detectedAt is a non-null string; linked
 *     records are referenceType/referenceId + linked hold (NO separate inspection /
 *     ccp / complaint numbers), closedAt + closureSignatureHash mark immutability.
 *
 * Contract (verified in ncr-actions.ts):
 *   listNcrs({status?, severity?, ncrType?, search?, limit}) -> NcrListRow[]
 *   getNcrDetail(ncrId) -> NcrDetail | null
 *   createNcr({ncrType, severity, title?, description?, referenceType?,
 *     referenceId?, productId?, affectedQtyKg?, linkedHoldId?}) -> CreatedNcr
 *   updateNcrInvestigation({ncrId, rootCause?, rootCauseCategory?, immediateAction?
 *     , ...}) -> UpdatedNcrInvestigation
 *   closeNcr({ncrId, resolution, signature?:{password}}) -> ClosedNcr
 *     (CRITICAL severity requires the signature; others close without it).
 */

export type NcrSeverity = 'critical' | 'major' | 'minor';
export const NCR_SEVERITIES: NcrSeverity[] = ['critical', 'major', 'minor'];

export type NcrStatus =
  | 'draft'
  | 'open'
  | 'investigating'
  | 'awaiting_capa'
  | 'closed'
  | 'reopened'
  | 'cancelled';
/** Statuses surfaced in the list status filter (terminal + the live workflow). */
export const NCR_FILTER_STATUSES: NcrStatus[] = [
  'draft',
  'open',
  'investigating',
  'awaiting_capa',
  'closed',
  'reopened',
  'cancelled',
];

export type NcrType =
  | 'quality'
  | 'yield_issue'
  | 'allergen_deviation'
  | 'supplier'
  | 'process'
  | 'complaint_related';
export const NCR_TYPES: NcrType[] = [
  'quality',
  'yield_issue',
  'allergen_deviation',
  'supplier',
  'process',
  'complaint_related',
];

export type NcrReferenceType =
  | 'lp'
  | 'batch'
  | 'wo'
  | 'po'
  | 'grn'
  | 'inspection'
  | 'ccp_deviation'
  | 'complaint'
  | 'supplier';

export type NcrRootCauseCategory =
  | 'contamination'
  | 'process_failure'
  | 'equipment_failure'
  | 'human_error'
  | 'supplier'
  | 'specification'
  | 'other';
export const NCR_ROOT_CAUSE_CATEGORIES: NcrRootCauseCategory[] = [
  'contamination',
  'process_failure',
  'equipment_failure',
  'human_error',
  'supplier',
  'specification',
  'other',
];

export type NcrActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
export type NcrActionResult<T> = { ok: true; data: T } | NcrActionFailure;

/** Row shape for the QA-009 list (mirrors ncr-actions.ts NcrListRow). */
export type NcrServerListRow = {
  id: string;
  ncrNumber: string;
  ncrType: NcrType;
  severity: NcrSeverity;
  status: NcrStatus;
  title: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  linkedHoldId: string | null;
  linkedHoldNumber: string | null;
  responseDueAt: string | null;
  createdAt: string;
};

/** UI list row = server row + a list-page-DERIVED overdue flag (responseDueAt<now). */
export type NcrListRow = NcrServerListRow & { overdue?: boolean };

/** Detail shape for QA-009a (mirrors ncr-actions.ts NcrDetail). */
export type NcrDetail = NcrServerListRow & {
  description: string;
  referenceType: NcrReferenceType | null;
  referenceId: string | null;
  affectedQtyKg: string | null;
  detectedBy: string | null;
  detectedAt: string;
  rootCause: string | null;
  rootCauseCategory: string | null;
  immediateAction: string | null;
  capaRecordId: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closureSignatureHash: string | null;
  inspection: null;
  /** Detail-page-DERIVED overdue flag (responseDueAt < now AND not terminal). */
  overdue?: boolean;
};

export type ListNcrsInput = {
  status?: NcrStatus;
  severity?: NcrSeverity;
  ncrType?: NcrType;
  search?: string;
  limit?: number;
};

export type CreateNcrInput = {
  ncrType: NcrType;
  severity: NcrSeverity;
  title?: string;
  description?: string;
  referenceType?: NcrReferenceType;
  referenceId?: string;
  productId?: string;
  affectedQtyKg?: string;
  linkedHoldId?: string;
};

export type UpdateNcrInvestigationInput = {
  ncrId: string;
  rootCause?: string;
  rootCauseCategory?: string;
  immediateAction?: string;
  correctiveAction?: string;
  capaRecordId?: string;
  assignedTo?: string;
  investigatorId?: string;
};

export type CloseNcrInput = {
  ncrId: string;
  resolution: string;
  signature?: { password: string };
};

export type CreatedNcr = { id: string; ncrNumber: string; status: 'open' };
export type UpdatedNcrInvestigation = {
  id: string;
  status: NcrStatus;
  rootCause: string | null;
  rootCauseCategory: string | null;
  immediateAction: string | null;
  capaRecordId: string | null;
};
export type ClosedNcr = { id: string; ncrNumber: string; status: 'closed'; closedAt: string; signatureHash: string | null };

/** Action function signatures the pages import and the islands consume as props. */
export type ListNcrsAction = (input?: ListNcrsInput) => Promise<NcrActionResult<NcrServerListRow[]>>;
export type GetNcrDetailAction = (ncrId: string) => Promise<NcrActionResult<NcrDetail | null>>;
export type CreateNcrAction = (input: CreateNcrInput) => Promise<NcrActionResult<CreatedNcr>>;
export type UpdateNcrInvestigationAction = (
  input: UpdateNcrInvestigationInput,
) => Promise<NcrActionResult<UpdatedNcrInvestigation>>;
export type CloseNcrAction = (input: CloseNcrInput) => Promise<NcrActionResult<ClosedNcr>>;
