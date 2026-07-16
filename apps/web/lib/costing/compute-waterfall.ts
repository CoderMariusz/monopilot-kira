/**
 * NPD costing engine (owner rulings D22-D31/D41-D42/U2).
 *
 * Canonical basis is PER PACK. Money and quantities are decimal strings and all
 * arithmetic uses the repo fixed-point decimal helper.
 */

import { Dec, type RecomputeIngredient } from '@monopilot/domain';
import { computeWipCostParts, type WipProcessCostInput } from '../npd/wip-cost';

export const COSTING_WATERFALL_STEP_NAMES = [
  'Raw materials',
  'Yield loss',
  'Process labour',
  'Setup',
  'Packaging',
  'Overhead',
  'Logistics',
  'Total cost',
  'Margin vs target price',
] as const;

export type CostingWaterfallStepName = (typeof COSTING_WATERFALL_STEP_NAMES)[number];
export type WaterfallStatus = 'ok' | 'warn' | 'fail';
export type CostingErrorCode =
  | 'yield_required'
  | 'brief_inputs_required'
  | 'packs_per_case_required'
  // Honesty contract carried over from the pct-era compute (W9-L6): an ingredient
  // without a cost must BLOCK the compute, never silently price as zero.
  | 'ingredient_costs_missing';

export interface WaterfallParams {
  rawCostEur: string;
  yieldPct: string;
  processLabourEur: string;
  packagingEur: string;
  overheadEur: string;
  logisticsEur: string;
  marginPct: string;
  distributorMarkupPct?: string;
  retailMarkupPct?: string;
}

export interface NpdCostUnits {
  packWeightKg: string;
  packsPerCase: string;
  avgBatchQty: string;
  fgBaseUom: 'kg' | 'each' | 'pack';
  packsPerBatch: string;
}

export interface WaterfallStep {
  stepIndex: number;
  stepName: CostingWaterfallStepName;
  valueEur: string;
  deltaPct: string | null;
}

export interface NpdCostStep {
  stepIndex: number;
  stepName: CostingWaterfallStepName;
  perPackEur: string;
  deltaPct: string | null;
}

export interface NpdCostProcessInput {
  id?: string;
  roles: Array<{ ratePerHour: string | null | undefined; headcount: string | null | undefined }>;
  throughputPerHour?: string | null;
  throughputUom?: string | null;
  durationHours?: string | null;
  additionalCost?: string | null;
  setupCost?: string | null;
}

export interface NpdWipComponentInput {
  /** Quantity consumed PER PACK of the FG, in the WIP's base unit (formulation
   *  qty_kg per pack for mass WIPs). No pack-weight rescaling is applied —
   *  the raw contribution is unitCost × quantity. */
  quantity: string;
  /** Informational — the WIP's base unit for the quantity above. */
  quantityUom?: string | null;
  rawMaterialCostPerOutputUnit: string;
  yieldPct: string;
  processes: NpdCostProcessInput[];
  /** Optional identity so callers can persist the computed WIP unit cost. */
  wipDefinitionId?: string;
  wipItemId?: string;
}

export interface NpdWipComponentCost {
  wipDefinitionId?: string;
  wipItemId?: string;
  /** Unit cost of ONE WIP output unit: (materials + process labour) / yield. */
  unitCostEur: string;
  /** Material-only contribution of this WIP line to the FG pack. */
  contributionEur: string;
}

export interface NpdCostEngineInput {
  ingredients: RecomputeIngredient[];
  yieldPct: string | null | undefined;
  packWeightKg: string | null | undefined;
  packsPerCase: string | null | undefined;
  avgBatchQty: string | null | undefined;
  fgBaseUom: 'kg' | 'each' | 'pack' | string | null | undefined;
  weeklyVolumePacks: string | null | undefined;
  runsPerWeek: string | null | undefined;
  targetPriceEur: string | null | undefined;
  marginWarnPct?: string;
  packagingComponents: Array<{
    qtyPerBox: string | null | undefined;
    costPerUnit: string | null | undefined;
    wastePct: string | null | undefined;
  }>;
  processes: NpdCostProcessInput[];
  wipComponents?: NpdWipComponentInput[];
  overheadPerKg: string | null | undefined;
  logisticsPerBox: string | null | undefined;
}

export interface WaterfallResult {
  steps: WaterfallStep[];
  costSteps: NpdCostStep[];
  rawCostEur: string;
  marginPct: string;
  targetPriceEur: string;
  status: WaterfallStatus;
  warn: boolean;
  missing: CostingErrorCode[];
  units: NpdCostUnits;
  legacyDurationBasis: boolean;
  params: {
    rawCostEur: string;
    yieldPct: string;
    processLabourEur: string;
    setupEur: string;
    packagingEur: string;
    overheadEur: string;
    logisticsEur: string;
    marginPct: string;
  };
  /** Per-WIP unit costs computed during the FG waterfall (not discarded). */
  wipComponentCosts: NpdWipComponentCost[];
}

export interface WaterfallThresholds {
  marginWarnPct?: string;
}

const HUNDRED = Dec.from('100');
const ONE = Dec.from('1');
const ZERO4 = '0.0000';

export function computeWaterfall(
  params: WaterfallParams,
  thresholds: WaterfallThresholds = {},
): WaterfallResult {
  const yieldPct = params.yieldPct;
  if (!decimalGt(yieldPct, '0') || decimalGt(yieldPct, '100')) {
    throw new Error('computeWaterfall: yieldPct must be in (0, 100]');
  }
  if (!decimalLt(params.marginPct, '100')) {
    throw new Error('computeWaterfall: marginPct must be < 100');
  }

  const raw = Dec.from(params.rawCostEur);
  const yielded = raw.div(Dec.from(yieldPct).div(HUNDRED));
  const labour = Dec.from(params.processLabourEur);
  const setup = Dec.zero();
  const packaging = Dec.from(params.packagingEur);
  const overhead = Dec.from(params.overheadEur);
  const logistics = Dec.from(params.logisticsEur);
  const total = yielded.add(labour).add(packaging).add(overhead).add(logistics);
  const target = targetPriceFromMargin(total, params.marginPct);

  return buildResult({
    raw,
    yielded,
    labour,
    setup,
    packaging,
    overhead,
    logistics,
    total,
    target,
    yieldPct,
    // V07 (rework finding 1): the status gate must see the CALLER'S full-precision
    // margin, never a value re-derived from the toFixed(4) round-trip via
    // computeMarginPct(total, target) — 14.99999 would round to 15.0000 and skip
    // the warn threshold; -0.00001 would round to 0.0000 and skip the hard fail.
    marginPct: params.marginPct,
    marginWarnPct: thresholds.marginWarnPct,
    units: zeroUnits(),
    missing: [],
    legacyDurationBasis: false,
  });
}

export function computeNpdCostEngine(input: NpdCostEngineInput): WaterfallResult {
  const missing: CostingErrorCode[] = [];
  const packWeightKg = Dec.from(input.packWeightKg);
  const packsPerCase = Dec.from(input.packsPerCase);
  const avgBatchQty = Dec.from(input.avgBatchQty);
  const weeklyVolumePacks = Dec.from(input.weeklyVolumePacks);
  const runsPerWeek = Dec.from(input.runsPerWeek);
  const yieldPctText = normaliseNumeric(input.yieldPct);

  if (!yieldPctText || !decimalGt(yieldPctText, '0')) {
    missing.push('yield_required');
  }
  if (packsPerCase.isZero()) {
    missing.push('packs_per_case_required');
  }
  const briefMissing = new Set<string>();
  if (weeklyVolumePacks.isZero()) briefMissing.add('weekly_volume_packs');
  if (runsPerWeek.isZero()) briefMissing.add('runs_per_week');
  if (avgBatchQty.isZero()) briefMissing.add('avg_batch_qty');
  if (briefMissing.size > 0) missing.push('brief_inputs_required');
  if (input.ingredients.some((ing) => !normaliseNumeric(ing.costPerKgEur))) {
    missing.push('ingredient_costs_missing');
  }

  const fgBaseUom = normaliseFgBaseUom(input.fgBaseUom);
  const packsPerBatch = packsFromOutput(avgBatchQty, fgBaseUom, packWeightKg);
  const units: NpdCostUnits = {
    packWeightKg: packWeightKg.toFixed(6),
    packsPerCase: packsPerCase.toFixed(4),
    avgBatchQty: avgBatchQty.toFixed(4),
    fgBaseUom,
    packsPerBatch: packsPerBatch.toFixed(4),
  };

  let raw = sumIngredientRawCostPerPack(input.ingredients);
  let yieldedMaterialPerPack = raw;
  let yieldedWipLabourPerPack = Dec.zero();
  const wipComponentCosts: NpdWipComponentCost[] = [];
  for (const wip of input.wipComponents ?? []) {
    const parts = computeWipCostParts({
      rawMaterialCostPerOutputUnit: wip.rawMaterialCostPerOutputUnit,
      processes: mapWipProcesses(wip.processes),
      yieldPct: wip.yieldPct,
    });
    const materialUnitCost = Dec.from(parts.rawMaterialUnitCost);
    const yieldedMaterialUnitCost = Dec.from(parts.yieldedRawMaterialUnitCost);
    const yieldedProcessLaborUnitCost = Dec.from(parts.yieldedProcessLaborPerOutputUnit);
    const qty = Dec.from(wip.quantity);
    // quantity is already per pack in the WIP's base unit — rescaling by
    // unitToPackFactor here would multiply by pack weight a second time (review H1).
    // C034: raw = materials only; WIP labour is yield-adjusted but stays in its own stage.
    const contribution = materialUnitCost.mul(qty);
    raw = raw.add(contribution);
    yieldedMaterialPerPack = yieldedMaterialPerPack.add(yieldedMaterialUnitCost.mul(qty));
    yieldedWipLabourPerPack = yieldedWipLabourPerPack.add(yieldedProcessLaborUnitCost.mul(qty));
    wipComponentCosts.push({
      wipDefinitionId: wip.wipDefinitionId,
      wipItemId: wip.wipItemId,
      unitCostEur: parts.unitCostEur,
      contributionEur: contribution.toFixed(4),
    });
  }

  const yieldPct = yieldPctText ?? '100';
  const fgYieldFactor = missing.includes('yield_required') ? ONE : Dec.from(yieldPct).div(HUNDRED);
  const yielded = yieldedMaterialPerPack.div(fgYieldFactor);
  const processResult = computeProcessLabour(input.processes, packWeightKg, packsPerBatch);
  const labour = yieldedWipLabourPerPack.div(fgYieldFactor).add(processResult.perPack);
  const setup = missing.includes('brief_inputs_required')
    ? Dec.zero()
    : sumSetup(input.processes).mul(runsPerWeek).div(weeklyVolumePacks);
  const packaging = packsPerCase.isZero()
    ? Dec.zero()
    : sumPackaging(input.packagingComponents).div(packsPerCase);
  const overhead = Dec.from(input.overheadPerKg).mul(packWeightKg);
  const logistics = packsPerCase.isZero() ? Dec.zero() : Dec.from(input.logisticsPerBox).div(packsPerCase);
  const total = yielded.add(labour).add(setup).add(packaging).add(overhead).add(logistics);
  const target = Dec.from(input.targetPriceEur);
  const marginPct = computeMarginPct(total, target);

  return buildResult({
    raw,
    yielded,
    labour,
    setup,
    packaging,
    overhead,
    logistics,
    total,
    target,
    yieldPct,
    marginPct,
    marginWarnPct: input.marginWarnPct,
    units,
    missing,
    legacyDurationBasis: processResult.legacyDurationBasis,
    wipComponentCosts,
  });
}

function buildResult(input: {
  raw: Dec;
  yielded: Dec;
  labour: Dec;
  setup: Dec;
  packaging: Dec;
  overhead: Dec;
  logistics: Dec;
  total: Dec;
  target: Dec;
  yieldPct: string;
  marginPct?: string;
  marginWarnPct?: string;
  units: NpdCostUnits;
  missing: CostingErrorCode[];
  legacyDurationBasis: boolean;
  wipComponentCosts?: NpdWipComponentCost[];
}): WaterfallResult {
  // V07: gate on FULL precision, report display-rounded. Rounding before the
  // gate made 14.99999 read as 15.0000 (skips warn) and -0.00001 as 0.0000
  // (skips fail).
  const marginPctFull = input.marginPct ?? computeMarginPct(input.total, input.target);
  const status = computeStatus(marginPctFull, input.marginWarnPct);
  const marginPct = Dec.from(marginPctFull).toFixed(4);
  const cumulatives = [
    input.raw,
    input.yielded,
    input.yielded.add(input.labour),
    input.yielded.add(input.labour).add(input.setup),
    input.yielded.add(input.labour).add(input.setup).add(input.packaging),
    input.yielded.add(input.labour).add(input.setup).add(input.packaging).add(input.overhead),
    input.yielded.add(input.labour).add(input.setup).add(input.packaging).add(input.overhead).add(input.logistics),
    input.total,
    input.target,
  ];
  const steps: WaterfallStep[] = COSTING_WATERFALL_STEP_NAMES.map((stepName, idx) => ({
    stepIndex: idx + 1,
    stepName,
    valueEur: cumulatives[idx]!.toFixed(4),
    deltaPct: idx === 0 ? null : percentChange(cumulatives[idx - 1]!, cumulatives[idx]!),
  }));

  return {
    steps,
    costSteps: steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepName: step.stepName,
      perPackEur: step.valueEur,
      deltaPct: step.deltaPct,
    })),
    rawCostEur: input.raw.toFixed(4),
    marginPct,
    targetPriceEur: input.target.toFixed(4),
    status,
    warn: status === 'warn',
    missing: input.missing,
    units: input.units,
    legacyDurationBasis: input.legacyDurationBasis,
    params: {
      rawCostEur: input.raw.toFixed(4),
      yieldPct: Dec.from(input.yieldPct).toFixed(4),
      processLabourEur: input.labour.toFixed(4),
      setupEur: input.setup.toFixed(4),
      packagingEur: input.packaging.toFixed(4),
      overheadEur: input.overhead.toFixed(4),
      logisticsEur: input.logistics.toFixed(4),
      marginPct,
    },
    wipComponentCosts: input.wipComponentCosts ?? [],
  };
}

function computeProcessLabour(
  processes: NpdCostProcessInput[],
  packWeightKg: Dec,
  packsPerBatch: Dec,
): { perPack: Dec; legacyDurationBasis: boolean } {
  let perPack = Dec.zero();
  let legacyDurationBasis = false;
  for (const process of processes) {
    const crewRate = sumCrewRate(process.roles);
    if (process.throughputPerHour && decimalGt(process.throughputPerHour, '0')) {
      const perOutput = crewRate.div(Dec.from(process.throughputPerHour));
      perPack = perPack.add(perOutput.mul(unitToPackFactor(process.throughputUom, packWeightKg)));
    } else {
      legacyDurationBasis = true;
      const batchCost = crewRate.mul(Dec.from(process.durationHours)).add(Dec.from(process.additionalCost));
      perPack = perPack.add(packsPerBatch.isZero() ? Dec.zero() : batchCost.div(packsPerBatch));
    }
    if (process.throughputPerHour && decimalGt(process.throughputPerHour, '0')) {
      perPack = perPack.add(Dec.from(process.additionalCost).mul(batchDivisor(packsPerBatch)));
    }
  }
  return { perPack, legacyDurationBasis };
}

function mapWipProcesses(processes: NpdCostProcessInput[]): WipProcessCostInput[] {
  return processes.map((process) => ({
    roles: process.roles.map((role) => ({
      rolePerHour: normaliseNumeric(role.ratePerHour) ?? '0',
      headcount: normaliseNumeric(role.headcount) ?? '0',
    })),
    durationHours: normaliseNumeric(process.durationHours) ?? '0',
    additionalCost: normaliseNumeric(process.additionalCost) ?? '0',
    throughputPerHour: normaliseNumeric(process.throughputPerHour),
    throughputUom: process.throughputUom,
  }));
}

function sumCrewRate(roles: NpdCostProcessInput['roles']): Dec {
  return roles.reduce((sum, role) => {
    return sum.add(Dec.from(role.ratePerHour).mul(Dec.from(role.headcount)));
  }, Dec.zero());
}

function sumSetup(processes: NpdCostProcessInput[]): Dec {
  return processes.reduce((sum, process) => sum.add(Dec.from(process.setupCost)), Dec.zero());
}

function sumPackaging(components: NpdCostEngineInput['packagingComponents']): Dec {
  return components.reduce((sum, component) => {
    const wasteFactor = ONE.add(Dec.from(component.wastePct).div(HUNDRED));
    return sum.add(Dec.from(component.qtyPerBox).mul(Dec.from(component.costPerUnit)).mul(wasteFactor));
  }, Dec.zero());
}

function sumIngredientRawCostPerPack(ingredients: RecomputeIngredient[]): Dec {
  return ingredients.reduce((sum, ingredient) => {
    return sum.add(Dec.from(ingredient.qtyKg).mul(Dec.from(ingredient.costPerKgEur)));
  }, Dec.zero());
}

function packsFromOutput(qty: Dec, uom: NpdCostUnits['fgBaseUom'], packWeightKg: Dec): Dec {
  if (qty.isZero()) return Dec.zero();
  if (uom === 'kg') return packWeightKg.isZero() ? Dec.zero() : qty.div(packWeightKg);
  return qty;
}

function unitToPackFactor(uom: string | null | undefined, packWeightKg: Dec): Dec {
  const normalised = (uom ?? 'pack').trim().toLowerCase();
  if (normalised === 'kg') return packWeightKg;
  if (normalised === 'g') return packWeightKg.mul(Dec.from('1000'));
  return ONE;
}

function batchDivisor(packsPerBatch: Dec): Dec {
  return packsPerBatch.isZero() ? Dec.zero() : ONE.div(packsPerBatch);
}

function targetPriceFromMargin(total: Dec, marginPct: string): Dec {
  const denom = ONE.sub(Dec.from(marginPct).div(HUNDRED));
  return total.div(denom);
}

function computeMarginPct(total: Dec, target: Dec): string {
  if (target.isZero()) return ZERO4;
  return target.sub(total).div(target).mul(HUNDRED).toFixed(4);
}

function computeStatus(marginPct: string, marginWarnPct?: string): WaterfallStatus {
  if (decimalLt(marginPct, '0')) return 'fail';
  if (marginWarnPct && decimalLt(marginPct, marginWarnPct)) return 'warn';
  return 'ok';
}

function percentChange(prev: Dec, current: Dec): string | null {
  if (prev.isZero()) return null;
  return current.sub(prev).div(prev).mul(HUNDRED).toFixed(4);
}

function normaliseNumeric(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : undefined;
}

function normaliseFgBaseUom(value: string | null | undefined): NpdCostUnits['fgBaseUom'] {
  const normalised = (value ?? 'kg').trim().toLowerCase();
  return normalised === 'each' || normalised === 'pack' ? normalised : 'kg';
}

function zeroUnits(): NpdCostUnits {
  return {
    packWeightKg: ZERO4,
    packsPerCase: ZERO4,
    avgBatchQty: ZERO4,
    fgBaseUom: 'kg',
    packsPerBatch: ZERO4,
  };
}

export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const cmp = Dec.from(a).cmp(Dec.from(b));
  return cmp < 0 ? -1 : cmp > 0 ? 1 : 0;
}

export function decimalLt(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) < 0;
}

export function decimalLte(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) <= 0;
}

export function decimalGt(a: string, b: string): boolean {
  return compareDecimalStrings(a, b) > 0;
}
