'use server';

/**
 * P2-MODALS — server-resolved action context for the WO execution screens.
 *
 * The detail page renders header / per-tab action buttons (Pause / Waste /
 * Catch-weight / Complete / Close / Register-output …) and the list renders
 * per-row Start / Pause / Resume. Whether each button is OFFERED is governed by
 * TWO server-resolved facts that the client must NEVER guess or trust from its
 * own state:
 *
 *   1. RBAC — the same permission strings the route handlers + services check
 *      (production.wo.start / pause / resume / cancel / complete / close,
 *      production.output.write, production.waste.write). Resolved here under RLS
 *      via the canonical `hasPermission` helper; the client receives a flat
 *      boolean bag and renders accordingly (the route re-checks server-side, so a
 *      tampered client can never actually mutate — this only governs affordance).
 *
 *   2. Runtime lifecycle status — the WO's `wo_executions.status` (runtime
 *      vocabulary: planned/in_progress/paused/completed/closed/cancelled), read
 *      via the read-only `readWoExecutionStatus` seam. The state machine's legal
 *      transition table (wo-state-machine.ts TRANSITIONS) decides which verb is
 *      valid for that status, so the UI never offers a guaranteed-409 action.
 *
 * It also returns the reference lists the Pause + Waste modals need:
 *   - downtime categories (downtime_events.category_id → reasonCategoryId)
 *   - waste categories (wo_waste_log resolves category_code → id server-side)
 * and the current user id (close e-sign signerUserId — the close handler verifies
 * the PIN/login-password via signEvent, so the signer is the acting supervisor).
 *
 * Read-only. No mutation, no client-trusted flags. `'use server'` export rule:
 * only the async action + serialisable types.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  readWoExecutionStatus,
  type ProductionContext,
  type WoState,
} from '../../../../../../lib/production/shared';

/** Runtime WO lifecycle state — re-exported for the client screens/modals. */
export type { WoState };

export type WoActionPermissions = {
  start: boolean;
  pause: boolean;
  resume: boolean;
  cancel: boolean;
  complete: boolean;
  close: boolean;
  outputWrite: boolean;
  wasteWrite: boolean;
};

export type WoReasonCategory = { id: string; code: string; name: string };
export type WoWasteCategory = { code: string; name: string };

export type WoActionContextData = {
  /** Runtime lifecycle status — null when the WO has no execution row yet. */
  executionStatus: WoState | null;
  permissions: WoActionPermissions;
  /** Supervisor e-sign signer (current user) for the CLOSE flow. */
  currentUserId: string;
  /** Downtime categories for the Pause reason select (reasonCategoryId). */
  downtimeCategories: WoReasonCategory[];
  /** Waste categories for the Log-waste category select (category_code). */
  wasteCategories: WoWasteCategory[];
};

export type WoActionContextResult =
  | { ok: true; data: WoActionContextData }
  | { ok: false; reason: 'not_found' | 'error' };

const PERMISSION_STRINGS: Record<keyof WoActionPermissions, string> = {
  start: 'production.wo.start',
  pause: 'production.wo.pause',
  resume: 'production.wo.resume',
  cancel: 'production.wo.cancel',
  complete: 'production.wo.complete',
  close: 'production.wo.close',
  outputWrite: 'production.output.write',
  wasteWrite: 'production.waste.write',
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** List-level slice: RBAC + downtime categories only (no per-WO status). */
export type WoListActionContextData = {
  permissions: WoActionPermissions;
  downtimeCategories: WoReasonCategory[];
};

export type WoListActionContextResult =
  | { ok: true; data: WoListActionContextData }
  | { ok: false; reason: 'error' };

/**
 * Resolve the org-level action affordances for the WO LIST (per-row Start /
 * Pause / Resume): the RBAC bag + the downtime categories the Pause modal needs.
 * Per-row state-legality is computed from each row's own runtime status.
 */
export async function getWoListActionContext(): Promise<WoListActionContextResult> {
  try {
    return await withOrgContext(async (ctx): Promise<WoListActionContextResult> => {
      const pctx = ctx as unknown as ProductionContext;
      const c = ctx.client;

      const permEntries = await Promise.all(
        (Object.keys(PERMISSION_STRINGS) as Array<keyof WoActionPermissions>).map(
          async (key) => [key, await hasPermission(pctx, PERMISSION_STRINGS[key])] as const,
        ),
      );
      const permissions = permEntries.reduce((acc, [key, allowed]) => {
        acc[key] = allowed;
        return acc;
      }, {} as WoActionPermissions);

      const downtimeRes = await c.query<{ id: string; code: string; name: string }>(
        `select id::text as id, code, name from public.downtime_categories
          where org_id = app.current_org_id() and is_active = true
          order by name asc`,
      );

      return {
        ok: true,
        data: {
          permissions,
          downtimeCategories: downtimeRes.rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
        },
      };
    });
  } catch (error) {
    console.error('[production/wos] list action-context read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

export async function getWoActionContext(woId: string): Promise<WoActionContextResult> {
  if (!isUuid(woId)) return { ok: false, reason: 'not_found' };

  try {
    return await withOrgContext(async (ctx): Promise<WoActionContextResult> => {
      const pctx = ctx as unknown as ProductionContext;
      const c = ctx.client;

      // WO existence (RLS-scoped) — a missing / cross-org id is not_found.
      const woRes = await c.query<{ id: string }>(
        `select id::text as id from public.work_orders
          where org_id = app.current_org_id() and id = $1::uuid limit 1`,
        [woId],
      );
      if (woRes.rows.length === 0) return { ok: false, reason: 'not_found' };

      const permEntries = await Promise.all(
        (Object.keys(PERMISSION_STRINGS) as Array<keyof WoActionPermissions>).map(
          async (key) => [key, await hasPermission(pctx, PERMISSION_STRINGS[key])] as const,
        ),
      );
      const permissions = permEntries.reduce((acc, [key, allowed]) => {
        acc[key] = allowed;
        return acc;
      }, {} as WoActionPermissions);

      const executionStatus = await readWoExecutionStatus(pctx, woId);

      const [downtimeRes, wasteRes] = await Promise.all([
        c.query<{ id: string; code: string; name: string }>(
          `select id::text as id, code, name from public.downtime_categories
            where org_id = app.current_org_id() and is_active = true
            order by name asc`,
        ),
        c.query<{ code: string; name: string }>(
          `select code, name from public.waste_categories
            where org_id = app.current_org_id() and is_active = true
            order by name asc`,
        ),
      ]);

      return {
        ok: true,
        data: {
          executionStatus,
          permissions,
          currentUserId: ctx.userId,
          downtimeCategories: downtimeRes.rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
          wasteCategories: wasteRes.rows.map((r) => ({ code: r.code, name: r.name })),
        },
      };
    });
  } catch (error) {
    console.error('[production/wos/:id] action-context read failed:', error);
    return { ok: false, reason: 'error' };
  }
}
