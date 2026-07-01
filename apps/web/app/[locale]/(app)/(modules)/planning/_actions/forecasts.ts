'use server';

/**
 * Wave E6 (second slice) — demand_forecasts CRUD (mig 302: independent demand
 * per (org_id, item_id, iso_week), in the item's BASE UoM). This is the
 * INDEPENDENT-demand seam runMrp can net against later (mrp_runs demand_source
 * = 'forecast', mig 178); this slice owns the editable grid + readers only.
 *
 * DDL grain honoured exactly: one row per (org_id, item_id, iso_week) — upsert
 * via the demand_forecasts_org_item_week_unique key. qty is NUMERIC(18,6) >= 0
 * and travels as a decimal string end-to-end (never a JS float). Quantities are
 * stored in the item's BASE UoM: the caller enters a qty in the item's OUTPUT
 * UoM (output_uom) and we convert to base ONLY via lib/uom (snapshotFromItemRow
 * + toBaseQty) — no ad-hoc arithmetic.
 *
 * RBAC: reads gate on `scheduler.run.read` (the planning READ gate the MRP slice
 * + dashboard use); writes gate on the EXISTING `planning.forecast.manage`
 * permission (seeded live by migration 301 — no enum churn here).
 *
 * All statements run inside withOrgContext as app_user (RLS:
 * org_id = app.current_org_id()); no service-role bypass.
 */
import { z } from 'zod';

import { snapshotFromItemRow, toBaseQty, TypedError } from '../../../../../../lib/uom/convert';
import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  isPgError,
  toIso,
  writeProcurementAudit,
  uuidSchema,
  type OrgActionContext,
  type QueryClient,
} from './procurement-shared';
import {
  searchItems,
  type ItemPickerOption,
  type SearchItemsInput,
} from '../../../../../(npd)/fa/actions/search-items';

/** Same READ gate as runMrp / reorder-thresholds / the planning dashboard. */
const PLANNING_READ_PERMISSION = 'scheduler.run.read';
/** EXISTING write gate (permissions.enum.ts PLANNING_FORECAST_MANAGE; seeded by mig 301). */
const FORECAST_MANAGE_PERMISSION = 'planning.forecast.manage';

/**
 * Forecast item universe — INDEPENDENT (sellable / produced) demand only.
 * fg = finished goods sold to customers; intermediate = sub-assemblies that can
 * carry an independent stocking target. Components (rm/ingredient/packaging) get
 * their demand from the BOM explosion, never an independent forecast.
 */
const FORECAST_ITEM_TYPES = ['fg', 'intermediate'] as const;

/** How many forward ISO-week buckets the grid spans by default. */
const DEFAULT_HORIZON_WEEKS = 12;
const MAX_HORIZON_WEEKS = 52;

export type ForecastError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'uom_conversion_unavailable'
  | 'persistence_failed';

export type ForecastResult<T> = { ok: true; data: T } | { ok: false; error: ForecastError };

/** One stored forecast cell (qty already in base UoM). */
export type ForecastCell = {
  id: string;
  itemId: string;
  isoWeek: string;
  /** Decimal string, mig-302 NUMERIC(18,6), in base UoM. */
  qty: string;
  uom: string;
  source: 'manual' | 'import';
  updatedAt: string;
};

/** One forecasted item with its full row of cells, keyed by ISO-week. */
export type ForecastItemRow = {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uomBase: string | null;
  /** isoWeek -> cell */
  cells: Record<string, ForecastCell>;
};

export type ForecastGrid = {
  /** Forward ISO-week labels the grid renders, oldest-first (e.g. ['2026-W25', …]). */
  weeks: string[];
  rows: ForecastItemRow[];
};

const isoWeekSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-W\d{2}$/);

/** Non-negative quantity, up to 6 dp (mig-302 NUMERIC(18,6) scale). */
const nonNegQtySchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/);

const UpsertForecastInput = z.object({
  itemId: uuidSchema,
  isoWeek: isoWeekSchema,
  /** Entered in the item's OUTPUT UoM; converted to base via lib/uom before write. */
  qty: nonNegQtySchema,
});

export type UpsertForecastInputType = z.input<typeof UpsertForecastInput>;

const ListForecastsInput = z
  .object({ weeks: z.number().int().min(1).max(MAX_HORIZON_WEEKS).optional() })
  .optional();

// ── ISO-8601 week helpers (UTC, no external dep) ────────────────────────────

/** ISO-8601 week-of-year + week-year for a UTC date (Thursday rule). */
function isoWeekOf(date: Date): { year: number; week: number } {
  // Shift to the Thursday of the current ISO week.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: isoYear, week };
}

function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * N forward ISO-week labels starting at the current week (UTC), oldest-first.
 * Module-local (NOT exported): this is a `'use server'` file, which may only
 * export async server actions — a sync export here breaks the production build.
 */
function buildForecastWeeks(count: number, from: Date = new Date()): string[] {
  const weeks: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let i = 0; i < count; i += 1) {
    const { year, week } = isoWeekOf(cursor);
    weeks.push(formatIsoWeek(year, week));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

// ── mappers ──────────────────────────────────────────────────────────────────

type ForecastSqlRow = {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  uom_base: string | null;
  iso_week: string;
  qty: string;
  uom: string;
  source: 'manual' | 'import';
  updated_at: string | Date;
};

function mapCell(row: ForecastSqlRow): ForecastCell {
  return {
    id: row.id,
    itemId: row.item_id,
    isoWeek: row.iso_week,
    qty: String(row.qty),
    uom: row.uom,
    source: row.source,
    updatedAt: toIso(row.updated_at),
  };
}

type ForecastItemMaster = {
  output_uom: string | null;
  uom_base: string | null;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  weight_mode: string | null;
};

/**
 * Convert a caller-entered quantity (in the item's OUTPUT UoM) to the item's
 * BASE UoM, ROUTING THROUGH lib/uom only. Returns a 6-dp decimal string ready
 * for the ::numeric bind. Throws TypedError('uom_conversion_unavailable') when
 * the item lacks the pack factors the requested output unit needs.
 */
function toBaseQtyString(master: ForecastItemMaster, qty: string): string {
  const snap = snapshotFromItemRow(master);
  const base = toBaseQty(snap, Number(qty), snap.outputUom);
  return base.toFixed(6);
}

// ── readers ───────────────────────────────────────────────────────────────────

/**
 * The full forecast grid: the forward ISO-week window (default 12) × every
 * forecast-eligible item that has at least one cell in that window, plus the
 * week labels. Item-code sorted; cells keyed by ISO-week. Read-gated.
 */
export async function listForecasts(weeks?: number): Promise<ForecastResult<ForecastGrid>> {
  const parsed = ListForecastsInput.safeParse(weeks === undefined ? undefined : { weeks });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const horizon = parsed.data?.weeks ?? DEFAULT_HORIZON_WEEKS;
  const weekLabels = buildForecastWeeks(horizon);

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, PLANNING_READ_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const { rows } = await ctx.client.query<ForecastSqlRow>(
        `select f.id, f.item_id, i.item_code, i.name as item_name, i.uom_base,
                f.iso_week, f.qty::text as qty, f.uom, f.source, f.updated_at
           from public.demand_forecasts f
           left join public.items i
             on i.org_id = app.current_org_id() and i.id = f.item_id
          where f.org_id = app.current_org_id()
            and f.iso_week = any($1::text[])
          order by i.item_code asc nulls last, f.iso_week asc`,
        [weekLabels],
      );

      const byItem = new Map<string, ForecastItemRow>();
      for (const row of rows) {
        let item = byItem.get(row.item_id);
        if (!item) {
          item = {
            itemId: row.item_id,
            itemCode: row.item_code,
            itemName: row.item_name,
            uomBase: row.uom_base,
            cells: {},
          };
          byItem.set(row.item_id, item);
        }
        item.cells[row.iso_week] = mapCell(row);
      }

      return {
        ok: true as const,
        data: { weeks: weekLabels, rows: [...byItem.values()] } satisfies ForecastGrid,
      };
    });
  } catch (err) {
    console.error('[planning/forecasts] listForecasts failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── writes ────────────────────────────────────────────────────────────────────

/** Loads the item master fields lib/uom needs; returns null when not a forecast-eligible item. */
async function loadForecastItem(
  ctx: OrgActionContext,
  itemId: string,
): Promise<({ uom_base: string | null } & ForecastItemMaster) | null> {
  const { rows } = await ctx.client.query<{ uom_base: string | null } & ForecastItemMaster>(
    `select i.uom_base, i.output_uom, i.net_qty_per_each::text as net_qty_per_each,
            i.each_per_box::text as each_per_box, i.weight_mode
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $1::uuid
        and i.item_type = any($2::text[])
      limit 1`,
    [itemId, [...FORECAST_ITEM_TYPES]],
  );
  return rows[0] ?? null;
}

async function upsertForecastWith(
  ctx: OrgActionContext,
  source: 'manual' | 'import',
  input: { itemId: string; isoWeek: string; qty: string },
): Promise<ForecastResult<ForecastCell>> {
  const master = await loadForecastItem(ctx, input.itemId);
  if (!master) return { ok: false as const, error: 'not_found' as const };

  let baseQty: string;
  try {
    baseQty = toBaseQtyString(master, input.qty);
  } catch (err) {
    if (err instanceof TypedError) return { ok: false as const, error: 'uom_conversion_unavailable' as const };
    throw err;
  }
  const uom = master.uom_base ?? 'kg';

  const { rows } = await ctx.client.query<ForecastSqlRow>(
    `insert into public.demand_forecasts
       (org_id, item_id, iso_week, qty, uom, source, created_by)
     values
       (app.current_org_id(), $1::uuid, $2, $3::numeric, $4, $5, $6::uuid)
     on conflict on constraint demand_forecasts_org_item_week_unique
     do update set qty = excluded.qty,
                   uom = excluded.uom,
                   source = excluded.source
     returning id, item_id,
               null::text as item_code, null::text as item_name, null::text as uom_base,
               iso_week, qty::text as qty, uom, source, updated_at`,
    [input.itemId, input.isoWeek, baseQty, uom, source, ctx.userId],
  );
  const upserted = rows[0];
  if (!upserted) throw new Error('persistence_failed');

  await writeProcurementAudit(ctx, {
    action: 'planning.demand_forecast.upserted',
    resourceType: 'demand_forecast',
    resourceId: upserted.id,
    afterState: { itemId: input.itemId, isoWeek: input.isoWeek, qty: baseQty, uom, source },
  });

  return { ok: true as const, data: mapCell(upserted) };
}

/**
 * Create-or-update ONE forecast cell (mig-302 unique (org_id, item_id, iso_week)).
 * Validates the item (forecast-eligible types only), converts qty to base UoM via
 * lib/uom, and writes inside the org context. Write-gated on planning.forecast.manage.
 */
export async function upsertForecast(rawInput: unknown): Promise<ForecastResult<ForecastCell>> {
  const parsed = UpsertForecastInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, FORECAST_MANAGE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }
      return await upsertForecastWith(ctx, 'manual', input);
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'not_found' };
    console.error('[planning/forecasts] upsertForecast failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Remove one forecast cell (write-gated; audited). */
export async function deleteForecast(id: string): Promise<ForecastResult<{ id: string }>> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, FORECAST_MANAGE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }
      const { rows } = await ctx.client.query<{ id: string; item_id: string; iso_week: string }>(
        `delete from public.demand_forecasts
          where org_id = app.current_org_id() and id = $1::uuid
          returning id, item_id, iso_week`,
        [parsed.data],
      );
      const deleted = rows[0];
      if (!deleted) return { ok: false as const, error: 'not_found' as const };
      await writeProcurementAudit(ctx, {
        action: 'planning.demand_forecast.deleted',
        resourceType: 'demand_forecast',
        resourceId: deleted.id,
        beforeState: { itemId: deleted.item_id, isoWeek: deleted.iso_week },
      });
      return { ok: true as const, data: { id: deleted.id } };
    });
  } catch (err) {
    console.error('[planning/forecasts] deleteForecast failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export type CopyPreviousWeekResult = ForecastResult<{ copied: number }>;

/**
 * "Copy previous week" — clone every cell of `fromWeek` into `toWeek` for the
 * forecast-eligible items, skipping any item that already has a `toWeek` cell
 * (non-destructive). Qty is already base-UoM, copied verbatim. Write-gated.
 */
export async function copyForecastWeek(rawInput: unknown): Promise<CopyPreviousWeekResult> {
  const schema = z.object({ fromWeek: isoWeekSchema, toWeek: isoWeekSchema });
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { fromWeek, toWeek } = parsed.data;
  if (fromWeek === toWeek) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, FORECAST_MANAGE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }
      const { rows } = await ctx.client.query<{ id: string }>(
        `insert into public.demand_forecasts
           (org_id, item_id, iso_week, qty, uom, source, created_by)
         select app.current_org_id(), src.item_id, $2, src.qty, src.uom, 'manual', $3::uuid
           from public.demand_forecasts src
          where src.org_id = app.current_org_id()
            and src.iso_week = $1
         on conflict on constraint demand_forecasts_org_item_week_unique
         do nothing
         returning id`,
        [fromWeek, toWeek, userId],
      );
      return { ok: true as const, data: { copied: rows.length } };
    });
  } catch (err) {
    console.error('[planning/forecasts] copyForecastWeek failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── CSV import ────────────────────────────────────────────────────────────────

export type CsvImportError = { row: number; reason: string };
export type CsvImportSummary = { imported: number; errors: CsvImportError[] };
export type ImportForecastCsvResult = ForecastResult<CsvImportSummary>;

/** A parsed CSV row: item code + ISO-week + qty (in the item's output UoM). */
const CsvRowInput = z.object({
  itemCode: z.string().trim().min(1).max(80),
  isoWeek: isoWeekSchema,
  qty: nonNegQtySchema,
});

const ImportForecastCsvInput = z.object({
  rows: z.array(CsvRowInput).min(1).max(2000),
});

export type ImportForecastCsvInputType = z.input<typeof ImportForecastCsvInput>;

/**
 * Bulk import forecast cells from parsed CSV rows (item CODE — never UUID — +
 * ISO-week + qty in the item's output UoM). Each row resolves its item against
 * the org items master (forecast-eligible types only), converts qty to base via
 * lib/uom, and upserts (source='import'). Bad rows are collected, not fatal.
 * Write-gated on planning.forecast.manage.
 */
export async function importForecastCsv(rawInput: unknown): Promise<ImportForecastCsvResult> {
  const parsed = ImportForecastCsvInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { rows } = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, FORECAST_MANAGE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // Resolve every distinct item code → id in one query (forecast-eligible only).
      const codes = [...new Set(rows.map((r) => r.itemCode))];
      const { rows: itemRows } = await ctx.client.query<{ id: string; item_code: string }>(
        `select i.id, i.item_code
           from public.items i
          where i.org_id = app.current_org_id()
            and i.item_code = any($1::text[])
            and i.item_type = any($2::text[])`,
        [codes, [...FORECAST_ITEM_TYPES]],
      );
      const idByCode = new Map(itemRows.map((r) => [r.item_code, r.id]));

      const errors: CsvImportError[] = [];
      let imported = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const itemId = idByCode.get(row.itemCode);
        if (!itemId) {
          errors.push({ row: i + 1, reason: 'unknown_item' });
          continue;
        }
        const result = await upsertForecastWith(ctx, 'import', {
          itemId,
          isoWeek: row.isoWeek,
          qty: row.qty,
        });
        if (result.ok) imported += 1;
        else errors.push({ row: i + 1, reason: result.error });
      }

      return { ok: true as const, data: { imported, errors } satisfies CsvImportSummary };
    });
  } catch (err) {
    console.error('[planning/forecasts] importForecastCsv failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── item picker seam ──────────────────────────────────────────────────────────

/** Item picker seam — the org items master restricted to forecast-eligible types. */
export async function searchForecastItems(input: SearchItemsInput = {}): Promise<ItemPickerOption[]> {
  try {
    return await searchItems({ ...input, itemTypes: [...FORECAST_ITEM_TYPES] });
  } catch {
    return [];
  }
}
