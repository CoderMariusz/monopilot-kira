import { microToDecimal, microToFixed, mulMicro, toMicro, MICRO_SCALE } from '../../../../../../lib/shared/decimal';

export type MaterialCostInput = {
  itemCode: string;
  qtyKg: string;
  costPerKg: string | null;
};

export type LaborCostInput = {
  runtimeMin: string;
  staffing: string;
  ratePerHour: string;
};

export type WoActualCostMathInput = {
  materials: MaterialCostInput[];
  labor: LaborCostInput | null;
  setupCost: string | null;
  machineCost: string | null;
  wasteKg: string;
  outputKg: string;
};

export type WoActualCostMaterial = {
  itemCode: string;
  qtyKg: string;
  costPerKg: string;
  cost: string;
};

export type WoActualCostLabor = {
  runtimeMin: string;
  staffing: string;
  ratePerHour: string;
  cost: string;
};

export type WoActualCostTotals = {
  materials: WoActualCostMaterial[];
  materialsTotal: string;
  labor: WoActualCostLabor | null;
  machineCost: string;
  setupCost: string;
  wasteCost: string;
  totalCost: string;
  costPerKgOutput: string | null;
};

function divMicro(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const neg = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const rounded = (absNum * MICRO_SCALE + absDen / 2n) / absDen;
  return neg ? -rounded : rounded;
}

function addMoney(values: readonly string[]): bigint {
  return values.reduce((acc, value) => acc + toMicro(value), 0n);
}

export function computeWoActualCostTotals(input: WoActualCostMathInput): WoActualCostTotals {
  let materialQtyTotal = 0n;
  let materialsTotal = 0n;

  const materials = input.materials.map((material) => {
    const qty = toMicro(material.qtyKg);
    const costPerKg = toMicro(material.costPerKg ?? '0');
    const cost = mulMicro(qty, costPerKg);
    materialQtyTotal += qty;
    materialsTotal += cost;

    return {
      itemCode: material.itemCode,
      qtyKg: microToFixed(qty, 3),
      costPerKg: microToFixed(costPerKg, 6),
      cost: microToFixed(cost, 4),
    };
  });

  const labor =
    input.labor == null
      ? null
      : (() => {
          const runtimeMin = toMicro(input.labor.runtimeMin);
          const staffing = toMicro(input.labor.staffing);
          const ratePerHour = toMicro(input.labor.ratePerHour);
          const runtimeHours = divMicro(runtimeMin, toMicro('60'));
          const staffedHours = mulMicro(runtimeHours, staffing);
          const cost = mulMicro(staffedHours, ratePerHour);
          return {
            runtimeMin: microToFixed(runtimeMin, 3),
            staffing: microToDecimal(staffing),
            ratePerHour: microToFixed(ratePerHour, 4),
            cost: microToFixed(cost, 4),
          };
        })();

  const avgMaterialCostPerKg = materialQtyTotal === 0n ? 0n : divMicro(materialsTotal, materialQtyTotal);
  const wasteCost = mulMicro(toMicro(input.wasteKg), avgMaterialCostPerKg);
  const setupCost = toMicro(input.setupCost ?? '0');
  const machineCost = toMicro(input.machineCost ?? '0');
  const laborCost = labor == null ? 0n : toMicro(labor.cost);
  const totalCost = addMoney([
    microToDecimal(materialsTotal),
    microToDecimal(laborCost),
    microToDecimal(machineCost),
    microToDecimal(setupCost),
    microToDecimal(wasteCost),
  ]);
  const outputKg = toMicro(input.outputKg);

  return {
    materials,
    materialsTotal: microToFixed(materialsTotal, 4),
    labor,
    machineCost: microToFixed(machineCost, 4),
    setupCost: microToFixed(setupCost, 4),
    wasteCost: microToFixed(wasteCost, 4),
    totalCost: microToFixed(totalCost, 4),
    costPerKgOutput: outputKg === 0n ? null : microToFixed(divMicro(totalCost, outputKg), 4),
  };
}
