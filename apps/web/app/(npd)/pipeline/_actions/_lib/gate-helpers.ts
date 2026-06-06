import { createHash, randomUUID } from 'node:crypto';

import {
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type QueryClient,
} from '../shared';

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
  code: 'CHECKLIST_REQUIRED' | 'FG_CANDIDATE_REQUIRED' | 'FG_ALREADY_LINKED';
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
 * Checklist completeness is checked against the CURRENT stage's gate (the gate the
 * project currently sits at), preserving the existing gate_checklist_items behaviour.
 * The FG-already-linked guard fires only when ENTERING the FG candidate stage.
 */
export async function getBlockers(
  ctx: OrgContextLike,
  project: GateProjectRow,
  targetStage: AnyStage,
): Promise<GateBlocker[]> {
  // 2026-06-06 pivot: the gate checklist is ADVISORY in the simplified R&D pipeline
  // (the user has no UI to tick the seeded ideation items, and stage/brief fields are
  // the real completeness signal). It NO LONGER hard-blocks a stage advance. The only
  // hard gates are: (1) the FG-conflict guard below, and (2) the approval→handoff
  // e-signature (enforced in advance-project-gate via assertG4ESignForHandoff).
  const blockers: GateBlocker[] = [];

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
  const productCode = normalizeProductCode(requestedProductCode, project);

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
       on conflict (org_id, product_code) do nothing
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
  const raw = requestedProductCode?.trim() || `FG-${project.code}`;
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 80);
  if (normalized.length < 3) {
    return `FG-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return normalized;
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
