/**
 * Loads WIP material + process inputs for the live formulation cost path.
 * SQL mirrors costing/compute.ts (loadWipComponentCosts + loadWipProcesses) so
 * the editor and save-draft share one authoritative loader — compute.ts itself
 * is owned by another wave lane and must not be edited here.
 */

import {
  buildLiveWipUnitCostMap,
  liveWipCostLineKey,
  type LiveWipMaterialRow,
  type LiveWipProcessDbRow,
} from './wip-cost';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type BriefRow = {
  runs_per_week: string | null;
  weekly_volume_packs: string | null;
  avg_batch_qty: string | null;
};

export type LiveWipPayloadLine = {
  rmCode: string;
  wipDefinitionId: string;
  qtyKg: string | null;
};

export { liveWipCostLineKey };

export async function loadLiveWipUnitCostMap(
  client: QueryClient,
  versionId: string,
  payloadLines?: LiveWipPayloadLine[],
): Promise<Record<string, string>> {
  const lines = payloadLines ?? [];
  const usePayload = payloadLines !== undefined;

  if (usePayload && lines.length === 0) return {};

  const [materialResult, processResult, briefResult] = await Promise.all([
    usePayload
      ? loadWipMaterialRowsFromPayload(client, lines)
      : loadWipMaterialRows(client, versionId),
    usePayload
      ? loadWipProcessRowsFromPayload(client, lines)
      : loadWipProcessRows(client, versionId),
    client.query<BriefRow>(
      `select p.runs_per_week::text as runs_per_week,
              p.weekly_volume_packs::text as weekly_volume_packs,
              p.avg_batch_qty::text as avg_batch_qty
         from public.formulation_versions fv
         join public.formulations f
           on f.id = fv.formulation_id
          and f.org_id = app.current_org_id()
         join public.npd_projects p
           on p.id = f.project_id
          and p.org_id = f.org_id
        where fv.id = $1::uuid
        limit 1`,
      [versionId],
    ),
  ]);

  if (materialResult.rows.length === 0) return {};

  const brief = briefResult.rows[0];
  return buildLiveWipUnitCostMap({
    materialRows: materialResult.rows,
    processRows: processResult.rows,
    runsPerWeek: brief?.runs_per_week,
    weeklyVolumePacks: brief?.weekly_volume_packs,
    avgBatchQty: brief?.avg_batch_qty,
  });
}

function loadWipMaterialRows(
  client: QueryClient,
  versionId: string,
): Promise<{ rows: LiveWipMaterialRow[] }> {
  return client.query<LiveWipMaterialRow>(
    `with formulation_wips as (
       select fi.id as fi_id,
              fi.rm_code,
              fi.wip_definition_id,
              fi.qty_kg,
              fi.sequence,
              wd.item_id as wip_item_id,
              wd.yield_pct
         from public.formulation_ingredients fi
         join public.wip_definitions wd
           on wd.id = fi.wip_definition_id
          and wd.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
          and fi.wip_definition_id is not null
     ),
     bom_materials as (
       select fw.fi_id,
              coalesce(sum(bl.quantity * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where bl.id is not null) as missing_cost,
              count(bl.id) > 0 as has_lines
         from formulation_wips fw
         left join public.bom_headers bh
           on bh.org_id = app.current_org_id()
          and bh.item_id = fw.wip_item_id
          and bh.status = 'active'
         left join public.bom_lines bl
           on bl.org_id = bh.org_id
          and bl.bom_header_id = bh.id
         left join public.items ci
           on ci.org_id = app.current_org_id()
          and (
            (bl.item_id is not null and ci.id = bl.item_id)
            or (bl.item_id is null and ci.item_code = bl.component_code)
          )
         left join public.v_item_effective_cost vec
           on vec.org_id = ci.org_id
          and vec.item_id = ci.id
        group by fw.fi_id
     ),
     definition_materials as (
       select fw.fi_id,
              coalesce(sum(wdi.qty_per_unit * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where wdi.id is not null) as missing_cost,
              count(wdi.id) > 0 as has_lines
         from formulation_wips fw
         left join public.wip_definition_ingredients wdi
           on wdi.org_id = app.current_org_id()
          and wdi.wip_definition_id = fw.wip_definition_id
         left join public.v_item_effective_cost vec
           on vec.org_id = wdi.org_id
          and vec.item_id = wdi.item_id
        group by fw.fi_id
     )
     select concat(fw.rm_code, ':', fw.wip_definition_id::text) as line_key,
            fw.wip_definition_id::text as wip_definition_id,
            fw.qty_kg::text as qty_kg,
            fw.yield_pct::text as yield_pct,
            case when coalesce(bm.has_lines, false)
                 then bm.material_cost
                 else coalesce(dm.material_cost, 0)
            end::text as raw_material_cost_per_output_unit,
            case when coalesce(bm.has_lines, false)
                 then coalesce(bm.missing_cost, false)
                 when coalesce(dm.has_lines, false)
                 then coalesce(dm.missing_cost, false)
                 else false
            end as composition_missing_cost
       from formulation_wips fw
       left join bom_materials bm on bm.fi_id = fw.fi_id
       left join definition_materials dm on dm.fi_id = fw.fi_id
      order by fw.sequence, fw.wip_definition_id`,
    [versionId],
  );
}

function loadWipMaterialRowsFromPayload(
  client: QueryClient,
  lines: LiveWipPayloadLine[],
): Promise<{ rows: LiveWipMaterialRow[] }> {
  const payload = lines.map((line) => ({
    rm_code: line.rmCode,
    wip_definition_id: line.wipDefinitionId,
    qty_kg: line.qtyKg,
  }));
  return client.query<LiveWipMaterialRow>(
    `with payload_wips as (
       select x.rm_code,
              x.wip_definition_id::uuid as wip_definition_id,
              x.qty_kg::numeric as qty_kg
         from jsonb_to_recordset($1::jsonb) as x(
           rm_code text,
           wip_definition_id text,
           qty_kg text
         )
     ),
     formulation_wips as (
       select concat(pw.rm_code, ':', pw.wip_definition_id::text) as line_key,
              pw.rm_code,
              pw.wip_definition_id,
              pw.qty_kg,
              wd.item_id as wip_item_id,
              wd.yield_pct
         from payload_wips pw
         join public.wip_definitions wd
           on wd.id = pw.wip_definition_id
          and wd.org_id = app.current_org_id()
     ),
     bom_materials as (
       select fw.line_key,
              coalesce(sum(bl.quantity * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where bl.id is not null) as missing_cost,
              count(bl.id) > 0 as has_lines
         from formulation_wips fw
         left join public.bom_headers bh
           on bh.org_id = app.current_org_id()
          and bh.item_id = fw.wip_item_id
          and bh.status = 'active'
         left join public.bom_lines bl
           on bl.org_id = bh.org_id
          and bl.bom_header_id = bh.id
         left join public.items ci
           on ci.org_id = app.current_org_id()
          and (
            (bl.item_id is not null and ci.id = bl.item_id)
            or (bl.item_id is null and ci.item_code = bl.component_code)
          )
         left join public.v_item_effective_cost vec
           on vec.org_id = ci.org_id
          and vec.item_id = ci.id
        group by fw.line_key
     ),
     definition_materials as (
       select fw.line_key,
              coalesce(sum(wdi.qty_per_unit * vec.amount) filter (where vec.amount is not null), 0) as material_cost,
              bool_or(vec.amount is null) filter (where wdi.id is not null) as missing_cost,
              count(wdi.id) > 0 as has_lines
         from formulation_wips fw
         left join public.wip_definition_ingredients wdi
           on wdi.org_id = app.current_org_id()
          and wdi.wip_definition_id = fw.wip_definition_id
         left join public.v_item_effective_cost vec
           on vec.org_id = wdi.org_id
          and vec.item_id = wdi.item_id
        group by fw.line_key
     )
     select fw.line_key,
            fw.wip_definition_id::text as wip_definition_id,
            fw.qty_kg::text as qty_kg,
            fw.yield_pct::text as yield_pct,
            case when coalesce(bm.has_lines, false)
                 then bm.material_cost
                 else coalesce(dm.material_cost, 0)
            end::text as raw_material_cost_per_output_unit,
            case when coalesce(bm.has_lines, false)
                 then coalesce(bm.missing_cost, false)
                 when coalesce(dm.has_lines, false)
                 then coalesce(dm.missing_cost, false)
                 else false
            end as composition_missing_cost
       from formulation_wips fw
       left join bom_materials bm on bm.line_key = fw.line_key
       left join definition_materials dm on dm.line_key = fw.line_key
      order by fw.line_key`,
    [JSON.stringify(payload)],
  );
}

function loadWipProcessRows(
  client: QueryClient,
  versionId: string,
): Promise<{ rows: LiveWipProcessDbRow[] }> {
  return client.query<LiveWipProcessDbRow>(
    `with formulation_wips as (
       select distinct fi.wip_definition_id, wd.item_id as wip_item_id
         from public.formulation_ingredients fi
         join public.wip_definitions wd
           on wd.id = fi.wip_definition_id
          and wd.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
          and fi.wip_definition_id is not null
     ),
     npd_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              wp.id::text as process_id,
              wp.duration_hours::text as duration_hours,
              wp.additional_cost::text as additional_cost,
              wp.throughput_per_hour::text as throughput_per_hour,
              wp.throughput_uom::text as throughput_uom,
              wp.setup_cost::text as setup_cost,
              coalesce(wpr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wpr.headcount::text as headcount,
              wp.display_order,
              wpr.role_group
         from formulation_wips fw
         join public.npd_wip_processes wp
           on wp.org_id = app.current_org_id()
          and (
            (fw.wip_item_id is not null and wp.wip_item_id = fw.wip_item_id)
            or wp.wip_definition_id = fw.wip_definition_id
          )
         left join public.npd_wip_process_roles wpr
           on wpr.process_id = wp.id
          and wpr.org_id = wp.org_id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = wp.org_id
              and lr.role_group = wpr.role_group
            order by lr.effective_from desc
            limit 1
         ) lr on true
     ),
     definition_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              wdp.id::text as process_id,
              wdp.duration_hours::text as duration_hours,
              wdp.additional_cost::text as additional_cost,
              wdp.throughput_per_hour::text as throughput_per_hour,
              wdp.throughput_uom::text as throughput_uom,
              wdp.setup_cost::text as setup_cost,
              coalesce(wdr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wdr.headcount::text as headcount,
              wdp.display_order,
              wdr.role_group
         from formulation_wips fw
         join public.wip_definition_processes wdp
           on wdp.org_id = app.current_org_id()
          and wdp.wip_definition_id = fw.wip_definition_id
         left join public.wip_definition_roles wdr
           on wdr.org_id = wdp.org_id
          and wdr.process_id = wdp.id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = wdp.org_id
              and lr.role_group = wdr.role_group
            order by lr.effective_from desc
            limit 1
         ) lr on true
        where not exists (
          select 1 from npd_rows nr where nr.wip_definition_id = fw.wip_definition_id::text
        )
     )
     select wip_definition_id, process_id, duration_hours, additional_cost,
            throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
       from (
         select wip_definition_id, process_id, duration_hours, additional_cost,
                throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
           from npd_rows
         union all
         select wip_definition_id, process_id, duration_hours, additional_cost,
                throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
           from definition_rows
       ) combined`,
    [versionId],
  );
}

function loadWipProcessRowsFromPayload(
  client: QueryClient,
  lines: LiveWipPayloadLine[],
): Promise<{ rows: LiveWipProcessDbRow[] }> {
  const definitionIds = [...new Set(lines.map((line) => line.wipDefinitionId))];
  return client.query<LiveWipProcessDbRow>(
    `with payload_defs as (
       select distinct x.wip_definition_id::uuid as wip_definition_id
         from jsonb_to_recordset($1::jsonb) as x(wip_definition_id text)
     ),
     formulation_wips as (
       select pd.wip_definition_id, wd.item_id as wip_item_id
         from payload_defs pd
         join public.wip_definitions wd
           on wd.id = pd.wip_definition_id
          and wd.org_id = app.current_org_id()
     ),
     npd_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              wp.id::text as process_id,
              wp.duration_hours::text as duration_hours,
              wp.additional_cost::text as additional_cost,
              wp.throughput_per_hour::text as throughput_per_hour,
              wp.throughput_uom::text as throughput_uom,
              wp.setup_cost::text as setup_cost,
              coalesce(wpr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wpr.headcount::text as headcount,
              wp.display_order,
              wpr.role_group
         from formulation_wips fw
         join public.npd_wip_processes wp
           on wp.org_id = app.current_org_id()
          and (
            (fw.wip_item_id is not null and wp.wip_item_id = fw.wip_item_id)
            or wp.wip_definition_id = fw.wip_definition_id
          )
         left join public.npd_wip_process_roles wpr
           on wpr.process_id = wp.id
          and wpr.org_id = wp.org_id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = wp.org_id
              and lr.role_group = wpr.role_group
            order by lr.effective_from desc
            limit 1
         ) lr on true
     ),
     definition_rows as (
       select fw.wip_definition_id::text as wip_definition_id,
              wdp.id::text as process_id,
              wdp.duration_hours::text as duration_hours,
              wdp.additional_cost::text as additional_cost,
              wdp.throughput_per_hour::text as throughput_per_hour,
              wdp.throughput_uom::text as throughput_uom,
              wdp.setup_cost::text as setup_cost,
              coalesce(wdr.rate_per_hour, lr.rate_per_hour)::text as rate_per_hour,
              wdr.headcount::text as headcount,
              wdp.display_order,
              wdr.role_group
         from formulation_wips fw
         join public.wip_definition_processes wdp
           on wdp.org_id = app.current_org_id()
          and wdp.wip_definition_id = fw.wip_definition_id
         left join public.wip_definition_roles wdr
           on wdr.org_id = wdp.org_id
          and wdr.process_id = wdp.id
         left join lateral (
           select rate_per_hour
             from public.labor_rates lr
            where lr.org_id = wdp.org_id
              and lr.role_group = wdr.role_group
            order by lr.effective_from desc
            limit 1
         ) lr on true
        where not exists (
          select 1 from npd_rows nr where nr.wip_definition_id = fw.wip_definition_id::text
        )
     )
     select wip_definition_id, process_id, duration_hours, additional_cost,
            throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
       from (
         select wip_definition_id, process_id, duration_hours, additional_cost,
                throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
           from npd_rows
         union all
         select wip_definition_id, process_id, duration_hours, additional_cost,
                throughput_per_hour, throughput_uom, setup_cost, rate_per_hour, headcount
           from definition_rows
       ) combined`,
    [JSON.stringify(definitionIds.map((id) => ({ wip_definition_id: id })))],
  );
}
