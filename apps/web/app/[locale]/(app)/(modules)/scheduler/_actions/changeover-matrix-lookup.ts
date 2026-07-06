import type { ChangeoverMatrixEntry, ChangeoverRiskLevel } from './scheduler-types';

export type ChangeoverTransition = {
  minutes: number;
  /** Mandatory cleaning + ATP step time baked into feasibility (not a soft score penalty). */
  step_minutes: number;
  requires_cleaning: boolean;
  requires_atp: boolean;
  risk_level: ChangeoverRiskLevel;
  /** False when risk_level is segregated — adjacency must be rejected/partitioned. */
  feasible: boolean;
};

const RISK_RANK: Record<ChangeoverRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  segregated: 3,
};

export const CLEANING_STEP_MINUTES = 15;
export const ATP_STEP_MINUTES = 30;

function minutes(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankRisk(a: ChangeoverRiskLevel, b: ChangeoverRiskLevel): ChangeoverRiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

export function normalizedAllergenIds(allergenIds: string[]): string[] {
  return allergenIds
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function allergenProfileKey(allergenIds: string[]): string {
  return normalizedAllergenIds(allergenIds).join('|');
}

function resolvePairEntry(
  allergenFrom: string,
  allergenTo: string,
  lineId: string | null,
  matrix: ChangeoverMatrixEntry[],
): ChangeoverMatrixEntry | null {
  if (lineId) {
    const lineRow = matrix.find(
      (entry) =>
        entry.allergen_from === allergenFrom &&
        entry.allergen_to === allergenTo &&
        entry.line_id === lineId,
    );
    if (lineRow) return lineRow;
  }

  return (
    matrix.find(
      (entry) =>
        entry.allergen_from === allergenFrom &&
        entry.allergen_to === allergenTo &&
        entry.line_id === null,
    ) ?? null
  );
}

function stepMinutes(requiresCleaning: boolean, requiresAtp: boolean): number {
  return (requiresCleaning ? CLEANING_STEP_MINUTES : 0) + (requiresAtp ? ATP_STEP_MINUTES : 0);
}

const ZERO_TRANSITION: ChangeoverTransition = {
  minutes: 0,
  step_minutes: 0,
  requires_cleaning: false,
  requires_atp: false,
  risk_level: 'low',
  feasible: true,
};

/**
 * Resolve a changeover transition between two allergen profiles using single-code
 * matrix rows (`allergen_from` ∈ from profile AND `allergen_to` ∈ to profile),
 * matching production changeover-actions matrix lookup. Each (from, to) pair
 * resolves line override first, then org default; pairs aggregate with max risk.
 */
export function resolveChangeoverTransition(
  fromAllergens: string[],
  toAllergens: string[],
  lineId: string | null,
  matrix: ChangeoverMatrixEntry[],
): ChangeoverTransition {
  const from = normalizedAllergenIds(fromAllergens);
  const to = normalizedAllergenIds(toAllergens);
  if (from.length === 0 && to.length === 0) {
    return ZERO_TRANSITION;
  }

  let aggregated: Omit<ChangeoverTransition, 'step_minutes' | 'feasible'> = {
    minutes: 0,
    requires_cleaning: false,
    requires_atp: false,
    risk_level: 'low',
  };
  let matched = false;

  for (const fromCode of from.length > 0 ? from : ['']) {
    for (const toCode of to.length > 0 ? to : ['']) {
      if (!fromCode || !toCode) continue;
      const entry = resolvePairEntry(fromCode, toCode, lineId, matrix);
      if (!entry) continue;
      matched = true;
      aggregated = {
        minutes: Math.max(aggregated.minutes, minutes(entry.changeover_minutes)),
        requires_cleaning: aggregated.requires_cleaning || entry.requires_cleaning,
        requires_atp: aggregated.requires_atp || entry.requires_atp,
        risk_level: rankRisk(aggregated.risk_level, entry.risk_level),
      };
    }
  }

  if (!matched) {
    return ZERO_TRANSITION;
  }

  const requiresCleaning = aggregated.requires_cleaning;
  const requiresAtp = aggregated.requires_atp;
  return {
    ...aggregated,
    step_minutes: stepMinutes(requiresCleaning, requiresAtp),
    feasible: aggregated.risk_level !== 'segregated',
  };
}

export function effectiveChangeoverMinutes(transition: ChangeoverTransition): number {
  return transition.minutes + transition.step_minutes;
}

export function transitionScore(
  transition: ChangeoverTransition,
  changeoverWeight: number,
): number {
  if (!transition.feasible) {
    return Number.POSITIVE_INFINITY;
  }

  let cost = effectiveChangeoverMinutes(transition) * changeoverWeight;
  const riskMultiplier =
    transition.risk_level === 'high' ? 1.5 : transition.risk_level === 'medium' ? 1.25 : 1;
  return cost * riskMultiplier;
}
