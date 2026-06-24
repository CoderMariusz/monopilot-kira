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
import { findOpenLineChangeover } from '../../../../../../lib/production/start-wo';
import {
  hasPermission,
  type ProductionContext,
  type WoState,
} from '../../../../../../lib/production/shared';

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

/**
 * Nil-UUID LP sentinel that LP-less consumes coalesce into
 * (consume-material-actions.ts / register-output.ts). A consumption row carrying
 * this lp_id has no real source license plate, so it must NOT count as genealogy
 * evidence for the "output-without-consumption" warning.
 */
const NIL_LP_SENTINEL = '00000000-0000-0000-0000-000000000000';

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
  /** production_lines.code/name — null when no line is assigned. */
  lineCode: string | null;
  lineName: string | null;
  machineId: string | null;
  /** machines.code / machines.name (mig 042) — null when no machine is assigned
   *  or the machine row is missing. The UI must render these, never the uuid. */
  machineCode: string | null;
  machineName: string | null;
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
  /**
   * E7 — bom_headers.bom_type for the WO's active BOM (mig 309). A 'disassembly'
   * WO has 1 input line + N co-product OUTPUTS (bom_co_products) and is executed
   * via registerDisassemblyOutput (NOT the forward Register-output flow). Defaults
   * to 'forward' when the WO has no BOM header or the column is absent. The
   * detail screen reads this to decide whether to offer the "Register disassembly
   * outputs" action — the route + service re-check it server-side regardless.
   */
  bomType: 'forward' | 'disassembly';
};

/** Consumption tab: BOM component required vs consumed. */
export type WoDetailComponent = {
  id: string;
  productId: string;
  /** items.item_code / items.name for the component product — null when the
   *  item row is missing. The UI must render these, never the uuid. */
  itemCode: string | null;
  itemName: string | null;
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
  /** items.item_code / items.name for the output product — null when missing. */
  productCode: string | null;
  productName: string | null;
  batchNumber: string;
  qtyKg: number;
  uom: string;
  qaStatus: string;
  lpId: string | null;
  lpNumber: string | null;
  expiryDate: string | null;
  correctionOfId: string | null;
  isCorrected: boolean;
};

/** Waste tab: a wo_waste_log row. */
export type WoDetailWaste = {
  id: string;
  recordedAt: string | null;
  categoryName: string | null;
  qtyKg: number;
  reasonNotes: string | null;
  correctionOfId: string | null;
  isCorrected: boolean;
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
  correctionOfId: string | null;
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

/**
 * E7 — an EXPECTED output of a disassembly BOM (one bom_co_products row). The
 * disassembly registration screen lists these so the operator enters the actual
 * yielded kg per co-product. `coProductItemId` is the value the
 * registerDisassemblyOutput service keys allocation on; `itemCode`/`itemName`
 * come from the items join (NEVER render the uuid). `allocationPct` is shown
 * read-only (the service owns the cost split). Empty for a forward WO.
 */
export type WoDisassemblyOutput = {
  coProductItemId: string;
  itemCode: string | null;
  itemName: string | null;
  allocationPct: number;
  isByproduct: boolean;
  /** bom_co_products.quantity — the nominal/expected yield, prefilled in the form. */
  expectedQty: number;
  uom: string;
};

/**
 * E7 — a candidate INPUT license plate for a disassembly WO: a consumed-input LP
 * already linked to this WO via wo_material_consumption (the carcass/primal being
 * broken down). The registration screen picks ONE of these as the
 * registerDisassemblyOutput `inputLpId` whose cost is allocated across the
 * outputs. Empty when nothing has been consumed yet (the screen then surfaces an
 * empty state — consume the input first).
 */
export type WoDisassemblyInputLp = {
  lpId: string;
  lpNumber: string | null;
  qtyKg: number;
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
  /**
   * E7 — the disassembly BOM's expected co-product OUTPUTS (bom_co_products).
   * Non-empty ONLY when the WO's active BOM has bom_type='disassembly'; empty for
   * a forward WO. The disassembly-registration screen lists these for qty entry.
   */
  disassemblyOutputs: WoDisassemblyOutput[];
  /**
   * E7 — candidate consumed-input LPs for a disassembly WO (the carcass/primal
   * already consumed into this WO). The screen picks one as the
   * registerDisassemblyOutput `inputLpId`. Empty for a forward WO or when nothing
   * has been consumed yet.
   */
  disassemblyInputLps: WoDisassemblyInputLp[];
  /**
   * Newest OPEN medium+ allergen changeover on this WO's line (start gate 3a) —
   * resolved by the gate's single owner findOpenLineChangeover so the detail
   * callout can never disagree with the START 409. Null = line clear.
   */
  openChangeoverId: string | null;
  /**
   * Owner-decision SOFT-warning state (no stored flag, no migration): TRUE when
   * the WO has ≥1 registered output (wo_outputs) but ZERO *real* material
   * consumption rows. "Real" excludes (a) the nil-UUID LP sentinel
   * (00000000-0000-0000-0000-000000000000) that no-LP consumes write and
   * (b) signed correction counter-entries (correction_of_id IS NOT NULL). When
   * TRUE the output LP has no genealogy/traceability parent — the detail screen
   * surfaces a non-blocking ⚠ badge + tooltip, and the register-output modal
   * shows a non-blocking "continue anyway" warning. Derived from the already-
   * loaded outputs + consumption rows — no extra round-trip.
   */
  hasOutputWithoutConsumption: boolean;
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
        line_name: string | null;
        machine_id: string | null;
        machine_code: string | null;
        machine_name: string | null;
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
        bom_type: string | null;
        bom_header_id: string | null;
      }>(
        `select w.id::text as id,
                w.wo_number,
                w.product_id::text as product_id,
                i.item_code,
                i.name as product_name,
                i.weight_mode,
                pl.code as line_code,
                pl.name as line_name,
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
                mc.code as machine_code,
                mc.name as machine_name,
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
                  where o.wo_id = w.id and o.org_id = app.current_org_id()) as output_pct,
                coalesce(bh.bom_type, 'forward') as bom_type,
                coalesce(w.active_bom_header_id, w.bom_id)::text as bom_header_id
           from public.work_orders w
           left join public.wo_executions e
             on e.org_id = w.org_id and e.wo_id = w.id
           left join public.items i
             on i.org_id = w.org_id and i.id = w.product_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
           left join public.machines mc
             on mc.org_id = w.org_id and mc.id = w.machine_id
           left join public.bom_headers bh
             on bh.org_id = w.org_id
            and bh.id = coalesce(w.active_bom_header_id, w.bom_id)
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
          item_code: string | null;
          item_name: string | null;
          material_name: string;
          required_qty: string | number;
          consumed_qty: string | number;
          uom: string;
        }>(
          `select m.id::text as id, m.product_id::text as product_id,
                  i.item_code, i.name as item_name, m.material_name,
                  m.required_qty, m.consumed_qty, m.uom
             from public.wo_materials m
             left join public.items i
               on i.org_id = m.org_id and i.id = m.product_id
            where m.org_id = app.current_org_id() and m.wo_id = $1::uuid
            order by m.sequence asc, m.material_name asc`,
          [woId],
        ),
        c.query<{
          id: string;
          output_type: string;
          product_id: string;
          product_code: string | null;
          product_name: string | null;
          batch_number: string;
          qty_kg: string | number;
          uom: string;
          qa_status: string;
          lp_id: string | null;
          lp_number: string | null;
          expiry_date: string | Date | null;
          correction_of_id: string | null;
          is_corrected: boolean;
        }>(
          `select o.id::text as id, o.output_type, o.product_id::text as product_id,
                  i.item_code as product_code, i.name as product_name,
                  o.batch_number, o.qty_kg, o.uom, o.qa_status, o.lp_id::text as lp_id,
                  lp.lp_number as lp_number, o.expiry_date,
                  o.correction_of_id::text as correction_of_id,
                  exists (
                    select 1
                      from public.wo_outputs oc
                     where oc.org_id = app.current_org_id()
                       and oc.correction_of_id = o.id
                  ) as is_corrected
             from public.wo_outputs o
             left join public.items i
               on i.org_id = o.org_id and i.id = o.product_id
             left join public.license_plates lp
               on lp.id = o.lp_id and lp.org_id = o.org_id
            where o.org_id = app.current_org_id() and o.wo_id = $1::uuid
            order by o.output_type asc, o.registered_at asc`,
          [woId],
        ),
        c.query<{
          id: string;
          recorded_at: string | Date | null;
          category_name: string | null;
          qty_kg: string | number;
          reason_notes: string | null;
          correction_of_id: string | null;
          is_corrected: boolean;
        }>(
          `select wl.id::text as id, wl.recorded_at, wc.name as category_name,
                  wl.qty_kg, wl.reason_notes,
                  wl.correction_of_id::text as correction_of_id,
                  exists (
                    select 1
                      from public.wo_waste_log wcorr
                     where wcorr.org_id = app.current_org_id()
                       and wcorr.correction_of_id = wl.id
                  ) as is_corrected
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
          correction_of_id: string | null;
        }>(
          `select id::text as id, component_id::text as component_id, lp_id::text as lp_id,
                  qty_consumed, fefo_adherence_flag, consumed_at,
                  correction_of_id::text as correction_of_id
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
          itemCode: r.item_code,
          itemName: r.item_name,
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
        productCode: r.product_code,
        productName: r.product_name,
        batchNumber: r.batch_number,
        qtyKg: Number(r.qty_kg),
        uom: r.uom,
        qaStatus: r.qa_status,
        lpId: r.lp_id,
        lpNumber: r.lp_number,
        expiryDate: toIso(r.expiry_date),
        correctionOfId: r.correction_of_id,
        isCorrected: Boolean(r.is_corrected),
      }));

      const waste: WoDetailWaste[] = wasteRes.rows.map((r) => ({
        id: r.id,
        recordedAt: toIso(r.recorded_at),
        categoryName: r.category_name,
        qtyKg: Number(r.qty_kg),
        reasonNotes: r.reason_notes,
        correctionOfId: r.correction_of_id,
        isCorrected: Boolean(r.is_corrected),
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
        correctionOfId: r.correction_of_id,
      }));

      // SOFT-warning derivation (owner decision — warn, never block; no stored
      // flag). Count only *real* consumption rows: drop the nil-UUID LP sentinel
      // that LP-less consumes write, and drop signed correction counter-entries.
      // Reuses the already-loaded genealogy rows + outputs — no extra round-trip.
      const realConsumptionCount = genealogyRes.rows.filter(
        (r) => r.lp_id !== NIL_LP_SENTINEL && r.correction_of_id == null,
      ).length;
      const hasOutputWithoutConsumption =
        outputs.length > 0 && realConsumptionCount === 0;

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
        lineName: h.line_name,
        machineId: h.machine_id,
        machineCode: h.machine_code,
        machineName: h.machine_name,
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
        bomType: h.bom_type === 'disassembly' ? 'disassembly' : 'forward',
      };

      // QA read-model not yet built — render an honest empty/zero summary.
      const qa: WoDetailQa = { total: 0, pass: 0, hold: 0, fail: 0 };

      // Start-gate preview: only meaningful before the WO is running/done.
      const openChangeoverId =
        status === 'planned'
          ? await findOpenLineChangeover(c, null, h.production_line_id)
          : null;

      // E7 — disassembly extras. Only loaded for a disassembly BOM (forward WOs
      // skip both queries entirely). The expected outputs are this BOM's
      // co-products (items join → code/name, never the uuid); the input-LP
      // candidates are the LPs already consumed into this WO (the carcass/primal
      // being broken down), folded from wo_material_consumption ⨝ license_plates.
      let disassemblyOutputs: WoDisassemblyOutput[] = [];
      let disassemblyInputLps: WoDisassemblyInputLp[] = [];
      if (header.bomType === 'disassembly' && h.bom_header_id) {
        const [coProductsRes, inputLpsRes] = await Promise.all([
          c.query<{
            co_product_item_id: string;
            item_code: string | null;
            item_name: string | null;
            allocation_pct: string | number;
            is_byproduct: boolean;
            quantity: string | number;
            uom: string;
          }>(
            `select cp.co_product_item_id::text as co_product_item_id,
                    i.item_code, i.name as item_name,
                    cp.allocation_pct, cp.is_byproduct, cp.quantity, cp.uom
               from public.bom_co_products cp
               left join public.items i
                 on i.org_id = cp.org_id and i.id = cp.co_product_item_id
              where cp.org_id = app.current_org_id()
                and cp.bom_header_id = $1::uuid
              order by i.item_code asc nulls last, cp.co_product_item_id asc`,
            [h.bom_header_id],
          ),
          c.query<{
            lp_id: string;
            lp_number: string | null;
            qty_kg: string | number;
          }>(
            `select mc.lp_id::text as lp_id,
                    lp.lp_number,
                    coalesce(sum(mc.qty_consumed), 0) as qty_kg
               from public.wo_material_consumption mc
               left join public.license_plates lp
                 on lp.id = mc.lp_id and lp.org_id = mc.org_id
              where mc.org_id = app.current_org_id()
                and mc.wo_id = $1::uuid
                and mc.lp_id is not null
                and mc.lp_id <> $2::uuid
                and mc.correction_of_id is null
              group by mc.lp_id, lp.lp_number
              order by lp.lp_number asc nulls last`,
            [woId, NIL_LP_SENTINEL],
          ),
        ]);

        disassemblyOutputs = coProductsRes.rows.map((r) => ({
          coProductItemId: r.co_product_item_id,
          itemCode: r.item_code,
          itemName: r.item_name,
          allocationPct: Number(r.allocation_pct),
          isByproduct: Boolean(r.is_byproduct),
          expectedQty: Number(r.quantity),
          uom: r.uom,
        }));

        disassemblyInputLps = inputLpsRes.rows.map((r) => ({
          lpId: r.lp_id,
          lpNumber: r.lp_number,
          qtyKg: Number(r.qty_kg),
        }));
      }

      return {
        ok: true,
        data: {
          header,
          components,
          outputs,
          waste,
          downtime,
          genealogyInputs,
          history,
          qa,
          disassemblyOutputs,
          disassemblyInputLps,
          openChangeoverId,
          hasOutputWithoutConsumption,
        },
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
