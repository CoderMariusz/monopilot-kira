/**
 * B-2 — Changeover dual-sign action CONTRACT (typed seam).
 *
 * Lane C4 implements these Server Actions in
 *   production/_actions/changeover-actions.ts
 * This lane (K6) only TYPES the contract and codes the UI against it; tests mock
 * these functions. Optional fields are read defensively (`?.`) — final shape
 * drift is reconciled at integration (per the lane brief).
 *
 * DO NOT author the actions here. Import them at the page boundary once C4 lands;
 * until then the page falls back to the in-folder read-model (changeover-data.ts)
 * for the list and stubs the mutations through this seam.
 */

export type ChangeoverDualSignStatus = 'pending' | 'first_signed' | 'complete';

export type ChangeoverProductRef = {
  id: string;
  code: string;
  name: string;
};

export type ChangeoverSignerRef = {
  id: string;
  name: string;
  email: string;
  signedAt: string;
};

/** Row returned by listChangeovers (C4). */
export type ChangeoverListRow = {
  id: string;
  lineId: string;
  lineCode: string;
  woId?: string;
  woNumber?: string;
  fromProduct?: ChangeoverProductRef;
  toProduct: ChangeoverProductRef;
  allergenRisk?: string;
  cleaningCompleted: boolean;
  atpResult?: string;
  dualSignOffStatus: ChangeoverDualSignStatus;
  firstSigner?: ChangeoverSignerRef;
  secondSigner?: ChangeoverSignerRef;
  createdAt: string;
};

export type ListChangeoversInput = {
  lineId?: string;
  status?: ChangeoverDualSignStatus;
  limit?: number;
};

export type ListChangeoversResult =
  | { ok: true; rows: ChangeoverListRow[] }
  | { ok: false; error: 'forbidden' | 'error'; message?: string };

export type ListChangeoversFn = (
  input?: ListChangeoversInput,
) => Promise<ListChangeoversResult>;

export type CreateChangeoverInput = {
  lineId: string;
  woId?: string;
  fromProductId?: string;
  toProductId: string;
  cleaningCompleted: boolean;
  atpResult?: string;
  notes?: string;
};

export type CreateChangeoverResult =
  | { ok: true; id?: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'error'; message?: string };

export type CreateChangeoverFn = (
  input: CreateChangeoverInput,
) => Promise<CreateChangeoverResult>;

/** Slot-aware error codes returned by signChangeover (C4). */
export type SignChangeoverError =
  | 'forbidden'
  | 'wrong_role'
  | 'same_user'
  | 'same_user_rejected'
  | 'invalid_state'
  | 'cleaning_incomplete'
  | 'esign_failed';

export type SignChangeoverInput = {
  changeoverId: string;
  signature: { password: string };
};

export type SignChangeoverResult =
  | { ok: true }
  | { ok: false; error: SignChangeoverError; message?: string };

export type SignChangeoverFn = (
  input: SignChangeoverInput,
) => Promise<SignChangeoverResult>;

/** Line option for the create-modal line picker (loaded server-side). */
export type ChangeoverLineOption = {
  id: string;
  code: string;
};
