/**
 * Wave E3 — CCP Deviations register: client/RSC shared contracts.
 *
 * Types the list + resolve client islands consume. The DEVIATION ROW shape is a
 * presentational subset of the reviewed backend `CcpDeviationRow`
 * (quality/_actions/ccp-deviation-actions.ts) — NO `*_id` reaches the UI except
 * the row `id` (used only as a React key + the action argument; never rendered).
 * The CCP CODE / name, the hold NUMBER (never the hold id) and the disposition
 * text are what the screen displays (plan rule 0.11 — no raw UUIDs).
 *
 * `ResolveDeviationAction` mirrors the reviewed `resolveCcpDeviation(id, {
 * actionTaken, disposition, signature:{password} })` signature so the page wires
 * the EXACT reviewed action (imported, never authored here) and the RTL test can
 * inject a vi.fn() satisfying the same type.
 */
import type { resolveCcpDeviation } from '../../_actions/ccp-deviation-actions';
import type { CcpDeviationDisposition } from '../../_actions/ccp-deviation-types';
import { CCP_DEVIATION_DISPOSITIONS } from '../../_actions/ccp-deviation-types';

export type DeviationStatus = 'open' | 'resolved';
export type DeviationDisposition = CcpDeviationDisposition;
export const DEVIATION_DISPOSITIONS: DeviationDisposition[] = [...CCP_DEVIATION_DISPOSITIONS];
/** The status filter the list exposes (the backend accepts open | resolved; 'all' = no filter). */
export type DeviationStatusFilter = 'open' | 'resolved' | 'all';
export const DEVIATION_STATUS_FILTERS: DeviationStatusFilter[] = ['open', 'resolved', 'all'];

/** A hold linked to a deviation — only the NUMBER + a display string reach the UI. */
export type DeviationHold = {
  /** Hold id — used ONLY to build the /quality/holds/{id} deep-link href; never rendered. */
  id: string;
  holdNumber: string;
  referenceDisplay: string | null;
  status: string;
};

/** Presentational subset of the reviewed backend CcpDeviationRow. */
export type DeviationRow = {
  /** Row id — React key + resolve argument only; NEVER rendered (rule 0.11). */
  id: string;
  status: DeviationStatus;
  ccpCode: string;
  ccpName: string;
  measuredValue: string | null;
  uom: string | null;
  actionTaken: string | null;
  disposition: DeviationDisposition | null;
  hold: DeviationHold | null;
  openedAt: string;
};

export type ResolveDeviationAction = typeof resolveCcpDeviation;
