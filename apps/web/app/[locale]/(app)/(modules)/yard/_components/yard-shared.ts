/**
 * WAVE E5 — UI-only helpers + re-exports over the canonical yard contract.
 *
 * The action/result types are OWNED by the yard backend lane
 * (../_actions/yard-types.ts). This module re-exports the subset the screens
 * use and adds presentation-only helpers (net computation for the live preview,
 * the carrier option shape sourced from the freight master). It authors NO new
 * contract types — when the backend changes a shape, this file follows.
 */
export type {
  AppointmentDirection,
  AppointmentRow,
  AppointmentStatus,
  BookAppointmentInput,
  DockDoorDirection,
  DockDoorRow,
  GateInInput,
  ListAppointmentsInput,
  RecordWeighingInput,
  UpsertDockDoorInput,
  VisitStatus,
  WeighingRow,
  YardVisitRow,
} from '../_actions/yard-types';

/**
 * Yard write actions THROW on failure (forbidden / validation / overlap) rather
 * than returning a discriminated result. The UI maps these stable Error.message
 * substrings to localized copy; we never surface a raw message to the user.
 */
export type YardActionErrorKind =
  | 'forbidden'
  | 'overlap'
  | 'not_found'
  | 'invalid_input'
  | 'persistence_failed';

export function classifyYardError(error: unknown): YardActionErrorKind {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message === 'forbidden') return 'forbidden';
  if (message.includes('overlap')) return 'overlap';
  if (message.includes('not found')) return 'not_found';
  if (
    message.includes('required') ||
    message.includes('must be') ||
    message.includes('invalid') ||
    message.includes('before')
  ) {
    return 'invalid_input';
  }
  return 'persistence_failed';
}

/** Carrier picker option — sourced from the freight master (listCarriers). */
export type CarrierOption = {
  id: string;
  code: string;
  name: string;
};

/**
 * Net = gross − tare, rendered for the live preview. Returns null when either
 * input is blank / non-numeric or tare exceeds gross (the form blocks submit in
 * that case, but the preview must not show a negative net).
 */
export function computeNet(grossKg: string, tareKg: string): string | null {
  const gross = Number(grossKg);
  const tare = Number(tareKg);
  if (grossKg.trim() === '' || tareKg.trim() === '') return null;
  if (!Number.isFinite(gross) || !Number.isFinite(tare)) return null;
  if (tare > gross) return null;
  return (gross - tare).toFixed(3);
}
