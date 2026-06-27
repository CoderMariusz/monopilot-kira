'use server';

/**
 * Lane A1 — 03-technical Item Detail: deferred-tab Server loaders (TEC-012).
 *
 * Org-scoped reads of the per-tab backing tables under withOrgContext + RLS
 * (`app.current_org_id()`). No service-role bypass, no hardcoded/mock data — every
 * read hits real Supabase. Each loader returns a discriminated `state` so the RSC
 * can render loading/empty/error/ready without leaking a raw stack.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:1074-1369
 *   (`ProductDetailScreen`) — the BOMs / Costing / Routing / Lab Results / D365
 *   tab panels. Allergens has its own loader (allergen-profile.ts).
 *
 * Query-fix notes (the "Unable to load" root-cause class on this module):
 *   - bom_headers.item_id is the items.id UUID FK. BOM versions still accept the
 *     route item_code, resolve it to items.id, and keep returning code strings.
 *   - routings / item_cost_history / lab_results key on items.id (uuid) — resolve
 *     the uuid from item_code first, then read by item_id.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/shared';

/** Resolve the item uuid + name from its org-natural code, or null when absent. */
async function resolveItem(
  ctx: OrgActionContext,
  itemCode: string,
): Promise<{ id: string; name: string } | null> {
  const { rows } = await ctx.client.query<{ id: string; name: string }>(
    `select id, name from public.items
      where org_id = app.current_org_id() and item_code = $1 limit 1`,
    [itemCode],
  );
  return rows[0] ?? null;
}

async function run<T>(fn: (ctx: OrgActionContext) => Promise<T>, onError: T): Promise<T> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) =>
      fn({ userId, orgId, client: client as QueryClient }),
    );
  } catch (error) {
    console.error('[technical/items] tab-data load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return onError;
  }
}

// ── BOM versions tab ──────────────────────────────────────────────────────────
export type BomVersionRow = {
  id: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lineCount: number;
};

export type BomTabData = {
  state: 'ready' | 'empty' | 'error';
  versions: BomVersionRow[];
};

export async function loadBomTab(itemCode: string): Promise<BomTabData> {
  return run<BomTabData>(async (ctx) => {
    const item = await resolveItem(ctx, itemCode);
    if (!item) return { state: 'empty', versions: [] };

    const { rows } = await ctx.client.query<{
      id: string;
      version: number;
      status: string;
      effective_from: string | Date | null;
      effective_to: string | Date | null;
      approved_by: string | null;
      approved_at: string | Date | null;
      line_count: string | number;
    }>(
      // bom_headers.item_id is the items.id FK; itemCode remains the route/API code string.
      `select bh.id, bh.version, bh.status, bh.effective_from, bh.effective_to,
              bh.approved_by, bh.approved_at,
              (select count(*) from public.bom_lines bl
                where bl.bom_header_id = bh.id and bl.org_id = bh.org_id) as line_count
         from public.bom_headers bh
        where bh.org_id = app.current_org_id()
          and bh.item_id = (
            select i.id
              from public.items i
             where i.org_id = app.current_org_id()
               and i.item_code = $1
          )
        order by bh.version desc`,
      [itemCode],
    );

    const versions: BomVersionRow[] = rows.map((r) => ({
      id: String(r.id),
      version: Number(r.version),
      status: r.status,
      effectiveFrom: toIso(r.effective_from),
      effectiveTo: toIso(r.effective_to),
      approvedBy: r.approved_by ? String(r.approved_by) : null,
      approvedAt: toIso(r.approved_at),
      lineCount: Number(r.line_count) || 0,
    }));

    return { state: versions.length ? 'ready' : 'empty', versions };
  }, { state: 'error', versions: [] });
}

// ── Cost history tab ──────────────────────────────────────────────────────────
export type CostHistoryRow = {
  id: string;
  costPerKg: string; // NUMERIC-exact string, never a float
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  source: string | null;
};

export type CostTabData = {
  state: 'ready' | 'empty' | 'error';
  current: { costPerKg: string | null; currency: string; effectiveFrom: string | null } | null;
  history: CostHistoryRow[];
};

export async function loadCostTab(itemCode: string): Promise<CostTabData> {
  return run<CostTabData>(async (ctx) => {
    const item = await resolveItem(ctx, itemCode);
    if (!item) return { state: 'empty', current: null, history: [] };

    const { rows } = await ctx.client.query<{
      id: string;
      cost_per_kg: string;
      currency: string;
      effective_from: string | Date | null;
      effective_to: string | Date | null;
      source: string | null;
    }>(
      // cost_per_kg stays a NUMERIC string end-to-end — no float coercion.
      `select id, cost_per_kg, currency, effective_from, effective_to, source
         from public.item_cost_history
        where org_id = app.current_org_id() and item_id = $1::uuid
        order by effective_from desc, created_at desc`,
      [item.id],
    );

    const history: CostHistoryRow[] = rows.map((r) => ({
      id: String(r.id),
      costPerKg: String(r.cost_per_kg),
      currency: String(r.currency).trim(),
      effectiveFrom: toIso(r.effective_from),
      effectiveTo: toIso(r.effective_to),
      source: r.source,
    }));

    // The "current" cost is the open row (effective_to is null) or the newest.
    const open = history.find((h) => h.effectiveTo === null) ?? history[0] ?? null;
    const current = open
      ? { costPerKg: open.costPerKg, currency: open.currency, effectiveFrom: open.effectiveFrom }
      : null;

    return { state: history.length ? 'ready' : 'empty', current, history };
  }, { state: 'error', current: null, history: [] });
}

// ── Routing tab ───────────────────────────────────────────────────────────────
export type RoutingVersionRow = {
  id: string;
  version: number;
  status: string;
  effectiveFrom: string | null;
  approvedAt: string | null;
  operationCount: number;
  totalSetupMin: number;
};

export type RoutingTabData = {
  state: 'ready' | 'empty' | 'error';
  routings: RoutingVersionRow[];
};

export async function loadRoutingTab(itemCode: string): Promise<RoutingTabData> {
  return run<RoutingTabData>(async (ctx) => {
    const item = await resolveItem(ctx, itemCode);
    if (!item) return { state: 'empty', routings: [] };

    const { rows } = await ctx.client.query<{
      id: string;
      version: number;
      status: string;
      effective_from: string | Date | null;
      approved_at: string | Date | null;
      op_count: string | number;
      setup_sum: string | number | null;
    }>(
      `select r.id, r.version, r.status, r.effective_from, r.approved_at,
              (select count(*) from public.routing_operations ro
                where ro.routing_id = r.id and ro.org_id = r.org_id) as op_count,
              (select coalesce(sum(ro.setup_time_min), 0) from public.routing_operations ro
                where ro.routing_id = r.id and ro.org_id = r.org_id) as setup_sum
         from public.routings r
        where r.org_id = app.current_org_id() and r.item_id = $1::uuid
        order by r.version desc`,
      [item.id],
    );

    const routings: RoutingVersionRow[] = rows.map((r) => ({
      id: String(r.id),
      version: Number(r.version),
      status: r.status,
      effectiveFrom: toIso(r.effective_from),
      approvedAt: toIso(r.approved_at),
      operationCount: Number(r.op_count) || 0,
      totalSetupMin: Number(r.setup_sum) || 0,
    }));

    return { state: routings.length ? 'ready' : 'empty', routings };
  }, { state: 'error', routings: [] });
}

// ── Lab results tab (read-only; Quality-owned) ────────────────────────────────
export type LabResultRow = {
  id: string;
  testType: string;
  resultValue: string | null;
  resultUnit: string | null;
  resultStatus: string;
  testedAt: string | null;
  labProvider: string | null;
};

export type LabTabData = {
  state: 'ready' | 'empty' | 'error';
  results: LabResultRow[];
};

export async function loadLabTab(itemCode: string): Promise<LabTabData> {
  return run<LabTabData>(async (ctx) => {
    const item = await resolveItem(ctx, itemCode);
    if (!item) return { state: 'empty', results: [] };

    const { rows } = await ctx.client.query<{
      id: string;
      test_type: string;
      result_value: string | null;
      result_unit: string | null;
      result_status: string;
      tested_at: string | Date | null;
      lab_provider: string | null;
    }>(
      `select id, test_type, result_value, result_unit, result_status, tested_at, lab_provider
         from public.lab_results
        where org_id = app.current_org_id() and item_id = $1::uuid
        order by tested_at desc nulls last, created_at desc
        limit 50`,
      [item.id],
    );

    const results: LabResultRow[] = rows.map((r) => ({
      id: String(r.id),
      testType: r.test_type,
      resultValue: r.result_value === null ? null : String(r.result_value),
      resultUnit: r.result_unit,
      resultStatus: r.result_status,
      testedAt: toIso(r.tested_at),
      labProvider: r.lab_provider,
    }));

    return { state: results.length ? 'ready' : 'empty', results };
  }, { state: 'error', results: [] });
}

// ── D365 status tab ───────────────────────────────────────────────────────────
export type D365TabData = {
  state: 'ready' | 'error';
  d365ItemId: string | null;
  syncStatus: string | null;
  lastSyncAt: string | null;
};

export async function loadD365Tab(itemCode: string): Promise<D365TabData> {
  return run<D365TabData>(async (ctx) => {
    const { rows } = await ctx.client.query<{
      d365_item_id: string | null;
      d365_sync_status: string | null;
      d365_last_sync_at: string | Date | null;
    }>(
      `select d365_item_id, d365_sync_status, d365_last_sync_at
         from public.items
        where org_id = app.current_org_id() and item_code = $1 limit 1`,
      [itemCode],
    );
    const row = rows[0];
    return {
      state: 'ready',
      d365ItemId: row?.d365_item_id ?? null,
      syncStatus: row?.d365_sync_status ?? null,
      lastSyncAt: toIso(row?.d365_last_sync_at ?? null),
    };
  }, { state: 'error', d365ItemId: null, syncStatus: null, lastSyncAt: null });
}

function toIso(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
