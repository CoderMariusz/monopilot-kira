/**
 * T-031 — Catch-weight variance nightly computation (PRD §8.1, §8.5, §8.6).
 *
 * Pure, org-scoped variance roll-up used by the cron route
 * `POST /api/internal/cron/catch-weight-variance`. For a target day it:
 *   1. reads per-unit weight captures from public.work_order_items (READ-ONLY —
 *      08-PRODUCTION canonical source, PRD §8.3) joined to public.items, keeping
 *      ONLY catch-weight items (items.weight_mode='catch'); fixed-weight items
 *      are skipped (no rows produced),
 *   2. computes per-(item,site) avg variance% vs nominal, stddev, and sample count
 *      (variance% = avg( abs(actual-nominal)/nominal ) * 100),
 *   3. upserts one row per (org,item,site,day) into catch_weight_variance_daily,
 *   4. emits a 'catch_weight.variance_exceeded' outbox event (same txn) when the
 *      item's avg variance% exceeds the org threshold
 *      (Reference.AlertThresholds catch_weight_variance_pct, default 5%).
 *
 * Red lines honoured (T-031):
 *   - work_order_items is READ-ONLY here (never written/modified).
 *   - org_id scope (Wave0); every query runs under the caller's active org
 *     context, so RLS does the isolation. No tenant_id, no current_setting.
 *   - Outbox INSERT is in the SAME transaction as the results upsert.
 *   - FG canonical — no legacy FA aliases.
 *   - D365 never the system of record; no D365 hard FK.
 *
 * No I/O / no clock of its own — the caller (cron route) opens the txn, sets org
 * context, and passes the target day. Graceful no-op on empty input (AC4).
 */
import type pg from 'pg';

export const CATCH_WEIGHT_VARIANCE_APP_VERSION = 'technical-catch-weight-variance-v1';
export const CATCH_WEIGHT_VARIANCE_EVENT = 'catch_weight.variance_exceeded' as const;
const DEFAULT_THRESHOLD_PCT = 5;

export interface CatchWeightVarianceRow {
  itemId: string;
  siteId: string | null;
  day: string; // YYYY-MM-DD
  avgVariancePct: number;
  stddev: number | null;
  samples: number;
  thresholdPct: number;
  alerted: boolean;
}

export type CatchWeightSkippedSample = {
  itemId: string;
  siteId: string | null;
  reason: 'missing_nominal' | 'zero_nominal';
};

export interface CatchWeightVarianceSummary {
  day: string;
  itemsProcessed: number;
  rowsWritten: number;
  alertsEmitted: number;
  skipped: CatchWeightSkippedSample[];
  rows: CatchWeightVarianceRow[];
}

/** Resolve the org catch-weight variance threshold (percent). Default 5%. */
export async function resolveCatchWeightThresholdPct(client: pg.PoolClient, orgId: string): Promise<number> {
  const { rows } = await client.query<{ value_int: number | null }>(
    `select value_int
       from "Reference"."AlertThresholds"
      where org_id = $1::uuid and threshold_key = 'catch_weight_variance_pct'`,
    [orgId],
  );
  const v = rows[0]?.value_int;
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_THRESHOLD_PCT;
}

/**
 * Compute + persist catch-weight variance for `orgId` over `day` (YYYY-MM-DD).
 * Must run inside an open transaction with org context already set.
 */
export async function computeCatchWeightVarianceForOrg(
  client: pg.PoolClient,
  orgId: string,
  day: string,
): Promise<CatchWeightVarianceSummary> {
  const thresholdPct = await resolveCatchWeightThresholdPct(client, orgId);

  const { rows: skippedRows } = await client.query<{
    item_id: string;
    site_id: string | null;
    skip_reason: 'missing_nominal' | 'zero_nominal';
  }>(
    `with weighings as (
       select
         woi.item_id,
         woi.site_id,
         coalesce(woi.nominal_weight, item_row.nominal_weight) as nominal_weight
       from public.work_order_items woi
       join public.items item_row on item_row.id = woi.item_id and item_row.org_id = woi.org_id
       where woi.org_id = $1::uuid
         and item_row.weight_mode = 'catch'
         and woi.actual_weight is not null
         and woi.captured_at >= $2::date
         and woi.captured_at <  ($2::date + interval '1 day')
     )
     select distinct
       weighings.item_id,
       weighings.site_id,
       case
         when weighings.nominal_weight is null then 'missing_nominal'::text
         else 'zero_nominal'::text
       end as skip_reason
     from weighings
     where weighings.nominal_weight is null or weighings.nominal_weight <= 0`,
    [orgId, day],
  );

  const skipped: CatchWeightSkippedSample[] = skippedRows.map((row) => ({
    itemId: row.item_id,
    siteId: row.site_id,
    reason: row.skip_reason,
  }));

  const { rows: agg } = await client.query<{
    item_id: string;
    site_id: string | null;
    samples: string;
    avg_variance_pct: string | null;
    stddev: string | null;
  }>(
    `with weighings as (
       select
         woi.item_id,
         woi.site_id,
         coalesce(woi.nominal_weight, item_row.nominal_weight) as nominal_weight,
         woi.actual_weight as actual_weight
       from public.work_order_items woi
       join public.items item_row on item_row.id = woi.item_id and item_row.org_id = woi.org_id
       where woi.org_id = $1::uuid
         and item_row.weight_mode = 'catch'
         and woi.actual_weight is not null
         and woi.captured_at >= $2::date
         and woi.captured_at <  ($2::date + interval '1 day')
     ),
     scored as (
       select
         weighings.item_id,
         weighings.site_id,
         weighings.actual_weight,
         weighings.nominal_weight,
         abs(weighings.actual_weight - weighings.nominal_weight) / weighings.nominal_weight * 100.0 as variance_pct
       from weighings
       where weighings.nominal_weight is not null and weighings.nominal_weight > 0
     )
     select
       scored.item_id,
       scored.site_id,
       count(*) as samples,
       avg(scored.variance_pct) as avg_variance_pct,
       stddev_samp(scored.variance_pct) as stddev
     from scored
     group by scored.item_id, scored.site_id`,
    [orgId, day],
  );

  const rows: CatchWeightVarianceRow[] = [];
  let alertsEmitted = 0;

  for (const r of agg) {
    const samples = Number.parseInt(r.samples, 10);
    if (!Number.isFinite(samples) || samples <= 0) continue;

    const avgVariancePct = r.avg_variance_pct === null ? 0 : Number(r.avg_variance_pct);
    const stddev = r.stddev === null ? null : Number(r.stddev);
    const alerted = avgVariancePct > thresholdPct;

    await client.query(
      `insert into public.catch_weight_variance_daily
         (org_id, site_id, item_id, day, avg_variance_pct, stddev, samples, threshold_pct, alerted)
       values ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::numeric, $6::numeric, $7::int, $8::numeric, $9::boolean)
       on conflict (org_id, item_id, site_id, day) do update set
         avg_variance_pct = excluded.avg_variance_pct,
         stddev           = excluded.stddev,
         samples          = excluded.samples,
         threshold_pct    = excluded.threshold_pct,
         alerted          = excluded.alerted,
         computed_at      = pg_catalog.now()`,
      [orgId, r.site_id, r.item_id, day, avgVariancePct, stddev, samples, thresholdPct, alerted],
    );

    if (alerted) {
      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4, $5::jsonb, $6)`,
        [
          orgId,
          CATCH_WEIGHT_VARIANCE_EVENT,
          'catch_weight_variance',
          r.item_id,
          JSON.stringify({
            item_id: r.item_id,
            site_id: r.site_id,
            day,
            avg_variance_pct: avgVariancePct,
            threshold_pct: thresholdPct,
            samples,
          }),
          CATCH_WEIGHT_VARIANCE_APP_VERSION,
        ],
      );
      alertsEmitted += 1;
    }

    rows.push({
      itemId: r.item_id,
      siteId: r.site_id,
      day,
      avgVariancePct,
      stddev,
      samples,
      thresholdPct,
      alerted,
    });
  }

  return {
    day,
    itemsProcessed: agg.length,
    rowsWritten: rows.length,
    alertsEmitted,
    skipped,
    rows,
  };
}
