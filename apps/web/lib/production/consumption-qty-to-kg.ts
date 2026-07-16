/**
 * Converts wo_material_consumption rows to kg for yield / mass-balance gates.
 * Mass UoMs (kg/g/lb/…) resolve via unit_of_measure.factor_to_base; item master
 * handles base/each/box. Exact NUMERIC — no JS float in the SQL path.
 */

/** Per-row CASE; requires aliases c, i (items), uom_mass (unit_of_measure). */
export const CONSUMPTION_ROW_QTY_KG_CASE = `
  case
    when lower(c.uom) = 'kg' then c.qty_consumed::numeric
    when lower(c.uom) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then c.qty_consumed::numeric
    when lower(c.uom) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg'
      then c.qty_consumed::numeric
    when lower(c.uom) in ('each', 'pcs', 'szt', 'ea') and i.net_qty_per_each is not null
      then c.qty_consumed::numeric * i.net_qty_per_each
    when lower(c.uom) = 'box'
      and i.net_qty_per_each is not null
      and i.each_per_box is not null
      then c.qty_consumed::numeric * i.each_per_box::numeric * i.net_qty_per_each
    when uom_mass.factor_to_base is not null and uom_mass.category = 'mass'
      then c.qty_consumed::numeric * uom_mass.factor_to_base
    when lower(c.uom) = 'lb' then c.qty_consumed::numeric * 0.45359237
    else null
  end`;

/**
 * Scalar subquery: sum of posted consumption for a WO in kg.
 * @param woIdSqlParam SQL parameter reference (e.g. `$1`)
 */
export function woPostedConsumptionKgSubquery(woIdSqlParam: string): string {
  return `coalesce(
    (
      select sum(conv.row_kg)
        from (
          select ${CONSUMPTION_ROW_QTY_KG_CASE} as row_kg
            from public.wo_material_consumption c
            left join public.items i
              on i.org_id = c.org_id
             and i.id = c.component_id
            left join public.unit_of_measure uom_mass
              on uom_mass.org_id = c.org_id
             and lower(uom_mass.code) = lower(c.uom)
             and uom_mass.category = 'mass'
             and uom_mass.deleted_at is null
           where c.org_id = app.current_org_id()
             and c.wo_id = ${woIdSqlParam}::uuid
        ) conv
       where conv.row_kg is not null
    ),
    0::numeric
  )`;
}
