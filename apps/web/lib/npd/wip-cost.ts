/**
 * WIP unit-cost helpers — canonical costing paths are NUMERIC-exact via `Dec`
 * (string in, string out). `computeWipProcessCost` alone keeps the legacy
 * process-editor number DTO at its outer boundary.
 *
 * Canonical formula (C033/C034): unit cost = (materials + process labour) / yield.
 * Batch labour normalizes by throughput×duration (or inferred batch kg for duration-only).
 */

import { Dec, SCALE } from '@monopilot/domain';

const HUNDRED = Dec.from('100');
const ONE = Dec.from('1');
const COST_DP = 4;

export type WipProcessRoleCost = {
  rolePerHour: string;
  headcount: string;
};

export type WipMaterialLineCost = {
  qtyPerUnit: string;
  unitCost: string;
};

export type WipProcessCostInput = {
  roles: WipProcessRoleCost[];
  durationHours: string;
  additionalCost: string;
  /** When set with duration, defines batch output qty (e.g. 200 kg/h × 5 h). */
  throughputPerHour?: string;
  throughputUom?: string | null;
  /** Per-run setup cost; amortised via {@link WipSetupAmortization}. */
  setupCost?: string;
};

/** Brief inputs for setup amortisation: setup × runs / volume / wipQty → per WIP output unit. */
export type WipSetupAmortization = {
  runsPerWeek: string;
  weeklyVolumePacks: string;
  /** WIP output units consumed per FG pack (formulation qty per pack). */
  wipQtyPerFgPack: string;
};

/** ponytail: depth ceiling for WIP-in-WIP — deeper trees need an explicit design pass. */
export const WIP_COST_DEPTH_CEILING = 8;

export function computeWipProcessCost(
  roles: Array<{ rolePerHour: number; headcount: number }>,
  durationHours: number,
  additionalCost: number,
): number {
  // Compatibility adapter for the legacy process-editor DTO, whose public
  // contract is numeric. Costing/persistence use WipProcessCostInput strings.
  const safeRoles = Array.isArray(roles) ? roles : [];
  const exactRoles = safeRoles.map((role) => ({
    rolePerHour: nonNegativeNumberText(role?.rolePerHour),
    headcount: nonNegativeNumberText(role?.headcount),
  }));
  const cost = sumCrewRate(exactRoles)
    .mul(nonNegativeDec(nonNegativeNumberText(durationHours)))
    .add(nonNegativeDec(nonNegativeNumberText(additionalCost)));
  return parseFloat(cost.toFixed(SCALE));
}

export function computeWipMaterialCost(lines: WipMaterialLineCost[]): string {
  return sumMaterialCost(lines).toFixed(COST_DP);
}

/**
 * Batch output (kg) inferred from throughput×duration on WIP process steps.
 * Duration-only steps divide by this instead of treating batch cost as per-kg.
 */
export function inferWipBatchOutputKg(processes: WipProcessCostInput[]): string {
  return inferWipBatchOutputKgDec(processes).toFixed(COST_DP);
}

function inferWipBatchOutputKgDec(processes: WipProcessCostInput[]): Dec {
  const safeProcesses = Array.isArray(processes) ? processes : [];
  let batchKg = Dec.zero();
  for (const process of safeProcesses) {
    const throughput = nonNegativeDec(process.throughputPerHour);
    const duration = nonNegativeDec(process.durationHours);
    if (throughput.isZero() || duration.isZero()) continue;
    const uom = (process.throughputUom ?? 'kg').trim().toLowerCase();
    if (uom === 'kg') {
      const candidate = throughput.mul(duration);
      if (candidate.cmp(batchKg) > 0) batchKg = candidate;
    }
  }
  return batchKg.isZero() ? ONE : batchKg;
}

/**
 * Process labour for ONE output unit of WIP (e.g. per kg), before yield.
 * Throughput path: crewRate/throughput + additional/(throughput×duration).
 * Duration path: (crewRate×duration + additional) / batchOutputKg.
 */
export function computeWipProcessLaborPerOutputUnit(
  process: WipProcessCostInput,
  batchOutputKg: string,
): string {
  return computeWipProcessLaborPerOutputUnitDec(
    process,
    nonNegativeDec(batchOutputKg),
  ).toFixed(COST_DP);
}

function computeWipProcessLaborPerOutputUnitDec(
  process: WipProcessCostInput,
  batchOutputKg: Dec,
): Dec {
  const crewRate = sumCrewRate(process.roles);
  const duration = nonNegativeDec(process.durationHours);
  const additional = nonNegativeDec(process.additionalCost);
  const throughput = nonNegativeDec(process.throughputPerHour);
  const safeBatchKg = batchOutputKg.isZero() ? ONE : batchOutputKg;

  if (!throughput.isZero()) {
    const batchOutput = throughput.mul(duration.isZero() ? ONE : duration);
    const additionalPerUnit = batchOutput.isZero() ? Dec.zero() : additional.div(batchOutput);
    return crewRate.div(throughput).add(additionalPerUnit);
  }

  const batchCost = crewRate.mul(duration).add(additional);
  return batchCost.div(safeBatchKg);
}

export function computeWipComponentCost(
  processCosts: string[],
  rmCost: string,
  yieldPct = '100',
): string {
  const rawCost = nonNegativeDec(rmCost);
  const safeProcessCosts = Array.isArray(processCosts) ? processCosts : [];
  const processTotal = safeProcessCosts.reduce((sum, cost) => sum.add(nonNegativeDec(cost)), Dec.zero());
  const safeYield = validYieldFactor(yieldPct);

  return rawCost.add(processTotal).div(safeYield).toFixed(COST_DP);
}

/**
 * WIP unit cost = (materials (qty×unitCost) + process labour) / yield.
 */
export function computeWipUnitCost(input: {
  materials: WipMaterialLineCost[];
  processes: WipProcessCostInput[];
  yieldPct?: string;
  setupAmortization?: WipSetupAmortization;
}): string {
  return computeWipCostPartsDecimal(
    sumMaterialCost(input.materials),
    input.processes,
    input.yieldPct,
    input.setupAmortization,
  )
    .unitCost
    .toFixed(COST_DP);
}

export function computeWipCostParts(input: {
  rawMaterialCostPerOutputUnit: string;
  processes: WipProcessCostInput[];
  yieldPct?: string;
  setupAmortization?: WipSetupAmortization;
}): {
  rawMaterialUnitCost: string;
  processLaborPerOutputUnit: string;
  yieldedRawMaterialUnitCost: string;
  yieldedProcessLaborPerOutputUnit: string;
  unitCostEur: string;
} {
  const rawMaterial = nonNegativeDec(input.rawMaterialCostPerOutputUnit);
  const parts = computeWipCostPartsDecimal(
    rawMaterial,
    input.processes,
    input.yieldPct,
    input.setupAmortization,
  );
  return {
    rawMaterialUnitCost: rawMaterial.toFixed(SCALE),
    processLaborPerOutputUnit: parts.processLabor.toFixed(SCALE),
    yieldedRawMaterialUnitCost: parts.yieldedRawMaterial.toFixed(SCALE),
    // Allocate the final fixed-point remainder to labour so the two presented
    // stages always add back to the canonical (material + labour) / yield total.
    yieldedProcessLaborPerOutputUnit: parts.unitCost.sub(parts.yieldedRawMaterial).toFixed(SCALE),
    unitCostEur: parts.unitCost.toFixed(COST_DP),
  };
}

export type WipTreeChildCost = string | { unitCost: string; missing?: boolean };

/**
 * Cycle-safe recursive cost over a WIP tree. `resolveChild` returns null when a
 * leaf has no price (honest missing). Cycle / depth-ceiling edges contribute 0
 * and set `missing: true`.
 */
export function computeWipTreeUnitCost(input: {
  itemId: string;
  materials: Array<{
    childItemId: string | null;
    qtyPerUnit: string;
    /** Pre-resolved leaf cost; null → ask resolveChild / treat as missing. */
    unitCost: string | null;
    isIntermediate: boolean;
  }>;
  processes: WipProcessCostInput[];
  yieldPct?: string;
  setupAmortization?: WipSetupAmortization;
  visited?: ReadonlySet<string>;
  depth?: number;
  resolveChild?: (
    childItemId: string,
    visited: ReadonlySet<string>,
    depth: number,
  ) => WipTreeChildCost | null;
}): { unitCost: string; missing: boolean } {
  const depth = input.depth ?? 0;
  const visited = new Set(input.visited ?? []);
  if (visited.has(input.itemId) || depth > WIP_COST_DEPTH_CEILING) {
    // ponytail: cycle / depth break → zero contribution, do not explode
    return {
      unitCost: Dec.zero().toFixed(COST_DP),
      missing: visited.has(input.itemId) || depth > WIP_COST_DEPTH_CEILING,
    };
  }
  visited.add(input.itemId);

  let missing = false;
  const resolvedMaterials: WipMaterialLineCost[] = [];
  for (const line of input.materials) {
    if (line.unitCost !== null && isDecimalString(line.unitCost)) {
      resolvedMaterials.push({ qtyPerUnit: line.qtyPerUnit, unitCost: line.unitCost });
      continue;
    }
    if (line.isIntermediate && line.childItemId && input.resolveChild) {
      if (visited.has(line.childItemId)) {
        // ponytail: cycle edge → zero contribution, honest incomplete
        missing = true;
        continue;
      }
      const childResult = input.resolveChild(line.childItemId, visited, depth + 1);
      if (childResult === null) {
        missing = true;
        continue;
      }
      const childCost = typeof childResult === 'string' ? childResult : childResult.unitCost;
      if (typeof childResult === 'object' && childResult.missing) {
        missing = true;
      }
      resolvedMaterials.push({ qtyPerUnit: line.qtyPerUnit, unitCost: childCost });
      continue;
    }
    missing = true;
  }

  return {
    unitCost: computeWipUnitCost({
      materials: resolvedMaterials,
      processes: input.processes,
      yieldPct: input.yieldPct,
      setupAmortization: input.setupAmortization,
    }),
    missing,
  };
}

function sumCrewRate(roles: WipProcessRoleCost[]): Dec {
  const safeRoles = Array.isArray(roles) ? roles : [];
  return safeRoles.reduce((sum, role) => {
    return sum.add(nonNegativeDec(role?.rolePerHour).mul(nonNegativeDec(role?.headcount)));
  }, Dec.zero());
}

function sumMaterialCost(lines: WipMaterialLineCost[]): Dec {
  const safeLines = Array.isArray(lines) ? lines : [];
  return safeLines.reduce((sum, line) => {
    return sum.add(nonNegativeDec(line?.qtyPerUnit).mul(nonNegativeDec(line?.unitCost)));
  }, Dec.zero());
}

/**
 * Amortises Σ setup_cost to one WIP output unit (D25 / mig429).
 * Per FG pack: setup × runs / volume; per WIP unit: ÷ wip qty per pack.
 */
export function computeWipSetupPerOutputUnit(
  processes: WipProcessCostInput[],
  amortization: WipSetupAmortization | undefined,
): string {
  return computeWipSetupPerOutputUnitDec(processes, amortization).toFixed(COST_DP);
}

function computeWipSetupPerOutputUnitDec(
  processes: WipProcessCostInput[],
  amortization: WipSetupAmortization | undefined,
): Dec {
  if (!amortization) return Dec.zero();
  const runs = nonNegativeDec(amortization.runsPerWeek);
  const volume = nonNegativeDec(amortization.weeklyVolumePacks);
  const wipQty = nonNegativeDec(amortization.wipQtyPerFgPack);
  if (volume.isZero() || wipQty.isZero()) return Dec.zero();

  const safeProcesses = Array.isArray(processes) ? processes : [];
  const setupTotal = safeProcesses.reduce(
    (sum, process) => sum.add(nonNegativeDec(process.setupCost)),
    Dec.zero(),
  );
  return setupTotal.mul(runs).div(volume).div(wipQty);
}

function computeWipCostPartsDecimal(
  rawMaterial: Dec,
  processes: WipProcessCostInput[],
  yieldPct: string | undefined,
  setupAmortization?: WipSetupAmortization,
): { processLabor: Dec; yieldedRawMaterial: Dec; unitCost: Dec } {
  const safeProcesses = Array.isArray(processes) ? processes : [];
  const batchOutputKg = inferWipBatchOutputKgDec(safeProcesses);
  const processLabor = safeProcesses
    .reduce((sum, process) => {
      return sum.add(computeWipProcessLaborPerOutputUnitDec(process, batchOutputKg));
    }, Dec.zero())
    .add(computeWipSetupPerOutputUnitDec(safeProcesses, setupAmortization));
  const yieldFactor = validYieldFactor(yieldPct);
  return {
    processLabor,
    yieldedRawMaterial: rawMaterial.div(yieldFactor),
    unitCost: rawMaterial.add(processLabor).div(yieldFactor),
  };
}

function nonNegativeDec(value: unknown): Dec {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Dec.zero();
  }
  const parsed = Dec.from(value);
  return parsed.cmp(Dec.zero()) < 0 ? Dec.zero() : parsed;
}

function validYieldFactor(yieldPct: unknown): Dec {
  if (typeof yieldPct !== 'string' || !/^\d+(\.\d+)?$/.test(yieldPct.trim())) {
    return ONE;
  }
  const pct = Dec.from(yieldPct);
  if (pct.isZero() || pct.cmp(HUNDRED) > 0) return ONE;
  return pct.div(HUNDRED);
}

function isDecimalString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function nonNegativeNumberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : '0';
}

/** DB row shape for WIP process labour (npd_wip_processes or wip_definition_processes). */
export type LiveWipProcessDbRow = {
  wip_definition_id: string;
  process_id: string;
  duration_hours: string | null;
  additional_cost: string | null;
  throughput_per_hour: string | null;
  throughput_uom: string | null;
  setup_cost: string | null;
  rate_per_hour: string | null;
  headcount: string | null;
};

function nonNegativeStringText(value: string | null | undefined): string {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) return '0';
  const parsed = Dec.from(value);
  return parsed.cmp(Dec.zero()) < 0 ? '0' : value.trim();
}

/** Groups flat process-role rows into {@link WipProcessCostInput} per WIP definition. */
export function groupWipProcessDbRows(rows: LiveWipProcessDbRow[]): Map<string, WipProcessCostInput[]> {
  const byDefinition = new Map<string, Map<string, WipProcessCostInput>>();
  const safeRows = Array.isArray(rows) ? rows : [];
  for (const row of safeRows) {
    const defId = row.wip_definition_id;
    if (!defId) continue;
    let byProcess = byDefinition.get(defId);
    if (!byProcess) {
      byProcess = new Map();
      byDefinition.set(defId, byProcess);
    }
    let process = byProcess.get(row.process_id);
    if (!process) {
      process = {
        roles: [],
        durationHours: nonNegativeStringText(row.duration_hours),
        additionalCost: nonNegativeStringText(row.additional_cost),
        throughputPerHour: row.throughput_per_hour ? nonNegativeStringText(row.throughput_per_hour) : undefined,
        throughputUom: row.throughput_uom,
        setupCost: row.setup_cost ? nonNegativeStringText(row.setup_cost) : undefined,
      };
      byProcess.set(row.process_id, process);
    }
    if (row.headcount !== null || row.rate_per_hour !== null) {
      process.roles.push({
        rolePerHour: nonNegativeStringText(row.rate_per_hour),
        headcount: nonNegativeStringText(row.headcount),
      });
    }
  }
  const result = new Map<string, WipProcessCostInput[]>();
  for (const [defId, byProcess] of byDefinition) {
    result.set(defId, [...byProcess.values()]);
  }
  return result;
}

export function buildWipSetupAmortization(input: {
  runsPerWeek: string | null | undefined;
  weeklyVolumePacks: string | null | undefined;
  wipQtyPerFgPack: string | null | undefined;
  /** When zero/unset, setup is omitted — parity with compute-waterfall brief_inputs_required. */
  avgBatchQty?: string | null | undefined;
}): WipSetupAmortization | undefined {
  const runs = input.runsPerWeek;
  const volume = input.weeklyVolumePacks;
  const wipQty = input.wipQtyPerFgPack;
  const avgBatchQty = input.avgBatchQty;
  if (!runs || !volume || !wipQty) return undefined;
  if (!isDecimalString(runs) || !isDecimalString(volume) || !isDecimalString(wipQty)) return undefined;
  if (Dec.from(runs).isZero() || Dec.from(volume).isZero() || Dec.from(wipQty).isZero()) return undefined;
  if (!avgBatchQty || !isDecimalString(avgBatchQty) || Dec.from(avgBatchQty).isZero()) return undefined;
  return { runsPerWeek: runs, weeklyVolumePacks: volume, wipQtyPerFgPack: wipQty };
}

/**
 * Live formulation path — canonical WIP unit cost from material + definition/NPD
 * processes + optional setup amortisation, divided by definition yield.
 */
export function computeLiveWipUnitCost(input: {
  rawMaterialCostPerOutputUnit: string;
  processes: WipProcessCostInput[];
  yieldPct?: string;
  setupAmortization?: WipSetupAmortization;
}): string {
  return computeWipUnitCost({
    materials: [{ qtyPerUnit: '1', unitCost: input.rawMaterialCostPerOutputUnit }],
    processes: input.processes,
    yieldPct: input.yieldPct,
    setupAmortization: input.setupAmortization,
  });
}

export type LiveWipMaterialRow = {
  /** Per formulation line — amortises setup independently (compute-waterfall parity). */
  line_key: string;
  wip_definition_id: string;
  qty_kg: string | null;
  yield_pct: string;
  raw_material_cost_per_output_unit: string;
  composition_missing_cost: boolean;
};

/** Stable merge/save key for a WIP recipe line (sequence-independent). */
export function liveWipCostLineKey(rmCode: string, wipDefinitionId: string): string {
  return `${rmCode}:${wipDefinitionId}`;
}

/** Builds lineKey → unit cost map for the live formulation editor. */
export function buildLiveWipUnitCostMap(input: {
  materialRows: LiveWipMaterialRow[];
  processRows: LiveWipProcessDbRow[];
  runsPerWeek?: string | null;
  weeklyVolumePacks?: string | null;
  avgBatchQty?: string | null;
}): Record<string, string> {
  const processesByDefinition = groupWipProcessDbRows(input.processRows);
  const out: Record<string, string> = {};
  for (const row of input.materialRows) {
    if (row.composition_missing_cost) continue;
    const setupAmortization = buildWipSetupAmortization({
      runsPerWeek: input.runsPerWeek,
      weeklyVolumePacks: input.weeklyVolumePacks,
      wipQtyPerFgPack: row.qty_kg,
      avgBatchQty: input.avgBatchQty,
    });
    out[row.line_key] = computeLiveWipUnitCost({
      rawMaterialCostPerOutputUnit: row.raw_material_cost_per_output_unit,
      processes: processesByDefinition.get(row.wip_definition_id) ?? [],
      yieldPct: row.yield_pct,
      setupAmortization,
    });
  }
  return out;
}
