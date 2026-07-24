import type { StageGateReadinessBundle } from './_lib/fetch-stage-gate-readiness';

export type GetStageGateReadinessResult =
  | { ok: true; data: StageGateReadinessBundle }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'terminal' | 'persistence_failed' };
