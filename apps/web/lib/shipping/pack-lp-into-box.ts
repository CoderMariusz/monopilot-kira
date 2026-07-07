import { generateSscc18 } from '@monopilot/gs1';

/**
 * Shared "pack a license plate into a shipment box" core.
 *
 * Extracted from the desktop `packLpIntoBox` Server Action so the SCANNER
 * pack-to-SO flow (FEAT-2 / map dead-end #13) can reuse the EXACT same
 * allocation + food-safety validation. Both callers pass their own
 * org-scoped client:
 *   - desktop  → withOrgContext  (Supabase JWT user session)
 *   - scanner  → withScannerOrg  (bearer scanner session)
 *
 * This module is intentionally NOT `'use server'` — it is plain TS shared by
 * a Server Action and a route handler. The permission gate lives in the
 * callers (desktop requirePermission / scanner hasPermission).
 */

export type PackQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type PackContext = { userId: string; orgId: string; client: PackQueryClient };

export type PackLpInput = { shipmentId: string; lpId: string; boxId?: string };

export type PackLpResult = { ok: true; boxId: string } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aligned with OPEN_SHIPMENT_STATUSES in shipping/_actions/so-transitions.ts */
const PACKABLE_SHIPMENT_STATUSES = new Set(['pending', 'packing']);

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

/** Resolve a scanned barcode (UUID, lp_number, or lp_code) to the LP UUID. */
export async function resolveLicensePlateId(ctx: PackContext, input: string): Promise<string | null> {
  const candidate = input.trim();
  if (!candidate) return null;
  if (UUID_PATTERN.test(candidate)) return candidate;

  const { rows } = await ctx.client.query<{ id: string }>(
    `select id::text as id
       from public.license_plates
      where (lp_number = $1 or lp_code = $1)
        and org_id = app.current_org_id()
      limit 1`,
    [candidate],
  );
  return rows[0]?.id ?? null;
}

export async function packLpIntoBoxCore(ctx: PackContext, input: PackLpInput): Promise<PackLpResult> {
  const { userId, orgId } = ctx;

  const { rows: shipmentRows } = await ctx.client.query<{
    id: string;
    sales_order_id: string;
    site_id: string | null;
    status: string;
  }>(
    `select sh.id::text,
            sh.sales_order_id::text,
            sh.site_id::text,
            sh.status
       from public.shipments sh
      where sh.org_id = app.current_org_id()
        and sh.id = $1::uuid
        and sh.deleted_at is null
      limit 1`,
    [input.shipmentId],
  );
  const shipment = shipmentRows[0];
  if (!shipment?.sales_order_id || !PACKABLE_SHIPMENT_STATUSES.has(shipment.status)) {
    return { ok: false, error: 'invalid_state' };
  }

  const licensePlateId = await resolveLicensePlateId(ctx, input.lpId);
  if (!licensePlateId) return { ok: false, error: 'lp_not_found' };

  const { rows: alreadyPackedRows } = await ctx.client.query<{ id: string }>(
    `select sbc.id::text
       from public.shipment_box_contents sbc
      where sbc.org_id = app.current_org_id()
        and sbc.license_plate_id = $1::uuid
        and sbc.deleted_at is null
      limit 1`,
    [licensePlateId],
  );
  if (alreadyPackedRows.length > 0) return { ok: false, error: 'already_packed' };

  const { rows: allocationRows } = await ctx.client.query<{
    sales_order_line_id: string;
    site_id: string | null;
    product_id: string;
    lot_number: string | null;
    quantity_allocated: string;
  }>(
    `select ia.sales_order_line_id::text,
            coalesce(ia.site_id, sol.site_id, lp.site_id)::text as site_id,
            coalesce(sol.product_id, lp.product_id)::text as product_id,
            lp.batch_number as lot_number,
            ia.quantity_allocated::text
       from public.inventory_allocations ia
       join public.sales_order_lines sol on sol.id = ia.sales_order_line_id and sol.org_id = app.current_org_id()
       left join public.license_plates lp on lp.id = ia.license_plate_id and lp.org_id = app.current_org_id()
      where ia.org_id = app.current_org_id()
        and ia.license_plate_id = $1::uuid
        and sol.sales_order_id = $2::uuid
        and ia.status in ('allocated', 'picked')
        and ia.deleted_at is null
        and sol.deleted_at is null
      order by ia.allocated_at desc
      limit 1`,
    [licensePlateId, shipment.sales_order_id],
  );
  const allocation = allocationRows[0];
  if (!allocation) return { ok: false, error: 'lp_not_allocated' };

  // Food-safety re-assert at PACK time (owner per-rule = HARD BLOCK): a quality
  // hold, QA-status reversion, or expiry can land AFTER allocation but before
  // the LP is packed into a shipment box. Held / QA-unreleased / expired goods
  // must not be packed for shipment. Mirrors the ship-time guard in
  // shipShipment (v_active_holds T-064 + qa_status + expiry_date), so the
  // egress path is blocked at both pack and ship.
  const { rows: blockedRows } = await ctx.client.query<{ reason: string }>(
    `select case when h.hold_id is not null then 'hold'
                 when lp.qa_status is distinct from 'released' then 'qa'
                 else 'expired' end as reason
       from public.license_plates lp
       left join lateral (
         select hold_id from public.v_active_holds h
          where h.org_id = app.current_org_id()
            and h.reference_type = 'lp' and h.reference_id = lp.id
          limit 1
       ) h on true
      where lp.id = $1::uuid
        and lp.org_id = app.current_org_id()
        and ( h.hold_id is not null
              or lp.qa_status is distinct from 'released'
              or (lp.expiry_date is not null and lp.expiry_date < current_date) )
      limit 1`,
    [licensePlateId],
  );
  if (blockedRows.length > 0) return { ok: false, error: 'lp_blocked_for_pack' };

  let boxId = input.boxId;
  let boxSiteId: string | null = null;

  if (boxId) {
    const { rows: boxRows } = await ctx.client.query<{ site_id: string | null }>(
      `select sb.site_id::text
         from public.shipment_boxes sb
        where sb.org_id = app.current_org_id()
          and sb.id = $1::uuid
          and sb.shipment_id = $2::uuid
          and sb.deleted_at is null
        limit 1`,
      [boxId, input.shipmentId],
    );
    if (!boxRows[0]) return { ok: false, error: 'invalid_box' };
    boxSiteId = boxRows[0].site_id;
  } else {
    const { rows: prefixRows } = await ctx.client.query<{ gs1_prefix: string | null }>(
      `select gs1_prefix
         from public.organizations
        where id = $1::uuid
        limit 1`,
      [orgId],
    );
    const gs1Prefix = prefixRows[0]?.gs1_prefix?.trim();
    if (!gs1Prefix) return { ok: false, error: 'missing_gs1_prefix' };

    const { rows: serialRows } = await ctx.client.query<{ serial: string }>(
      `select public.next_sscc_serial($1::uuid)::text as serial`,
      [orgId],
    );
    const serial = serialRows[0]?.serial;
    if (!serial) return { ok: false, error: 'persistence_failed' };

    let sscc: string;
    try {
      sscc = generateSscc18({
        extensionDigit: 0,
        companyPrefix: gs1Prefix,
        serialReference: serial,
      });
    } catch {
      return { ok: false, error: 'invalid_gs1_prefix' };
    }

    const { rows: boxNumberRows } = await ctx.client.query<{ next_box_number: number | string | bigint }>(
      `select coalesce(max(sb.box_number), 0) + 1 as next_box_number
         from public.shipment_boxes sb
        where sb.org_id = app.current_org_id()
          and sb.shipment_id = $1::uuid
          and sb.deleted_at is null`,
      [input.shipmentId],
    );
    const nextBoxNumber = toNumber(boxNumberRows[0]?.next_box_number) || 1;
    boxSiteId = allocation.site_id ?? shipment.site_id;

    const { rows: boxRows } = await ctx.client.query<{ id: string }>(
      `insert into public.shipment_boxes
         (org_id, site_id, shipment_id, box_number, sscc, created_by, updated_by)
       values ($1::uuid, $2::uuid, $3::uuid, $4::integer, $5::varchar(18), $6::uuid, $6::uuid)
       returning id::text`,
      [orgId, boxSiteId, input.shipmentId, nextBoxNumber, sscc, userId],
    );
    boxId = boxRows[0]?.id;
    if (!boxId) return { ok: false, error: 'persistence_failed' };
  }

  await ctx.client.query(
    `insert into public.shipment_box_contents
       (org_id, site_id, shipment_box_id, sales_order_line_id, product_id, license_plate_id,
        lot_number, quantity, created_at, created_by, updated_by)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
             $7::text, $8::numeric, now(), $9::uuid, $9::uuid)`,
    [
      orgId,
      allocation.site_id ?? boxSiteId ?? shipment.site_id,
      boxId,
      allocation.sales_order_line_id,
      allocation.product_id,
      licensePlateId,
      allocation.lot_number,
      allocation.quantity_allocated,
      userId,
    ],
  );

  const { rowCount: linkedLpCount } = await ctx.client.query(
    `update public.license_plates
        set source_so_id = $2::uuid,
            updated_at = now(),
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [licensePlateId, shipment.sales_order_id, userId],
  );
  if (linkedLpCount !== 1) throw new Error('source_so_link_failed');

  return { ok: true, boxId };
}
