/**
 * Shared pilot-write stage guard — upsertPilotRun and createPilotWorkOrder must
 * both pass through here (PF-R05-06). Uses the canonical STAGE_ORDER seam from
 * gate-helpers / stage-routes; does not invent a parallel eligibility model.
 */

import type { ProjectGate } from '../../../../../../../(npd)/pipeline/_actions/shared';
import { PIPELINE_STAGE_ORDER, stageOrderIndex } from '../../../../../../../../lib/npd/stage-routes';

/** Minimum operational stage for pilot planning / pilot WO creation (G3 floor). */
export const PILOT_WRITE_MIN_STAGE = 'packaging' as const;

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type PilotProjectStageRow = {
  id: string;
  current_stage: string;
  current_gate: ProjectGate;
  product_code: string | null;
};

export type PilotStageNotReachedContext = {
  requiredStage: typeof PILOT_WRITE_MIN_STAGE;
  currentStage: string;
  currentGate: ProjectGate;
};

export type PilotStageGuardFailure =
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'stage_not_reached'; stage: PilotStageNotReachedContext };

export type PilotStageGuardSuccess = { ok: true; project: PilotProjectStageRow };

export type PilotStageGuardResult = PilotStageGuardSuccess | PilotStageGuardFailure;

/** True when the project has reached G3 (packaging) or a later operational stage. */
export function isPilotWriteStageEligible(currentStage: string): boolean {
  const normalized = (currentStage ?? '').trim().toLowerCase();
  if (normalized === 'launched') return true;
  const index = PIPELINE_STAGE_ORDER.indexOf(normalized as (typeof PIPELINE_STAGE_ORDER)[number]);
  if (index < 0) return false;
  return index >= stageOrderIndex(PILOT_WRITE_MIN_STAGE);
}

export async function assertPilotWriteStage(
  ctx: { client: QueryClient },
  projectId: string,
): Promise<PilotStageGuardResult> {
  const { rows } = await ctx.client.query<PilotProjectStageRow>(
    `select id, current_stage, current_gate, product_code
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  const project = rows[0];
  if (!project) return { ok: false, error: 'not_found' };

  if (!isPilotWriteStageEligible(project.current_stage)) {
    return {
      ok: false,
      error: 'stage_not_reached',
      stage: {
        requiredStage: PILOT_WRITE_MIN_STAGE,
        currentStage: project.current_stage,
        currentGate: project.current_gate,
      },
    };
  }

  return { ok: true, project };
}
