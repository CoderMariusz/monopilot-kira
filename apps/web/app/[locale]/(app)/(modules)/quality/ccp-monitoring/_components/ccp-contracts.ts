/**
 * CCP Monitoring (Wave E3) — client/server contract types.
 *
 * These mirror the EXACT shapes exported by the reviewed HACCP Server Actions
 * (quality/_actions/haccp-actions.ts) — imported by the page, never re-authored
 * here. Kept in a leaf module so the client islands and the RTL tests share one
 * source of truth for the action signatures we wire against.
 *
 * Action signatures wired against (haccp-actions.ts):
 *   listCcps(input?: { activeOnly?: boolean })
 *     → { ok: true; data: CcpRow[] } | { ok: false; reason: 'forbidden' | 'error'; message? }
 *   listMonitoringLog(input?: { ccpId?: string; days?: number })
 *     → { ok: true; data: MonitoringLogRow[] } | { ok: false; ... }
 *   recordMonitoring({ ccpId, measuredValue, woId?, note? })
 *     → { ok: true; data: { withinLimits; ncrId; outboxEmitted } } | { ok: false; ... }
 */

export type HazardType = 'biological' | 'chemical' | 'physical' | 'allergen';

/** Mirror of haccp-actions.ts `CcpRow` (the listCcps element). */
export type CcpRow = {
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

/** Mirror of haccp-actions.ts `MonitoringLogRow` (the listMonitoringLog element). */
export type MonitoringLogRow = {
  id: string;
  ccpId: string;
  ccpCode: string | null;
  measuredValue: string;
  measuredAt: string;
  woId: string | null;
  withinLimits: boolean;
  recordedBy: string | null;
  note: string | null;
  breachNcrId: string | null;
};

export type MonitoringResult = {
  withinLimits: boolean;
  ncrId: string | null;
  outboxEmitted: boolean;
};

export type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;

/** Exact callable signature of the reviewed recordMonitoring action. */
export type RecordMonitoringAction = (data: {
  ccpId: string;
  measuredValue: string;
  woId?: string;
  note?: string;
}) => Promise<ActionResult<MonitoringResult>>;

/**
 * Exact callable signature of the reviewed `upsertCcp` action
 * (haccp-actions.ts:259). Wired by MODAL-CCP-CREATE — never re-authored here.
 * The action is gated server-side on `quality.haccp.plan_edit` (creation stays
 * plan_edit-only). Decimal limits are passed as strings (never coerced to a JS
 * number); omitted/empty bounds are sent as `null` for a one-sided limit.
 *
 * NOTE the snake_case field shape — it mirrors the action's `upsertCcpSchema`
 * input verbatim (the action validates these names with zod), in contrast to
 * the camelCase `CcpRow` it RETURNS.
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
  is_active?: boolean;
};

export type UpsertCcpAction = (data: UpsertCcpInput) => Promise<ActionResult<CcpRow>>;

/**
 * A CCP enriched with its latest reading (computed server-side by joining
 * listCcps with the most-recent listMonitoringLog row per CCP). `*_id` fields
 * are NEVER carried into the board — only the CCP code/name and a derived
 * status are surfaced (plan rule 0.11: no raw UUIDs in the UI).
 */
export type CcpBoardItem = {
  id: string;
  ccpCode: string;
  name: string;
  processStep: string;
  hazardType: HazardType;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string;
  monitoringFrequency: string;
  /** latest reading value (decimal string) or null when none recorded yet */
  lastValue: string | null;
  /** ISO timestamp of the latest reading or null */
  lastAt: string | null;
  /** derived limit status of the latest reading */
  lastStatus: 'in_limit' | 'out_of_limit' | 'no_data';
};
