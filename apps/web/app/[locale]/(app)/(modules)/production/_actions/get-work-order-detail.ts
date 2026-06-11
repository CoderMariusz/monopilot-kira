'use server';

/**
 * P-L1 — 08-Production WO Execution detail (prototype wo-detail.jsx:4-530).
 *
 * READ server action gathering ALL eight detail tabs' data for one WO in a
 * SINGLE `withOrgContext` transaction (queries fired with Promise.all on the one
 * txn-bound client — node-pg serialises them on the connection, but the call
 * sites read as parallel data gathering). RLS (`org_id = app.current_org_id()`)
 * scopes every row to the signed-in user's org — a cross-org WO id returns
 * `not_found`, never another org's data. No service-role bypass, no mocks.
 *
 * Tab → source mapping (prototype wo-detail.jsx anchors):
 *   Overview     :4-101   header KPIs / status / line / schedule  → work_orders + wo_executions
 *   QA results   :181     linked QA inspections                   → (read-model not yet built → empty)
 *   Consumption  :257     wo_materials vs wo_material_consumption  → per-component required/consumed
 *   Output       :347     registered output rows                  → wo_outputs
 *   Waste        :409     waste events on this WO                  → wo_waste_log ⨝ waste_categories
 *   Downtime     :438     downtime linked to this WO              → downtime_events ⨝ downtime_categories
 *   Genealogy    :454     LP links from consumption               → wo_material_consumption (empty-state OK)
 *   History      :505     status history + execution events       → wo_status_history + wo_events
 *
 * RBAC: server-resolved `production.oee.read` (the dashboard read permission,
 * migration 185). The client never re-queries and never trusts a client flag.
 *
 * `'use server'` export rule: exports ONLY the async action + serialisable types.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type ProductionContext,
  type WoState,
} from '../../../../../../lib/production/shared';

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

export type WorkOrderDetailStatus = WoState;

/** Overview header + KPI summary. */
export type WoDetailHeader = {
  id: string;
  woNumber: string;
  productId: string;
  /** items.item_code / items.name — null when the product row is missing. */
  itemCode: string | null;
  productName: string | null;
  status: WorkOrderDetailStatus;
  lineId: string | null;
  /** production_lines.code — null when no line is assigned. */
  lineCode: string | null;
  machineId: string | null;
  plannedQty: number;
  uom: string;
  outputKg: number;
  consumptionPct: number;
  outputPct: number;
  allergenGate: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMin: number | null;
  bomVersion: number | null;
  /**
   * B-3 — items.weight_mode for the WO's FG product. Drives the Register-output
   * modal's per-unit catch-weight capture (the service 422s catch items without
   * catch_weight_kg_per_unit). Defaults to 'fixed' when the item row is missing.
   */
  weightMode: 'fixed' | 'catch';
};

/** Consumption tab: BOM component required vs consumed. */
export type WoDetailComponent = {
  id: string;
  productId: string;
  materialName: string;
  requiredQty: number;
  consumedQty: number;
  remainingQty: number;
  uom: string;
  progressPct: number;
};

/** Output tab: a registered wo_outputs row. */
export type WoDetailOutput = {
  id: string;
  outputType: string;
  productId: string;
  batchNumber: string;
  qtyKg: number;
  uom: string;
  qaStatus: string;
  lpId: string | null;
  expiryDate: string | null;
};

/** Waste tab: a wo_waste_log row. */
export type WoDetailWaste = {
  id: string;
  recordedAt: string | null;
  categoryName: string | null;
  qtyKg: number;
  reasonNotes: string | null;
};

/** Downtime tab: a downtime_events row linked to this WO. */
export type WoDetailDowntime = {
  id: string;
  categoryName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMin: number | null;
  reasonNotes: string | null;
};

/** Genealogy tab: a consumed-LP link folded from wo_material_consumption. */
export type WoDetailGenealogyInput = {
  id: string;
  componentId: string;
  lpId: string;
  qtyKg: number;
  fefoAdherence: boolean;
  consumedAt: string | null;
};

/** History tab: a unified event-log row (status-history + execution events). */
export type WoDetailHistoryEvent = {
  id: string;
  occurredAt: string | null;
  source: 'status' | 'execution';
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
};

/** QA tab placeholder until the linked-inspection read-model lands. */
export type WoDetailQa = {
  total: number;
  pass: number;
  hold: number;
  fail: number;
};

export type WorkOrderDetailData = {
  header: WoDetailHeader;
  components: WoDetailComponent[];
  outputs: WoDetailOutput[];
  waste: WoDetailWaste[];
  downtime: WoDetailDowntime[];
  genealogyInputs: WoDetailGenealogyInput[];
  history: WoDetailHistoryEvent[];
  qa: WoDetailQa;
};

export type WorkOrderDetailResult =
  | { ok: true; data: WorkOrderDetailData }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error' };

export async function getWorkOrderDetail(woId: string): Promise<WorkOrderDetailResult> {
  if (!isUuid(woId)) return { ok: false, reason: 'not_found' };

  try {
    return await withOrgContext(async (ctx): Promise<WorkOrderDetailResult> => {
      const pctx = ctx as unknown as ProductionContext;

      if (!(await hasPermission(pctx, PRODUCTION_VIEW_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const c = ctx.client;

      // Header drives existence — a missing/cross-org WO is `not_found`.
      const headerRes = await c.query<{
        id: string;
        wo_number: string | null;
        product_id: string;
        item_code: string | null;
        product_name: string | null;
        status: string;
        production_line_id: string | null;
        line_code: string | null;
        machine_id: string | null;
        planned_quantity: string | number | null;
        uom: string | null;
        bom_version: number | null;
        has_allergen: boolean;
        scheduled_start_time: string | Date | null;
        scheduled_end_time: string | Date | null;
        started_at: string | Date | null;
        completed_at: string | Date | null;
        output_kg: string | number | null;
        consumption_pct: string | number | null;
        output_pct: string | number | null;
        weight_mode: string | null;
      }>(
        `select w.id::text as id,
                w.wo_number,
                w.product_id::text as product_id,
                i.item_code,
                i.name as product_name,
                i.weight_mode,
                pl.code as line_code,
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
                w.machine_id::text as machine_id,
                w.planned_quantity,
                w.uom,
                (select max(bom_version) from public.wo_materials m
                  where m.wo_id = w.id and m.org_id = app.current_org_id()) as bom_version,
                (w.allergen_profile_snapshot is not null) as has_allergen,
                w.scheduled_start_time,
                w.scheduled_end_time,
                coalesce(e.started_at, w.started_at) as started_at,
                coalesce(e.completed_at, w.completed_at) as completed_at,
                (select coalesce(sum(o.qty_kg), 0) from public.wo_outputs o
                  where o.wo_id = w.id and o.org_id = app.current_org_id()) as output_kg,
                (select case when coalesce(sum(required_qty), 0) > 0
                             then round(sum(consumed_qty) / sum(required_qty) * 100, 1)
                             else 0 end
                   from public.wo_materials m
                  where m.wo_id = w.id and m.org_id = app.current_org_id()) as consumption_pct,
                (select case when coalesce(w.planned_quantity, 0) > 0
                             then round(coalesce(sum(o.qty_kg), 0) / w.planned_quantity * 100, 1)
                             else 0 end
                   from public.wo_outputs o
                  where o.wo_id = w.id and o.org_id = app.current_org_id()) as output_pct
           from public.work_orders w
           left join public.wo_executions e
             on e.org_id = w.org_id and e.wo_id = w.id
           left join public.items i
             on i.org_id = w.org_id and i.id = w.product_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where w.org_id = app.current_org_id() and w.id = $1::uuid`,
        [woId],
      );
      if (headerRes.rows.length === 0) return { ok: false, reason: 'not_found' };
      const h = headerRes.rows[0]!;

      // Remaining tabs gathered together (one txn-bound client).
      const [
        componentsRes,
        outputsRes,
        wasteRes,
        downtimeRes,
        genealogyRes,
        statusRes,
        eventsRes,
      ] = await Promise.all([
        c.query<{
          id: string;
          product_id: string;
          material_name: string;
          required_qty: string | number;
          consumed_qty: string | number;
          uom: string;
        }>(
          `select id::text as id, product_id::text as product_id, material_name,
                  required_qty, consumed_qty, uom
             from public.wo_materials
            where org_id = app.current_org_id() and wo_id = $1::uuid
            order by sequence asc, material_name asc`,
          [woId],
        ),
        c.query<{
          id: string;
          output_type: string;
          product_id: string;
          batch_number: string;
          qty_kg: string | number;
          uom: string;
          qa_status: string;
          lp_id: string | null;
          expiry_date: string | Date | null;
        }>(
          `select id::text as id, output_type, product_id::text as product_id,
                  batch_number, qty_kg, uom, qa_status, lp_id::text as lp_id, expiry_date
             from public.wo_outputs
            where org_id = app.current_org_id() and wo_id = $1::uuid
            order by output_type asc, registered_at asc`,
          [woId],
        ),
        c.query<{
          id: string;
          recorded_at: string | Date | null;
          category_name: string | null;
          qty_kg: string | number;
          reason_notes: string | null;
        }>(
          `select wl.id::text as id, wl.recorded_at, wc.name as category_name,
                  wl.qty_kg, wl.reason_notes
             from public.wo_waste_log wl
             left join public.waste_categories wc
               on wc.id = wl.category_id and wc.org_id = wl.org_id
            where wl.org_id = app.current_org_id() and wl.wo_id = $1::uuid
            order by wl.recorded_at desc`,
          [woId],
        ),
        c.query<{
          id: string;
          category_name: string | null;
          started_at: string | Date | null;
          ended_at: string | Date | null;
          duration_min: number | null;
          reason_notes: string | null;
        }>(
          `select de.id::text as id, dc.name as category_name, de.started_at,
                  de.ended_at, de.duration_min, de.reason_notes
             from public.downtime_events de
             left join public.downtime_categories dc
               on dc.id = de.category_id and dc.org_id = de.org_id
            where de.org_id = app.current_org_id() and de.wo_id = $1::uuid
            order by de.started_at desc`,
          [woId],
        ),
        c.query<{
          id: string;
          component_id: string;
          lp_id: string;
          qty_consumed: string | number;
          fefo_adherence_flag: boolean;
          consumed_at: string | Date | null;
        }>(
          `select id::text as id, component_id::text as component_id, lp_id::text as lp_id,
                  qty_consumed, fefo_adherence_flag, consumed_at
             from public.wo_material_consumption
            where org_id = app.current_org_id() and wo_id = $1::uuid
            order by consumed_at asc`,
          [woId],
        ),
        c.query<{
          id: string;
          occurred_at: string | Date | null;
          action: string;
          from_status: string | null;
          to_status: string;
          override_reason: string | null;
        }>(
          `select id::text as id, occurred_at, action, from_status, to_status, override_reason
             from public.wo_status_history
            where org_id = app.current_org_id() and wo_id = $1::uuid
            order by occurred_at asc`,
          [woId],
        ),
        c.query<{
          id: string;
          occurred_at: string | Date | null;
          event_type: string;
          from_status: string | null;
          to_status: string;
          reason: string | null;
        }>(
          `select id::text as id, occurred_at, event_type, from_status, to_status, reason
             from public.wo_events
            where org_id = app.current_org_id() and wo_id = $1::uuid
            order by occurred_at asc`,
          [woId],
        ),
      ]);

      const components: WoDetailComponent[] = componentsRes.rows.map((r) => {
        const required = Number(r.required_qty);
        const consumed = Number(r.consumed_qty);
        const remaining = Math.max(0, required - consumed);
        const progressPct = required > 0 ? Math.min(100, Math.round((consumed / required) * 100)) : 0;
        return {
          id: r.id,
          productId: r.product_id,
          materialName: r.material_name,
          requiredQty: required,
          consumedQty: consumed,
          remainingQty: remaining,
          uom: r.uom,
          progressPct,
        };
      });

      const outputs: WoDetailOutput[] = outputsRes.rows.map((r) => ({
        id: r.id,
        outputType: r.output_type,
        productId: r.product_id,
        batchNumber: r.batch_number,
        qtyKg: Number(r.qty_kg),
        uom: r.uom,
        qaStatus: r.qa_status,
        lpId: r.lp_id,
        expiryDate: toIso(r.expiry_date),
      }));

      const waste: WoDetailWaste[] = wasteRes.rows.map((r) => ({
        id: r.id,
        recordedAt: toIso(r.recorded_at),
        categoryName: r.category_name,
        qtyKg: Number(r.qty_kg),
        reasonNotes: r.reason_notes,
      }));

      const downtime: WoDetailDowntime[] = downtimeRes.rows.map((r) => ({
        id: r.id,
        categoryName: r.category_name,
        startedAt: toIso(r.started_at),
        endedAt: toIso(r.ended_at),
        durationMin: r.duration_min,
        reasonNotes: r.reason_notes,
      }));

      const genealogyInputs: WoDetailGenealogyInput[] = genealogyRes.rows.map((r) => ({
        id: r.id,
        componentId: r.component_id,
        lpId: r.lp_id,
        qtyKg: Number(r.qty_consumed),
        fefoAdherence: Boolean(r.fefo_adherence_flag),
        consumedAt: toIso(r.consumed_at),
      }));

      // Merge status-history + execution events into one chronological log.
      const history: WoDetailHistoryEvent[] = [
        ...statusRes.rows.map((r) => ({
          id: `status-${r.id}`,
          occurredAt: toIso(r.occurred_at),
          source: 'status' as const,
          action: r.action,
          fromStatus: r.from_status,
          toStatus: r.to_status,
          reason: r.override_reason,
        })),
        ...eventsRes.rows.map((r) => ({
          id: `exec-${r.id}`,
          occurredAt: toIso(r.occurred_at),
          source: 'execution' as const,
          action: r.event_type,
          fromStatus: r.from_status,
          toStatus: r.to_status,
          reason: r.reason,
        })),
      ].sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''));

      const status = (
        ['planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled'] as string[]
      ).includes(h.status)
        ? (h.status as WorkOrderDetailStatus)
        : 'planned';

      const startedAt = toIso(h.started_at);
      const completedAt = toIso(h.completed_at);
      const elapsedMin =
        startedAt != null
          ? Math.round(
              ((completedAt ? Date.parse(completedAt) : Date.now()) - Date.parse(startedAt)) / 60000,
            )
          : null;

      const header: WoDetailHeader = {
        id: h.id,
        woNumber: h.wo_number ?? h.id.slice(0, 8),
        productId: h.product_id,
        itemCode: h.item_code,
        productName: h.product_name,
        status,
        lineId: h.production_line_id,
        lineCode: h.line_code,
        machineId: h.machine_id,
        plannedQty: Number(h.planned_quantity ?? 0),
        uom: h.uom ?? 'kg',
        outputKg: Number(h.output_kg ?? 0),
        consumptionPct: Number(h.consumption_pct ?? 0),
        outputPct: Number(h.output_pct ?? 0),
        allergenGate: Boolean(h.has_allergen),
        scheduledStart: toIso(h.scheduled_start_time),
        scheduledEnd: toIso(h.scheduled_end_time),
        startedAt,
        completedAt,
        elapsedMin,
        bomVersion: h.bom_version,
        weightMode: h.weight_mode === 'catch' ? 'catch' : 'fixed',
      };

      // QA read-model not yet built — render an honest empty/zero summary.
      const qa: WoDetailQa = { total: 0, pass: 0, hold: 0, fail: 0 };

      return {
        ok: true,
        data: { header, components, outputs, waste, downtime, genealogyInputs, history, qa },
      };
    });
  } catch (error) {
    console.error('[production/wos/:id] WO-detail read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
