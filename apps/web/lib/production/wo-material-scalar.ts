export class WoMaterialScalarError extends Error {
  readonly code = 'pack_hierarchy_incomplete';
  constructor(
    public readonly detail: { eachPerBox: number | null | undefined; netQtyPerEach: number | null | undefined },
  ) {
    super(
      `per_box BOM line requires both each_per_box and net_qty_per_each on the item; got eachPerBox=${detail.eachPerBox}, netQtyPerEach=${detail.netQtyPerEach}`,
    );
    this.name = 'WoMaterialScalarError';
  }
}

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
  if (!Number.isFinite(kgPerBox) || kgPerBox <= 0) {
    throw new WoMaterialScalarError({ eachPerBox: input.eachPerBox, netQtyPerEach: input.netQtyPerEach });
  }
  return planned / kgPerBox;
}
