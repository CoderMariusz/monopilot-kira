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
    required?: boolean;
    lockedAt?: Date | string | null;
  };
  nutrition: {
    required?: boolean;
    nutriScoreGrade?: string | null;
  };
  costing: {
    required?: boolean;
    targetMarginPct?: string | null;
    marginThresholdPct?: string | null;
  };
  sensory: {
    required?: boolean;
    meanScore?: string | null;
  };
  allergens: {
    required?: boolean;
    audited: boolean;
    passed?: boolean;
  };
  risks: {
    required?: boolean;
    openHighCount: number;
  };
  docs: {
    required?: boolean;
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
    C1: evaluateRecipeLocked(input.formulation),
    C2: evaluateNutrition(input.nutrition),
    C3: evaluateTargetMargin(input.costing),
    C4: evaluateSensory(input.sensory),
    C5: evaluateAllergens(input.allergens),
    C6: evaluateRisks(input.risks),
    C7: evaluateComplianceDocs(input.docs),
  };
}

function evaluateRecipeLocked(input: EvaluateApprovalCriteriaInput['formulation']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  return input.lockedAt ? 'pass' : 'pending';
}

function evaluateNutrition(input: EvaluateApprovalCriteriaInput['nutrition']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  if (!input.nutriScoreGrade) return 'pending';
  return PASSING_NUTRI_GRADES.has(input.nutriScoreGrade.toUpperCase()) ? 'pass' : 'warn';
}

function evaluateTargetMargin(input: EvaluateApprovalCriteriaInput['costing']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  if (!input.targetMarginPct) return 'pending';
  const threshold = Dec.from(input.marginThresholdPct ?? DEFAULT_TARGET_MARGIN_PCT);
  return Dec.from(input.targetMarginPct).cmp(threshold) >= 0 ? 'pass' : 'warn';
}

function evaluateSensory(input: EvaluateApprovalCriteriaInput['sensory']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  if (!input.meanScore) return 'pending';
  return Dec.from(input.meanScore).cmp(MIN_SENSORY_MEAN) >= 0 ? 'pass' : 'warn';
}

function evaluateAllergens(input: EvaluateApprovalCriteriaInput['allergens']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  if (!input.audited) return 'pending';
  return input.passed === false ? 'warn' : 'pass';
}

function evaluateRisks(input: EvaluateApprovalCriteriaInput['risks']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  return input.openHighCount > 0 ? 'warn' : 'pass';
}

function evaluateComplianceDocs(input: EvaluateApprovalCriteriaInput['docs']): ApprovalCriterionStatus {
  if (input.required === false) return 'not_required';
  if (input.activeCount <= 0) return 'pending';
  if (input.expiredCount > 0 || (input.invalidCount ?? 0) > 0) return 'warn';
  return 'pass';
}
