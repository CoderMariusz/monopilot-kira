/**
 * Shared SQL fragments for BOM material cost roll-ups (recipe + portfolio).
 * Suppresses invalid cross-currency sums — no FX table exists (Wave 10 / option a).
 *
 * Intermediate/WIP components resolve via v_item_effective_cost (cost_history →
 * supplier → list → wip_computed from ACTIVE BOM + npd_wip_processes labour per
 * mig 491). Portfolio list stays FG-only by product decision — roll-up correctness
 * for WIPs is in the recipe BOM total, not the portfolio catalogue.
 *
 * Loss factors are intentionally excluded: the Σ uses BOM net quantities only. bom_lines.scrap_pct inflates WO/MRP consumption
 * (qty ÷ (1 − scrap/100), mig 393); packaging_components.waste_pct inflates NPD
 * waterfall packaging (qty × cost × (1 + waste/100), D41/mig 427). Those are
 * separate concerns — do not fold scrap_pct or waste_pct into this standard rollup.
 */

export const MIXED_CURRENCY_ROLLUP_MARKER = 'mixed_currency';

const ITEM_MATCH_ON = `
          on ci.org_id = app.current_org_id()
         and (
           (bl.item_id is not null and ci.id = bl.item_id)
           or (bl.item_id is null and ci.item_code = bl.component_code)
         )`;

/**
 * UoM catalogue joins required by BOM_LINE_BASE_QTY_SQL. Aliases `bl` (bom_lines)
 * and `ci` (component item) must already be in scope.
 */
export const BOM_LINE_UOM_JOIN = `
   left join public.unit_of_measure line_uom
          on line_uom.org_id = ci.org_id
         and lower(line_uom.code) = lower(btrim(bl.uom))
         and line_uom.deleted_at is null
   left join public.unit_of_measure base_uom
          on base_uom.org_id = ci.org_id
         and lower(base_uom.code) = lower(btrim(ci.uom_base))
         and base_uom.deleted_at is null`;

/**
 * BOM line quantity reduced to the COMPONENT ITEM'S BASE UoM — NULL when no
 * defensible factor exists.
 *
 * `v_item_effective_cost.amount` is quoted per the component's base unit
 * (item_cost_history.cost_per_kg for a kg-based item, a per-piece price for a
 * pcs-based one). `bom_lines.quantity` is denominated in `bom_lines.uom`, which
 * is free to differ — spices are dosed in grams. Multiplying the two directly
 * inflated every such line by the unit factor: 200 g at 5.00/kg booked 1000.00
 * instead of 1.00, on every recipe containing a non-base-unit ingredient.
 *
 * The branches mirror `normalizeItemQuantityToBase` (apps/web/lib/uom/convert.ts)
 * exactly, in the same order, and treat the item master as the allow-list. That
 * helper is the committed reference, but it is async and costs one query per
 * item, so it cannot drive an aggregate roll-up over a whole FG portfolio. The
 * two are pinned together by __tests__/recipe-cost-uom.pg.test.ts, which runs
 * the same fixture through both.
 *
 * NULL is deliberate and load-bearing: an unconvertible line must surface as
 * `uncosted` on the screen, never as a silent factor of 1. A believable wrong
 * number is worse than the absurd one it replaced — nobody audits 30.00.
 *
 * Rounded to 6 dp = the micro-6 scale used everywhere else in the repo
 * (lib/shared/decimal.ts) and the scale of bom_lines.quantity itself. All
 * arithmetic stays in Postgres NUMERIC; nothing round-trips through a JS float.
 */
export const BOM_LINE_BASE_QTY_SQL = `round(case
             when lower(btrim(bl.uom)) = lower(btrim(ci.uom_base)) then bl.quantity
             when lower(btrim(bl.uom)) in ('pcs', 'each', 'ea', 'szt')
                  and ci.output_uom in ('each', 'box')
                  and ci.net_qty_per_each is not null
               then bl.quantity * ci.net_qty_per_each
             when lower(btrim(bl.uom)) = 'box'
                  and ci.output_uom = 'box'
                  and ci.net_qty_per_each is not null
                  and ci.each_per_box is not null
               then bl.quantity * ci.net_qty_per_each * ci.each_per_box::numeric
             when lower(btrim(bl.uom)) = lower(btrim(ci.uom_secondary))
                  and line_uom.category = base_uom.category
                  and line_uom.factor_to_base is not null
                  and base_uom.factor_to_base > 0
               then bl.quantity * line_uom.factor_to_base / base_uom.factor_to_base
             else null
           end, 6)`;

const BOM_LINE_COST_JOIN = `
   from public.bom_lines bl
   left join public.items ci
          ${ITEM_MATCH_ON}
   left join public.v_item_effective_cost vec on vec.item_id = ci.id
   ${BOM_LINE_UOM_JOIN}
  where bl.org_id = app.current_org_id()
    and bl.bom_header_id = bh.id
    and vec.amount is not null
    and ${BOM_LINE_BASE_QTY_SQL} is not null`;

/** Total material cost — null when component currencies differ (no bogus sum). */
export function bomMaterialTotalSql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then null
             else sum(${BOM_LINE_BASE_QTY_SQL} * vec.amount)::text
           end
           ${BOM_LINE_COST_JOIN})`;
}

/** Roll-up currency — mixed_currency when components use more than one currency. */
export function bomMaterialCurrencySql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then '${MIXED_CURRENCY_ROLLUP_MARKER}'
             else max(vec.currency)
           end
           ${BOM_LINE_COST_JOIN})`;
}

/** Portfolio variant: latest_bom CTE alias is lb.id instead of bh.id. */
const PORTFOLIO_BOM_LINE_COST_JOIN = `
   from public.bom_lines bl
   left join public.items ci
          ${ITEM_MATCH_ON}
   left join public.v_item_effective_cost vec on vec.item_id = ci.id
   ${BOM_LINE_UOM_JOIN}
  where bl.org_id = app.current_org_id()
    and bl.bom_header_id = lb.id
    and vec.amount is not null
    and ${BOM_LINE_BASE_QTY_SQL} is not null`;

export function portfolioMaterialTotalSql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then null
             else sum(${BOM_LINE_BASE_QTY_SQL} * vec.amount)::text
           end
           ${PORTFOLIO_BOM_LINE_COST_JOIN})`;
}

export function portfolioMaterialCurrencySql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then '${MIXED_CURRENCY_ROLLUP_MARKER}'
             else max(vec.currency)
           end
           ${PORTFOLIO_BOM_LINE_COST_JOIN})`;
}
