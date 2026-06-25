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

/**
 * Shift option for the Waste-modal shift dropdown. `code` is the value submitted
 * as `shift_id`; `name` is the display label from the org shift catalog.
 */
export type WoShiftOption = { code: string; name: string };
/** Production line option for the Pause-modal line dropdown (public.production_lines). */
export type WoLineOption = { id: string; code: string };

/**
 * Fallback shift enum used only when the org has not configured shift_configs yet.
 */
// Module-local (NOT exported): this is a `'use server'` file, which may only
// export async functions — a const export here breaks the production build.
// The shift options reach the client via the returned `shifts` list, not this const.
const WO_SHIFT_CODES = ['morning', 'afternoon', 'night'] as const;

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

async function readWoShiftOptions(client: QueryClient, orgId: string): Promise<WoShiftOption[]> {
  const shiftRes = await client.query<WoShiftOption>(
    `select shift_id as code, shift_label as name
       from public.shift_configs
      where org_id = $1::uuid
        and is_active = true
      order by sort_order asc nulls last, shift_label asc`,
    [orgId],
  );

  if (shiftRes.rows.length > 0) return shiftRes.rows.map((r) => ({ code: r.code, name: r.name }));

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[production/wos] no active shift_configs found; falling back to default WO shifts');
  }

  return WO_SHIFT_CODES.map((code) => ({ code, name: code }));
}

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
  /**
   * Shift options for the Waste-modal shift dropdown (still MANDATORY — only the
   * entry method changes from free text to a picker). Stable codes; the page maps
   * each to its localized label. Same source the scanner login uses.
   */
  shifts: WoShiftOption[];
  /**
   * The org's production lines for the Pause-modal line dropdown (still MANDATORY).
   * Always populated so a line can be chosen even when the WO has none assigned.
   */
  lines: WoLineOption[];
  /** The WO's assigned production line id — preselected in the Pause dropdown (null ⇒ none). */
  lineId: string | null;
  /** The WO's assigned production line code (display only; null ⇒ none). */
  lineCode: string | null;
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

/** List-level slice: RBAC + downtime categories + line/shift options (no per-WO status). */
export type WoListActionContextData = {
  permissions: WoActionPermissions;
  downtimeCategories: WoReasonCategory[];
  /** Shift options for the per-row Pause modal (same fixed enum as the detail). */
  shifts: WoShiftOption[];
  /** Org production lines for the per-row Pause modal line dropdown. */
  lines: WoLineOption[];
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

      const [downtimeRes, linesRes, shifts] = await Promise.all([
        c.query<{ id: string; code: string; name: string }>(
          `select id::text as id, code, name from public.downtime_categories
            where org_id = app.current_org_id() and is_active = true
            order by name asc`,
        ),
        c.query<{ id: string; code: string }>(
          `select pl.id::text as id, pl.code
             from public.production_lines pl
            where pl.org_id = app.current_org_id()
              and coalesce(pl.status, 'active') <> 'archived'
            order by pl.code asc
            limit 200`,
        ),
        readWoShiftOptions(c, ctx.orgId),
      ]);

      return {
        ok: true,
        data: {
          permissions,
          downtimeCategories: downtimeRes.rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
          shifts,
          lines: linesRes.rows.map((r) => ({ id: r.id, code: r.code })),
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

      // WO existence (RLS-scoped) — a missing / cross-org id is not_found. Also
      // pull the WO's assigned line (joined to production_lines for the code) so
      // the Pause-modal line dropdown can preselect it.
      const woRes = await c.query<{
        id: string;
        line_id: string | null;
        line_code: string | null;
      }>(
        `select w.id::text as id,
                w.production_line_id::text as line_id,
                pl.code as line_code
           from public.work_orders w
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where w.org_id = app.current_org_id() and w.id = $1::uuid
          limit 1`,
        [woId],
      );
      if (woRes.rows.length === 0) return { ok: false, reason: 'not_found' };
      const woRow = woRes.rows[0];

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

      const [downtimeRes, wasteRes, linesRes, shifts] = await Promise.all([
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
        c.query<{ id: string; code: string }>(
          `select pl.id::text as id, pl.code
             from public.production_lines pl
            where pl.org_id = app.current_org_id()
              and coalesce(pl.status, 'active') <> 'archived'
            order by pl.code asc
            limit 200`,
        ),
        readWoShiftOptions(c, ctx.orgId),
      ]);

      return {
        ok: true,
        data: {
          executionStatus,
          permissions,
          currentUserId: ctx.userId,
          downtimeCategories: downtimeRes.rows.map((r) => ({ id: r.id, code: r.code, name: r.name })),
          wasteCategories: wasteRes.rows.map((r) => ({ code: r.code, name: r.name })),
          shifts,
          lines: linesRes.rows.map((r) => ({ id: r.id, code: r.code })),
          lineId: woRow.line_id,
          lineCode: woRow.line_code,
        },
      };
    });
  } catch (error) {
    console.error('[production/wos/:id] action-context read failed:', error);
    return { ok: false, reason: 'error' };
  }
}
