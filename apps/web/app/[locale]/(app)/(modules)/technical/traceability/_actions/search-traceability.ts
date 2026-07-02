'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

/** Technical module read gate — seeded in packages/db/migrations/236-npd-stage-permissions-org-admin-seed.sql:59 */
const TECHNICAL_READ_PERMISSION = 'technical.sensory.read';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const TraceabilitySearchInput = z.object({
  query: z.string().trim().min(1).max(128),
  direction: z.enum(['backward', 'forward', 'both']).optional().default('both'),
  limit: z.number().int().min(1).max(100).optional().default(50),
});
type TraceabilitySearchInputType = z.input<typeof TraceabilitySearchInput>;

type TraceabilityNode = {
  nodeType: 'license_plate' | 'wo_output' | 'wo_consumption' | 'work_order' | 'bom_line';
  id: string;
  label: string;
  itemId: string | null;
  itemCode: string | null;
  lotOrBatch: string | null;
  quantity: string | null;
  uom: string | null;
  status: string | null;
  occurredAt: string | null;
};

type TraceabilityEdge = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relation: 'contains' | 'consumed_by' | 'produced' | 'requires_component';
  quantity: string | null;
  uom: string | null;
};

type TraceabilitySearchResult =
  | { ok: true; data: { nodes: TraceabilityNode[]; edges: TraceabilityEdge[] } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed'; message?: string };

type NodeRow = {
  node_type: TraceabilityNode['nodeType'];
  id: string;
  label: string;
  item_id: string | null;
  item_code: string | null;
  lot_or_batch: string | null;
  quantity: string | null;
  uom: string | null;
  status: string | null;
  occurred_at: string | null;
};

type EdgeRow = {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation: TraceabilityEdge['relation'];
  quantity: string | null;
  uom: string | null;
};

export async function searchTraceability(rawInput: unknown): Promise<TraceabilitySearchResult> {
  const parsed = TraceabilitySearchInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;
  const includeBackward = input.direction === 'backward' || input.direction === 'both';
  const includeForward = input.direction === 'forward' || input.direction === 'both';

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TraceabilitySearchResult> => {
      if (!(await hasPermission({ userId, orgId, client: client as QueryClient }, TECHNICAL_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const qc = client as QueryClient;
      const { rows: nodeRows } = await qc.query<NodeRow>(
        `with seed_lps as (
           select lp.*
             from public.license_plates lp
             left join public.items i on i.org_id = lp.org_id and i.id = lp.product_id
            where lp.org_id = app.current_org_id()
              and (
                lp.lp_number ilike '%' || $1 || '%'
                or coalesce(lp.lp_code, '') ilike '%' || $1 || '%'
                or coalesce(lp.batch_number, '') ilike '%' || $1 || '%'
                or coalesce(lp.supplier_batch_number, '') ilike '%' || $1 || '%'
                or coalesce(i.item_code, '') ilike '%' || $1 || '%'
              )
            limit $2::integer
         ),
         seed_outputs as (
           select o.*
             from public.wo_outputs o
             left join public.items i on i.org_id = o.org_id and i.id = o.product_id
            where o.org_id = app.current_org_id()
              and (
                o.batch_number ilike '%' || $1 || '%'
                or o.id::text = $1
                or coalesce(i.item_code, '') ilike '%' || $1 || '%'
              )
            limit $2::integer
         ),
         seed_wos as (
           select wo.*
             from public.work_orders wo
            where wo.org_id = app.current_org_id()
              and (wo.wo_number ilike '%' || $1 || '%' or wo.id::text = $1)
            limit $2::integer
         ),
         seed_transfer_orders as (
           select t.*
             from public.transfer_orders t
            where t.org_id = app.current_org_id()
              and (t.to_number ilike '%' || $1 || '%' or t.id::text = $1)
            limit $2::integer
         ),
         touched_wos as (
           select wo_id from seed_outputs
           union
           select id as wo_id from seed_wos
           union
           select consumed_by_wo_id from seed_lps where consumed_by_wo_id is not null
           union
           select wo_id from seed_lps where wo_id is not null
         ),
         touched_lps as (
           select id from seed_lps
           union
           select lp_id from seed_outputs where lp_id is not null
           union
           select c.lp_id
             from public.wo_material_consumption c
            where $3::boolean
              and c.org_id = app.current_org_id()
              and c.wo_id in (select wo_id from touched_wos)
           union
           select o.lp_id
             from public.wo_outputs o
            where $4::boolean
              and o.org_id = app.current_org_id()
              and o.wo_id in (select wo_id from touched_wos)
              and o.lp_id is not null
           union
           select source_lp_id
             from public.transfer_order_line_lps
            where org_id = app.current_org_id()
              and to_id in (select id from seed_transfer_orders)
           union
           select dest_lp_id
             from public.transfer_order_line_lps
            where org_id = app.current_org_id()
              and to_id in (select id from seed_transfer_orders)
              and dest_lp_id is not null
         )
         select *
         from (
           select
             'license_plate'::text as node_type,
             lp.id::text as id,
             coalesce(lp.lp_code, lp.lp_number) as label,
             lp.product_id::text as item_id,
             i.item_code,
             coalesce(lp.batch_number, lp.supplier_batch_number) as lot_or_batch,
             lp.quantity::text as quantity,
             lp.uom,
             lp.status,
             lp.created_at::text as occurred_at
            from public.license_plates lp
            left join public.items i on i.org_id = lp.org_id and i.id = lp.product_id
           where lp.org_id = app.current_org_id()
             and lp.id in (select id from touched_lps)
           union all
           select
             'wo_output'::text,
             o.id::text,
             o.batch_number,
             o.product_id::text,
             i.item_code,
             o.batch_number,
             o.qty_kg::text,
             o.uom,
             o.qa_status,
             o.registered_at::text
            from public.wo_outputs o
            left join public.items i on i.org_id = o.org_id and i.id = o.product_id
           where o.org_id = app.current_org_id()
             and (o.wo_id in (select wo_id from touched_wos) or o.id in (select id from seed_outputs))
           union all
           select
             'wo_consumption'::text,
             c.id::text,
             'Consumption ' || c.qty_consumed::text || ' ' || c.uom,
             c.component_id::text,
             i.item_code,
             lp.batch_number,
             c.qty_consumed::text,
             c.uom,
             case when c.fefo_adherence_flag then 'FEFO' else 'FEFO_DEVIATION' end,
             c.consumed_at::text
            from public.wo_material_consumption c
            left join public.items i on i.org_id = c.org_id and i.id = c.component_id
            left join public.license_plates lp on lp.org_id = c.org_id and lp.id = c.lp_id
           where $3::boolean
             and c.org_id = app.current_org_id()
             and c.wo_id in (select wo_id from touched_wos)
           union all
           select
             'work_order'::text,
             wo.id::text,
             wo.wo_number,
             wo.product_id::text,
             i.item_code,
             null::text,
             wo.planned_quantity::text,
             wo.uom,
             wo.status,
             coalesce(wo.started_at, wo.scheduled_start_time, wo.created_at)::text
            from public.work_orders wo
            left join public.items i on i.org_id = wo.org_id and i.id = wo.product_id
           where wo.org_id = app.current_org_id()
             and wo.id in (select wo_id from touched_wos)
           union all
           select
             'bom_line'::text,
             bl.id::text,
             coalesce(bl.component_code, bl.id::text),
             bl.item_id::text,
             i.item_code,
             null::text,
             bl.quantity::text,
             bl.uom,
             bh.status,
             bl.updated_at::text
            from public.bom_lines bl
            join public.bom_headers bh on bh.org_id = bl.org_id and bh.id = bl.bom_header_id
            left join public.items i on i.org_id = bl.org_id and i.id = bl.item_id
           where $3::boolean
             and bl.org_id = app.current_org_id()
             and bh.id in (
               select wo.active_bom_header_id
                 from public.work_orders wo
                where wo.org_id = app.current_org_id()
                  and wo.id in (select wo_id from touched_wos)
                  and wo.active_bom_header_id is not null
             )
         ) nodes
         order by occurred_at desc nulls last
         limit ($2::integer * 5)`,
        [input.query, input.limit, includeBackward, includeForward],
      );

      const { rows: edgeRows } = await qc.query<EdgeRow>(
        `with seed_lps as (
           select lp.*
             from public.license_plates lp
             left join public.items i on i.org_id = lp.org_id and i.id = lp.product_id
            where lp.org_id = app.current_org_id()
              and (
                lp.lp_number ilike '%' || $1 || '%'
                or coalesce(lp.lp_code, '') ilike '%' || $1 || '%'
                or coalesce(lp.batch_number, '') ilike '%' || $1 || '%'
                or coalesce(lp.supplier_batch_number, '') ilike '%' || $1 || '%'
                or coalesce(i.item_code, '') ilike '%' || $1 || '%'
              )
            limit $2::integer
         ),
         seed_outputs as (
           select o.*
             from public.wo_outputs o
             left join public.items i on i.org_id = o.org_id and i.id = o.product_id
            where o.org_id = app.current_org_id()
              and (o.batch_number ilike '%' || $1 || '%' or o.id::text = $1 or coalesce(i.item_code, '') ilike '%' || $1 || '%')
            limit $2::integer
         ),
         seed_wos as (
           select wo.*
             from public.work_orders wo
            where wo.org_id = app.current_org_id()
              and (wo.wo_number ilike '%' || $1 || '%' or wo.id::text = $1)
            limit $2::integer
         ),
         touched_wos as (
           select wo_id from seed_outputs
           union
           select id as wo_id from seed_wos
           union
           select consumed_by_wo_id from seed_lps where consumed_by_wo_id is not null
           union
           select wo_id from seed_lps where wo_id is not null
         )
         select *
         from (
           select
             'license_plate'::text as from_type,
             c.lp_id::text as from_id,
             'wo_consumption'::text as to_type,
             c.id::text as to_id,
             'consumed_by'::text as relation,
             c.qty_consumed::text as quantity,
             c.uom
            from public.wo_material_consumption c
           where $3::boolean
             and c.org_id = app.current_org_id()
             and c.wo_id in (select wo_id from touched_wos)
           union all
           select
             'wo_consumption'::text,
             c.id::text,
             'work_order'::text,
             c.wo_id::text,
             'consumed_by'::text,
             c.qty_consumed::text,
             c.uom
            from public.wo_material_consumption c
           where $3::boolean
             and c.org_id = app.current_org_id()
             and c.wo_id in (select wo_id from touched_wos)
           union all
           select
             'work_order'::text,
             o.wo_id::text,
             'wo_output'::text,
             o.id::text,
             'produced'::text,
             o.qty_kg::text,
             o.uom
            from public.wo_outputs o
           where $4::boolean
             and o.org_id = app.current_org_id()
             and o.wo_id in (select wo_id from touched_wos)
           union all
           select
             'wo_output'::text,
             o.id::text,
             'license_plate'::text,
             o.lp_id::text,
             'contains'::text,
             o.qty_kg::text,
             o.uom
            from public.wo_outputs o
           where $4::boolean
             and o.org_id = app.current_org_id()
             and o.wo_id in (select wo_id from touched_wos)
             and o.lp_id is not null
           union all
           select
             'work_order'::text,
             wo.id::text,
             'bom_line'::text,
             bl.id::text,
             'requires_component'::text,
             bl.quantity::text,
             bl.uom
            from public.work_orders wo
            join public.bom_lines bl
              on bl.org_id = wo.org_id
             and bl.bom_header_id = wo.active_bom_header_id
           where $3::boolean
             and wo.org_id = app.current_org_id()
             and wo.id in (select wo_id from touched_wos)
             and wo.active_bom_header_id is not null
         ) edges
         limit ($2::integer * 8)`,
        [input.query, input.limit, includeBackward, includeForward],
      );

      return {
        ok: true,
        data: {
          nodes: nodeRows.map((row) => ({
            nodeType: row.node_type,
            id: row.id,
            label: row.label,
            itemId: row.item_id,
            itemCode: row.item_code,
            lotOrBatch: row.lot_or_batch,
            quantity: row.quantity,
            uom: row.uom,
            status: row.status,
            occurredAt: row.occurred_at,
          })),
          edges: edgeRows.map((row) => ({
            fromType: row.from_type,
            fromId: row.from_id,
            toType: row.to_type,
            toId: row.to_id,
            relation: row.relation,
            quantity: row.quantity,
            uom: row.uom,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[technical/traceability] searchTraceability failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
