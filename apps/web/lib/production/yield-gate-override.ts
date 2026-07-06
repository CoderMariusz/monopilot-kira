/**
 * Controlled taxonomy for output-yield-gate supervisor overrides (NN-PROD-6).
 * Free-text override reasons are rejected — callers must supply one of these codes
 * AND hold production.wo.override_yield (supervisor / prod-manager tier).
 */
export const YIELD_GATE_OVERRIDE_REASON_CODES = [
  'scrap_total_loss',
  'equipment_failure',
  'qa_reject_all',
  'trial_run_void',
  'process_deviation_approved',
] as const;

export type YieldGateOverrideReasonCode = (typeof YIELD_GATE_OVERRIDE_REASON_CODES)[number];

export function isYieldGateOverrideReasonCode(code: string): code is YieldGateOverrideReasonCode {
  return (YIELD_GATE_OVERRIDE_REASON_CODES as readonly string[]).includes(code);
}
