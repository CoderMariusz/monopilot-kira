/**
 * The multiplier applied to a bom_line quantity when snapshotting wo_materials.
 * - 'per_base' BOMs (default, all non-NPD): the bom_line quantity is per ONE base unit of the
 *   FG output, so scale directly by plannedBaseQty (unchanged legacy behaviour).
 * - 'per_box' BOMs (NPD v2, owner decision D8): the bom_line quantity is per ONE BOX, so scale by
 *   the NUMBER OF BOXES = plannedBaseQty / kg_per_box (kg_per_box = eachPerBox x netQtyPerEach).
 *   Falls back to plannedBaseQty if kg_per_box is missing/<=0 (no each_per_box / net) so a
 *   misconfigured FG can never divide-by-zero - it degrades to legacy scaling, not a crash.
 */
export function computeWoMaterialScalar(input: {
  plannedBaseQty: number;
  lineBasis: string | null | undefined;
  eachPerBox: number | null | undefined;
  netQtyPerEach: number | null | undefined;
}): number {
  const planned = Number(input.plannedBaseQty);
  if (input.lineBasis !== 'per_box') return planned;
  const eachPerBox = Number(input.eachPerBox ?? 0);
  const netPerEach = Number(input.netQtyPerEach ?? 0);
  const kgPerBox = eachPerBox * netPerEach;
  if (!Number.isFinite(kgPerBox) || kgPerBox <= 0) return planned;
  return planned / kgPerBox;
}
