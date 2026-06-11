'use server';

/**
 * W9-M2 — runMrp: read-first MRP vertical (04-planning T-032 family, first slice).
 *
 * Pure READ + compute — persists NOTHING (the mrp_runs / mrp_requirements /
 * mrp_planned_orders tables from migration 178 exist but this slice does not
 * write them; suggestions are returned to the screen only, no orders are
 * auto-created). All reads run inside withOrgContext as app_user, RLS-scoped
 * via app.current_org_id() — no service-role bypass.
 *
 * Demand / supply sources (see mrp-compute.ts for the netting formula + caveats):
 *   - demand:      wo_materials (required − consumed) on DRAFT/RELEASED/IN_PROGRESS WOs (mig 176)
 *   - on-hand:     v_inventory_available (mig 191; status=available + qa released)
 *   - PO supply:   purchase_order_lines remainder (qty − Σ grn_items.received_qty,
 *                  non-cancelled GRNs — same join shape as purchase-orders/_actions
 *                  fetchLines) on open POs (sent/confirmed/partially_received)
 *   - production:  schedule_outputs.expected_qty (mig 177, planning-owned) of open
 *                  WOs with disposition='to_stock' — intermediates incoming supply
 *
 * RBAC: gated on the planning READ permission `scheduler.run.read` (the same
 * gate the planning dashboard + module-registry use). Writes elsewhere in the
 * module gate on `npd.planning.write` — not needed here (no writes).
 */
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  computeMrp,
  type MrpItemRow,
  type MrpKpis,
  type MrpOnHandBucket,
  type MrpQtyBucket,
  type MrpRow,
} from './mrp-compute';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Planning read gate — byte-matches the module-registry planning-basic gate. */
const PLANNING_READ_PERMISSION = 'scheduler.run.read';

/** WO statuses whose materials count as open demand / whose outputs count as incoming supply. */
const OPEN_WO_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS'];
/** PO statuses that represent committed open supply (draft POs are not yet committed). */
const OPEN_PO_STATUSES = ['sent', 'confirmed', 'partially_received'];
/** Item types planned by MRP. fg/co_product/byproduct demand is production output, not material demand. */
const MRP_ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'packaging'];

export type MrpRunData = {
  /** ISO timestamp of this (non-persisted) run. */
  ranAt: string;
  rows: MrpRow[];
  kpis: MrpKpis;
};

export type MrpRunResult =
  | { ok: true; data: MrpRunData }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

async function hasPlanningReadPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, PLANNING_READ_PERMISSION],
  );
  return rows.length > 0;
}

export async function runMrp(): Promise<MrpRunResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpRunResult> => {
      const c = client as QueryClient;

      if (!(await hasPlanningReadPermission(c, userId, orgId))) {
        return { ok: false, error: 'forbidden' };
      }

      // 1) Item master — the MRP-planned item universe (pack hierarchy for UoM conversion).
      const items = await c.query<MrpItemRow>(
        `select i.id, i.item_code, i.name, i.item_type, i.uom_base,
                i.output_uom, i.net_qty_per_each::text as net_qty_per_each, i.each_per_box
           from public.items i
          where i.org_id = app.current_org_id()
            and i.item_type = any($1::text[])`,
        [MRP_ITEM_TYPES],
      );

      // 2) On-hand + reserved from the FEFO read model (available + QA-released only).
      const onHand = await c.query<MrpOnHandBucket>(
        `select product_id, uom,
                sum(quantity)::text as on_hand,
                sum(reserved_qty)::text as reserved
           from public.v_inventory_available
          where org_id = app.current_org_id()
          group by product_id, uom`,
      );

      // 3) Demand — unconsumed BOM-snapshot materials on open WOs.
      const demand = await c.query<MrpQtyBucket>(
        `select m.product_id, m.uom,
                sum(greatest(m.required_qty - m.consumed_qty, 0))::text as qty
           from public.wo_materials m
           join public.work_orders w
             on w.id = m.wo_id
            and w.org_id = app.current_org_id()
            and w.status = any($1::text[])
          where m.org_id = app.current_org_id()
          group by m.product_id, m.uom`,
        [OPEN_WO_STATUSES],
      );

      // 4) Open-PO remainder — ordered minus received (grn_items on non-cancelled GRNs;
      //    same aggregate shape as purchase-orders/_actions/actions.ts fetchLines).
      const poSupply = await c.query<MrpQtyBucket>(
        `select l.item_id as product_id, l.uom,
                sum(greatest(l.qty - coalesce(rec.received_qty, 0), 0))::text as qty
           from public.purchase_order_lines l
           join public.purchase_orders po
             on po.id = l.po_id
            and po.org_id = app.current_org_id()
            and po.status = any($1::text[])
           left join (
             select gi.po_line_id, sum(gi.received_qty) as received_qty
               from public.grn_items gi
               join public.grns g
                 on g.id = gi.grn_id
                and g.org_id = app.current_org_id()
                and g.status <> 'cancelled'
              where gi.org_id = app.current_org_id()
                and gi.po_line_id is not null
              group by gi.po_line_id
           ) rec on rec.po_line_id = l.id
          where l.org_id = app.current_org_id()
          group by l.item_id, l.uom`,
        [OPEN_PO_STATUSES],
      );

      // 5) Planned production supply — schedule_outputs (planning-owned projection)
      //    of open WOs, to-stock only (direct_continue feeds a downstream WO, not
      //    stock; pending_decision is excluded conservatively).
      //
      //    Self-supply guard (Codex batch-D F2): a WO that CONSUMES product X to
      //    MAKE product X (rework / regrind) must not offset its own open material
      //    demand with its own projected output — that nets the loop to ~zero and
      //    hides the real shortage. Anti-join: drop any schedule_outputs row whose
      //    WO still has an open wo_materials demand row for the SAME product.
      const productionSupply = await c.query<MrpQtyBucket>(
        `select so.product_id, so.uom, sum(so.expected_qty)::text as qty
           from public.schedule_outputs so
           join public.work_orders w
             on w.id = so.planned_wo_id
            and w.org_id = app.current_org_id()
            and w.status = any($1::text[])
          where so.org_id = app.current_org_id()
            and so.disposition = 'to_stock'
            and not exists (
              select 1
                from public.wo_materials m
               where m.org_id = app.current_org_id()
                 and m.wo_id = so.planned_wo_id
                 and m.product_id = so.product_id
                 and m.required_qty > m.consumed_qty
            )
          group by so.product_id, so.uom`,
        [OPEN_WO_STATUSES],
      );

      const { rows, kpis } = computeMrp({
        items: items.rows,
        onHand: onHand.rows,
        demand: demand.rows,
        poSupply: poSupply.rows,
        productionSupply: productionSupply.rows,
      });

      return { ok: true, data: { ranAt: new Date().toISOString(), rows, kpis } };
    });
  } catch (err) {
    console.error('[planning/mrp] runMrp failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
