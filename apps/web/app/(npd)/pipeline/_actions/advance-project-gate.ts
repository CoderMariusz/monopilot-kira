'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  FG_CANDIDATE_STAGE,
  GATE_ADVANCE_PERMISSION,
  GATE_ADVANCED_EVENT,
  STAGE_ORDER,
  assertAdjacentStage,
  assertG4ESignForHandoff,
  createFgCandidate,
  emitOutbox,
  gateForStage,
  getBlockers,
  loadProjectForUpdate,
  requireActionPermission,
  seedHandoffChecklist,
  serializeGateError,
  updateProjectStage,
  type AnyStage,
  type GateBlocker,
} from './_lib/gate-helpers';
import { closeOutLegacyStagesForLaunch } from './close-out-legacy-stages';
import { type OrgContextLike, type ProjectGate } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// advanceProjectGate — STAGE-NATIVE advance (2026-06-06 pivot).
//
// The project advances ONE operational stage at a time through STAGE_ORDER. The
// caller passes the `targetStage` (the next stage); we assert it is exactly the
// successor of current_stage (no skipping), run the current-stage blockers, perform
// the per-transition side effects, then persist the new stage + DERIVED gate.
//
// Side effects keyed by the stage being ENTERED:
//   • entering `packaging` (3rd stage = entering G3) → createFgCandidate (idempotent;
//     the product is a CANDIDATE, never active — activation is the handoff promotion).
//   • approval → handoff                            → require a valid G4 e-signature
//     (assertG4ESignForHandoff; collected by approveProjectGate).
//   • handoff  → launched                           → closeOutLegacyStagesForLaunch
//     (the existing terminal closeout; full FG activation is promoteToProduction).
//
// INPUT: `targetStage` only — the next stage in STAGE_ORDER (or 'launched' after
// handoff). The old `targetGate` shape is gone; callers that reason in gate space
// (bulk-move) translate a gate into the corresponding single stage step.
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_VALUES = [...STAGE_ORDER, 'launched'] as const;

const inputSchema = z.object({
  projectId: z.string().uuid(),
  targetStage: z.enum(STAGE_VALUES),
  productCode: z.string().trim().min(1).max(80).optional().nullable(),
});

export type AdvanceProjectGateResult =
  | {
      ok: true;
      data: {
        projectId: string;
        previousGate: ProjectGate;
        currentGate: ProjectGate;
        previousStage: string;
        currentStage: AnyStage;
        productCode: string | null;
        outboxEventType: typeof GATE_ADVANCED_EVENT;
      };
    }
  | { ok: false; error: string; status: number; blockers?: GateBlocker[] };

export async function advanceProjectGate(rawInput: unknown): Promise<AdvanceProjectGateResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<AdvanceProjectGateResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_ADVANCE_PERMISSION);

      const project = await loadProjectForUpdate(context, parsed.data.projectId);

      // Terminal short-circuit: already launched. This is a real failure of the
      // requested advance (F-C09: it used to carry status 200, which read as a
      // silent success from the client) — 409 Conflict is the honest status.
      if (project.current_stage === 'launched' || project.current_gate === 'Launched') {
        return { ok: false, error: 'ALREADY_CLOSED', status: 409 };
      }

      // Adjacency: the requested stage must be exactly the successor of the current
      // stage (one step at a time, no skipping). Throws ADJACENCY_VIOLATION otherwise.
      const targetStage = parsed.data.targetStage as AnyStage;
      assertAdjacentStage(project.current_stage, targetStage);
      const targetGate = gateForStage(targetStage);

      // Blockers are checked against the CURRENT stage's gate checklist.
      const blockers = await getBlockers(context, project, targetStage);
      if (blockers.length > 0) {
        return { ok: false, error: 'BLOCKERS_PRESENT', status: 409, blockers };
      }

      // ─── Per-transition side effects ───
      let productCode = project.product_code;

      // E-sign checkpoint: approval → handoff requires a valid G4 e-signature.
      // Entering handoff also seeds the handoff checklist — without it the stage
      // is a dead end (get-handoff not_found, promote impossible, launch 409).
      if (project.current_stage === 'approval' && targetStage === 'handoff') {
        await assertG4ESignForHandoff(context, project.id);
        await seedHandoffChecklist(context, project);
      }

      // FG candidate is created ENTERING the packaging stage (the 3rd stage = G3).
      if (targetStage === FG_CANDIDATE_STAGE) {
        const fg = await createFgCandidate(context, project, parsed.data.productCode);
        productCode = fg.productCode;
      }

      // Terminal closeout when entering 'launched' (handoff → launched).
      if (targetStage === 'launched') {
        const closeout = await closeOutLegacyStagesForLaunch(context, project);
        productCode = closeout.fg_product_code;
      }

      await updateProjectStage(context, project.id, targetStage);
      await emitOutbox(context, {
        eventType: GATE_ADVANCED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          org_id: context.orgId,
          actor_user_id: context.userId,
          project_id: project.id,
          project_code: project.code,
          previous_gate: project.current_gate,
          current_gate: targetGate,
          previous_stage: project.current_stage,
          current_stage: targetStage,
          product_code: productCode,
        },
        dedupKey: `${GATE_ADVANCED_EVENT}:${project.id}:${project.current_stage}:${targetStage}`,
      });

      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return {
        ok: true,
        data: {
          projectId: project.id,
          previousGate: project.current_gate,
          currentGate: targetGate,
          previousStage: project.current_stage,
          currentStage: targetStage,
          productCode,
          outboxEventType: GATE_ADVANCED_EVENT,
        },
      };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return serialized;
    console.error('[advanceProjectGate] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
