export type PilotMaterialStatus = 'reserved' | 'short';

export function pilotMaterialStatus(requiredKg: number, reservedKg: number): PilotMaterialStatus {
  return reservedKg >= requiredKg ? 'reserved' : 'short';
}
