import { Dec } from '../formulation/decimal.js';

export type ApprovalCriterionStatus = 'pass' | 'warn' | 'pending' | 'not_required';

export type ApprovalCriteriaResult = {
  C1: ApprovalCriterionStatus;
  C2: ApprovalCriterionStatus;
  C3: ApprovalCriterionStatus;
  C4: ApprovalCriterionStatus;
  C5: ApprovalCriterionStatus;
  C6: ApprovalCriterionStatus;
  C7: ApprovalCriterionStatus;
};

export type EvaluateApprovalCriteriaInput = {
  formulation: {
    lockedAt?: Date | string | null;
  };
  nutrition: {
    nutriScoreGrade?: string | null;
  };
  costing: {
    targetMarginPct?: string | null;
    marginThresholdPct?: string | null;
  };
  sensory: {
    required: boolean;
    meanScore?: string | null;
  };
  allergens: {
    audited: boolean;
    passed?: boolean;
  };
  risks: {
    openHighCount: number;
  };
  docs: {
    activeCount: number;
    expiredCount: number;
    invalidCount?: number;
  };
};

const PASSING_NUTRI_GRADES = new Set(['A', 'B', 'C']);
const DEFAULT_TARGET_MARGIN_PCT = '15';
const MIN_SENSORY_MEAN = Dec.from('7');

export function evaluateApprovalCriteria(input: EvaluateApprovalCriteriaInput): ApprovalCriteriaResult {
  return {
    C1: evaluateRecipeLocked(input.formulation.lockedAt),
    C2: evaluateNutrition(input.nutrition.nutriScoreGrade),
    C3: evaluateTargetMargin(input.costing.targetMarginPct, input.costing.marginThresholdPct),
    C4: evaluateSensory(input.sensory),
    C5: evaluateAllergens(input.allergens),
    C6: input.risks.openHighCount > 0 ? 'warn' : 'pass',
    C7: evaluateComplianceDocs(input.docs),
  };
}

function evaluateRecipeLocked(lockedAt: Date | string | null | undefined): ApprovalCriterionStatus {
  return lockedAt ? 'pass' : 'pending';
}

function evaluateNutrition(grade: string | null | undefined): ApprovalCriterionStatus {
  if (!grade) return 'pending';
  return PASSING_NUTRI_GRADES.has(grade.toUpperCase()) ? 'pass' : 'warn';
}

function evaluateTargetMargin(
  targetMarginPct: string | null | undefined,
  marginThresholdPct: string | null | undefined,
): ApprovalCriterionStatus {
  if (!targetMarginPct) return 'pending';
  const threshold = Dec.from(marginThresholdPct ?? DEFAULT_TARGET_MARGIN_PCT);
  return Dec.from(targetMarginPct).cmp(threshold) >= 0 ? 'pass' : 'warn';
}

function evaluateSensory(input: EvaluateApprovalCriteriaInput['sensory']): ApprovalCriterionStatus {
  if (!input.required) return 'not_required';
  if (!input.meanScore) return 'pending';
  return Dec.from(input.meanScore).cmp(MIN_SENSORY_MEAN) >= 0 ? 'pass' : 'warn';
}

function evaluateAllergens(input: EvaluateApprovalCriteriaInput['allergens']): ApprovalCriterionStatus {
  if (!input.audited) return 'pending';
  return input.passed === false ? 'warn' : 'pass';
}

function evaluateComplianceDocs(input: EvaluateApprovalCriteriaInput['docs']): ApprovalCriterionStatus {
  if (input.activeCount <= 0) return 'pending';
  if (input.expiredCount > 0 || (input.invalidCount ?? 0) > 0) return 'warn';
  return 'pass';
}
