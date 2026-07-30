/**
 * Production dashboard SQL literals.
 *
 * Kept outside `'use server'` modules so pg integration tests can import the
 * exact query text executed on /production without duplicating literals.
 */

/**
 * Site scope for work_orders-driven reads — mirrors
 * `list-work-orders.ts` (`$1::uuid is null or coalesce(w.site_id, pl.site_id) = $1`)
 * and `mrp.ts` demand reads, but binds via `withSiteContext` →
 * `app.current_site_id()`. `current_site_id() is null` = All sites.
 */
export const PRODUCTION_DASHBOARD_SITE_WO_PREDICATE =
  '(app.current_site_id() is null or coalesce(w.site_id, pl.site_id) = app.current_site_id())';

/**
 * Site scope for rows that carry their own nullable `site_id` (forecasts/thresholds
 * campaign semantics) — org-wide rows (`site_id is null`) stay visible from every
 * site picker choice.
 */
export function productionDashboardSiteRowPredicate(alias: string): string {
  return `(app.current_site_id() is null or ${alias}.site_id is null or ${alias}.site_id = app.current_site_id())`;
}

/**
 * WO list for SCR-08-01. The lateral `produced.qty_kg` must stay numeric so
 * `progress_pct` can divide by `work_orders.planned_quantity` (numeric).
 * Cast to text only in the output alias (`produced_quantity`).
 *
 * The lateral is restricted to outputs denominated in the WO's own unit: `qty_kg` is a
 * legacy column name holding the quantity in whatever unit `wo_outputs.uom` names, and
 * `planned_quantity` is in `work_orders.uom`. Without the filter a 500-pcs by-product on
 * a kg WO inflated produced_quantity and progress_pct one-for-one (U1).
 */
export const PRODUCTION_DASHBOARD_WO_LIST_SQL = `select w.id::text as id,
                w.wo_number,
                coalesce(
                  e.status,
                  case w.status
                    when 'RELEASED' then 'planned'
                    when 'IN_PROGRESS' then 'in_progress'
                    when 'ON_HOLD' then 'paused'
                    when 'COMPLETED' then 'completed'
                    when 'CLOSED' then 'closed'
                    when 'CANCELLED' then 'cancelled'
                    else 'planned'
                  end
                ) as status,
                w.production_line_id::text as production_line_id,
                pl.code as line_code,
                w.product_id::text as product_id,
                i.item_code,
                i.name as product_name,
                w.planned_quantity::text as planned_quantity,
                produced.qty_kg::text as produced_quantity,
                case
                  when coalesce(w.planned_quantity, 0) > 0
                    then least(100::numeric, round(produced.qty_kg / w.planned_quantity * 100, 0))
                  else null
                end as progress_pct,
                (w.allergen_profile_snapshot is not null) as has_allergen,
                w.over_production_flagged
           from public.work_orders w
           left join public.wo_executions e
             on e.wo_id = w.id and e.org_id = w.org_id
           left join public.items i
             on i.org_id = w.org_id and i.id = w.product_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
           left join lateral (
             select coalesce(sum(o.qty_kg), 0) as qty_kg
               from public.wo_outputs o
              where o.wo_id = w.id
                and o.org_id = app.current_org_id()
                and lower(coalesce(nullif(trim(o.uom), ''), 'kg'))
                    = lower(coalesce(nullif(trim(w.uom), ''), 'kg'))
           ) produced on true
          where w.org_id = app.current_org_id()
            and w.status in ('RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}
          order by w.scheduled_start_time desc nulls last, e.created_at desc nulls last
          limit 25`;

/** Regression fixture: lateral qty_kg cast to text reproduces production 42883. */
export const PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL =
  PRODUCTION_DASHBOARD_WO_LIST_SQL.replace(
    'coalesce(sum(o.qty_kg), 0) as qty_kg',
    'coalesce(sum(o.qty_kg), 0)::text as qty_kg',
  );
