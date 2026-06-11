/**
 * QA-005 / QA-005a — Inspection Server Action CONTRACTS (types only).
 *
 * The runtime actions are owned by the parallel C2 lane in
 * quality/_actions/inspection-actions.ts (do NOT author there). This file declares
 * the SHAPES the inspections UI consumes so the client islands + RTL tests are
 * decoupled from the action implementation: the islands accept the action functions
 * as typed props, the RSC pages import the real runtime from ../_actions/
 * inspection-actions, and the tests inject vi.fn() stubs typed against these
 * contracts. Build defensively — minor shape drift gets reconciled at integration
 * (optional chaining on row fields in the components).
 *
 * Contract source: lane K3 task brief (Wave 8a). When C2's action types land these
 * are replaced by `typeof listInspections` etc. imported from the action module.
 */

export type InspectionStatus =
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'on_hold'
  | 'cancelled';

export type InspectionReferenceType = 'lp' | 'grn' | 'wo_output';

export type InspectionDecision = 'pass' | 'fail' | 'hold';

/** A standard Server Action result envelope (mirrors hold/spec actions). */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; message?: string };

/** Person reference resolved by the action (assignee / decider / creator). */
export type InspectionPerson = { id: string; email: string | null; name: string | null } | null;

export type InspectionListRow = {
  id: string;
  inspectionNumber: string;
  referenceType?: InspectionReferenceType;
  referenceId?: string;
  /** resolved reference label (LP / GRN / WO output number) */
  referenceDisplay?: string;
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  status: InspectionStatus;
  assignedTo?: InspectionPerson;
  dueDate?: string | null;
  createdAt: string;
};

/** Mirrors the action's InspectionParameter ({name, expected?, actual, pass}). */
export type InspectionParameter = {
  name: string;
  expected?: string;
  actual: string;
  pass: boolean;
};

export type InspectionDetail = InspectionListRow & {
  parameters: InspectionParameter[];
  resultNotes?: string | null;
  decidedBy?: InspectionPerson;
  decidedAt?: string | null;
  /** Active quality hold for this inspection's LP (deep-link target); null → holds list. */
  holdId?: string | null;
};

/** Searchable LP result for the create-inspection reference picker (referenceType 'lp'). */
export type InspectionLpReference = {
  id: string;
  lpNumber: string;
  itemCode: string | null;
  qty: string;
  uom: string;
  status: string;
};

/** Resolved grn / wo_output reference (number → uuid). */
export type InspectionReferenceResolve = { id: string; display: string };

/** Searchable org user for the create-inspection assignee picker. */
export type InspectionAssignee = { id: string; name: string | null; email: string | null };

export type SearchInspectionLpsAction = (
  input: { query: string; limit?: number },
) => Promise<ActionResult<InspectionLpReference[]>>;

export type ResolveInspectionGrnAction = (
  input: { grnNumber: string },
) => Promise<ActionResult<InspectionReferenceResolve | null>>;

export type ResolveInspectionWoOutputAction = (
  input: { batchNumber: string },
) => Promise<ActionResult<InspectionReferenceResolve | null>>;

export type SearchInspectionAssigneesAction = (
  input: { query: string; limit?: number },
) => Promise<ActionResult<InspectionAssignee[]>>;

export type ListInspectionsInput = {
  status?: InspectionStatus;
  search?: string;
  limit?: number;
};
export type ListInspectionsAction = (
  input?: ListInspectionsInput,
) => Promise<ActionResult<InspectionListRow[]>>;

export type GetInspectionDetailAction = (
  inspectionId: string,
) => Promise<ActionResult<InspectionDetail | null>>;

export type CreateInspectionInput = {
  referenceType: InspectionReferenceType;
  referenceId: string;
  productId?: string;
  assignedTo?: string;
  dueDate?: string;
  notes?: string;
};
export type CreateInspectionAction = (
  input: CreateInspectionInput,
) => Promise<ActionResult<{ id: string; inspectionNumber: string }>>;

export type RecordInspectionResultInput = {
  inspectionId: string;
  parameters: InspectionParameter[];
  notes?: string;
};
export type RecordInspectionResultAction = (
  input: RecordInspectionResultInput,
) => Promise<ActionResult<{ id: string; status: InspectionStatus }>>;

export type SubmitInspectionDecisionInput = {
  inspectionId: string;
  decision: InspectionDecision;
  signature: { password: string };
  note?: string;
};
export type SubmitInspectionDecisionAction = (
  input: SubmitInspectionDecisionInput,
) => Promise<ActionResult<{ id: string; status: InspectionStatus }>>;
