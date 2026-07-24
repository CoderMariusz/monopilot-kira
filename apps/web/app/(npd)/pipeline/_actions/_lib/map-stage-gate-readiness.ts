import type { StageGateEvaluation } from './evaluate-stage-gate';
import type { AdvanceTransition, GateBlocker } from './gate-helpers';
import type { ProjectGate } from '../shared';
import type { AdvanceGateInfo, AdvanceGateItem, GateKey, TargetGate } from '../../../_modals/advance-gate-modal';

export type ServerGateBlockerView = {
  id: string;
  text: string;
  code?: string;
};

export type StageGateReadinessView = {
  status: 'PASS' | 'HARD_BLOCKED' | 'SOFT_GATE_BLOCKED';
  blockers: ServerGateBlockerView[];
  softMissing: string[];
  requiredDone: number;
  requiredTotal: number;
  canAdvance: boolean;
};

export function mapGateBlockersToView(blockers: GateBlocker[]): ServerGateBlockerView[] {
  return blockers.map((blocker, index) => ({
    id: blocker.itemId ?? `${blocker.code ?? 'BLOCKER'}-${index}`,
    text: blocker.itemText ?? blocker.message ?? blocker.code ?? 'Blocker',
    code: blocker.code,
  }));
}

export function deriveRequiredCounts(
  items: Pick<AdvanceGateItem, 'required' | 'done'>[],
  blockers: ServerGateBlockerView[],
  status: StageGateReadinessView['status'],
): { requiredDone: number; requiredTotal: number } {
  const requiredItems = items.filter((item) => item.required);
  const requiredDone = requiredItems.filter((item) => item.done).length;
  const checklistTotal = requiredItems.length;

  if (status === 'PASS') {
    return { requiredDone, requiredTotal: checklistTotal };
  }

  const blockerCount = blockers.length;
  const requiredTotal = Math.max(checklistTotal, requiredDone + blockerCount, blockerCount);
  return { requiredDone, requiredTotal };
}

export function mapStageGateEvaluationToView(
  evaluation: StageGateEvaluation,
  items: Pick<AdvanceGateItem, 'required' | 'done'>[] = [],
): StageGateReadinessView {
  if (evaluation.status === 'PASS') {
    const counts = deriveRequiredCounts(items, [], 'PASS');
    return {
      status: 'PASS',
      blockers: [],
      softMissing: [],
      ...counts,
      canAdvance: true,
    };
  }

  if (evaluation.status === 'SOFT_GATE_BLOCKED') {
    const counts = deriveRequiredCounts(items, [], 'SOFT_GATE_BLOCKED');
    return {
      status: 'SOFT_GATE_BLOCKED',
      blockers: [],
      softMissing: evaluation.missing,
      ...counts,
      canAdvance: false,
    };
  }

  const blockers = mapGateBlockersToView(evaluation.blockers ?? []);
  const counts = deriveRequiredCounts(items, blockers, 'HARD_BLOCKED');
  return {
    status: 'HARD_BLOCKED',
    blockers,
    softMissing: [],
    ...counts,
    canAdvance: false,
  };
}

const STAGE_LABEL_FALLBACKS: Record<string, string> = {
  brief: 'Brief',
  recipe: 'Recipe',
  packaging: 'Packaging',
  costing_nutrition: 'Costing & Nutrition',
  trial: 'Trial',
  sensory: 'Sensory',
  pilot: 'Pilot',
  approval: 'Approval',
  handoff: 'Handoff',
  launched: 'Launched',
};

const GATE_LABEL_FALLBACKS: Record<GateKey, string> = {
  G0: 'Idea',
  G1: 'Feasibility',
  G2: 'Business Case',
  G3: 'Development',
  G4: 'Testing',
};

function isGateKey(gate: ProjectGate): gate is GateKey {
  return gate !== 'Launched';
}

export function resolveStageLabel(stage: string, labels?: Record<string, string>): string {
  const source = labels ?? STAGE_LABEL_FALLBACKS;
  return source[stage] ?? stage;
}

export function resolveGateLabel(gate: ProjectGate, labels?: Record<GateKey, string>): string {
  if (gate === 'Launched') return 'Launched';
  const source = labels ?? GATE_LABEL_FALLBACKS;
  return source[gate] ?? gate;
}

export function buildAuthoritativeAdvanceGateInfo(input: {
  currentGate: ProjectGate;
  currentStage: string;
  transition: AdvanceTransition;
  gateLabels?: Partial<Record<GateKey, string>>;
  stageLabels?: Record<string, string>;
}): AdvanceGateInfo {
  const currentKey: GateKey = isGateKey(input.currentGate) ? input.currentGate : 'G4';
  const targetKey: TargetGate = input.transition.targetGate;
  // ponytail: targetGate is TargetGate (G1..G4) — 'Launched' is a terminal action, never a transition target
  const sameGate = currentKey === targetKey;

  return {
    current: currentKey,
    currentLabel: resolveGateLabel(input.currentGate, input.gateLabels as Record<GateKey, string> | undefined),
    next: targetKey,
    nextLabel:
      targetKey === 'Launched'
        ? 'Launched'
        : resolveGateLabel(targetKey, input.gateLabels as Record<GateKey, string> | undefined),
    requiresApproval: input.transition.requiresESign,
    transitionMode: sameGate ? 'stage' : 'gate',
    currentStageLabel: sameGate
      ? resolveStageLabel(input.currentStage, input.stageLabels)
      : undefined,
    nextStageLabel: sameGate
      ? resolveStageLabel(input.transition.nextStage, input.stageLabels)
      : undefined,
  };
}
