import type { PilotStageNotReachedContext } from '../_actions/pilot-stage-guard';
import type { PilotLabels } from '../_components/pilot-screen';

export type PilotLabelBundle = PilotLabels & {
  stageLabels: Record<string, string>;
  gateLabels: Record<string, string>;
};

/** Localized stage-not-reached sentence — built in page.tsx, not in the server guard. */
export function formatPilotStageNotReached(
  bundle: PilotLabelBundle,
  stage: PilotStageNotReachedContext,
): string {
  const requiredStage = bundle.stageLabels[stage.requiredStage] ?? stage.requiredStage;
  const currentStage = bundle.stageLabels[stage.currentStage] ?? stage.currentStage;
  const gateLabel = bundle.gateLabels[stage.currentGate] ?? stage.currentGate;
  return bundle.stageNotReached
    .replace('{requiredStage}', requiredStage)
    .replace('{currentStage}', currentStage)
    .replace('{currentGate}', stage.currentGate)
    .replace('{gateLabel}', gateLabel);
}
