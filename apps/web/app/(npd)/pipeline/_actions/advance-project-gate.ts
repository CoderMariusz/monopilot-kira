'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  FG_CANDIDATE_STAGE,
  GATE_ADVANCE_PERMISSION,
  GATE_ADVANCED_EVENT,
  STAGE_ORDER,
  assertAdjacentStage,
  assertG3ESignForApproval,
  assertG4ESignForHandoff,
  createFgCandidate,
  emitOutbox,
  gateForStage,
  checkCostingNutritionReady,
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

type StageGateEvaluation =
  | { status: 'PASS' }
  | { status: 'SOFT_GATE_BLOCKED'; missing: string[] }
  | { status: 'HARD_BLOCKED'; hardReason: string; blockers?: GateBlocker[] };

type RequiredFieldRow = {
  dept_code: string | null;
  dept_name: string | null;
  field_code: string | null;
  field_label: string | null;
  auto_source_field: string | null;
  product_json: Record<string, unknown> | null;
  project_json: Record<string, unknown> | null;
};

// F6.1 CRITICAL: this action's soft-gate check is a SECOND implementation of the
// required-fields read, separate from loadStageDeptSections. Before an FG exists
// (np.product_code IS NULL) the values live on the PROJECT (direct columns +
// field_values jsonb + the product_name<->name alias) — reading only product_json
// here recreated the Brief deadlock the F6.1 loader fix closed (caught by the
// Gate-5b logic walk). Value resolution must mirror the loader exactly.
function resolveGateFieldValues(row: RequiredFieldRow): Record<string, unknown> {
  if (row.product_json) return row.product_json;
  const projectJson = row.project_json ?? {};
  const rawFieldValues = projectJson.field_values;
  const fieldValues =
    typeof rawFieldValues === 'object' && rawFieldValues !== null && !Array.isArray(rawFieldValues)
      ? (rawFieldValues as Record<string, unknown>)
      : {};
  const values: Record<string, unknown> = { ...fieldValues };
  for (const [key, value] of Object.entries(projectJson)) {
    if (key !== 'field_values') values[key] = value;
  }
  values.product_name = projectJson.name ?? null;
  return values;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

async function requiredFieldsMissing(
  ctx: OrgContextLike,
  projectId: string,
  stage: AnyStage,
): Promise<string[]> {
  if (stage === 'launched') return [];
  const { rows } = await ctx.client.query<RequiredFieldRow>(
    `select
        d.code as dept_code,
        d.name as dept_name,
        f.code as field_code,
        f.label as field_label,
        f.auto_source_field,
        case when p.product_code is not null then to_jsonb(p.*) end as product_json,
        to_jsonb(np.*) as project_json
       from public.npd_departments d
       join public.npd_department_field df
         on df.department_id = d.id
        and df.org_id = d.org_id
       join public.npd_field_catalog f
         on f.id = df.field_id
        and f.org_id = df.org_id
       join public.npd_projects np
         on np.id = $1::uuid
        and np.org_id = app.current_org_id()
       left join public.product p
         on p.org_id = app.current_org_id()
        and p.product_code = np.product_code
      where d.org_id = app.current_org_id()
        and d.active = true
        and d.stage_code = $2::text
        and df.visible = true
        and df.required = true
        and f.active = true
      order by d.display_order asc, d.code asc, df.display_order asc, f.code asc`,
    [projectId, stage],
  );

  const missing: string[] = [];
  for (const row of rows) {
    const fieldCode = (row.field_code ?? '').trim().toLowerCase();
    if (!fieldCode) continue;
    const autoSource = (row.auto_source_field ?? '').trim().toLowerCase();
    const values = resolveGateFieldValues(row);
    const value = autoSource && autoSource in values ? values[autoSource] : values[fieldCode];
    if (!isFilled(value)) {
      const dept = (row.dept_name ?? row.dept_code ?? 'Stage field').trim();
      const field = (row.field_label ?? fieldCode).trim();
      missing.push(`${dept}: ${field}`);
    }
  }
  return missing;
}

async function writeGateOverrideAudit(
  ctx: OrgContextLike,
  params: {
    projectId: string;
    fromStage: AnyStage;
    toStage: AnyStage;
    missing: string[];
    note: string;
  },
): Promise<void> {
  const payload = {
    fromStage: params.fromStage,
    toStage: params.toStage,
    missing: params.missing,
    note: params.note,
    actor: ctx.userId,
  };
  await ctx.client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values (app.current_org_id(), $1::uuid, 'user', 'npd.stage.gate_overridden',
             'npd_project', $2, null, $3::jsonb, $4::uuid, 'operational')`,
    [ctx.userId, params.projectId, JSON.stringify(payload), randomUUID()],
  );
}

export async function evaluateStageGate(
  projectId: string,
  fromStage: AnyStage,
  toStage: AnyStage,
  db: OrgContextLike,
  project?: Parameters<typeof getBlockers>[1],
): Promise<StageGateEvaluation> {
  const softMissing: string[] = [];
  const projectRow = project ?? await loadProjectForUpdate(db, projectId);

  const blockers = await getBlockers(db, projectRow, toStage);
  if (blockers.length > 0) {
    return { status: 'HARD_BLOCKED', hardReason: blockers[0]?.code ?? 'BLOCKERS_PRESENT', blockers };
  }

  if (gateForStage(fromStage) === 'G3' && gateForStage(toStage) === 'G4') {
    await assertG3ESignForApproval(db, projectId);
  }
  if (fromStage === 'approval' && toStage === 'handoff') {
    await assertG4ESignForHandoff(db, projectId);
  }

  if (fromStage === 'costing_nutrition' && toStage === 'trial') {
    const readiness = await checkCostingNutritionReady(db, projectId);
    if (!readiness.costReady) softMissing.push('Cost breakdown computed');
    if (!readiness.nutritionReady) softMissing.push('Nutrition computed');
  }

  softMissing.push(...await requiredFieldsMissing(db, projectId, fromStage));
  return softMissing.length > 0
    ? { status: 'SOFT_GATE_BLOCKED', missing: softMissing }
    : { status: 'PASS' };
}

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
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
