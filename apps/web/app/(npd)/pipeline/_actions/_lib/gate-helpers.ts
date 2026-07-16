import { createHash, randomUUID } from 'node:crypto';

import {
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type QueryClient,
} from '../shared';
import type { ApprovalCriteriaResult, ApprovalCriterionStatus } from '@monopilot/domain';

import { quoteIdentifier, syncProdDetailRows } from '../../../fa/actions/_lib/fa-cell-shared';
import { nextEntityCode, renderCodeMask } from '../../../../../lib/documents/code-mask';
import type { QueryClient as NumberingQueryClient } from '../../../../../lib/documents/numbering';
import { evaluateApprovalCriteriaWithClient } from '../../[projectId]/approval/_actions/evaluate-core';

export const GATE_ADVANCE_PERMISSION = 'npd.gate.advance';
export const GATE_APPROVE_PERMISSION = 'npd.gate.approve';
export const ADMIN_PERMISSION = 'admin';
export const GATE_ADVANCED_EVENT = 'npd.gate.advanced';
export const GATE_APPROVED_EVENT = 'npd.gate.approved';
export const GATE_REVERTED_EVENT = 'npd.gate.reverted';
export const FG_CREATED_EVENT = 'fg.created';
export const FG_CANDIDATE_MAPPED_EVENT = 'npd.fg_candidate_mapped';
export const APP_VERSION = 'npd-gate-actions-v1';

const GATES: ProjectGate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'Launched'];

// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE — stage pipeline + explicit gate sequence (C025).
//
// `current_stage` advances ONE step at a time through STAGE_ORDER. `current_gate`
// advances ONE gate at a time through G0→G1→G2→G3→G4→Launched and is NOT blindly
// derived from stage alone.
//
//   STAGE_ORDER : brief → recipe → packaging → costing_nutrition → trial → sensory
//                 → pilot → approval → handoff → (launched, terminal)
//
//   Valid gate/stage pairs:
//     brief     + G0  (Idea — creation, create-project.ts)
//     brief     + G1  (Feasibility — gate-only advance while stage stays brief)
//     recipe    + G2  (Business Case)
//     packaging … pilot + G3 (Development; FG candidate created entering packaging)
//     approval / handoff + G4 (Testing — e-sign checkpoints)
//     launched  + Launched (terminal)
//
//   Gate sequence on brief:
//     G0+brief  ──gate advance──► G1+brief  ──stage advance──► G2+recipe
//
//   handoff maps to G4 (not Launched) until the terminal `launched` stage.
// ─────────────────────────────────────────────────────────────────────────────

/** The fixed operational stage pipeline + terminal 'launched' (matches mig 242). */
export const STAGE_ORDER = [
  'brief',
  'recipe',
  'packaging',
  'costing_nutrition',
  'trial',
  'sensory',
  'pilot',
  'approval',
  'handoff',
] as const;

export type ProjectStage = (typeof STAGE_ORDER)[number];
export type TerminalStage = 'launched';
export type AnyStage = ProjectStage | TerminalStage;

/** Stages, in order, that derive into gate G3 (FG candidate is created entering the first). */
const G3_STAGES: ProjectStage[] = ['packaging', 'costing_nutrition', 'trial', 'sensory', 'pilot'];

/** The stage on which the FG candidate is created (the 3rd stage = entering G3). */
export const FG_CANDIDATE_STAGE: ProjectStage = 'packaging';

/** Gate for stages other than `brief` (brief allows G0 or G1 — see resolveGateReadiness). */
const GATE_BY_STAGE: Record<Exclude<AnyStage, 'brief'>, ProjectGate> = {
  recipe: 'G2',
  packaging: 'G3',
  costing_nutrition: 'G3',
  trial: 'G3',
  sensory: 'G3',
  pilot: 'G3',
  approval: 'G4',
  handoff: 'G4',
  launched: 'Launched',
};

const ALL_STAGES: Record<AnyStage, true> = {
  brief: true,
  recipe: true,
  packaging: true,
  costing_nutrition: true,
  trial: true,
  sensory: true,
  pilot: true,
  approval: true,
  handoff: true,
  launched: true,
};

export function gateForStage(stage: AnyStage): ProjectGate {
  if (stage === 'brief') {
    throw new GateActionError('INVALID_STAGE_GATE', 500);
  }
  return GATE_BY_STAGE[stage];
}

export function isProjectStage(value: string): value is AnyStage {
  return value in ALL_STAGES;
}

/** Expected gate for a consistent gate/stage pair; null when the pair is invalid. */
export function expectedGateForStagePair(stage: string, gate: ProjectGate): ProjectGate | null {
  if (stage === 'brief') {
    return gate === 'G0' || gate === 'G1' ? gate : null;
  }
  if (!isProjectStage(stage) || stage === 'launched') {
    return stage === 'launched' && gate === 'Launched' ? 'Launched' : null;
  }
  return gateForStage(stage) === gate ? gate : null;
}

/** The next operational stage after `stage`, or 'launched' after handoff, or null at terminal. */
export function nextStage(stage: string): AnyStage | null {
  if (stage === 'launched') return null;
  const index = STAGE_ORDER.indexOf(stage as ProjectStage);
  if (index < 0) return null;
  if (index === STAGE_ORDER.length - 1) return 'launched'; // handoff → launched
  return STAGE_ORDER[index + 1] ?? null;
}

/** Adjacency in STAGE space — the target must be exactly the next stage (no skipping). */
export function assertAdjacentStage(currentStage: string, targetStage: AnyStage): void {
  if (nextStage(currentStage) !== targetStage) {
    throw new GateActionError('ADJACENCY_VIOLATION', 422);
  }
}

export function isCreationGateStagePair(gate: ProjectGate, stage: string): boolean {
  return gate === 'G0' && stage === 'brief';
}

export type GateStageSkewRecord = {
  id: string;
  code: string;
  name: string;
  current_gate: ProjectGate;
  current_stage: string;
  repair_gate: ProjectGate;
  repair_stage: string;
  reason: string;
};

/**
 * Preview projects whose gate/stage pair is inconsistent (e.g. G0+recipe from the
 * blank-project bug). After deploy these rows are stuck on GATE_STATE_MISMATCH until
 * repaired. Does not mutate.
 */
export async function previewGateStageSkewRepairs(
  ctx: OrgContextLike,
): Promise<GateStageSkewRecord[]> {
  const { rows } = await ctx.client.query<{
    id: string;
    code: string;
    name: string;
    current_gate: ProjectGate;
    current_stage: string;
  }>(
    `select id, code, name, current_gate, current_stage
       from public.npd_projects
      where org_id = app.current_org_id()
        and current_gate <> 'Launched'
        and current_stage <> 'launched'`,
  );

  const repairs: GateStageSkewRecord[] = [];
  for (const row of rows) {
    if (expectedGateForStagePair(row.current_stage, row.current_gate) !== null) continue;

    if (row.current_gate === 'G0' && row.current_stage !== 'brief') {
      repairs.push({
        ...row,
        repair_gate: 'G0',
        repair_stage: 'brief',
        reason: 'G0 gate requires brief stage — reset skewed stage so G0→G1→G2 can run',
      });
      continue;
    }

    if (row.current_gate === 'G1' && row.current_stage !== 'brief') {
      repairs.push({
        ...row,
        repair_gate: 'G1',
        repair_stage: 'brief',
        reason: 'G1 gate requires brief stage — reset skewed stage',
      });
      continue;
    }

    if (isProjectStage(row.current_stage) && row.current_stage !== 'brief') {
      const alignedGate = gateForStage(row.current_stage as Exclude<AnyStage, 'brief'>);
      repairs.push({
        ...row,
        repair_gate: alignedGate,
        repair_stage: row.current_stage,
        reason: `Align gate to stage-derived ${alignedGate}`,
      });
    }
  }
  return repairs;
}

/**
 * Apply previewGateStageSkewRepairs. When dryRun=true, returns the preview only.
 */
export async function repairGateStageSkew(
  ctx: OrgContextLike,
  options: { dryRun?: boolean } = {},
): Promise<{ preview: GateStageSkewRecord[]; repairedIds: string[] }> {
  const preview = await previewGateStageSkewRepairs(ctx);
  if (options.dryRun) {
    return { preview, repairedIds: preview.map((row) => row.id) };
  }

  const repairedIds: string[] = [];
  for (const row of preview) {
    await ctx.client.query(
      `update public.npd_projects
          set current_gate = $2,
              current_stage = $3
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [row.id, row.repair_gate, row.repair_stage],
    );
    repairedIds.push(row.id);
  }
  return { preview, repairedIds };
}

export function assertGateStageConsistent(project: {
  current_gate: ProjectGate;
  current_stage: string;
}): void {
  const expected = expectedGateForStagePair(project.current_stage, project.current_gate);
  if (expected === null) {
    throw new GateActionError('GATE_STATE_MISMATCH', 409);
  }
}

/**
 * Forward gate from `current_gate`. Each step advances exactly one gate.
 * UI advance claims and the server guard share this.
 */
export function nextHonestGate(gate: ProjectGate): ProjectGate | null {
  switch (gate) {
    case 'G0':
      return 'G1';
    case 'G1':
      return 'G2';
    case 'G2':
      return 'G3';
    case 'G3':
      return 'G4';
    case 'G4':
      return 'Launched';
    default:
      return null;
  }
}

/** Authoritative current gate — honours stored gate on brief (G0 or G1). */
export function effectiveCurrentGate(project: {
  current_gate: ProjectGate;
  current_stage: string;
}): ProjectGate {
  const expected = expectedGateForStagePair(project.current_stage, project.current_gate);
  if (expected !== null) return expected;
  if (!isProjectStage(project.current_stage)) return project.current_gate;
  if (project.current_stage === 'brief') return project.current_gate;
  try {
    return gateForStage(project.current_stage);
  } catch {
    return project.current_gate;
  }
}

/**
 * Single transactional guard for stage advance: gate/stage must agree, the target
 * stage must be the sole successor, and cross-gate steps must match nextHonestGate
 * (blocks G0→G3 and any other multi-gate skip). Intra-gate stage steps (G3 substages,
 * approval→handoff under G4) are allowed when the derived gate is unchanged.
 */
export function assertHonestGateAdvance(
  project: { current_gate: ProjectGate; current_stage: string },
  targetStage: AnyStage,
): void {
  assertGateStageConsistent(project);
  const transition = resolveAdvanceTransition(project);
  if (!transition || transition.nextStage !== targetStage) {
    throw new GateActionError('ADJACENCY_VIOLATION', 422);
  }
  const fromGate = effectiveCurrentGate(project);
  const toGate = transition.targetGate;
  if (fromGate === toGate) return;
  const expectedGate = nextHonestGate(fromGate);
  if (expectedGate !== toGate) {
    throw new GateActionError('GATE_SEQUENCE_VIOLATION', 422);
  }
}

export type AdvanceTransition = {
  /** Gate-only advance keeps the stage unchanged; stage advance moves STAGE_ORDER. */
  kind: 'gate' | 'stage';
  nextStage: AnyStage;
  targetGate: ProjectGate;
  /** True only for the approval→handoff step (the enforced G4 e-sign checkpoint). */
  requiresESign: boolean;
};

export type GateReadiness = {
  /** Authoritative gate for display, checklist, and validation. */
  currentGate: ProjectGate;
  /** Gate whose checklist items block the next advance. */
  checklistGate: ProjectGate;
  /** Allowed next transition, or null at terminal. */
  advance: AdvanceTransition | null;
};

/**
 * Single server selector for gate UI + advance validation (C025).
 * Returns current gate, checklist gate, and the sole allowed next transition.
 */
export function resolveGateReadiness(project: {
  current_gate: ProjectGate;
  current_stage: string;
}): GateReadiness {
  const currentGate = effectiveCurrentGate(project);
  const checklistGate = currentGate;
  const advance = resolveAdvanceTransition(project);
  return { currentGate, checklistGate, advance };
}

/**
 * The honest advance transition for a project. Gate-only G0→G1 stays on `brief`;
 * G1→G2 is the brief→recipe stage step. All later steps follow STAGE_ORDER.
 */
export function resolveAdvanceTransition(project: {
  current_gate: ProjectGate;
  current_stage: string;
}): AdvanceTransition | null {
  const currentGate = effectiveCurrentGate(project);
  const stage = project.current_stage;

  if (currentGate === 'G0' && stage === 'brief') {
    return { kind: 'gate', nextStage: 'brief', targetGate: 'G1', requiresESign: false };
  }
  if (currentGate === 'G1' && stage === 'brief') {
    return { kind: 'stage', nextStage: 'recipe', targetGate: 'G2', requiresESign: false };
  }

  const next = nextStage(stage);
  if (!next) return null;
  return {
    kind: 'stage',
    nextStage: next,
    targetGate: gateForStage(next),
    requiresESign: stage === 'approval' && next === 'handoff',
  };
}

/** @deprecated Use resolveAdvanceTransition(project) — stage alone is insufficient on brief. */
export function advanceTransitionForStage(currentStage: string): AdvanceTransition | null {
  if (currentStage === 'brief') {
    return { kind: 'gate', nextStage: 'brief', targetGate: 'G1', requiresESign: false };
  }
  const next = nextStage(currentStage);
  if (!next) return null;
  return {
    kind: 'stage',
    nextStage: next,
    targetGate: gateForStage(next),
    requiresESign: currentStage === 'approval' && next === 'handoff',
  };
}

export type GateProjectRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  current_gate: ProjectGate;
  current_stage: string;
  product_code: string | null;
};

export type GateBlocker = {
  code:
    | 'FG_CANDIDATE_REQUIRED'
    | 'FG_ALREADY_LINKED'
    | 'RECIPE_INGREDIENTS_REQUIRED'
    | 'LAUNCH_COMPLIANCE_BLOCKED';
  message: string;
  /** Stable criterion keys (e.g. C7) for client i18n when code is LAUNCH_COMPLIANCE_BLOCKED. */
  pendingCriteria?: string;
  gateCode?: ProjectGate;
  itemId?: string;
  itemText?: string;
};

const LAUNCH_CRITERION_LABELS: Record<keyof ApprovalCriteriaResult, string> = {
  C1: 'Recipe locked',
  C2: 'Nutrition score',
  C3: 'Target margin',
  C4: 'Sensory panel',
  C5: 'Allergen audit',
  C6: 'High risks',
  C7: 'Compliance documents',
};

/** Launch blocks on any required criterion still pending; warns are non-blocking. */
export function launchBlockingCriteria(criteria: ApprovalCriteriaResult): Array<keyof ApprovalCriteriaResult> {
  return (Object.entries(criteria) as Array<[keyof ApprovalCriteriaResult, ApprovalCriterionStatus]>)
    .filter(([, status]) => status === 'pending')
    .map(([key]) => key);
}

export class GateActionError extends Error {
  code: string;
  status: number;
  blockers: GateBlocker[];

  constructor(code: string, status = 400, blockers: GateBlocker[] = []) {
    super(code);
    this.name = 'GateActionError';
    this.code = code;
    this.status = status;
    this.blockers = blockers;
  }
}

// ─── Gate-space navigation primitives (legacy) ───
// The advance engine is now STAGE-native (nextStage / assertAdjacentStage above).
// Gate primitives remain for revert-npd-gate.ts, which reasons in gate space
// (admin rollback to the previous gate), and as the documented gate adjacency rule.
export function nextGate(gate: ProjectGate): ProjectGate | null {
  const index = GATES.indexOf(gate);
  if (index < 0 || index >= GATES.length - 1) return null;
  return GATES[index + 1] ?? null;
}

export function previousGate(gate: ProjectGate): ProjectGate | null {
  const index = GATES.indexOf(gate);
  if (index <= 0) return null;
  return GATES[index - 1] ?? null;
}

/** @deprecated Stage advance uses assertAdjacentStage. Kept for gate-space rollback docs. */
export function assertAdjacent(currentGate: ProjectGate, targetGate: ProjectGate): void {
  if (nextGate(currentGate) !== targetGate) {
    throw new GateActionError('ADJACENCY_VIOLATION', 422);
  }
}

export async function requireActionPermission(ctx: OrgContextLike, permission: string): Promise<void> {
  if (!(await hasPermission(ctx, permission))) {
    throw new GateActionError('FORBIDDEN', 403);
  }
}

export async function requireAdmin(ctx: OrgContextLike): Promise<void> {
  if (await hasPermission(ctx, ADMIN_PERMISSION)) return;

  const role = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and r.code = 'admin'
      limit 1`,
    [ctx.userId, ctx.orgId],
  );
  if (role.rows.length === 0) throw new GateActionError('FORBIDDEN', 403);
}

/**
 * G4 e-signature checkpoint guard for the approval → handoff stage transition.
 *
 * Advancing FROM `approval` TO `handoff` is the BRCGS/CFR-21 e-sign checkpoint. The
 * signature itself is collected by the existing approveProjectGate flow (gateCode
 * 'G4', signEvent intent 'npd.gate.approved' → gate_approvals with esigned_at +
 * esign_hash). This guard verifies a valid, immutable G4 e-sign approval exists
 * before allowing the stage to advance — advancing without one throws ESIGN_REQUIRED.
 */
export async function assertG4ESignForHandoff(ctx: OrgContextLike, projectId: string): Promise<void> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.gate_approvals
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and gate_code = 'G4'
        and decision = 'approved'
        and esigned_at is not null
        and esign_hash is not null
      limit 1`,
    [projectId],
  );
  if (rows.length === 0) {
    throw new GateActionError('ESIGN_REQUIRED', 403);
  }
}

/**
 * G3 e-signature guard for the G3 → G4 stage crossing (pilot → approval).
 * Mirrors assertG4ESignForHandoff: a valid, immutable G3 e-sign approval (collected
 * by approveProjectGate, gateCode 'G3') must exist before the project may enter G4.
 * Advancing without one throws ESIGN_REQUIRED. (Owner decision F-1, 2026-06-27.)
 */
export async function assertG3ESignForApproval(ctx: OrgContextLike, projectId: string): Promise<void> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.gate_approvals
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and gate_code = 'G3'
        and decision = 'approved'
        and esigned_at is not null
        and esign_hash is not null
      limit 1`,
    [projectId],
  );
  if (rows.length === 0) {
    throw new GateActionError('ESIGN_REQUIRED', 403);
  }
}

export async function loadProjectForUpdate(ctx: OrgContextLike, projectId: string): Promise<GateProjectRow> {
  const { rows } = await ctx.client.query<GateProjectRow>(
    `select id, code, name, type, current_gate, current_stage, product_code
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
      for update`,
    [projectId],
  );
  const project = rows[0];
  if (!project) throw new GateActionError('NOT_FOUND', 404);
  return project;
}

/**
 * Blockers that must be resolved before advancing the project's CURRENT stage.
 * Required gate-checklist items block advance unless a recorded override (reason +
 * audit row) is supplied via advanceProjectGate.override — same path as other
 * soft-gate missing fields.
 */
export async function getBlockers(
  ctx: OrgContextLike,
  project: GateProjectRow,
  targetStage: AnyStage,
): Promise<GateBlocker[]> {
  const blockers: GateBlocker[] = [];

  // Recipe guard: leaving the `recipe` stage requires the formulation's current
  // version to have at least one ingredient. This is the ONLY real completeness
  // signal for the recipe stage — the seeded G2 checklist (shelf-life / label / HACCP
  // / business case) belongs to later stages and is advisory only.
  if (project.current_stage === 'recipe') {
    const count = await countCurrentVersionIngredients(ctx.client, project.id);
    if (count === 0) {
      blockers.push({
        code: 'RECIPE_INGREDIENTS_REQUIRED',
        message: 'Add at least one ingredient to the recipe before advancing.',
      });
    }
  }

  // FG conflict guard: only relevant when about to create the FG candidate (entering
  // the `packaging` stage) and the project has no FG mapped yet.
  if (targetStage === FG_CANDIDATE_STAGE && !project.product_code) {
    const conflict = await findFgConflict(ctx.client, project.id, normalizeProductCode(null, project));
    if (conflict) {
      blockers.push({
        code: 'FG_ALREADY_LINKED',
        message: `Finished Good ${conflict.product_code} is already linked to another active NPD project.`,
      });
    }
  }

  if (project.current_stage === 'handoff' && targetStage === 'launched') {
    blockers.push(...await getLaunchComplianceBlockers(ctx, project));
  }

  return blockers;
}

/**
 * Regulatory launch guard (handoff → launched): reuses evaluateApprovalCriteria so
 * C1/C5/C7 and every other required criterion must be satisfied (pass/warn/not_required).
 * Pending criteria block launch; warns (expiring docs, low margin, etc.) do not.
 */
export async function getLaunchComplianceBlockers(
  ctx: OrgContextLike,
  project: GateProjectRow,
): Promise<GateBlocker[]> {
  const productCode = project.product_code?.trim();
  if (!productCode) {
    return [{
      code: 'LAUNCH_COMPLIANCE_BLOCKED',
      message: 'Map a finished-good product before launch.',
      gateCode: 'G4',
    }];
  }

  const evaluation = await evaluateApprovalCriteriaWithClient(ctx.client, productCode);
  if (!evaluation.ok) {
    return [{
      code: 'LAUNCH_COMPLIANCE_BLOCKED',
      message: 'Approval criteria could not be evaluated for this product.',
      gateCode: 'G4',
    }];
  }

  const blockingKeys = new Set<keyof ApprovalCriteriaResult>(launchBlockingCriteria(evaluation.data));

  // Launch is a regulatory dispatch gate: it requires at least one VALID (non-deleted,
  // non-expired) compliance document REGARDLESS of the Approval-stage C7 config. An org
  // that marks C7 not-required in npd_approval_criterion_config (so C7 -> 'not_required'
  // for the Approval screen) must still not be able to launch a product with no docs.
  const docs = await ctx.client.query<{ valid_docs: number }>(
    `select count(*)::int as valid_docs
       from public.compliance_docs
      where product_code = $1
        and org_id = app.current_org_id()
        and deleted_at is null
        and coalesce(expiry_state, 'Valid') = 'Valid'
        and (expires_at is null or expires_at >= current_date)`,
    [productCode],
  );
  if ((docs.rows[0]?.valid_docs ?? 0) <= 0) blockingKeys.add('C7');

  if (blockingKeys.size === 0) return [];

  const keys = [...blockingKeys];
  const detail = keys.map((key) => LAUNCH_CRITERION_LABELS[key]).join(', ');
  return [{
    code: 'LAUNCH_COMPLIANCE_BLOCKED',
    message: `Launch blocked — complete approval criteria: ${detail}.`,
    pendingCriteria: keys.join(','),
    gateCode: 'G4',
  }];
}

export async function checkCostingNutritionReady(
  ctx: OrgContextLike,
  projectId: string,
): Promise<{ costReady: boolean; nutritionReady: boolean }> {
  const { rows } = await ctx.client.query<{
    cost_ready: boolean;
    nutrition_ready: boolean;
  }>(
    `with project_row as (
       select p.id, p.product_code
         from public.npd_projects p
        where p.id = $1::uuid
          and p.org_id = app.current_org_id()
        limit 1
     ),
     locked_recipe as (
       select fv.id as locked_version_id
         from public.formulations f
         join public.formulation_versions fv
           on fv.formulation_id = f.id
          and fv.state = 'locked'
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
        order by fv.version_number desc
        limit 1
     )
     select
       exists (
         select 1
           from public.costing_breakdowns cb
           join project_row p on p.product_code = cb.product_code
          where cb.org_id = app.current_org_id()
            and lower(cb.scenario) = 'target'
       ) as cost_ready,
       exists (
         select 1
           from public.nutri_score_results nsr
           join project_row p on p.product_code = nsr.product_code
           left join locked_recipe lr on true
          where nsr.org_id = app.current_org_id()
            and (
              lr.locked_version_id is null
              or nsr.formulation_version_id = lr.locked_version_id
            )
       ) as nutrition_ready`,
    [projectId],
  );
  return {
    costReady: rows[0]?.cost_ready === true,
    nutritionReady: rows[0]?.nutrition_ready === true,
  };
}

/**
 * Persist a stage transition. `current_stage` is authoritative; `current_gate` is
 * DERIVED via GATE_BY_STAGE so all gate-keyed infra stays in sync. The 'launched'
 * terminal stage maps to gate 'Launched'.
 */
export async function updateProjectStage(
  ctx: OrgContextLike,
  projectId: string,
  targetStage: AnyStage,
): Promise<void> {
  await ctx.client.query(
    `update public.npd_projects
        set current_stage = $2,
            current_gate = $3
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [projectId, targetStage, gateForStage(targetStage)],
  );
}

/**
 * Legacy gate-only setter (kept for revert-npd-gate / approve-gate which still reason in
 * gate space). It derives a representative stage for the target gate so current_stage
 * never drifts. For G3 (4 stages) it lands on the FIRST G3 stage (packaging); for a
 * downward gate revert this is the safe, earliest stage of that gate.
 */
export function representativeStageForGate(gate: ProjectGate): AnyStage {
  switch (gate) {
    case 'G0':
      return 'brief';
    case 'G1':
      return 'brief';
    case 'G2':
      return 'recipe';
    case 'G3':
      return G3_STAGES[0];
    case 'G4':
      return 'approval';
    case 'Launched':
      return 'launched';
    default:
      return 'brief';
  }
}

export async function updateProjectGateOnly(
  ctx: OrgContextLike,
  projectId: string,
  targetGate: ProjectGate,
): Promise<void> {
  await ctx.client.query(
    `update public.npd_projects
        set current_gate = $2
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [projectId, targetGate],
  );
}

export async function updateProjectGate(
  ctx: OrgContextLike,
  projectId: string,
  targetGate: ProjectGate,
): Promise<void> {
  await ctx.client.query(
    `update public.npd_projects
        set current_gate = $2,
            current_stage = $3
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [projectId, targetGate, representativeStageForGate(targetGate)],
  );
}

export function deterministicApprovalHash(userId: string, projectId: string, gateCode: ProjectGate, esignedAtIso: string): string {
  return createHash('sha256').update(`${userId}${projectId}${gateCode}${esignedAtIso}`, 'utf8').digest('hex');
}

export async function emitOutbox(
  ctx: OrgContextLike,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    dedupKey: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, $2, $3, $4::jsonb, $5, $6)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      APP_VERSION,
      event.dedupKey,
    ],
  );
}

export async function createFgCandidate(
  ctx: OrgContextLike,
  project: GateProjectRow,
  requestedProductCode?: string | null,
): Promise<{ productCode: string; created: boolean; mapped: boolean }> {
  const existingLinkedCode = await resolveExistingFgCode(ctx.client, project);
  if (existingLinkedCode) {
    if (requestedProductCode?.trim()) {
      const requested = normalizeProductCode(requestedProductCode, project);
      if (requested !== existingLinkedCode) {
        throw new GateActionError('FG_ALREADY_LINKED', 409);
      }
    }
    const repaired = await ensureFgCandidateMapped(ctx, project, existingLinkedCode);
    if (repaired.created) {
      await emitOutbox(ctx, {
        eventType: FG_CREATED_EVENT,
        aggregateType: 'fg',
        aggregateId: existingLinkedCode,
        payload: {
          org_id: ctx.orgId,
          actor_user_id: ctx.userId,
          project_id: project.id,
          project_code: project.code,
          product_code: existingLinkedCode,
          product_name: project.name,
        },
        dedupKey: `${FG_CREATED_EVENT}:${existingLinkedCode}`,
      });
    }
    if (repaired.mapped) {
      await emitOutbox(ctx, {
        eventType: FG_CANDIDATE_MAPPED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          org_id: ctx.orgId,
          actor_user_id: ctx.userId,
          project_id: project.id,
          project_code: project.code,
          product_code: existingLinkedCode,
          previous_product_code: project.product_code,
        },
        dedupKey: `${FG_CANDIDATE_MAPPED_EVENT}:${project.id}:${existingLinkedCode}`,
      });
    }
    return { productCode: existingLinkedCode, created: repaired.created, mapped: repaired.mapped };
  }

  const productCode = await generateFgProductCode(ctx, requestedProductCode, project);

  const conflict = await findFgConflict(ctx.client, project.id, productCode);
  if (conflict) throw new GateActionError('FG_ALREADY_LINKED', 409);

  const { created } = await ensureFgCandidateMapped(ctx, project, productCode);

  if (created) {
    await emitOutbox(ctx, {
      eventType: FG_CREATED_EVENT,
      aggregateType: 'fg',
      aggregateId: productCode,
      payload: {
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        project_id: project.id,
        project_code: project.code,
        product_code: productCode,
        product_name: project.name,
      },
      dedupKey: `${FG_CREATED_EVENT}:${productCode}`,
    });
  }

  await emitOutbox(ctx, {
    eventType: FG_CANDIDATE_MAPPED_EVENT,
    aggregateType: 'npd_project',
    aggregateId: project.id,
    payload: {
      org_id: ctx.orgId,
      actor_user_id: ctx.userId,
      project_id: project.id,
      project_code: project.code,
      product_code: productCode,
      previous_product_code: null,
    },
    dedupKey: `${FG_CANDIDATE_MAPPED_EVENT}:${project.id}:${productCode}`,
  });

  return { productCode, created, mapped: true };
}

async function ensureFgCandidateMapped(
  ctx: OrgContextLike,
  project: GateProjectRow,
  productCode: string,
): Promise<{ created: boolean; mapped: boolean }> {
  let created = false;
  let mapped = false;

  const existing = await ctx.client.query<{ product_code: string }>(
    `select product_code
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  if (existing.rows.length === 0) {
    const inserted = await ctx.client.query<{ product_code: string }>(
      `insert into public.product
         (org_id, product_code, product_name, created_by_user, app_version)
       values
         (app.current_org_id(), $1, $2, $3::uuid, $4)
       -- product is a VIEW post-merge-cut → no ON CONFLICT (a view has no constraints; 42P10).
       -- The SELECT pre-check above already guards existence, so this only runs when absent.
       returning product_code`,
      [productCode, project.name, ctx.userId, APP_VERSION],
    );
    created = inserted.rows.length > 0;
    if (created) mapped = true;
  }

  const projectBackfill = await ctx.client.query(
    `update public.npd_projects
        set product_code = $2
      where id = $1::uuid
        and org_id = app.current_org_id()
        and product_code is null`,
    [project.id, productCode],
  );
  if ((projectBackfill.rowCount ?? 0) > 0) mapped = true;

  const formulationBackfill = await ctx.client.query(
    `update public.formulations
        set product_code = $2
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and product_code is null`,
    [project.id, productCode],
  );
  if ((formulationBackfill.rowCount ?? 0) > 0) mapped = true;

  if (await ensureFgFactorySpecLink(ctx, project, productCode)) mapped = true;

  await copyBriefFieldsToProduct(ctx, project.id, productCode);
  await transferProjectFieldValuesToProduct(ctx, project.id, productCode);

  return { created, mapped };
}

async function ensureFgFactorySpecLink(
  ctx: OrgContextLike,
  project: GateProjectRow,
  productCode: string,
): Promise<boolean> {
  let linked = false;

  const itemLink = await ctx.client.query(
    `update public.items
        set npd_project_id = $2::uuid
      where org_id = app.current_org_id()
        and item_code = $1
        and npd_project_id is null`,
    [productCode, project.id],
  );
  if ((itemLink.rowCount ?? 0) > 0) linked = true;

  const { rows: itemRows } = await ctx.client.query<{ id: string }>(
    `select id
       from public.items
      where org_id = app.current_org_id()
        and item_code = $1
      limit 1`,
    [productCode],
  );
  const fgItemId = itemRows[0]?.id;
  if (!fgItemId) return linked;

  const specInsert = await ctx.client.query(
    `insert into public.factory_specs
       (org_id, fg_item_id, spec_code, version, status, source, created_by)
     select app.current_org_id(), $1::uuid, $2, 1, 'draft', 'npd_builder', $3::uuid
      where not exists (
        select 1
          from public.factory_specs
         where org_id = app.current_org_id()
           and fg_item_id = $1::uuid
      )
     returning id`,
    [fgItemId, `NPD-${project.code}`, ctx.userId],
  );
  if ((specInsert.rowCount ?? 0) > 0) linked = true;

  return linked;
}

async function copyBriefFieldsToProduct(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<void> {
  // A12 — pre-fill the FG's commercial fields from the project brief (kill double-
  // entry). createFgCandidate used to insert only code+name, so Volume / Weight (g) /
  // Price (Brief) stayed NULL on every project-created FG and had to be re-typed on the
  // FG detail. Copy them from npd_projects now; coalesce only fills blanks (never
  // clobbers a value the user already typed). weekly_volume_packs is the canonical
  // brief volume (W4-B); mirrored into product.volume as a plain number.
  const brief = await ctx.client.query<{
    pack_weight_g: string | null;
    target_retail_price_eur: string | null;
    weekly_volume_packs: string | null;
    packs_per_case: string | null;
  }>(
    `select pack_weight_g::text, target_retail_price_eur::text, weekly_volume_packs::text, packs_per_case::text
       from public.npd_projects
      where id = $1::uuid and org_id = app.current_org_id()`,
    [projectId],
  );
  const b = brief.rows[0];
  if (!b) return;

  const volumeNumeric =
    b.weekly_volume_packs && /^[0-9]+(\.[0-9]+)?$/.test(b.weekly_volume_packs.trim())
      ? b.weekly_volume_packs.trim()
      : null;
  const parsedPacksPerCase =
    b.packs_per_case && /^\d+$/.test(b.packs_per_case.trim())
      ? parseInt(b.packs_per_case.trim(), 10)
      : NaN;
  const packsPerCase = Number.isNaN(parsedPacksPerCase) ? null : parsedPacksPerCase;
  await ctx.client.query(
    `update public.product
        set weight      = coalesce(weight,      $2::numeric),
            price_brief = coalesce(price_brief, $3::numeric),
            volume      = coalesce(volume,      $4::numeric),
            packs_per_case = coalesce(packs_per_case, $5::integer)
      where org_id = app.current_org_id()
        and product_code = $1`,
    [productCode, b.pack_weight_g, b.target_retail_price_eur, volumeNumeric, packsPerCase],
  );
}

export async function transferProjectFieldValuesToProduct(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<void> {
  const values = await readProjectFieldValues(ctx, projectId);
  const catalogKeys = await readOrgCatalogFieldKeys(ctx);
  const productColumns = await readProductColumnSet(ctx);
  let transferredRecipeComponents = false;

  for (const key of catalogKeys) {
    if (!productColumns.has(key)) continue;
    const value = key === 'product_name' ? values.product_name : values[key];
    if (!hasTransferValue(value)) continue;
    if (await coalesceProductColumn(ctx, productCode, key, value)) {
      transferredRecipeComponents = transferredRecipeComponents || key === 'recipe_components';
    }
  }

  if (transferredRecipeComponents) {
    await syncProdDetailRows(ctx, productCode);
  }
}

async function readProjectFieldValues(
  ctx: OrgContextLike,
  projectId: string,
): Promise<Record<string, unknown>> {
  const { rows } = await ctx.client.query<{ project_json: Record<string, unknown> | null }>(
    `select to_jsonb(np.*) as project_json
       from public.npd_projects np
      where np.id = $1::uuid
        and np.org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  const projectJson = rows[0]?.project_json ?? {};
  const fieldValues = isRecord(projectJson.field_values) ? projectJson.field_values : {};
  const values: Record<string, unknown> = { ...fieldValues };
  for (const [key, value] of Object.entries(projectJson)) {
    if (key !== 'field_values') values[key] = value;
  }
  values.product_name = projectJson.name ?? null;
  return values;
}

async function readOrgCatalogFieldKeys(ctx: OrgContextLike): Promise<string[]> {
  const { rows } = await ctx.client.query<{ column_key: string }>(
    `select distinct lower(f.code) as column_key
       from public.npd_field_catalog f
      where f.org_id = app.current_org_id()
        and f.active = true
        and lower(f.code) ~ '^[a-z][a-z0-9_]*$'
      order by lower(f.code)`,
  );
  return rows.map((row) => row.column_key);
}

async function readProductColumnSet(ctx: OrgContextLike): Promise<Set<string>> {
  const { rows } = await ctx.client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'product'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

async function coalesceProductColumn(
  ctx: OrgContextLike,
  productCode: string,
  columnName: string,
  value: unknown,
): Promise<boolean> {
  const quoted = quoteIdentifier(columnName);
  const result = await ctx.client.query(
    `update public.product
        set ${quoted} = $2
      where org_id = app.current_org_id()
        and product_code = $1
        and (${quoted} is null or ${quoted}::text = '')
      returning product_code`,
    [productCode, value],
  );
  return (result.rowCount ?? 0) > 0;
}

function hasTransferValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function peekSuggestedFgCandidateCode(
  client: QueryClient,
  orgId: string,
  projectCode: string,
): Promise<string> {
  const { rows } = await client.query<{ next_seq: string | number; code_mask: string | null }>(
    `select next_seq, code_mask
       from public.org_document_settings
      where org_id = $1::uuid
        and doc_type = 'fg'
      limit 1`,
    [orgId],
  );
  const row = rows[0];
  if (!row?.code_mask) return fallbackFgProductCode(projectCode);
  return renderCodeMask(row.code_mask, { seq: Number(row.next_seq) });
}

/**
 * Count the ingredients on the project's CURRENT formulation version. Zero means
 * the recipe is empty (no `formulations` row, no current version, or no ingredient
 * rows) — the recipe stage cannot be left until at least one ingredient exists.
 */
async function countCurrentVersionIngredients(client: QueryClient, projectId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `select count(fi.id)::text as n
       from public.formulations f
       join public.formulation_versions fv on fv.id = f.current_version_id
       join public.formulation_ingredients fi on fi.version_id = fv.id
      where f.org_id = app.current_org_id()
        and f.project_id = $1::uuid`,
    [projectId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function resolveExistingFgCode(
  client: QueryClient,
  project: GateProjectRow,
): Promise<string | null> {
  const linkedOnProject = project.product_code?.trim() || null;

  const { rows } = await client.query<{ product_code: string }>(
    `select product_code
       from public.formulations
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and product_code is not null
      limit 1`,
    [project.id],
  );
  const linkedOnFormulation = rows[0]?.product_code?.trim() || null;

  if (linkedOnProject && linkedOnFormulation && linkedOnProject !== linkedOnFormulation) {
    console.warn('[npd/gate-helpers] FG_LINK_MISMATCH', {
      projectId: project.id,
      projectProductCode: linkedOnProject,
      formulationProductCode: linkedOnFormulation,
    });
    throw new GateActionError('FG_LINK_MISMATCH', 409);
  }

  return linkedOnProject || linkedOnFormulation || null;
}

async function findFgConflict(
  client: QueryClient,
  projectId: string,
  productCode: string,
): Promise<{ id: string; product_code: string } | null> {
  const { rows } = await client.query<{ id: string; product_code: string }>(
    `select id, product_code
       from public.npd_projects
      where org_id = app.current_org_id()
        and id <> $1::uuid
        and product_code = $2
        and current_gate <> 'Launched'
      limit 1`,
    [projectId, productCode],
  );
  return rows[0] ?? null;
}

function normalizeProductCode(requestedProductCode: string | null | undefined, project: GateProjectRow): string {
  const raw = requestedProductCode?.trim() || fallbackFgProductCode(project.code);
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
  if (normalized.length < 3) {
    return `FG-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return normalized;
}

async function generateFgProductCode(
  ctx: OrgContextLike,
  requestedProductCode: string | null | undefined,
  project: GateProjectRow,
): Promise<string> {
  if (requestedProductCode?.trim()) return normalizeProductCode(requestedProductCode, project);

  try {
    // nextEntityCode wants the numbering QueryClient (unconstrained generic); ctx.client is the pipeline
    // QueryClient (T extends pg.QueryResultRow). Structurally compatible for this call (query→{rows}).
    return await nextEntityCode(ctx.client as unknown as NumberingQueryClient, ctx.orgId, 'fg');
  } catch (error) {
    if (isMissingFgCodeMaskError(error)) return normalizeProductCode(null, project);
    throw error;
  }
}

function isMissingFgCodeMaskError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === 'entity_code_settings_missing:fg' || error.message === 'entity_code_mask_missing:fg';
}

export function fallbackFgProductCode(projectCode: string): string {
  // Plan→FG: the FG code drops the "NPD" project prefix so NPD-012 → FG-012 (NOT FG-NPD-012).
  // Safe because the FG↔project link is a stored FK (npd_projects.product_code / items.npd_project_id),
  // never re-parsed back out of the code string — so the produced code can be a clean FG-<number>.
  // Used by BOTH the create path (normalizeProductCode) and the suggested-code peek, so the modal
  // preview and the actually-created code stay identical.
  const numericPart = projectCode.replace(/^NPD[-_ ]?/i, '');
  return `FG-${numericPart}`;
}

export function serializeGateError(error: unknown):
  | { ok: false; error: string; status: number; blockers?: GateBlocker[] }
  | null {
  if (error instanceof GateActionError) {
    return {
      ok: false,
      error: error.code,
      status: error.status,
      ...(error.blockers.length > 0 ? { blockers: error.blockers } : {}),
    };
  }
  return null;
}

/**
 * Default handoff checklist labels (prototype other-stages.jsx:488-534,
 * generalized from its sample data).
 */
const HANDOFF_CHECKLIST_DEFAULT_ITEMS = [
  'Recipe locked',
  'Nutrition label approved by regulatory',
  'Packaging artwork finalized',
  'Pilot production successful',
  'Training material prepared',
  'First production order scheduled',
] as const;

/**
 * Seeds the project's handoff checklist when it enters the handoff stage.
 *
 * Nothing else ever INSERTs into handoff_checklists (live deadlock 2026-06-10):
 * get-handoff returned not_found forever, promote-to-production required the row
 * to pre-exist, and closeOutLegacyStagesForLaunch then rejected handoff→launched
 * with HANDOFF_BOM_NOT_APPROVED — so no project could ever reach `launched`.
 * Idempotent: ON CONFLICT on (org_id, project_id); items seeded only when the
 * checklist has none.
 */
export async function seedHandoffChecklist(
  ctx: OrgContextLike,
  project: Pick<GateProjectRow, 'id'>,
): Promise<void> {
  const checklist = await ctx.client.query<{ id: string }>(
    `insert into public.handoff_checklists
       (org_id, project_id, bom_verification_status, created_by, updated_by)
     values
       (app.current_org_id(), $1::uuid, 'pending', $2::uuid, $2::uuid)
     on conflict on constraint handoff_checklists_org_project_unique do update
       set updated_by = excluded.updated_by
     returning id`,
    [project.id, ctx.userId],
  );
  const checklistId = checklist.rows[0]?.id;
  if (!checklistId) return;

  const existing = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.handoff_checklist_items
      where org_id = app.current_org_id()
        and handoff_checklist_id = $1::uuid
      limit 1`,
    [checklistId],
  );
  if (existing.rows.length > 0) return;

  for (let i = 0; i < HANDOFF_CHECKLIST_DEFAULT_ITEMS.length; i++) {
    await ctx.client.query(
      `insert into public.handoff_checklist_items
         (org_id, handoff_checklist_id, label, is_checked, display_order, created_by, updated_by)
       values
         (app.current_org_id(), $1::uuid, $2, false, $3::integer, $4::uuid, $4::uuid)`,
      [checklistId, HANDOFF_CHECKLIST_DEFAULT_ITEMS[i], i, ctx.userId],
    );
  }
}
