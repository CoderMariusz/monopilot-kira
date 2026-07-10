/**
 * Shared SQL fragments for BOM material cost roll-ups (recipe + portfolio).
 * Suppresses invalid cross-currency sums — no FX table exists (Wave 10 / option a).
 */

export const MIXED_CURRENCY_ROLLUP_MARKER = 'mixed_currency';

const ITEM_MATCH_ON = `
          on ci.org_id = app.current_org_id()
         and (
           (bl.item_id is not null and ci.id = bl.item_id)
           or (bl.item_id is null and ci.item_code = bl.component_code)
         )`;

const BOM_LINE_COST_JOIN = `
   from public.bom_lines bl
   left join public.items ci
          ${ITEM_MATCH_ON}
   left join public.v_item_effective_cost vec on vec.item_id = ci.id
  where bl.org_id = app.current_org_id()
    and bl.bom_header_id = bh.id
    and vec.amount is not null`;

/** Total material cost — null when component currencies differ (no bogus sum). */
export function bomMaterialTotalSql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then null
             else sum(bl.quantity * vec.amount)::text
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
  where bl.org_id = app.current_org_id()
    and bl.bom_header_id = lb.id
    and vec.amount is not null`;

export function portfolioMaterialTotalSql(): string {
  return `(select case
             when count(distinct vec.currency) > 1 then null
             else sum(bl.quantity * vec.amount)::text
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
