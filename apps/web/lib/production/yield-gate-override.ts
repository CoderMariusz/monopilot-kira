/**
 * Controlled taxonomy for output-yield-gate supervisor overrides (NN-PROD-6).
 * Free-text override reasons are rejected — callers must supply one of these codes
 * AND hold production.wo.override_yield (supervisor / prod-manager tier).
 */
/** Must stay aligned with migration 459 seed (public.yield_gate_override_reasons). */
export const YIELD_GATE_OVERRIDE_REASON_CODES = [
  'scrap_quality',
  'equipment_failure',
  'material_shortage',
  'other',
] as const;

export type YieldGateOverrideReasonCode = (typeof YIELD_GATE_OVERRIDE_REASON_CODES)[number];

export function isYieldGateOverrideReasonCode(code: string): code is YieldGateOverrideReasonCode {
  return (YIELD_GATE_OVERRIDE_REASON_CODES as readonly string[]).includes(code);
}
