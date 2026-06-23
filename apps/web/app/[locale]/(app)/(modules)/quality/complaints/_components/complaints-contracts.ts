/**
 * Wave E11 — Complaints + CAPA Server Action CONTRACT mirror (UI side).
 *
 * The real Server Actions live in quality/_actions/complaint-actions.ts (backend
 * DONE — do NOT author or touch them here). That file keeps its row types
 * module-PRIVATE (not exported), so these types mirror the published shapes 1:1
 * (RECONCILED against complaint-actions.ts). The pages import the REAL action
 * functions and pass them to the islands as props; the islands type those props
 * against the shapes below so the UI compiles independently and the RTL tests mock
 * the actions against the exact same shapes.
 *
 * Contract (verified in complaint-actions.ts):
 *   createComplaint({customerId?, lpId?, batchRef?, description, severity}) -> ComplaintRow
 *   listComplaints({status?}) -> ComplaintRow[]
 *   getComplaint(id) -> ComplaintRow
 *   convertComplaintToNcr(complaintId) -> { complaintId, ncrId }
 *   createCapaAction({sourceType, sourceId, actionType, description, ownerUserId?,
 *     dueDate?}) -> CapaActionRow
 *   listCapaActions({sourceType?, sourceId?, status?}) -> CapaActionRow[]
 *   resolveCapaAction(id, {signature:{password}}) -> CapaActionRow
 *
 * Every backend action returns ActionResult<T> = {ok:true,data} | {ok:false,error}.
 * `error` is a code string ('forbidden' | 'not_found' | 'esign_failed' | …); the UI
 * maps the known codes to i18n copy and surfaces unknown codes verbatim.
 */

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';
export const COMPLAINT_SEVERITIES: ComplaintSeverity[] = ['low', 'medium', 'high', 'critical'];

export type ComplaintStatus = 'open' | 'investigating' | 'converted' | 'closed';
/** Statuses surfaced in the list status filter (the live workflow). */
export const COMPLAINT_FILTER_STATUSES: ComplaintStatus[] = [
  'open',
  'investigating',
  'converted',
  'closed',
];

export type CapaSourceType = 'complaint' | 'ncr';
export type CapaActionType = 'corrective' | 'preventive';
export const CAPA_ACTION_TYPES: CapaActionType[] = ['corrective', 'preventive'];

export type CapaStatus = 'open' | 'in_progress' | 'closed';

/** Mirrors complaint-actions.ts ComplaintRow 1:1. */
export type ComplaintRow = {
  id: string;
  complaintNumber: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  customerDisplay: string | null;
  lpId: string | null;
  lpCode: string | null;
  batchRef: string | null;
  batchDisplay: string | null;
  description: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  ncrId: string | null;
  openedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Mirrors complaint-actions.ts CapaActionRow 1:1. */
export type CapaActionRow = {
  id: string;
  sourceType: CapaSourceType;
  sourceId: string;
  actionType: CapaActionType;
  description: string;
  ownerUserId: string | null;
  dueDate: string | null;
  status: CapaStatus;
  closedBy: string | null;
  closedAt: string | null;
  esignRef: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Backend ActionResult — `error` is a code string, mapped to copy by the UI. */
export type ComplaintActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CreateComplaintInput = {
  customerId?: string | null;
  lpId?: string | null;
  batchRef?: string | null;
  description: string;
  severity: ComplaintSeverity;
};

export type CreateCapaActionInput = {
  sourceType: CapaSourceType;
  sourceId: string;
  actionType: CapaActionType;
  description: string;
  ownerUserId?: string | null;
  dueDate?: string | null;
};

/** Action function signatures the pages import and the islands consume as props. */
export type CreateComplaintAction = (
  input: CreateComplaintInput,
) => Promise<ComplaintActionResult<ComplaintRow>>;
export type ConvertComplaintToNcrAction = (
  complaintId: string,
) => Promise<ComplaintActionResult<{ complaintId: string; ncrId: string }>>;
export type ListCapaActionsAction = (input?: {
  sourceType?: CapaSourceType;
  sourceId?: string;
  status?: CapaStatus;
}) => Promise<ComplaintActionResult<CapaActionRow[]>>;
export type CreateCapaActionAction = (
  input: CreateCapaActionInput,
) => Promise<ComplaintActionResult<CapaActionRow>>;
export type ResolveCapaActionAction = (
  id: string,
  input: { signature: { password: string } },
) => Promise<ComplaintActionResult<CapaActionRow>>;
