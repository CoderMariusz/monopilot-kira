import { createHash, randomUUID } from 'node:crypto';

import {
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type QueryClient,
} from '../shared';
import { nextEntityCode, renderCodeMask } from '../../../../../lib/documents/code-mask';
import type { QueryClient as NumberingQueryClient } from '../../../../../lib/documents/numbering';

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
// STATE MACHINE (2026-06-06 pivot — gate-centric → 8-stage operational pipeline).
//
// `current_stage` is now the AUTHORITATIVE step the user drives. It advances ONE
// step at a time through STAGE_ORDER; `current_gate` is DERIVED from the stage so
// all existing gate-keyed infra (gate_checklist_items.gate_code, gate_approvals,
// closeout, factory-release preflight) keeps working unchanged.
//
//   STAGE_ORDER : brief → recipe → packaging → trial → sensory → pilot → approval
//                 → handoff → (launched, terminal)
//
//   STAGE → GATE (derived):
//     brief     → G1   (Feasibility)
//     recipe    → G2   (Business Case)
//     packaging → G3   (Development)  ← FG candidate is created ENTERING here
//     trial     → G3
//     sensory   → G3
//     pilot     → G3
//     approval  → G4   (Testing — e-signature checkpoint)
//     handoff   → G4   (handoff work runs UNDER the G4 testing gate; the project is
//                       NOT 'Launched' until the terminal stage — see deviation note)
//     launched  → Launched (terminal — set only by closeout / handoff promotion)
//
//   DEVIATION from the original proposal (handoff→Launched): we map handoff→G4 and
//   reserve gate 'Launched' for the terminal `launched` stage ONLY. Rationale:
//   (a) the FG-not-active invariant — gate 'Launched' should never be visible while
//   handoff work is still in progress; (b) mapCloseoutStatus() + the standalone
//   closeOutLegacyStages() key off current_gate==='Launched' to mean truly launched;
//   collapsing handoff into Launched would surface closeout status prematurely.
//
//   Creation is the single special case: stage='brief' AND gate='G0' (Idea), set
//   by create-project.ts. The FIRST advance (brief→recipe) moves gate G0→G2 via the
//   derived map below; G1 (Feasibility) is collapsed into the brief stage so the
//   gate the project SITS at while on `brief` is G1 once advanced into. Migration 242
//   widened npd_projects.current_stage to exactly these 9 values.
// ─────────────────────────────────────────────────────────────────────────────

/** The fixed operational stage pipeline + terminal 'launched' (matches mig 242). */
export const STAGE_ORDER = [
  'brief',
  'recipe',
  'packaging',
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
const G3_STAGES: ProjectStage[] = ['packaging', 'trial', 'sensory', 'pilot'];

/** The stage on which the FG candidate is created (the 3rd stage = entering G3). */
export const FG_CANDIDATE_STAGE: ProjectStage = 'packaging';

/**
 * Derived STAGE → GATE map. Single source of truth for keeping current_gate in
 * sync with current_stage. (Creation's G0/brief is the one exception, handled in
 * create-project.ts — see header.)
 */
const GATE_BY_STAGE: Record<AnyStage, ProjectGate> = {
  brief: 'G1',
  recipe: 'G2',
  packaging: 'G3',
  trial: 'G3',
  sensory: 'G3',
  pilot: 'G3',
  approval: 'G4',
  handoff: 'G4',
  launched: 'Launched',
};

export function gateForStage(stage: AnyStage): ProjectGate {
  return GATE_BY_STAGE[stage];
}

export function isProjectStage(value: string): value is AnyStage {
  return value in GATE_BY_STAGE;
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

/**
 * The honest UI-facing advance transition for a stage: the single next stage and
 * the gate that stage DERIVES into. This is the one source the advance modal /
 * header / gate screen must use for their "advance to …" claims, so the UI never
 * promises a gate the engine cannot land on.
 *
 * NOTE on G1 (intended skip, 2026-06-06 pivot — see the state-machine header):
 * a project is created at stage 'brief' with gate G0; the first advance goes
 * brief→recipe which derives gate G2. G1 (Feasibility) is collapsed into the
 * brief stage and is NEVER a forward advance target — it can only appear via an
 * admin gate revert. Any UI claiming "next: G1" is lying; use this helper.
 */
export type AdvanceTransition = {
  nextStage: AnyStage;
  targetGate: ProjectGate;
  /** True only for the approval→handoff step (the enforced G4 e-sign checkpoint). */
  requiresESign: boolean;
};

export function advanceTransitionForStage(currentStage: string): AdvanceTransition | null {
  const next = nextStage(currentStage);
  if (!next) return null;
  return {
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
  code: 'FG_CANDIDATE_REQUIRED' | 'FG_ALREADY_LINKED' | 'RECIPE_INGREDIENTS_REQUIRED';
  message: string;
  gateCode?: ProjectGate;
  itemId?: string;
  itemText?: string;
};

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
// These gate primitives remain for revert-gate.ts, which still reasons in gate space
// (admin rollback to an earlier gate), and as the documented gate adjacency rule.
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
 * Checklist completeness is advisory by product decision: seeded checklist rows are
 * progress markers, but required/uncompleted items do not hard-block stage advance.
 * The FG-already-linked guard fires only when ENTERING the FG candidate stage.
 */
export async function getBlockers(
  ctx: OrgContextLike,
  project: GateProjectRow,
  targetStage: AnyStage,
): Promise<GateBlocker[]> {
  const blockers: GateBlocker[] = [];

  // Gate checklist rows are advisory progress markers. Required-but-unchecked
  // items must stay visible to the UI, but they do not hard-block stage advance.

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

  return blockers;
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
 * Legacy gate-only setter (kept for revert-gate / approve-gate which still reason in
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
  const productCode = await generateFgProductCode(ctx, requestedProductCode, project);

  if (project.product_code) {
    if (project.product_code !== productCode) throw new GateActionError('FG_ALREADY_LINKED', 409);
    return { productCode: project.product_code, created: false, mapped: false };
  }

  const conflict = await findFgConflict(ctx.client, project.id, productCode);
  if (conflict) throw new GateActionError('FG_ALREADY_LINKED', 409);

  const existing = await ctx.client.query<{ product_code: string }>(
    `select product_code
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  let created = false;
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
  }

  await ctx.client.query(
    `update public.npd_projects
        set product_code = $2
      where id = $1::uuid
        and org_id = app.current_org_id()
        and product_code is null`,
    [project.id, productCode],
  );
  await ctx.client.query(
    `update public.formulations
        set product_code = $2
      where org_id = app.current_org_id()
        and project_id = $1::uuid
        and product_code is null`,
    [project.id, productCode],
  );

  // A12 — pre-fill the FG's commercial fields from the project brief (kill double-
  // entry). createFgCandidate used to insert only code+name, so Volume / Weight (g) /
  // Price (Brief) stayed NULL on every project-created FG and had to be re-typed on the
  // FG detail. Copy them from npd_projects now; coalesce only fills blanks (never
  // clobbers a value the user already typed). expected_volume is free text → copied
  // only when it is a plain number. Runs whether the FG was just created or only mapped.
  const brief = await ctx.client.query<{
    pack_weight_g: string | null;
    target_retail_price_eur: string | null;
    expected_volume: string | null;
    packs_per_case: string | null;
  }>(
    `select pack_weight_g::text, target_retail_price_eur::text, expected_volume, packs_per_case::text
       from public.npd_projects
      where id = $1::uuid and org_id = app.current_org_id()`,
    [project.id],
  );
  const b = brief.rows[0];
  if (b) {
    const volumeNumeric =
      b.expected_volume && /^[0-9]+(\.[0-9]+)?$/.test(b.expected_volume.trim())
        ? b.expected_volume.trim()
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
      [
        productCode,
        b.pack_weight_g,
        b.target_retail_price_eur,
        volumeNumeric,
        packsPerCase,
      ],
    );
  }

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

function fallbackFgProductCode(projectCode: string): string {
  return `FG-${projectCode}`;
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
