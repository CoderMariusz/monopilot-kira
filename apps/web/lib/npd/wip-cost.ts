export type WipProcessRoleCost = {
  rolePerHour: number;
  headcount: number;
};

export type WipMaterialLineCost = {
  qtyPerUnit: number;
  unitCost: number;
};

export type WipProcessCostInput = {
  roles: WipProcessRoleCost[];
  durationHours: number;
  additionalCost: number;
};

/** ponytail: depth ceiling for WIP-in-WIP — deeper trees need an explicit design pass. */
export const WIP_COST_DEPTH_CEILING = 8;

export function computeWipProcessCost(
  roles: WipProcessRoleCost[],
  durationHours: number,
  additionalCost: number,
): number {
  const duration = toNonNegativeNumber(durationHours);
  const safeRoles = Array.isArray(roles) ? roles : [];
  const processCost = safeRoles.reduce((sum, role) => {
    const rate = toNonNegativeNumber(role?.rolePerHour);
    const headcount = toNonNegativeNumber(role?.headcount);
    return sum + rate * headcount * duration;
  }, 0);

  return processCost + toNonNegativeNumber(additionalCost);
}

export function computeWipMaterialCost(lines: WipMaterialLineCost[]): number {
  const safeLines = Array.isArray(lines) ? lines : [];
  return safeLines.reduce((sum, line) => {
    return sum + toNonNegativeNumber(line?.qtyPerUnit) * toNonNegativeNumber(line?.unitCost);
  }, 0);
}

export function computeWipComponentCost(
  processCosts: number[],
  rmCost: number,
  yieldPct = 100,
): number {
  const rawCost = toNonNegativeNumber(rmCost);
  const safeProcessCosts = Array.isArray(processCosts) ? processCosts : [];
  const processTotal = safeProcessCosts.reduce((sum, cost) => sum + toNonNegativeNumber(cost), 0);
  const safeYield = toValidYieldPct(yieldPct);

  return (rawCost + processTotal) / (safeYield / 100);
}

/**
 * WIP unit cost = materials (qty×unitCost) + process labour (rate×headcount×duration)
 * with yield applied. Pure; callers own cycle guards via visited-set + depth ceiling.
 */
export function computeWipUnitCost(input: {
  materials: WipMaterialLineCost[];
  processes: WipProcessCostInput[];
  yieldPct?: number;
}): number {
  const materials = computeWipMaterialCost(input.materials);
  const processCosts = (Array.isArray(input.processes) ? input.processes : []).map((process) =>
    computeWipProcessCost(process.roles, process.durationHours, process.additionalCost),
  );
  return computeWipComponentCost(processCosts, materials, input.yieldPct);
}

/**
 * Cycle-safe recursive cost over a WIP tree. `resolveChild` returns null when a
 * leaf has no price (honest missing). Cycle / depth-ceiling edges contribute 0.
 */
export function computeWipTreeUnitCost(input: {
  itemId: string;
  materials: Array<{
    childItemId: string | null;
    qtyPerUnit: number;
    /** Pre-resolved leaf cost; null → ask resolveChild / treat as missing. */
    unitCost: number | null;
    isIntermediate: boolean;
  }>;
  processes: WipProcessCostInput[];
  yieldPct?: number;
  visited?: ReadonlySet<string>;
  depth?: number;
  resolveChild?: (childItemId: string, visited: ReadonlySet<string>, depth: number) => number | null;
}): { unitCost: number; missing: boolean } {
  const depth = input.depth ?? 0;
  const visited = new Set(input.visited ?? []);
  if (visited.has(input.itemId) || depth > WIP_COST_DEPTH_CEILING) {
    // ponytail: cycle / depth break → zero contribution, do not explode
    return { unitCost: 0, missing: depth > WIP_COST_DEPTH_CEILING };
  }
  visited.add(input.itemId);

  let missing = false;
  const resolvedMaterials: WipMaterialLineCost[] = [];
  for (const line of input.materials) {
    if (line.unitCost !== null && Number.isFinite(line.unitCost)) {
      resolvedMaterials.push({ qtyPerUnit: line.qtyPerUnit, unitCost: line.unitCost });
      continue;
    }
    if (line.isIntermediate && line.childItemId && input.resolveChild) {
      if (visited.has(line.childItemId)) {
        // ponytail: cycle edge → zero contribution, do not explode
        continue;
      }
      const child = input.resolveChild(line.childItemId, visited, depth + 1);
      if (child === null) {
        missing = true;
        continue;
      }
      resolvedMaterials.push({ qtyPerUnit: line.qtyPerUnit, unitCost: child });
      continue;
    }
    missing = true;
  }

  return {
    unitCost: computeWipUnitCost({
      materials: resolvedMaterials,
      processes: input.processes,
      yieldPct: input.yieldPct,
    }),
    missing,
  };
}

function toNonNegativeNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function toValidYieldPct(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 && numberValue <= 100 ? numberValue : 100;
}
