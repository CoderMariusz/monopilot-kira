import { Dec } from '@monopilot/domain';

export type PilotMaterialStatus = 'reserved' | 'short';

export function scalePilotRequiredKg(
  perPackKg: string,
  pilotBatchKg: string | null,
  packSizeKg: string | null,
): string {
  if (!pilotBatchKg || !packSizeKg) return perPackKg;
  return Dec.from(perPackKg).mul(Dec.from(pilotBatchKg)).div(Dec.from(packSizeKg)).toFixed(4);
}

export function pilotMaterialStatus(requiredKg: string, availableKg: string): PilotMaterialStatus {
  return Dec.from(availableKg).cmp(Dec.from(requiredKg)) >= 0 ? 'reserved' : 'short';
}

/** Deterministic pilot WO mask: WO-pilot-{FG####} (FG product code). */
export function buildPilotWoNumber(productCode: string): string {
  return `WO-pilot-${productCode.trim()}`;
}
