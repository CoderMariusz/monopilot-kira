type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type UnCostedConsumptionLine = {
  consumptionId: string;
  componentId: string;
  qty: string;
  uom: string;
};

export type OutputWacResolution =
  | {
      applied: true;
      deltaQtyKg: string;
      deltaValue: string;
      costPerKg: string;
      source: 'wo_computed' | 'standard';
    }
  | { applied: false; excluded: 'un_costed'; unCostedLines: UnCostedConsumptionLine[] };

type WoOutputCostBasisRow = {
  material_cost: string;
  prior_wac_booked: string;
  output_baseline_kg: string;
};

/**
 * Resolves the WAC credit for a forward FG output registration.
 * Uses only persisted positive consumption wac_value snapshots. A missing/zero
 * snapshot is unknown historical cost and must be corrected explicitly.
 */
export async function resolveOutputWacContribution(
  client: QueryClient,
  input: {
    woId: string;
    qtyKg: string;
    standardCostPerKg: string | null;
  },
): Promise<OutputWacResolution> {
  const unCosted = await loadUnCostedConsumptionLines(client, input.woId);
  if (unCosted.length > 0) {
    return { applied: false, excluded: 'un_costed', unCostedLines: unCosted };
  }

  const { rows } = await client.query<WoOutputCostBasisRow>(
    `with material_wac as (
       select coalesce(
                sum(nullif(c.ext_jsonb->>'wac_value', '')::numeric),
                0
              ) as material_cost
         from public.wo_material_consumption c
        where c.org_id = app.current_org_id()
          and c.wo_id = $1::uuid
          and c.correction_of_id is null
          and not exists (
            select 1
              from public.wo_material_consumption correction
             where correction.org_id = c.org_id
               and correction.correction_of_id = c.id
          )
     ),
     prior_outputs as (
       select coalesce(sum(o.qty_kg), 0) as prior_output_kg,
              coalesce(
                sum(nullif(o.ext_jsonb->>'wac_value', '')::numeric),
                0
              ) as prior_wac_booked
         from public.wo_outputs o
        where o.org_id = app.current_org_id()
          and o.wo_id = $1::uuid
          and o.correction_of_id is null
          and not exists (
            select 1
              from public.wo_outputs correction
             where correction.org_id = o.org_id
               and correction.correction_of_id = o.id
          )
     ),
     wo_baseline as (
       select case
                when lower(wo.uom) = 'kg' then wo.planned_quantity
                else null
              end as planned_output_kg
         from public.work_orders wo
        where wo.org_id = app.current_org_id()
          and wo.id = $1::uuid
     )
     select (select material_cost from material_wac)::text as material_cost,
            (select prior_wac_booked from prior_outputs)::text as prior_wac_booked,
            greatest(
              coalesce((select planned_output_kg from wo_baseline), 0),
              (select prior_output_kg from prior_outputs) + $2::numeric
            )::text as output_baseline_kg`,
    [input.woId, input.qtyKg],
  );

  const basis = rows[0];
  const materialCost = basis?.material_cost ?? '0';
  const priorWacBooked = basis?.prior_wac_booked ?? '0';
  const outputBaselineKg = basis?.output_baseline_kg ?? '0';

  const computed = await client.query<{ cost_per_kg: string | null; output_value: string | null }>(
    `select case
              when $1::numeric > 0 and $2::numeric > 0
                then ($1::numeric / $2::numeric)::text
              else null
            end as cost_per_kg,
            case
              when $1::numeric > 0 and $2::numeric > 0
                then least(
                  ($1::numeric / $2::numeric) * $3::numeric,
                  $1::numeric - $4::numeric
                )::text
              else null
            end as output_value`,
    [materialCost, outputBaselineKg, input.qtyKg, priorWacBooked],
  );
  const computedRow = computed.rows[0];
  if (computedRow?.cost_per_kg && computedRow.output_value && !isZeroDecimal(computedRow.cost_per_kg)) {
    return {
      applied: true,
      deltaQtyKg: input.qtyKg,
      deltaValue: computedRow.output_value,
      costPerKg: computedRow.cost_per_kg,
      source: 'wo_computed',
    };
  }

  if (input.standardCostPerKg != null && !isZeroDecimal(input.standardCostPerKg)) {
    const standard = await client.query<{ output_value: string }>(
      `select ($1::numeric * $2::numeric)::text as output_value`,
      [input.qtyKg, input.standardCostPerKg],
    );
    const outputValue = standard.rows[0]?.output_value ?? '0';
    return {
      applied: true,
      deltaQtyKg: input.qtyKg,
      deltaValue: outputValue,
      costPerKg: input.standardCostPerKg,
      source: 'standard',
    };
  }

  return { applied: false, excluded: 'un_costed', unCostedLines: [] };
}

async function loadUnCostedConsumptionLines(
  client: QueryClient,
  woId: string,
): Promise<UnCostedConsumptionLine[]> {
  const { rows } = await client.query<{
    consumption_id: string;
    component_id: string;
    qty: string;
    uom: string;
  }>(
    `select c.id::text as consumption_id,
            c.component_id::text as component_id,
            c.qty_consumed::text as qty,
            c.uom
       from public.wo_material_consumption c
      where c.org_id = app.current_org_id()
        and c.wo_id = $1::uuid
        and c.correction_of_id is null
        and not exists (
          select 1
            from public.wo_material_consumption correction
           where correction.org_id = c.org_id
             and correction.correction_of_id = c.id
        )
        and coalesce(nullif(trim(c.ext_jsonb->>'wac_value'), '')::numeric, 0) <= 0`,
    [woId],
  );

  return rows.map((row) => ({
    consumptionId: row.consumption_id,
    componentId: row.component_id,
    qty: row.qty,
    uom: row.uom,
  }));
}

function isZeroDecimal(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value.trim());
}
