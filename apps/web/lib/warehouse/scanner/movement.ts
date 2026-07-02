import { createHash } from 'node:crypto';

import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../scanner/txn-org-context';

import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

const IMMOVABLE_STATUSES = ['consumed', 'destroyed', 'shipped'] as const;

export type ScannerLpDetail = {
  id: string;
  lpNumber: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  quantity: string;
  reservedQty: string;
  availableQty: string;
  uom: string;
  status: string;
  qaStatus: string;
  expiryDate: string | null;
  batchNumber: string | null;
  locationId: string | null;
  locationCode: string | null;
  warehouseId: string;
  warehouseCode: string | null;
  lastMoveAt: string | null;
  parents: Array<{ id: string; lpNumber: string }>;
  children: Array<{ id: string; lpNumber: string }>;
};

export type PutawaySuggestion = {
  locationId: string;
  locationCode: string;
  locationName: string;
  reason: 'same_product' | 'empty' | 'default';
};

export type WarehouseScannerWo = {
  id: string;
  woNumber: string;
  productCode: string | null;
  productName: string | null;
  status: string;
  lineCode: string | null;
  materials: Array<{
    id: string;
    productId: string;
    productCode: string | null;
    productName: string | null;
    requiredQty: string;
    consumedQty: string;
    uom: string;
  }>;
};

export type FefoLp = {
  id: string;
  lpNumber: string;
  availableQty: string;
  uom: string;
  expiryDate: string | null;
  locationCode: string | null;
};

export type MoveInput = {
  clientOpId: string;
  lpId: string;
  toLocationId: string;
  reason?: string | null;
  moveType: 'putaway' | 'transfer';
};

export type PickInput = {
  clientOpId: string;
  woId: string;
  materialId: string;
  lpId: string;
  toLocationId?: string | null;
};

export type MoveResult = { ok: true; moveId: string | null; replay?: true };

export class WarehouseScannerError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WarehouseScannerError';
  }
}

type LpHeaderRow = {
  id: string;
  lp_number: string;
  product_id: string;
  item_code: string | null;
  item_name: string | null;
  quantity: string;
  reserved_qty: string;
  available_qty: string;
  uom: string;
  status: string;
  qa_status: string;
  expiry_date: string | Date | null;
  batch_number: string | null;
  location_id: string | null;
  location_code: string | null;
  warehouse_id: string;
  warehouse_code: string | null;
  last_move_at: string | Date | null;
};

export async function getScannerLpDetail(client: QueryClient, code: string): Promise<ScannerLpDetail | null> {
  const { rows } = await client.query<LpHeaderRow>(
    `select lp.id::text,
            lp.lp_number,
            lp.product_id::text,
            i.item_code,
            i.name as item_name,
            lp.quantity::text,
            lp.reserved_qty::text,
            (lp.quantity - lp.reserved_qty)::text as available_qty,
            lp.uom,
            lp.status,
            lp.qa_status,
            lp.expiry_date,
            lp.batch_number,
            lp.location_id::text,
            loc.code as location_code,
            lp.warehouse_id::text,
            w.code as warehouse_code,
            (
              select max(sm.move_date)
                from public.stock_moves sm
               where sm.org_id = app.current_org_id()
                 and sm.lp_id = lp.id
            ) as last_move_at
       from public.license_plates lp
       left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
       left join public.locations loc on loc.org_id = app.current_org_id() and loc.id = lp.location_id
       left join public.warehouses w on w.org_id = app.current_org_id() and w.id = lp.warehouse_id
      where lp.org_id = app.current_org_id()
        and (lp.lp_number = $1 or ($2::uuid is not null and lp.id = $2::uuid))
      limit 1`,
    [code, isUuid(code) ? code : null],
  );
  const row = rows[0];
  if (!row) return null;

  const [parents, children] = await Promise.all([
    client.query<{ id: string; lp_number: string }>(
      `with recursive parents as (
         select parent.id, parent.lp_number, parent.parent_lp_id, 1 as depth, array[parent.id] as path
           from public.license_plates child
           join public.license_plates parent
             on parent.org_id = app.current_org_id()
            and parent.id = child.parent_lp_id
          where child.org_id = app.current_org_id()
            and child.id = $1::uuid
         union all
         select parent.id, parent.lp_number, parent.parent_lp_id, parents.depth + 1, parents.path || parent.id
           from parents
           join public.license_plates parent
             on parent.org_id = app.current_org_id()
            and parent.id = parents.parent_lp_id
          where parents.depth < 20
            and not parent.id = any(parents.path)
       )
       select id::text, lp_number
         from parents
        order by depth desc`,
      [row.id],
    ),
    client.query<{ id: string; lp_number: string }>(
      `select id::text, lp_number
         from public.license_plates
        where org_id = app.current_org_id()
          and parent_lp_id = $1::uuid
        order by created_at asc, lp_number asc`,
      [row.id],
    ),
  ]);

  return {
    id: row.id,
    lpNumber: row.lp_number,
    productId: row.product_id,
    productCode: row.item_code,
    productName: row.item_name,
    quantity: row.quantity,
    reservedQty: row.reserved_qty,
    availableQty: row.available_qty,
    uom: row.uom,
    status: row.status,
    qaStatus: row.qa_status,
    expiryDate: isoDate(row.expiry_date),
    batchNumber: row.batch_number,
    locationId: row.location_id,
    locationCode: row.location_code,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    lastMoveAt: iso(row.last_move_at),
    parents: parents.rows.map((parent) => ({ id: parent.id, lpNumber: parent.lp_number })),
    children: children.rows.map((child) => ({ id: child.id, lpNumber: child.lp_number })),
  };
}

export async function suggestPutawayLocations(client: QueryClient, lpId: string): Promise<PutawaySuggestion[]> {
  const lp = await client.query<{ warehouse_id: string; product_id: string }>(
    `select warehouse_id::text, product_id::text
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [lpId],
  );
  const target = lp.rows[0];
  if (!target) throw new WarehouseScannerError('lp_not_found', 404, 'Pallet not found. Scan the barcode again or contact a supervisor.');

  const { rows } = await client.query<{
    location_id: string;
    location_code: string;
    location_name: string;
    reason: 'same_product' | 'empty' | 'default';
    priority: number;
  }>(
    `with same_product as (
       select distinct loc.id::text as location_id,
              loc.code as location_code,
              loc.name as location_name,
              'same_product'::text as reason,
              1 as priority
         from public.locations loc
         join public.license_plates held
           on held.org_id = app.current_org_id()
          and held.location_id = loc.id
          and held.product_id = $2::uuid
          and held.status not in ('consumed', 'destroyed', 'shipped')
        where loc.org_id = app.current_org_id()
          and loc.warehouse_id = $1::uuid
      ),
      empty_locations as (
       select loc.id::text as location_id,
              loc.code as location_code,
              loc.name as location_name,
              'empty'::text as reason,
              2 as priority
         from public.locations loc
        where loc.org_id = app.current_org_id()
          and loc.warehouse_id = $1::uuid
          and not exists (
            select 1
              from public.license_plates held
             where held.org_id = app.current_org_id()
               and held.location_id = loc.id
               and held.status not in ('consumed', 'destroyed', 'shipped')
          )
      ),
      default_locations as (
       select loc.id::text as location_id,
              loc.code as location_code,
              loc.name as location_name,
              'default'::text as reason,
              3 as priority
         from public.locations loc
        where loc.org_id = app.current_org_id()
          and loc.warehouse_id = $1::uuid
        order by case when loc.location_type in ('receiving', 'default') then 0 else 1 end,
                 loc.level asc,
                 loc.code asc
        limit 1
      )
      select location_id, location_code, location_name, reason, priority
        from (
          select distinct on (location_id) location_id, location_code, location_name, reason, priority
            from (
              select * from same_product
              union all
              select * from empty_locations
              union all
              select * from default_locations
            ) suggestions
           order by location_id, priority
        ) deduped
       order by priority asc, location_code asc
       limit 5`,
    [target.warehouse_id, target.product_id],
  );

  return rows
    .sort((a, b) => a.priority - b.priority || a.location_code.localeCompare(b.location_code))
    .slice(0, 5)
    .map((row) => ({
      locationId: row.location_id,
      locationCode: row.location_code,
      locationName: row.location_name,
      reason: row.reason,
    }));
}

export async function listPickWorkOrders(client: QueryClient, session: ScannerSessionRow): Promise<WarehouseScannerWo[]> {
  const { rows } = await client.query<{
    wo_id: string;
    wo_number: string;
    status: string;
    product_code: string | null;
    product_name: string | null;
    line_code: string | null;
    material_id: string;
    material_product_id: string;
    material_product_code: string | null;
    material_product_name: string | null;
    required_qty: string;
    consumed_qty: string;
    uom: string;
  }>(
    `select wo.id::text as wo_id,
            wo.wo_number,
            case
              when exec.status in ('in_progress', 'paused') then exec.status
              when wo.status = 'RELEASED' then 'released'
              else lower(wo.status)
            end as status,
            product.item_code as product_code,
            product.name as product_name,
            line.code as line_code,
            mat.id::text as material_id,
            mat.product_id::text as material_product_id,
            material_item.item_code as material_product_code,
            coalesce(material_item.name, mat.material_name) as material_product_name,
            mat.required_qty::text,
            mat.consumed_qty::text,
            mat.uom
       from public.work_orders wo
       left join public.wo_executions exec
         on exec.wo_id = wo.id
        and exec.org_id = wo.org_id
       left join public.items product
         on product.org_id = app.current_org_id()
        and product.id = wo.product_id
       left join public.production_lines line
         on line.org_id = app.current_org_id()
        and line.id = wo.production_line_id
       join public.wo_materials mat
         on mat.org_id = app.current_org_id()
        and mat.wo_id = wo.id
       left join public.items material_item
         on material_item.org_id = app.current_org_id()
        and material_item.id = mat.product_id
      where wo.org_id = app.current_org_id()
        and app.user_can_see_site(wo.site_id)
        and (wo.status = 'RELEASED' or exec.status in ('in_progress', 'paused'))
        and ($1::uuid is null or wo.production_line_id = $1::uuid)
      order by (wo.scheduled_start_time is null) asc,
               wo.scheduled_start_time asc,
               wo.wo_number asc,
               mat.sequence asc,
               mat.material_name asc
      limit 250`,
    [session.line_id],
  );

  const byWo = new Map<string, WarehouseScannerWo>();
  for (const row of rows) {
    if (!byWo.has(row.wo_id)) {
      if (byWo.size >= 25) break;
      byWo.set(row.wo_id, {
        id: row.wo_id,
        woNumber: row.wo_number,
        productCode: row.product_code,
        productName: row.product_name,
        status: row.status,
        lineCode: row.line_code,
        materials: [],
      });
    }
    byWo.get(row.wo_id)?.materials.push({
      id: row.material_id,
      productId: row.material_product_id,
      productCode: row.material_product_code,
      productName: row.material_product_name,
      requiredQty: row.required_qty,
      consumedQty: row.consumed_qty,
      uom: row.uom,
    });
  }
  return [...byWo.values()];
}

export async function listFefoLps(client: QueryClient, productId: string, uom: string): Promise<FefoLp[]> {
  const { rows } = await client.query<{
    lp_id: string;
    lp_number: string;
    available_qty: string;
    uom: string;
    expiry_date: string | Date | null;
    location_code: string | null;
  }>(
    `select inv.lp_id::text,
            inv.lp_number,
            inv.available_qty::text,
            inv.uom,
            inv.expiry_date,
            loc.code as location_code
       from public.v_inventory_available inv
       left join public.locations loc
         on loc.org_id = app.current_org_id()
        and loc.id = inv.location_id
      where inv.org_id = app.current_org_id()
        and inv.product_id = $1::uuid
        and inv.uom = $2
      order by inv.expiry_date asc nulls last, inv.lp_number asc
      limit 10`,
    [productId, uom],
  );

  return rows.map((row) => ({
    id: row.lp_id,
    lpNumber: row.lp_number,
    availableQty: row.available_qty,
    uom: row.uom,
    expiryDate: isoDate(row.expiry_date),
    locationCode: row.location_code,
  }));
}

export async function moveScannerLp(
  client: QueryClient,
  session: ScannerSessionRow,
  input: MoveInput,
): Promise<MoveResult> {
  validateClientOpId(input.clientOpId);
  validateUuid(input.lpId, 'invalid_lp_id');
  validateUuid(input.toLocationId, 'invalid_location_id');

  return inIdempotentScannerWrite(client, session, `warehouse.scanner.${input.moveType}`, input.clientOpId, async () => {
    const lp = await loadMovableLpForUpdate(client, session, input.lpId);
    if (!lp) throw new WarehouseScannerError('lp_not_found', 404, 'Pallet not found. Scan the barcode again or contact a supervisor.');
    assertLpMovable(lp);

    const destination = await loadLocationScope(client, input.toLocationId);
    const moveId = await insertStockMove(client, session, {
      lpId: input.lpId,
      moveType: input.moveType,
      fromLocationId: lp.location_id,
      toLocationId: input.toLocationId,
      siteId: destination.siteId,
      quantity: lp.quantity,
      uom: lp.uom,
      reason: input.reason ?? null,
      transactionId: transactionIdFor(`warehouse.${input.moveType}`, input.clientOpId),
      woId: null,
      materialId: null,
    });
    await updateLpLocation(client, session, input.lpId, input.toLocationId, destination);
    // Lifecycle (audit F-A01): putaway is the canonical received→available
    // transition — v_inventory_available (mig 191) requires status='available',
    // so without this promotion received stock never reaches FEFO/consume.
    // Only 'received' promotes; every other state is left untouched (a transfer
    // of available/quarantine/blocked stock is a pure location move).
    if (input.moveType === 'putaway' && lp.status === 'received') {
      await promoteLpReceivedToAvailable(client, session, {
        lpId: input.lpId,
        lpQaStatus: lp.qa_status,
        reasonCode: 'putaway',
        stockMoveId: moveId,
        transactionId: transactionIdFor('warehouse.putaway.promote', input.clientOpId),
      });
    }
    return moveId;
  });
}

export async function pickScannerLp(
  client: QueryClient,
  session: ScannerSessionRow,
  input: PickInput,
): Promise<MoveResult> {
  validateClientOpId(input.clientOpId);
  validateUuid(input.woId, 'invalid_wo_id');
  validateUuid(input.materialId, 'invalid_material_id');
  validateUuid(input.lpId, 'invalid_lp_id');
  if (input.toLocationId) validateUuid(input.toLocationId, 'invalid_location_id');

  return inIdempotentScannerWrite(client, session, 'warehouse.scanner.pick', input.clientOpId, async () => {
    const pick = await client.query<{
      product_id: string;
      site_id: string | null;
      uom: string;
      staging_location_id: string | null;
    }>(
      `select mat.product_id::text,
              wo.site_id::text,
              mat.uom,
              line.default_location_id::text as staging_location_id
         from public.wo_materials mat
         join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.id = mat.wo_id
         left join public.production_lines line
           on line.org_id = app.current_org_id()
          and line.id = wo.production_line_id
        where mat.org_id = app.current_org_id()
          and mat.wo_id = $1::uuid
          and mat.id = $2::uuid
          and (wo.status = 'RELEASED' or exists (
            select 1 from public.wo_executions exec
             where exec.org_id = app.current_org_id()
               and exec.wo_id = wo.id
               and exec.status in ('in_progress', 'paused')
          ))
        limit 1`,
      [input.woId, input.materialId],
    );
    const material = pick.rows[0];
    if (!material) throw new WarehouseScannerError('invalid_material', 422, 'This work order material is not available for picking.');

    // Review fix F4: distinct error code — the pick screen branches on the
    // parsed body code (destination_required → reveal the destination field;
    // any other 422 → generic error). Do NOT reuse a generic 422 code here.
    const toLocationId = input.toLocationId ?? material.staging_location_id;
    if (!toLocationId) throw new WarehouseScannerError('destination_required', 422, 'Choose a destination location before picking this pallet.');
    const destination = await loadLocationScope(client, toLocationId);

    const lp = await loadMovableLpForUpdate(client, session, input.lpId);
    if (!lp) throw new WarehouseScannerError('lp_not_found', 404, 'Pallet not found. Scan the barcode again or contact a supervisor.');
    assertLpMovable(lp);
    if (lp.site_id && material.site_id && lp.site_id !== material.site_id) {
      throw new WarehouseScannerError('lp_wrong_site', 409, 'This pallet belongs to another site and cannot be picked for this work order.');
    }
    // PICK-ONLY food-safety gate (G-WH-01 / owner per-rule = HARD BLOCK):
    // staging to production is a consume precursor, so picked stock must be
    // QA-released, not expired, and not on an active quality hold. Putaway/move
    // of held/expired LPs stays allowed — relocating quarantined stock is a
    // legit warehouse op — so these checks live HERE, not in assertLpMovable.
    //
    // Mirrors the egress guards in shipShipment + pack-lp-into-box (v_active_holds
    // T-064 + qa_status + expiry_date): QA-released (review fix F3) → expiry →
    // active hold, surfaced as distinct 409 codes the route maps verbatim.
    if (lp.qa_status !== 'released') {
      throw new WarehouseScannerError('lp_not_released', 409, 'This pallet cannot be picked until QA releases it.');
    }
    if (lp.expired) {
      throw new WarehouseScannerError('lp_expired', 409, 'This pallet is past its expiry date and cannot be picked.');
    }
    await assertLpNotOnActiveHold(client, input.lpId);
    if (lp.product_id !== material.product_id || lp.uom !== material.uom) {
      throw new WarehouseScannerError('lp_not_movable', 409, 'This pallet does not match the selected work order material.');
    }

    const transactionId = transactionIdFor('warehouse.pick', input.clientOpId);
    // issue = staged to production, no inventory deduction (LP qty untouched);
    // consume is recorded separately. 'issue' is in migration 193's move_type
    // CHECK, so it is canonical here (review fix F5 deleted an unreachable
    // issue→transfer CHECK-violation fallback).
    const moveId = await insertStockMove(client, session, {
      lpId: input.lpId,
      moveType: 'issue',
      fromLocationId: lp.location_id,
      toLocationId,
      siteId: destination.siteId,
      quantity: lp.available_qty,
      uom: lp.uom,
      reason: 'scanner_pick',
      transactionId,
      woId: input.woId,
      materialId: input.materialId,
    });
    await updateLpLocation(client, session, input.lpId, toLocationId, destination);
    return moveId;
  });
}

async function inIdempotentScannerWrite(
  client: QueryClient,
  session: ScannerSessionRow,
  operation: string,
  clientOpId: string,
  action: () => Promise<string>,
): Promise<MoveResult> {
  await client.query('begin');
  let orgContextToken: string | null = null;
  try {
    // Every statement in the move/pick bodies (and this helper's own replay +
    // audit SQL) filters on app.current_org_id(), which resolves via
    // app.active_org_contexts keyed on the CURRENT txid (migration 002) — the
    // autocommit set_config done by withScannerOrg's 3-arg overload never
    // reaches it. Register the context inside this transaction or every lookup
    // returns NULL-org (lp_not_found) and the audit insert violates NOT NULL.
    // See lib/scanner/txn-org-context.ts.
    orgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);

    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${session.org_id}:scanner:${clientOpId}`,
    ]);

    const replay = await findReplay(client, session, clientOpId, operation);
    if (replay) {
      await client.query('commit');
      return { ok: true, moveId: replay, replay: true };
    }

    const moveId = await action();
    await insertScannerAudit(client, session, operation, clientOpId, 'ok', { moveId });

    await client.query('commit');
    return { ok: true, moveId };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await cleanupTxnOrgContext(client, orgContextToken);
  }
}

async function findReplay(
  client: QueryClient,
  session: ScannerSessionRow,
  clientOpId: string,
  operation: string,
): Promise<string | null> {
  const { rows } = await client.query<{ ext: Record<string, unknown> | string | null }>(
    `select ext
       from public.scanner_audit_log
      where org_id = app.current_org_id()
        and client_op_id = $1
        and operation = $2
      limit 1`,
    [clientOpId, operation],
  );
  const row = rows[0];
  if (!row) return null;
  const ext = typeof row.ext === 'string' ? (JSON.parse(row.ext) as Record<string, unknown>) : (row.ext ?? {});
  return typeof ext.moveId === 'string' ? ext.moveId : null;
}

async function insertScannerAudit(
  client: QueryClient,
  session: ScannerSessionRow,
  operation: string,
  clientOpId: string,
  resultCode: string,
  ext: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `insert into public.scanner_audit_log (
       org_id, session_id, user_id, device_id, operation, result_code, client_op_id, ext
     )
     values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)
     on conflict (org_id, operation, client_op_id) where client_op_id is not null and operation not like 'client.%' do nothing`,
    [session.id, session.user_id, session.device_id, operation, resultCode, clientOpId, JSON.stringify(ext)],
  );
}

type MovableLpRow = {
  id: string;
  product_id: string;
  site_id: string | null;
  quantity: string;
  available_qty: string;
  reserved_qty: string;
  uom: string;
  status: string;
  qa_status: string;
  expired: boolean;
  location_id: string | null;
  locked_by: string | null;
  lock_is_active_for_other_user: boolean;
};

async function loadMovableLpForUpdate(
  client: QueryClient,
  session: ScannerSessionRow,
  lpId: string,
): Promise<MovableLpRow | null> {
  const { rows } = await client.query<MovableLpRow>(
    `select lp.id::text,
            lp.product_id::text,
            lp.site_id::text,
            lp.quantity::text,
            (lp.quantity - lp.reserved_qty)::text as available_qty,
            lp.reserved_qty::text,
            lp.uom,
            lp.status,
            lp.qa_status,
            (lp.expiry_date is not null and lp.expiry_date::date < current_date) as expired,
            lp.location_id::text,
            lp.locked_by::text,
            (
              lp.locked_by is not null
              and lp.locked_by <> $2::uuid
              and lp.locked_at > pg_catalog.now() - interval '5 minutes'
            ) as lock_is_active_for_other_user
       from public.license_plates lp
      where lp.org_id = app.current_org_id()
        and lp.id = $1::uuid
        and app.user_can_see_site(lp.site_id)
      for update`,
    [lpId, session.user_id],
  );
  return rows[0] ?? null;
}

function assertLpMovable(lp: MovableLpRow): void {
  if (IMMOVABLE_STATUSES.includes(lp.status as (typeof IMMOVABLE_STATUSES)[number])) {
    throw new WarehouseScannerError('lp_not_movable', 409, `This pallet can't be moved because its status is '${lp.status}'.`);
  }
  if (lp.lock_is_active_for_other_user) {
    throw new WarehouseScannerError('lp_not_movable', 409, 'This pallet is currently locked by another scanner session.');
  }
}

// G-WH-01 active-hold gate (T-064). Reads the canonical SECURITY INVOKER,
// org-scoped public.v_active_holds view — NEVER quality_holds directly — keyed
// on the polymorphic (reference_type='lp', reference_id) model (migration 197).
// Fail-OPEN only when the view is genuinely ABSENT (42P01 undefined_table:
// 09-quality not shipped) so a not-yet-built dependency cannot wedge picking;
// 42703 (column drift) deliberately surfaces. Mirrors holds-guard.ts.
async function assertLpNotOnActiveHold(client: QueryClient, lpId: string): Promise<void> {
  try {
    const { rows } = await client.query<{ hold_id: string }>(
      `select hold_id
         from public.v_active_holds
        where org_id = app.current_org_id()
          and reference_type = 'lp'
          and reference_id = $1::uuid
        limit 1`,
      [lpId],
    );
    if (rows[0]) {
      throw new WarehouseScannerError('lp_on_hold', 409, 'This pallet is on an active quality hold and cannot be picked.');
    }
  } catch (err) {
    if (err instanceof WarehouseScannerError) throw err;
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
      return;
    }
    throw err;
  }
}

async function loadLocationScope(client: QueryClient, locationId: string): Promise<{ warehouseId: string; siteId: string }> {
  const { rows } = await client.query<{ warehouse_id: string; site_id: string | null }>(
    `select loc.warehouse_id::text,
            w.site_id::text
       from public.locations loc
       join public.warehouses w
         on w.org_id = app.current_org_id()
        and w.id = loc.warehouse_id
      where loc.org_id = app.current_org_id()
        and loc.id = $1::uuid
        and app.user_can_see_site(w.site_id)
      limit 1`,
    [locationId],
  );
  const row = rows[0];
  if (!row?.site_id) throw new WarehouseScannerError('invalid_location', 422, 'Location not found. Scan the location again or choose another one.');
  return { warehouseId: row.warehouse_id, siteId: row.site_id };
}

async function insertStockMove(
  client: QueryClient,
  session: ScannerSessionRow,
  input: {
    lpId: string;
    moveType: 'putaway' | 'transfer' | 'issue';
    fromLocationId: string | null;
    toLocationId: string;
    siteId: string;
    quantity: string;
    uom: string;
    reason: string | null;
    transactionId: string;
    woId: string | null;
    materialId: string | null;
  },
): Promise<string> {
  const moveNumber = moveNumberFromTransactionId(input.transactionId);
  const { rows } = await client.query<{ id: string }>(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
       quantity, uom, reason_text, wo_id, wo_material_id, transaction_id, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, $4, $5::uuid, $6::uuid,
       $7::numeric, $8, $9, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $13::uuid
     )
     on conflict (org_id, transaction_id) do nothing
     returning id::text`,
    [
      input.siteId,
      moveNumber,
      input.lpId,
      input.moveType,
      input.fromLocationId,
      input.toLocationId,
      input.quantity,
      input.uom,
      input.reason,
      input.woId,
      input.materialId,
      input.transactionId,
      session.user_id,
    ],
  );
  if (rows[0]?.id) return rows[0].id;

  const existing = await client.query<{ id: string }>(
    `select id::text
       from public.stock_moves
      where org_id = app.current_org_id()
        and transaction_id = $1::uuid
      limit 1`,
    [input.transactionId],
  );
  const move = existing.rows[0];
  if (!move) throw new WarehouseScannerError('move_not_recorded', 409, 'The stock move could not be recorded. Try again or contact a supervisor.');
  return move.id;
}

// Audit F-A01: the put-away state transition. Promotes status 'received' →
// 'available' (guarded in SQL so a concurrent transition can never double-fire),
// writes the lp_state_history ledger row (mig 193 pattern: same txn as the
// license_plates UPDATE, deterministic transaction_id + ON CONFLICT for replay
// safety) and emits the warehouse.lp.transitioned outbox event (mirrors
// lp-qa-actions.ts). qa_status is NOT touched — that stays owned by 09-Quality;
// v_inventory_available additionally requires qa_status='released', so putting
// away still-pending stock keeps it invisible to FEFO until QA releases it.
async function promoteLpReceivedToAvailable(
  client: QueryClient,
  session: ScannerSessionRow,
  input: {
    lpId: string;
    lpQaStatus: string;
    reasonCode: string;
    stockMoveId: string | null;
    transactionId: string;
  },
): Promise<void> {
  const updated = await client.query<{ id: string; lp_number: string }>(
    `update public.license_plates
        set status = 'available',
            updated_by = $2::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status = 'received'
      returning id::text, lp_number`,
    [input.lpId, session.user_id],
  );
  const row = updated.rows[0];
  if (!row) return;

  await client.query(
    `insert into public.lp_state_history
       (org_id, lp_id, from_state, to_state, reason_code, stock_move_id, transaction_id, created_by)
     values
       (app.current_org_id(), $1::uuid, 'received', 'available', $2, $3::uuid, $4::uuid, $5::uuid)
     on conflict (org_id, transaction_id) do nothing`,
    [input.lpId, input.reasonCode, input.stockMoveId, input.transactionId, session.user_id],
  );

  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), 'warehouse.lp.transitioned', 'license_plate', $1::uuid, $2::jsonb, 'warehouse-scanner-putaway-v1')`,
    [
      input.lpId,
      JSON.stringify({
        org_id: session.org_id,
        actor_user_id: session.user_id,
        lp_id: input.lpId,
        lp_number: row.lp_number,
        status_from: 'received',
        status_to: 'available',
        qa_status_from: input.lpQaStatus,
        qa_status_to: input.lpQaStatus,
        reason_code: input.reasonCode,
        stock_move_id: input.stockMoveId,
      }),
    ],
  );
}

async function updateLpLocation(
  client: QueryClient,
  session: ScannerSessionRow,
  lpId: string,
  toLocationId: string,
  destination: { warehouseId: string; siteId: string },
): Promise<void> {
  await client.query(
    `update public.license_plates
        set location_id = $2::uuid,
            site_id = $4::uuid,
            warehouse_id = $5::uuid,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [lpId, toLocationId, session.user_id, destination.siteId, destination.warehouseId],
  );
}

function transactionIdFor(kind: string, clientOpId: string): string {
  return uuidFromSeed(`scanner.${kind}:${clientOpId}`);
}

function uuidFromSeed(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function moveNumberFromTransactionId(transactionId: string): string {
  return `SM-${transactionId.replaceAll('-', '').slice(0, 20).toUpperCase()}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateUuid(value: string, code: string): void {
  if (!isUuid(value)) throw new WarehouseScannerError(code, 422, invalidUuidMessage(code));
}

export function validateClientOpId(value: string): void {
  if (!value || value.length > 120) {
    throw new WarehouseScannerError('invalid_client_op_id', 422, 'This scanner request is invalid. Refresh and try again.');
  }
}

function invalidUuidMessage(code: string): string {
  switch (code) {
    case 'invalid_lp_id':
      return 'Pallet barcode is invalid. Scan the barcode again.';
    case 'invalid_location_id':
      return 'Location barcode is invalid. Scan the location again.';
    case 'invalid_wo_id':
      return 'Work order is invalid. Refresh the pick list and try again.';
    case 'invalid_material_id':
      return 'Work order material is invalid. Refresh the pick list and try again.';
    default:
      return 'This scanner request is invalid. Refresh and try again.';
  }
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoDate(value: string | Date | null): string | null {
  const normalized = iso(value);
  return normalized ? normalized.slice(0, 10) : null;
}
