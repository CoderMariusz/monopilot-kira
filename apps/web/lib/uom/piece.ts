/**
 * Canonical piece-count UoM (R3.3): stored value is always `pcs`.
 * Legacy codes `szt` (PL items master) and `ea` (unit_of_measure seed) are
 * equivalent — normalize on read/compare until the 449 data migration has run everywhere.
 */

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

type BomSnapshotUomCarrier = {
  lines?: Array<{ uom?: string | null }>;
  co_products?: Array<{ uom?: string | null }>;
};

/** Normalize legacy piece codes in immutable bom_snapshots.snapshot_json on read (R3.3 F4). */
export function normalizeBomSnapshotJsonUoms<T extends BomSnapshotUomCarrier>(json: T): T {
  return {
    ...json,
    ...(json.lines
      ? {
          lines: json.lines.map((line) => ({
            ...line,
            uom: normalizePieceUom(line.uom ?? undefined) ?? line.uom,
          })),
        }
      : {}),
    ...(json.co_products
      ? {
          co_products: json.co_products.map((cp) => ({
            ...cp,
            uom: normalizePieceUom(cp.uom ?? undefined) ?? cp.uom,
          })),
        }
      : {}),
  };
}
