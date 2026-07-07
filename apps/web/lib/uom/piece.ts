/**
 * Canonical piece-count UoM (R3.3): stored value is always `pcs`.
 * Legacy codes `szt` (PL items master) and `ea` (unit_of_measure seed) are
 * equivalent — normalize on read/compare until the 449 data migration has run everywhere.
 */

export const LEGACY_PIECE_UOMS = ['szt', 'ea'] as const;
export type LegacyPieceUom = (typeof LEGACY_PIECE_UOMS)[number];

export const CANONICAL_PIECE_UOM = 'pcs' as const;

/** Map legacy piece codes to canonical `pcs`; pass through all other codes unchanged. */
export function normalizePieceUom(uom: string | null | undefined): string | undefined {
  if (uom == null) return undefined;
  const trimmed = uom.trim();
  if (trimmed === '') return undefined;
  if (trimmed === 'szt' || trimmed === 'ea') return CANONICAL_PIECE_UOM;
  return trimmed;
}

/** Case-sensitive equality after piece-code normalization (scanner LP matching uses raw SQL equality post-migration). */
export function pieceUomsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePieceUom(a) ?? a ?? '';
  const right = normalizePieceUom(b) ?? b ?? '';
  return left === right;
}
