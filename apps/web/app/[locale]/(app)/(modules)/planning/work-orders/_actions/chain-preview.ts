'use server';

/**
 * P2-PLANNING — read-only surface for the multi-stage production chain.
 *
 * Two reads, both org-scoped inside withOrgContext (RLS: org_id =
 * app.current_org_id()); neither writes:
 *
 *   1. previewWorkOrderChain — a DRY RUN of create-work-order-chain. Given the FG
 *      product + planned qty it recomputes (never persists) the child WIP stages
 *      that would be created, so the create flow can show a tree BEFORE the write.
 *      It mirrors create-work-order-chain's reads (loadItem / loadActiveBom /
 *      computeWoMaterialScalar / WIP bom lines) so the preview matches what the
 *      action actually creates. Each stage is enriched with its production line(s)
 *      (routing_operations → production_lines), its process throughput per
 *      product×process (npd_wip_processes via prod_detail.item_id) and the WIP it
 *      consumes / outputs.
 *
 *   2. getStationQueue — the per-station lane. Given a production line it returns
 *      ONLY that line's WOs across every chain, each with demand qty, the upstream
 *      WIP it needs + how much is already produced (real produced_quantity on the
 *      upstream WO), the output target, and the line's throughput_per_hour for that
 *      product×process so the station knows its rate.
 *
 * Honest data policy: throughput/line come from the real masters; when a product has
 * no routing or no npd_wip_processes row the stage simply carries an empty list (the
 * UI renders an em dash), never a fabricated rate. Raw-material stock-on-hand is NOT
 * surfaced here — see the station view's note; the only availability signal is the
 * upstream WIP WO's produced_quantity, which is real.
 */

import { z } from 'zod';

import { computeWoMaterialScalar, WoMaterialScalarError } from '../../../../../../../lib/production/wo-material-scalar';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type ChainStageProcess = {
  name: string;
  throughputPerHour: number | null;
  throughputUom: string | null;
  durationHours: number | null;
};

export type ChainStageLine = { code: string; name: string };

export type ChainStageMaterial = { itemCode: string; requiredQty: string; uom: string };

export type ChainStage = {
  /** Stable key for React lists (item id + suffix). */
  key: string;
  /** "FG" for the root, or the WIP stage label (W1, W2 …). */
  stageLabel: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** Qty this stage must output, in `uom`. */
  requiredQty: string;
  uom: string;
  lines: ChainStageLine[];
  processes: ChainStageProcess[];
  /** WIP items this stage consumes from upstream stages (empty for leaf stages). */
  consumes: ChainStageMaterial[];
  children: ChainStage[];
};

export type PreviewWorkOrderChainResult =
  | { ok: true; spansMultipleStages: boolean; stageCount: number; root: ChainStage }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'no_active_bom' | 'pack_hierarchy_incomplete' | 'persistence_failed' };

const PreviewInput = z.object({
  productId: z.string().uuid(),
  plannedQuantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,4})?$/)
    .refine((value) => Number(value) > 0),
});

type ItemRow = {
  id: string;
  item_code: string;
  name: string | null;
  uom_base: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
};

type BomHeaderRow = { id: string; line_basis: string };

type WipBomLineRow = {
  item_id: string;
  component_code: string;
  name: string | null;
  uom_base: string;
  quantity: string;
  scrap_pct: string | null;
};

type LineRow = { item_id: string; code: string; name: string };
type ProcessRow = {
  item_id: string;
  process_name: string;
  throughput_per_hour: string | null;
  throughput_uom: string | null;
  duration_hours: string | null;
};

function computeRequiredMaterialQty(quantity: string, scrapPct: string | null, materialScalar: number): string {
  const denominator = Math.max(1 - Number(scrapPct ?? 0) / 100, 0.01);
  return (Math.round((Number(quantity) * materialScalar / denominator) * 10000) / 10000).toFixed(4);
}

async function loadLinesByItem(client: QueryClient, itemIds: string[]): Promise<Map<string, ChainStageLine[]>> {
  const byItem = new Map<string, ChainStageLine[]>();
  if (itemIds.length === 0) return byItem;
  const { rows } = await client.query<LineRow>(
    `select distinct on (r.item_id, pl.id)
            r.item_id::text as item_id, pl.code, pl.name
       from public.routings r
       join public.routing_operations ro on ro.routing_id = r.id and ro.org_id = r.org_id
       join public.production_lines pl on pl.id = ro.line_id and pl.org_id = ro.org_id
      where r.org_id = app.current_org_id()
        and r.item_id = any($1::uuid[])
        and r.status in ('active', 'approved')
      order by r.item_id, pl.id, ro.op_no`,
    [itemIds],
  );
  for (const row of rows) {
    const list = byItem.get(row.item_id) ?? [];
    list.push({ code: row.code, name: row.name });
    byItem.set(row.item_id, list);
  }
  return byItem;
}

async function loadProcessesByItem(client: QueryClient, itemIds: string[]): Promise<Map<string, ChainStageProcess[]>> {
  const byItem = new Map<string, ChainStageProcess[]>();
  if (itemIds.length === 0) return byItem;
  const { rows } = await client.query<ProcessRow>(
    `select pd.item_id::text as item_id, p.process_name,
            p.throughput_per_hour::text as throughput_per_hour,
            p.throughput_uom, p.duration_hours::text as duration_hours
       from public.npd_wip_processes p
       join public.prod_detail pd on pd.id = p.prod_detail_id and pd.org_id = p.org_id
      where p.org_id = app.current_org_id()
        and pd.item_id = any($1::uuid[])
      order by pd.item_id, p.display_order`,
    [itemIds],
  );
  for (const row of rows) {
    const list = byItem.get(row.item_id) ?? [];
    list.push({
      name: row.process_name,
      throughputPerHour: row.throughput_per_hour === null ? null : Number(row.throughput_per_hour),
      throughputUom: row.throughput_uom,
      durationHours: row.duration_hours === null ? null : Number(row.duration_hours),
    });
    byItem.set(row.item_id, list);
  }
  return byItem;
}

export async function previewWorkOrderChain(raw: unknown): Promise<PreviewWorkOrderChainResult> {
  const parsed = PreviewInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }): Promise<PreviewWorkOrderChainResult> => {
      const q = client as unknown as QueryClient;
      const fg = (
        await q.query<ItemRow>(
          `select id::text as id, item_code, name, uom_base,
                  net_qty_per_each::text as net_qty_per_each, each_per_box::text as each_per_box
             from public.items
            where org_id = app.current_org_id() and id = $1::uuid
            limit 1`,
          [parsed.data.productId],
        )
      ).rows[0];
      if (!fg) return { ok: false, error: 'not_found' };

      const bom = (
        await q.query<BomHeaderRow>(
          `select id::text as id, line_basis
             from public.bom_headers
            where org_id = app.current_org_id() and status = 'active'
              and (item_id = $1::uuid or product_id = $2)
            order by version desc, created_at desc
            limit 1`,
          [fg.id, fg.item_code],
        )
      ).rows[0];
      if (!bom) return { ok: false, error: 'no_active_bom' };

      let materialScalar: number;
      try {
        materialScalar = computeWoMaterialScalar({
          plannedBaseQty: Number(parsed.data.plannedQuantity),
          lineBasis: bom.line_basis,
          eachPerBox: fg.each_per_box == null ? null : Number(fg.each_per_box),
          netQtyPerEach: fg.net_qty_per_each == null ? null : Number(fg.net_qty_per_each),
        });
      } catch (error) {
        if (error instanceof WoMaterialScalarError) return { ok: false, error: 'pack_hierarchy_incomplete' };
        throw error;
      }

      const wipLines = (
        await q.query<WipBomLineRow>(
          `select bl.item_id::text as item_id, bl.component_code, i.name, i.uom_base,
                  bl.quantity::text as quantity, bl.scrap_pct::text as scrap_pct
             from public.bom_lines bl
             left join public.items i on i.id = bl.item_id and i.org_id = bl.org_id
            where bl.org_id = app.current_org_id()
              and bl.bom_header_id = $1::uuid
              and bl.component_type = 'WIP'
              and bl.item_id is not null
            order by bl.line_no`,
          [bom.id],
        )
      ).rows;

      const itemIds = [fg.id, ...wipLines.map((l) => l.item_id)];
      const [linesByItem, processesByItem] = await Promise.all([
        loadLinesByItem(q, itemIds),
        loadProcessesByItem(q, itemIds),
      ]);

      const childStages: ChainStage[] = wipLines.map((line, index) => {
        const requiredQty = computeRequiredMaterialQty(line.quantity, line.scrap_pct, materialScalar);
        return {
          key: `${line.item_id}-W${index + 1}`,
          stageLabel: `W${index + 1}`,
          itemId: line.item_id,
          itemCode: line.component_code,
          itemName: line.name ?? line.component_code,
          requiredQty,
          uom: line.uom_base,
          lines: linesByItem.get(line.item_id) ?? [],
          processes: processesByItem.get(line.item_id) ?? [],
          consumes: [],
          children: [],
        };
      });

      const root: ChainStage = {
        key: `${fg.id}-FG`,
        stageLabel: 'FG',
        itemId: fg.id,
        itemCode: fg.item_code,
        itemName: fg.name ?? fg.item_code,
        requiredQty: parsed.data.plannedQuantity,
        uom: fg.uom_base,
        lines: linesByItem.get(fg.id) ?? [],
        processes: processesByItem.get(fg.id) ?? [],
        consumes: childStages.map((c) => ({ itemCode: c.itemCode, requiredQty: c.requiredQty, uom: c.uom })),
        children: childStages,
      };

      return {
        ok: true,
        spansMultipleStages: childStages.length > 0,
        stageCount: childStages.length + 1,
        root,
      };
    });
  } catch (error) {
    console.error('[previewWorkOrderChain] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

// ---------------------------------------------------------------------------
// Per-station queue
// ---------------------------------------------------------------------------

export type StationInput = { itemCode: string; requiredQty: string | null; producedQty: string | null; upstreamWoNumber: string; upstreamStatus: string; uom: string };

export type StationWorkOrder = {
  id: string;
  woNumber: string;
  status: string;
  itemCode: string | null;
  itemName: string | null;
  demandQty: string;
  producedQty: string | null;
  uom: string;
  scheduledStartTime: string | null;
  processes: ChainStageProcess[];
  inputs: StationInput[];
};

export type GetStationQueueResult =
  | { ok: true; lineCode: string; lineName: string; workOrders: StationWorkOrder[] }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed' };

const StationInputSchema = z.object({ lineId: z.string().uuid() });

type StationWoRow = {
  id: string;
  wo_number: string;
  status: string;
  product_id: string;
  item_code: string | null;
  name: string | null;
  planned_quantity: string;
  produced_quantity: string | null;
  uom: string;
  scheduled_start_time: string | null;
};

type StationDepRow = {
  parent_wo_id: string;
  child_wo_number: string;
  child_status: string;
  child_item_code: string | null;
  child_uom: string;
  produced_quantity: string | null;
  required_qty: string | null;
};

export async function getStationQueue(raw: unknown): Promise<GetStationQueueResult> {
  const parsed = StationInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }): Promise<GetStationQueueResult> => {
      const q = client as unknown as QueryClient;
      const line = (
        await q.query<{ code: string; name: string }>(
          `select code, name from public.production_lines
            where org_id = app.current_org_id() and id = $1::uuid limit 1`,
          [parsed.data.lineId],
        )
      ).rows[0];
      if (!line) return { ok: false, error: 'not_found' };

      const woRows = (
        await q.query<StationWoRow>(
          `select wo.id::text as id, wo.wo_number, wo.status, wo.product_id::text as product_id,
                  i.item_code, i.name,
                  wo.planned_quantity::text as planned_quantity,
                  wo.produced_quantity::text as produced_quantity, wo.uom,
                  wo.scheduled_start_time::text as scheduled_start_time
             from public.work_orders wo
             left join public.items i on i.id = wo.product_id and i.org_id = wo.org_id
            where wo.org_id = app.current_org_id()
              and wo.production_line_id = $1::uuid
              and wo.status not in ('CLOSED', 'CANCELLED')
            order by coalesce(wo.scheduled_start_time, wo.created_at), wo.wo_number`,
          [parsed.data.lineId],
        )
      ).rows;

      if (woRows.length === 0) {
        return { ok: true, lineCode: line.code, lineName: line.name, workOrders: [] };
      }

      const woIds = woRows.map((w) => w.id);
      const productIds = [...new Set(woRows.map((w) => w.product_id))];
      const [depRows, processesByItem] = await Promise.all([
        q.query<StationDepRow>(
          `select dep.parent_wo_id::text as parent_wo_id, child.wo_number as child_wo_number,
                  child.status as child_status, ci.item_code as child_item_code, child.uom as child_uom,
                  child.produced_quantity::text as produced_quantity, dep.required_qty::text as required_qty
             from public.wo_dependencies dep
             join public.work_orders child on child.id = dep.child_wo_id and child.org_id = dep.org_id
             left join public.items ci on ci.id = child.product_id and ci.org_id = child.org_id
            where dep.org_id = app.current_org_id()
              and dep.parent_wo_id = any($1::uuid[])
            order by child.wo_number`,
          [woIds],
        ),
        loadProcessesByItem(q, productIds),
      ]);

      const inputsByWo = new Map<string, StationInput[]>();
      for (const dep of depRows.rows) {
        const list = inputsByWo.get(dep.parent_wo_id) ?? [];
        list.push({
          itemCode: dep.child_item_code ?? '—',
          requiredQty: dep.required_qty,
          producedQty: dep.produced_quantity,
          upstreamWoNumber: dep.child_wo_number,
          upstreamStatus: dep.child_status,
          uom: dep.child_uom,
        });
        inputsByWo.set(dep.parent_wo_id, list);
      }

      const workOrders: StationWorkOrder[] = woRows.map((w) => ({
        id: w.id,
        woNumber: w.wo_number,
        status: w.status,
        itemCode: w.item_code,
        itemName: w.name,
        demandQty: w.planned_quantity,
        producedQty: w.produced_quantity,
        uom: w.uom,
        scheduledStartTime: w.scheduled_start_time,
        processes: processesByItem.get(w.product_id) ?? [],
        inputs: inputsByWo.get(w.id) ?? [],
      }));

      return { ok: true, lineCode: line.code, lineName: line.name, workOrders };
    });
  } catch (error) {
    console.error('[getStationQueue] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
