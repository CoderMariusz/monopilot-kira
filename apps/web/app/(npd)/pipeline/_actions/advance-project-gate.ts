'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  FG_CANDIDATE_STAGE,
  GATE_ADVANCE_PERMISSION,
  GATE_APPROVE_PERMISSION,
  GATE_ADVANCED_EVENT,
  STAGE_ORDER,
  assertHonestGateAdvance,
  createFgCandidate,
  emitOutbox,
  loadProjectForUpdate,
  requireActionPermission,
  resolveAdvanceTransition,
  seedHandoffChecklist,
  serializeGateError,
  updateProjectGateOnly,
  updateProjectStage,
  type AnyStage,
  type GateBlocker,
} from './_lib/gate-helpers';
import { evaluateStageGate, writeGateOverrideAudit } from './_lib/evaluate-stage-gate';
import { closeOutLegacyStagesForLaunch } from './close-out-legacy-stages';
import { type OrgContextLike, type ProjectGate } from './shared';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

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
  /** Optional audit note from the advance modal; stored in the outbox event payload. */
  notes: z.string().trim().max(2000).optional().nullable(),
  override: z.object({
    note: z.string().trim().min(1).max(2000),
  }).optional(),
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
  | { ok: false; error: string; status: number; blockers?: GateBlocker[]; missing?: string[] };

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

      // One guard for adjacency + gate/stage consistency + no multi-gate skips (C025).
      const targetStage = parsed.data.targetStage as AnyStage;
      assertHonestGateAdvance(project, targetStage);
      const transition = resolveAdvanceTransition(project);
      if (!transition) {
        return { ok: false, error: 'ADJACENCY_VIOLATION', status: 422 };
      }
      const targetGate = transition.targetGate;

      const gateEvaluation = await evaluateStageGate(
        project.id,
        project.current_stage as AnyStage,
        targetStage,
        context,
        project,
      );
      if (gateEvaluation.status === 'HARD_BLOCKED') {
        return {
          ok: false,
          error: 'BLOCKERS_PRESENT',
          status: 409,
          blockers: gateEvaluation.blockers,
        };
      }
      if (gateEvaluation.status === 'SOFT_GATE_BLOCKED') {
        if (!parsed.data.override) {
          return { ok: false, error: 'SOFT_GATE_BLOCKED', status: 409, missing: gateEvaluation.missing };
        }
        await requireActionPermission(context, GATE_APPROVE_PERMISSION);
        await writeGateOverrideAudit(context, {
          projectId: project.id,
          fromStage: project.current_stage as AnyStage,
          toStage: targetStage,
          missing: gateEvaluation.missing,
          note: parsed.data.override.note,
        });
      }

      // ─── Per-transition side effects ───
      let productCode = project.product_code;

      // E-sign checkpoint: approval → handoff requires a valid G4 e-signature.
      // Entering handoff also seeds the handoff checklist — without it the stage
      // is a dead end (get-handoff not_found, promote impossible, launch 409).
      if (project.current_stage === 'approval' && targetStage === 'handoff') {
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

      await (transition.kind === 'gate'
        ? updateProjectGateOnly(context, project.id, targetGate)
        : updateProjectStage(context, project.id, targetStage));
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
          current_stage: transition.kind === 'gate' ? project.current_stage : targetStage,
          product_code: productCode,
          // Notes from the advance modal are recorded in the event payload so
          // they travel with the audit trail — no schema change required.
          ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
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
          currentStage: transition.kind === 'gate' ? (project.current_stage as AnyStage) : targetStage,
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
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
