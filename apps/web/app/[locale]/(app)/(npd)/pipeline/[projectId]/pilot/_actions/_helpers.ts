export type PilotMaterialStatus = 'reserved' | 'short';

export function pilotMaterialStatus(requiredKg: number, reservedKg: number): PilotMaterialStatus {
  return reservedKg >= requiredKg ? 'reserved' : 'short';
}

/** Deterministic pilot WO mask: WO-pilot-{FG####} (FG product code). */
export function buildPilotWoNumber(productCode: string): string {
  return `WO-pilot-${productCode.trim()}`;
}
