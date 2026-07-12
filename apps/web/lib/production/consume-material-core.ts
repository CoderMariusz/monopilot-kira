import { assertLpConsumableForProduction } from './lp-safety-guard';
import type { ActiveHold } from './holds-guard';
import type { LpConsumeSafetyError } from './lp-safety-guard';
import type { ProductionContext, QueryClient } from './shared';

export const NIL_LP_UUID = '00000000-0000-0000-0000-000000000000';

/** wo_material_consumption.qty_consumed — migration 181: numeric(12, 3). */
export const CONSUMPTION_QTY_PRECISION = 12;
export const CONSUMPTION_QTY_SCALE = 3;
export const CONSUMPTION_QTY_MAX_INTEGER_DIGITS = CONSUMPTION_QTY_PRECISION - CONSUMPTION_QTY_SCALE;

export type ConsumptionQuantityErrorCode =
  | 'invalid_qty'
  | 'qty_scale_exceeded'
  | 'qty_range_exceeded';

export class ConsumptionQuantityError extends Error {
  readonly code: ConsumptionQuantityErrorCode;

  constructor(code: ConsumptionQuantityErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ConsumptionQuantityError';
    this.code = code;
  }
}

export function isNilOrZeroLpId(lpId: string | null | undefined): boolean {
  if (lpId == null) return true;
  const trimmed = lpId.trim().toLowerCase();
  return trimmed === '' || trimmed === NIL_LP_UUID;
}

/**
 * Normalize a consumption quantity for persistence (S6).
 * Validates against wo_material_consumption.qty_consumed numeric(12,3) — never
 * silently truncates extra fractional digits or allows out-of-range magnitudes.
 */
export function normalizePersistedQuantity(qty: string): string {
  const trimmed = qty.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match || /^0+(\.0+)?$/.test(trimmed)) {
    throw new ConsumptionQuantityError('invalid_qty');
  }

  const intPart = match[1]!;
  const fracPart = match[2] ?? '';

  if (fracPart.length > CONSUMPTION_QTY_SCALE) {
    throw new ConsumptionQuantityError('qty_scale_exceeded');
  }
  if (intPart.length > CONSUMPTION_QTY_MAX_INTEGER_DIGITS) {
    throw new ConsumptionQuantityError('qty_range_exceeded');
  }

  const scaleFactor = 10n ** BigInt(CONSUMPTION_QTY_SCALE);
  const paddedFrac = (fracPart + '0'.repeat(CONSUMPTION_QTY_SCALE)).slice(0, CONSUMPTION_QTY_SCALE);
  const scaled = BigInt(intPart) * scaleFactor + BigInt(paddedFrac || '0');
  const maxScaled =
    BigInt('9'.repeat(CONSUMPTION_QTY_MAX_INTEGER_DIGITS)) * scaleFactor + (scaleFactor - 1n);
  if (scaled > maxScaled) {
    throw new ConsumptionQuantityError('qty_range_exceeded');
  }

  const normalizedFrac = fracPart.replace(/0+$/, '');
  return normalizedFrac ? `${intPart}.${normalizedFrac}` : intPart;
}

export type FefoLpCandidate = {
  lpId: string;
  productId: string;
  status: string;
  siteId: string | null;
  locationId: string | null;
};

export async function selectFefoConsumableLpForUpdate(
  client: QueryClient,
  input: {
    productIds: readonly string[];
    uom: string;
    qty: string;
  },
): Promise<FefoLpCandidate | null> {
  const { rows } = await client.query<{
    lp_id: string;
    product_id: string;
    status: string;
    site_id: string | null;
    location_id: string | null;
  }>(
    `select lp.id::text as lp_id,
            lp.product_id::text as product_id,
            lp.status,
            lp.site_id::text as site_id,
            lp.location_id::text as location_id
       from public.v_inventory_available cand
       join public.license_plates lp
         on lp.org_id = cand.org_id
        and lp.id = cand.lp_id
      where cand.org_id = app.current_org_id()
        and cand.product_id = any($1::uuid[])
        and cand.uom = $2
        and cand.available_qty >= $3::numeric
        and not exists (
          select 1
            from public.v_active_holds h
           where h.org_id = cand.org_id
             and (
               (h.reference_type = 'lp' and h.reference_id = lp.id)
               or (
                 h.reference_type = 'batch'
                 and h.reference_text is not null
                 and lower(trim(h.reference_text)) in (
                   nullif(lower(trim(lp.batch_number)), ''),
                   nullif(lower(trim(lp.supplier_batch_number)), '')
                 )
               )
             )
        )
      order by cand.expiry_date asc nulls last, cand.lp_number asc
      limit 1
      for update of lp`,
    [input.productIds, input.uom, input.qty],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    lpId: row.lp_id,
    productId: row.product_id,
    status: row.status,
    siteId: row.site_id,
    locationId: row.location_id,
  };
}

export type ResolveConsumptionLpResult =
  | {
      ok: true;
      lpId: string;
      productId: string;
      status: string;
      siteId: string | null;
      locationId: string | null;
      /** True when the LP was auto-picked from FEFO (reason-code / no-explicit-LP path). */
      fefoAutoResolved: boolean;
    }
  | {
      ok: false;
      error: LpConsumeSafetyError | 'invalid_input' | 'lp_unavailable';
      hold?: ActiveHold;
    };

/**
 * Shared consume LP resolution (C1/C2): every consumption must decrement a real,
 * released, non-held LP. Explicit zero/null UUIDs are rejected; the reason-code
 * path auto-selects the FEFO candidate from v_inventory_available under lock.
 */
export async function resolveConsumptionLp(
  ctx: Pick<ProductionContext, 'client' | 'userId'>,
  input: {
    explicitLpId: string | null | undefined;
    productIds: readonly string[];
    uom: string;
    qty: string;
  },
): Promise<ResolveConsumptionLpResult> {
  const qty = normalizePersistedQuantity(input.qty);
  const productIds = input.productIds.filter(Boolean);
  if (productIds.length === 0) {
    return { ok: false, error: 'lp_unavailable' };
  }

  if (!isNilOrZeroLpId(input.explicitLpId)) {
    const lpId = input.explicitLpId!.trim();
    const lpGate = await assertLpConsumableForProduction(ctx, lpId);
    if (!lpGate.ok) {
      return lpGate.error === 'quality_hold_active'
        ? { ok: false, error: lpGate.error, hold: lpGate.hold }
        : { ok: false, error: lpGate.error };
    }

    const availability = await ctx.client.query<{
      id: string;
      product_id: string;
      status: string;
      site_id: string | null;
      location_id: string | null;
    }>(
      `select lp.id::text as id,
              lp.product_id::text as product_id,
              lp.status,
              lp.site_id::text as site_id,
              lp.location_id::text as location_id
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and lp.id = $1::uuid
          and lp.product_id = any($2::uuid[])
          and lp.uom = $3
          and lp.quantity - $4::numeric >= lp.reserved_qty
        limit 1
        for update`,
      [lpId, productIds, input.uom, qty],
    );
    const lp = availability.rows[0];
    if (!lp) return { ok: false, error: 'lp_unavailable' };
    return {
      ok: true,
      lpId: lp.id,
      productId: lp.product_id,
      status: lp.status,
      siteId: lp.site_id,
      locationId: lp.location_id,
      fefoAutoResolved: false,
    };
  }

  const fefo = await selectFefoConsumableLpForUpdate(ctx.client, {
    productIds,
    uom: input.uom,
    qty,
  });
  if (!fefo) return { ok: false, error: 'lp_unavailable' };

  const lpGate = await assertLpConsumableForProduction(ctx, fefo.lpId);
  if (!lpGate.ok) {
    return lpGate.error === 'quality_hold_active'
      ? { ok: false, error: lpGate.error, hold: lpGate.hold }
      : { ok: false, error: lpGate.error };
  }

  return {
    ok: true,
    lpId: fefo.lpId,
    productId: fefo.productId,
    status: fefo.status,
    siteId: fefo.siteId,
    locationId: fefo.locationId,
    fefoAutoResolved: true,
  };
}
