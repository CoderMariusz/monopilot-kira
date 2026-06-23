/**
 * HACCP plan management (Wave E3) — client/server contract types.
 *
 * These mirror the EXACT shapes exported by the reviewed HACCP plan Server
 * Actions (quality/_actions/haccp-plan-actions.ts) and the `upsertCcp` action
 * (quality/_actions/haccp-actions.ts) — imported by the pages, never re-authored
 * here. Kept in a leaf module so the client islands and the RTL tests share one
 * source of truth for the action signatures we wire against.
 *
 * Action signatures wired against:
 *   listHaccpPlans()
 *     → { ok: true; data: HaccpPlan[] } | { ok: false; reason: 'forbidden' | 'error'; message? }
 *   getHaccpPlan(id)
 *     → { ok: true; data: HaccpPlan | null } | { ok: false; ... }
 *   upsertHaccpPlan({ id?, name, scopeType, scopeRef?, siteId? })
 *     → { ok: true; data: HaccpPlanHeader } | { ok: false; ... }
 *   activateHaccpPlan(planId, { password })
 *     → { ok: true; data: HaccpPlanHeader } | { ok: false; ... }
 *   newPlanVersion(planId)
 *     → { ok: true; data: HaccpPlan } | { ok: false; ... }
 *   upsertCcp({ ...ccpFields, plan_id }) (haccp-actions.ts)
 *     → { ok: true; data: HaccpCcpRow } | { ok: false; ... }
 */

export type HaccpPlanScopeType = 'product' | 'category' | 'line';
export type HaccpPlanStatus = 'draft' | 'active' | 'superseded';
export type HazardType = 'biological' | 'chemical' | 'physical' | 'allergen';

/** Mirror of haccp-plan-actions.ts `HaccpPlanHeader`. */
export type HaccpPlanHeader = {
  id: string;
  name: string;
  scopeType: HaccpPlanScopeType;
  scopeRef: string | null;
  siteId: string | null;
  version: number;
  status: HaccpPlanStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Mirror of haccp-plan-actions.ts `HaccpPlanCcp` (a CCP linked to a plan). */
export type HaccpPlanCcp = {
  id: string;
  ccpCode: string;
  name: string;
  processStep: string;
  hazardType: HazardType;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string;
  monitoringFrequency: string;
  correctiveAction: string;
  lineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Mirror of haccp-plan-actions.ts `HaccpPlan` (header + linked CCPs). */
export type HaccpPlan = HaccpPlanHeader & { ccps: HaccpPlanCcp[] };

/** Mirror of haccp-actions.ts `CcpRow` (the upsertCcp return shape). */
export type HaccpCcpRow = {
  id: string;
  ccpCode: string;
  name: string;
  processStep: string;
  hazardType: HazardType;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string;
  monitoringFrequency: string;
  correctiveAction: string;
  lineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

/** Exact callable signature of the reviewed `upsertHaccpPlan` action. */
export type UpsertPlanInput = {
  id?: string;
  name: string;
  scopeType: HaccpPlanScopeType;
  scopeRef?: string | null;
  siteId?: string | null;
};
export type UpsertPlanAction = (input: UpsertPlanInput) => Promise<ActionResult<HaccpPlanHeader>>;

/** Exact callable signature of the reviewed `activateHaccpPlan` action (e-sign). */
export type ActivatePlanAction = (
  planId: string,
  signature: { password: string },
) => Promise<ActionResult<HaccpPlanHeader>>;

/** Exact callable signature of the reviewed `newPlanVersion` action. */
export type NewPlanVersionAction = (planId: string) => Promise<ActionResult<HaccpPlan>>;

/**
 * Exact callable signature of the reviewed `upsertCcp` action
 * (haccp-actions.ts) WITH the optional `plan_id` link. Wired by MODAL-CCP-ADD
 * on the plan detail screen — never re-authored here. The action is gated
 * server-side on `quality.haccp.plan_edit`. Decimal limits are passed as strings
 * (never coerced to a JS number); omitted/empty bounds are sent as `null` for a
 * one-sided limit. NOTE the snake_case field shape — it mirrors the action's
 * `upsertCcpSchema` input verbatim, in contrast to the camelCase row it RETURNS.
 */
export type UpsertCcpInput = {
  id?: string;
  ccp_code: string;
  name: string;
  process_step: string;
  hazard_type: HazardType;
  critical_limit_min?: string | null;
  critical_limit_max?: string | null;
  unit?: string;
  monitoring_frequency?: string;
  corrective_action?: string;
  line_id?: string | null;
  plan_id?: string | null;
  is_active?: boolean;
};
export type UpsertCcpAction = (data: UpsertCcpInput) => Promise<ActionResult<HaccpCcpRow>>;

/**
 * A plan list row shaped for the table: scope-type/status are surfaced as
 * derived labels and ccpCount is computed server-side from the linked CCPs.
 * `*_id` fields (id stays as a routing key only, never RENDERED) are never shown
 * — only plan NAME / scope label / version / status / #CCP (plan rule 0.11).
 */
export type PlanListRow = {
  id: string;
  name: string;
  scopeType: HaccpPlanScopeType;
  scopeRef: string | null;
  version: number;
  status: HaccpPlanStatus;
  ccpCount: number;
};
