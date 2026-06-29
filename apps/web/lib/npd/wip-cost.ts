export type WipProcessRoleCost = {
  rolePerHour: number;
  headcount: number;
};

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

function toNonNegativeNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function toValidYieldPct(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 && numberValue <= 100 ? numberValue : 100;
}
