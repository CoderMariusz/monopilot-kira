'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { assertDraftWorkOrderDeletable } from '../../../../../../../lib/planning/wo-chain-delete-guard';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import {
  assertUpstreamWipReady,
  upstreamWipNotReadyMessage,
} from '../../../../../../../lib/planning/upstream-wip-dependency-gate';
import { acquireFactorySpecProductBindLock } from '../../../../../../../lib/technical/factory-spec-bind-lock';
import { packHierarchyComplete, snapshotFromItemRow } from '../../../../../../../lib/uom/convert';
import {
  APP_VERSION,
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  type CancelWorkOrderChainResult,
  type DeleteDraftWorkOrderResult,
  type OrgActionContext,
  mapWoHeader,
  type ReleaseWorkOrderResult,
  type WorkOrderRow,
} from './shared';

type ReleasePreflightRow = {
  item_type_at_creation: string;
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
  output_uom: string | null;
  net_qty_per_each: string | null;
  each_per_box: string | null;
};

type DraftWorkOrderDeleteRow = Pick<WorkOrderRow, 'id' | 'wo_number' | 'status' | 'product_id' | 'planned_quantity' | 'uom'>;

type ChainMemberRow = {
  id: string;
  depth: number;
  status: string;
  wo_number: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Undirected membership CTE — collects every WO in the dependency component (cancel / guards). */
const CHAIN_MEMBERS_SQL = `with recursive chain(wo_id, depth) as (
       select $1::uuid, 0
       union
       select case
                when d.parent_wo_id = c.wo_id then d.child_wo_id
                else d.parent_wo_id
              end,
              c.depth + 1
         from chain c
         join public.wo_dependencies d
           on d.org_id = app.current_org_id()
          and (d.parent_wo_id = c.wo_id or d.child_wo_id = c.wo_id)
        where c.depth < 32
     )
     select ch.wo_id::text as id,
            max(ch.depth)::int as depth,
            wo.status,
            wo.wo_number
       from chain ch
       join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = ch.wo_id
      group by ch.wo_id, wo.status, wo.wo_number
      order by max(ch.depth) desc, wo.wo_number`;

/** Directed parent→child depth from the FG root (release order: deepest descendant first, root last). */
const CHAIN_RELEASE_ORDER_SQL = `with recursive chain(wo_id, depth) as (
       select $1::uuid, 0
       union all
       select d.child_wo_id,
              c.depth + 1
         from chain c
         join public.wo_dependencies d
           on d.org_id = app.current_org_id()
          and d.parent_wo_id = c.wo_id
        where c.depth < 32
     )
     select ch.wo_id::text as id,
            ch.depth,
            wo.status,
            wo.wo_number
       from chain ch
       join public.work_orders wo
         on wo.org_id = app.current_org_id()
        and wo.id = ch.wo_id
      where ch.depth > 0
      order by ch.depth desc, wo.wo_number`;

const RELEASE_PREFLIGHT_SQL = `select
    wo.item_type_at_creation,
    coalesce(wo.active_factory_spec_id, (
      select fs.id
        from public.factory_specs fs
       where fs.org_id = app.current_org_id()
         and fs.fg_item_id = wo.product_id
         and fs.status in ('approved_for_factory', 'released_to_factory')
       order by fs.version desc
       limit 1
    )) as active_factory_spec_id,
    coalesce(wo.active_bom_header_id, (
      select bh.id
        from public.bom_headers bh
       where bh.org_id = app.current_org_id()
         and bh.item_id = wo.product_id
         and bh.status = 'active'
       order by bh.version desc
       limit 1
    )) as active_bom_header_id,
    (select i.output_uom from public.items i
      where i.id = wo.product_id and i.org_id = app.current_org_id()) as output_uom,
    (select i.net_qty_per_each::text from public.items i
      where i.id = wo.product_id and i.org_id = app.current_org_id()) as net_qty_per_each,
    (select i.each_per_box::text from public.items i
      where i.id = wo.product_id and i.org_id = app.current_org_id()) as each_per_box
  from public.work_orders wo
 where wo.org_id = app.current_org_id()
   and wo.id = $1::uuid
   and wo.status = 'DRAFT'`;

function revalidateWorkOrderDeletePaths(id: string): void {
  revalidateLocalized('/planning/work-orders');
  revalidateLocalized(`/planning/work-orders/${id}`);
}

function evaluateReleasePreflight(preflight: ReleasePreflightRow): ReleaseWorkOrderResult | null {
  if (preflight.output_uom === 'each' || preflight.output_uom === 'box') {
    const snap = snapshotFromItemRow({
      output_uom: preflight.output_uom,
      net_qty_per_each: preflight.net_qty_per_each,
      each_per_box: preflight.each_per_box,
    });
    if (!packHierarchyComplete(snap)) {
      return { ok: false, error: 'pack_hierarchy_incomplete' };
    }
  }

  const missing: Array<'active_bom' | 'factory_spec'> = [];
  if (!preflight.active_bom_header_id) missing.push('active_bom');
  if (
    preflight.item_type_at_creation !== 'intermediate'
    && !preflight.active_factory_spec_id
  ) {
    missing.push('factory_spec');
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'factory_release_incomplete',
      missing,
      message:
        'Factory spec or active BOM missing — generate and complete the factory spec in Technical before release.',
    };
  }

  return null;
}

async function loadChainMembers(ctx: OrgActionContext, rootWoId: string): Promise<ChainMemberRow[]> {
  const { rows } = await ctx.client.query<ChainMemberRow>(CHAIN_MEMBERS_SQL, [rootWoId]);
  return rows;
}

async function loadChainDescendantsForRelease(
  ctx: OrgActionContext,
  rootWoId: string,
): Promise<ChainMemberRow[]> {
  const { rows } = await ctx.client.query<ChainMemberRow>(CHAIN_RELEASE_ORDER_SQL, [rootWoId]);
  return rows;
}

/** Release one DRAFT WO inside an existing org transaction (no withOrgContext wrapper). */
export async function releaseWorkOrderForContext(
  ctx: OrgActionContext,
  woId: string,
): Promise<ReleaseWorkOrderResult> {
  const current = await ctx.client.query<{ status: string; product_id: string }>(
    `select wo.status, wo.product_id::text as product_id
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      limit 1
      for update`,
    [woId],
  );
  const row = current.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'RELEASED') {
    const existing = await ctx.client.query<WorkOrderRow>(
      `select wo.id, wo.wo_number, wo.product_id,
              (select i.item_code from public.items i where i.id = wo.product_id and i.org_id = app.current_org_id()) as item_code,
              wo.item_type_at_creation, wo.planned_quantity::text as planned_quantity,
              wo.produced_quantity::text as produced_quantity, wo.uom, wo.status,
              wo.scheduled_start_time, wo.scheduled_end_time, wo.production_line_id,
              wo.priority, wo.source_of_demand, wo.source_reference, wo.ext_jsonb->>'notes' as notes,
              wo.created_at, wo.updated_at
         from public.work_orders wo
        where wo.org_id = app.current_org_id()
          and wo.id = $1::uuid`,
      [woId],
    );
    const workOrder = existing.rows[0];
    return workOrder ? { ok: true, workOrder: mapWoHeader(workOrder) } : { ok: false, error: 'not_found' };
  }
  if (row.status !== 'DRAFT') return { ok: false, error: 'invalid_state' };

  await acquireFactorySpecProductBindLock(ctx.client, row.product_id);

  const preflightResult = await ctx.client.query<ReleasePreflightRow>(RELEASE_PREFLIGHT_SQL, [woId]);
  const preflight = preflightResult.rows[0];
  if (!preflight) return { ok: false, error: 'invalid_state' };

  const gateFailure = evaluateReleasePreflight(preflight);
  if (gateFailure) return gateFailure;

  const upstreamGate = await assertUpstreamWipReady(ctx.client, woId, 'release');
  if (upstreamGate) {
    return {
      ok: false,
      error: 'upstream_wip_not_ready',
      message: upstreamWipNotReadyMessage(upstreamGate),
      details: upstreamGate,
    };
  }

  const healed = await ctx.client.query<ReleasePreflightRow>(
    `update public.work_orders wo
        set active_factory_spec_id = coalesce(wo.active_factory_spec_id, (
              select fs.id
                from public.factory_specs fs
               where fs.org_id = app.current_org_id()
                 and fs.fg_item_id = wo.product_id
                 and fs.status in ('approved_for_factory', 'released_to_factory')
               order by fs.version desc
               limit 1
            )),
            active_bom_header_id = coalesce(wo.active_bom_header_id, (
              select bh.id
                from public.bom_headers bh
               where bh.org_id = app.current_org_id()
                 and bh.item_id = wo.product_id
                 and bh.status = 'active'
               order by bh.version desc
               limit 1
            )),
            uom_snapshot = coalesce(wo.uom_snapshot, (
              select jsonb_build_object(
                'output_uom', i.output_uom,
                'uom_base', i.uom_base,
                'net_qty_per_each', i.net_qty_per_each,
                'each_per_box', i.each_per_box,
                'boxes_per_pallet', i.boxes_per_pallet,
                'weight_mode', i.weight_mode
              )
                from public.items i
               where i.id = wo.product_id
                 and i.org_id = app.current_org_id()
               limit 1
            )),
            updated_by = $2::uuid
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
        and wo.status = 'DRAFT'
      returning active_bom_header_id, active_factory_spec_id,
                (select i.output_uom from public.items i
                  where i.id = wo.product_id and i.org_id = app.current_org_id()) as output_uom,
                (select i.net_qty_per_each::text from public.items i
                  where i.id = wo.product_id and i.org_id = app.current_org_id()) as net_qty_per_each,
                (select i.each_per_box::text from public.items i
                  where i.id = wo.product_id and i.org_id = app.current_org_id()) as each_per_box`,
    [woId, ctx.userId],
  );
  if (!healed.rows[0]) return { ok: false, error: 'invalid_state' };

  const updated = await ctx.client.query<WorkOrderRow>(
    `update public.work_orders wo
        set status = 'RELEASED',
            updated_by = $2::uuid
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
        and wo.status = 'DRAFT'
      returning wo.id, wo.wo_number, wo.product_id,
                (select i.item_code from public.items i where i.id = wo.product_id and i.org_id = app.current_org_id()) as item_code,
                wo.item_type_at_creation, wo.planned_quantity::text as planned_quantity,
                wo.produced_quantity::text as produced_quantity, wo.uom, wo.status,
                wo.scheduled_start_time, wo.scheduled_end_time, wo.production_line_id,
                wo.priority, wo.source_of_demand, wo.source_reference, wo.ext_jsonb->>'notes' as notes,
                wo.created_at, wo.updated_at`,
    [woId, ctx.userId],
  );
  const workOrder = updated.rows[0];
  if (!workOrder) return { ok: false, error: 'invalid_state' };

  await ctx.client.query(
    `insert into public.wo_status_history
       (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
     values
       (app.current_org_id(), $1::uuid, 'DRAFT', 'RELEASED', 'release', $2::uuid, $3::jsonb)`,
    [woId, ctx.userId, JSON.stringify({ app_version: APP_VERSION })],
  );

  return { ok: true, workOrder: mapWoHeader(workOrder) };
}

/** Read-only release gates for one chain member — no writes. */
async function preflightChainMemberRelease(
  ctx: OrgActionContext,
  woId: string,
  chainDraftChildIds: ReadonlySet<string>,
): Promise<ReleaseWorkOrderResult | null> {
  const current = await ctx.client.query<{ status: string }>(
    `select wo.status
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      limit 1`,
    [woId],
  );
  const row = current.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'RELEASED') return null;
  if (row.status !== 'DRAFT') return { ok: false, error: 'invalid_state' };

  const preflightResult = await ctx.client.query<ReleasePreflightRow>(RELEASE_PREFLIGHT_SQL, [woId]);
  const preflight = preflightResult.rows[0];
  if (!preflight) return { ok: false, error: 'invalid_state' };

  const gateFailure = evaluateReleasePreflight(preflight);
  if (gateFailure) return gateFailure;

  const upstreamGate = await assertUpstreamWipReady(ctx.client, woId, 'release');
  if (upstreamGate) {
    const blockers = upstreamGate.blockers.filter(
      (blocker) => !(chainDraftChildIds.has(blocker.child_wo_id) && blocker.release_blocked),
    );
    if (blockers.length > 0) {
      return {
        ok: false,
        error: 'upstream_wip_not_ready',
        message: upstreamWipNotReadyMessage({ ...upstreamGate, blockers }),
        details: { ...upstreamGate, blockers },
      };
    }
  }

  return null;
}

/**
 * Release every DRAFT member of a dependency chain, deepest upstream WIP first,
 * then the FG root — so upstream-wip gates pass in one transaction.
 */
export async function releaseWorkOrderChainForContext(
  ctx: OrgActionContext,
  rootWoId: string,
): Promise<ReleaseWorkOrderResult> {
  const descendants = await loadChainDescendantsForRelease(ctx, rootWoId);
  const members = await loadChainMembers(ctx, rootWoId);
  if (members.length === 0) return { ok: false, error: 'not_found' };

  const rootMember = members.find((member) => member.id === rootWoId)
    ?? members.find((member) => member.depth === 0);
  const draftDescendants = descendants.filter((member) => member.status === 'DRAFT');
  const chainDraftChildIds = new Set(draftDescendants.map((member) => member.id));
  const draftMembers = [
    ...draftDescendants,
    ...(rootMember?.status === 'DRAFT' ? [rootMember] : []),
  ];

  for (const member of draftMembers) {
    const failure = await preflightChainMemberRelease(ctx, member.id, chainDraftChildIds);
    if (failure) return failure;
  }

  for (const member of descendants) {
    if (member.status !== 'DRAFT') continue;
    const result = await releaseWorkOrderForContext(ctx, member.id);
    if (!result.ok) return result;
  }

  return releaseWorkOrderForContext(ctx, rootWoId);
}

/** Cancel every DRAFT/RELEASED member of a WO chain atomically (Extra-3). */
export async function cancelWorkOrderChainForContext(
  ctx: OrgActionContext,
  rootWoId: string,
): Promise<CancelWorkOrderChainResult> {
  const members = await loadChainMembers(ctx, rootWoId);
  if (members.length === 0) return { ok: false, error: 'not_found' };

  const cancellable = new Set(['DRAFT', 'RELEASED']);
  for (const member of members) {
    if (!cancellable.has(member.status)) {
      return { ok: false, error: 'chain_cancel_blocked' };
    }
  }

  const blocked = await ctx.client.query<{ blocked: boolean }>(
    `select exists (
       select 1
         from (${CHAIN_MEMBERS_SQL}) ch
         join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.id = ch.id::uuid
        where exists (
          select 1
            from public.wo_executions ex
           where ex.org_id = wo.org_id
             and ex.wo_id = wo.id
             and coalesce(ex.status, 'planned') not in ('planned', 'cancelled')
        )
         or exists (
          select 1
            from public.wo_outputs o
           where o.org_id = wo.org_id
             and o.wo_id = wo.id
          limit 1
        )
     ) as blocked`,
    [rootWoId],
  );
  if (blocked.rows[0]?.blocked) {
    return { ok: false, error: 'chain_cancel_blocked' };
  }

  const cancelledIds: string[] = [];
  for (const member of members) {
    if (member.status === 'CANCELLED') {
      cancelledIds.push(member.id);
      continue;
    }
    const updated = await ctx.client.query<{ id: string; status: string }>(
      `update public.work_orders wo
          set status = 'CANCELLED',
              updated_by = $2::uuid
        where wo.org_id = app.current_org_id()
          and wo.id = $1::uuid
          and wo.status in ('DRAFT', 'RELEASED')
        returning wo.id::text as id, wo.status`,
      [member.id, ctx.userId],
    );
    const row = updated.rows[0];
    if (!row) return { ok: false, error: 'invalid_state' };
    cancelledIds.push(row.id);

    await ctx.client.query(
      `insert into public.wo_status_history
         (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
       values
         (app.current_org_id(), $1::uuid, $2, 'CANCELLED', 'cancel_chain', $3::uuid, $4::jsonb)`,
      [member.id, member.status, ctx.userId, JSON.stringify({ app_version: APP_VERSION, root_wo_id: rootWoId })],
    );
  }

  return { ok: true, rootId: rootWoId, cancelledIds };
}

export async function cancelWorkOrderChain(params: { id: string }): Promise<CancelWorkOrderChainResult> {
  if (!params.id || !UUID_RE.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    const result = await withOrgContext(async (ctx): Promise<CancelWorkOrderChainResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }
      return cancelWorkOrderChainForContext(ctx, params.id);
    });
    if (result.ok) {
      revalidateWorkOrderDeletePaths(result.rootId);
      for (const id of result.cancelledIds) {
        revalidateLocalized(`/planning/work-orders/${id}`);
      }
    }
    return result;
  } catch (error) {
    console.error('[cancelWorkOrderChain] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function releaseWorkOrder(params: { id: string }): Promise<ReleaseWorkOrderResult> {
  if (!params.id || !UUID_RE.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx): Promise<ReleaseWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };
      return releaseWorkOrderForContext(ctx, params.id);
    });
  } catch (error) {
    console.error('[releaseWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteDraftWorkOrder(params: { id: string }): Promise<DeleteDraftWorkOrderResult> {
  if (!params.id || !UUID_RE.test(params.id)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx): Promise<DeleteDraftWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const current = await ctx.client.query<DraftWorkOrderDeleteRow>(
        `select id, wo_number, status, product_id, planned_quantity::text as planned_quantity, uom
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [params.id],
      );
      const row = current.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.status !== 'DRAFT' && row.status !== 'CANCELLED') {
        return { ok: false, error: 'invalid_state' };
      }

      const chainGate = await assertDraftWorkOrderDeletable(ctx.client, row.id);
      if (!chainGate.ok) return chainGate;

      const fromStatus = row.status;
      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, $2, 'CANCELLED', 'delete_draft', $3::uuid, $4::jsonb)`,
        [
          row.id,
          fromStatus,
          ctx.userId,
          JSON.stringify({
            app_version: APP_VERSION,
            wo_number: row.wo_number,
            product_id: row.product_id,
            planned_quantity: row.planned_quantity,
            uom: row.uom,
          }),
        ],
      );

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values
           (app.current_org_id(), $1::uuid, 'user', 'planning.work_order.deleted', 'work_order', $2,
            $3::jsonb, null, gen_random_uuid(), 'operational')`,
        [
          ctx.userId,
          row.id,
          JSON.stringify({
            id: row.id,
            wo_number: row.wo_number,
            status: row.status,
            product_id: row.product_id,
            planned_quantity: row.planned_quantity,
            uom: row.uom,
          }),
        ],
      );

      const deleted = await ctx.client.query(
        `delete from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status in ('DRAFT', 'CANCELLED')`,
        [row.id],
      );
      if ((deleted.rowCount ?? 0) !== 1) return { ok: false, error: 'invalid_state' };

      revalidateWorkOrderDeletePaths(row.id);
      return { ok: true, id: row.id };
    });
  } catch (error) {
    console.error('[deleteDraftWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
