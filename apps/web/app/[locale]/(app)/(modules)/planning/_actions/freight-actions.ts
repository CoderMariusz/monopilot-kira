'use server';

/**
 * WAVE E9 — Freight / carrier / transport-lane Server Actions + supplier scorecard.
 *
 * TODO(E9-backend): this file is OWNED by the freight backend lane. It is a
 * working stub authored by the UI lane so the /planning/carriers and
 * /planning/suppliers/[id]/scorecard screens typecheck and render against the
 * EXACT agreed contract today. The backend lane will replace this file (same
 * path, same exported signatures) with the reviewed implementation — the UI
 * imports these symbols and MUST NOT be touched when that swap happens.
 *
 * Contract (do not change without re-coordinating with the UI lane):
 *   listCarriers()                     → CarrierRow[]
 *   upsertCarrier(input)               → FreightResult<CarrierRow>
 *   listTransportLanes(carrierId?)     → TransportLaneRow[]  (joined to carrier name)
 *   upsertTransportLane(input)         → FreightResult<TransportLaneRow>
 *   getSupplierScorecard(supplierId)   → FreightResult<SupplierScorecard>
 *
 * Real data: all reads/writes run inside withOrgContext (org_id =
 * app.current_org_id() via RLS) over the mig-316 freight tables
 * (public.carriers, public.transport_lanes) and the suppliers / purchase_orders
 * masters. Never mocks. Writes gate on the planning write permission
 * (npd.planning.write) server-side — never a client-trusted flag.
 *
 * Defensive note: until mig 316 is applied in an environment, a read against a
 * missing relation (SQLSTATE 42P01) is mapped to an empty list / safe result so
 * the screen shows its honest empty/error state instead of a 500.
 */
import { Dec } from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPlanningWritePermission,
  isPgError,
  pgErrorToResult,
  toNullableIso,
  writeProcurementAudit,
  type OrgActionContext,
  type QueryClient,
} from './procurement-shared';
import {
  CarrierUpsertSchema,
  TransportLaneUpsertSchema,
  type CarrierRow,
  type CostBasis,
  type FreightMode,
  type FreightResult,
  type ScorecardPoRow,
  type SupplierScorecard,
  type TransportLaneRow,
} from './freight-types';

export type {
  CarrierRow,
  CarrierUpsertInput,
  CostBasis,
  FreightError,
  FreightMode,
  FreightResult,
  ScorecardPoRow,
  SupplierScorecard,
  TransportLaneRow,
  TransportLaneUpsertInput,
} from './freight-types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Internal helpers ──────────────────────────────────────────────────────────

/** A missing-relation error (42P01) before mig 316 is applied — treated as "no data". */
function isUndefinedTable(err: unknown): boolean {
  return isPgError(err) && err.code === '42P01';
}

type CarrierDbRow = {
  id: string;
  code: string;
  name: string;
  mode: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
};

function mapCarrier(row: CarrierDbRow): CarrierRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    mode: row.mode as FreightMode,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    isActive: Boolean(row.is_active),
  };
}

type LaneDbRow = {
  id: string;
  carrier_id: string;
  carrier_name: string;
  origin: string;
  destination: string;
  mode: string;
  cost_basis: string;
  cost_amount: string | number;
  currency: string;
  transit_days: number | null;
  is_active: boolean;
};

function toUiCostBasis(value: string): CostBasis {
  return value === 'flat' ? 'per_shipment' : (value as CostBasis);
}

function toDbCostBasis(value: CostBasis): string {
  return value === 'per_shipment' ? 'flat' : value;
}

function mapLane(row: LaneDbRow): TransportLaneRow {
  return {
    id: row.id,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    origin: row.origin,
    destination: row.destination,
    mode: row.mode as FreightMode,
    costBasis: toUiCostBasis(row.cost_basis),
    costAmount: String(row.cost_amount),
    currency: row.currency,
    transitDays: row.transit_days === null ? null : Number(row.transit_days),
    isActive: Boolean(row.is_active),
  };
}

// ── Carriers ──────────────────────────────────────────────────────────────────

export async function listCarriers(): Promise<CarrierRow[]> {
  try {
    return await withOrgContext(async ({ client }): Promise<CarrierRow[]> => {
      const { rows } = await (client as QueryClient).query<CarrierDbRow>(
        `select id, code, name, mode, contact_email, contact_phone, is_active
           from public.carriers
          where org_id = app.current_org_id()
          order by code asc`,
      );
      return rows.map(mapCarrier);
    });
  } catch (err) {
    if (isUndefinedTable(err)) return [];
    console.error('[planning/freight] listCarriers failed', err);
    throw err;
  }
}

export async function upsertCarrier(rawInput: unknown): Promise<FreightResult<CarrierRow>> {
  const parsed = CarrierUpsertSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<FreightResult<CarrierRow>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const params = [
        input.code,
        input.name,
        input.mode,
        input.contactEmail ?? null,
        input.contactPhone ?? null,
        input.isActive,
        userId,
      ];

      const { rows } = input.id
        ? await ctx.client.query<CarrierDbRow>(
            `update public.carriers
                set code = $1, name = $2, mode = $3,
                    contact_email = $4, contact_phone = $5, is_active = $6,
                    updated_by = $7::uuid
              where org_id = app.current_org_id() and id = $8::uuid
            returning id, code, name, mode, contact_email, contact_phone, is_active`,
            [...params, input.id],
          )
        : await ctx.client.query<CarrierDbRow>(
            `insert into public.carriers
               (org_id, code, name, mode, contact_email, contact_phone, is_active, created_by, updated_by)
             values
               (app.current_org_id(), $1, $2, $3, $4, $5, $6, $7::uuid, $7::uuid)
             returning id, code, name, mode, contact_email, contact_phone, is_active`,
            params,
          );

      const row = rows[0];
      if (!row) return { ok: false, error: input.id ? 'not_found' : 'persistence_failed' };
      await writeProcurementAudit(ctx, {
        action: input.id ? 'planning.carrier.updated' : 'planning.carrier.created',
        resourceType: 'carrier',
        resourceId: row.id,
        afterState: { code: row.code, name: row.name, mode: row.mode, isActive: row.is_active },
      });
      return { ok: true, data: mapCarrier(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/freight] upsertCarrier failed', err);
    return { ok: false, error };
  }
}

// ── Transport lanes ───────────────────────────────────────────────────────────

export async function listTransportLanes(carrierId?: string): Promise<TransportLaneRow[]> {
  const filter = typeof carrierId === 'string' && uuidPattern.test(carrierId) ? carrierId : null;
  try {
    return await withOrgContext(async ({ client }): Promise<TransportLaneRow[]> => {
      const { rows } = await (client as QueryClient).query<LaneDbRow>(
        `select l.id, l.carrier_id, c.name as carrier_name, l.origin, l.destination,
                l.mode, l.cost_basis, l.cost_amount, l.currency, l.transit_days, l.is_active
           from public.transport_lanes l
           join public.carriers c
             on c.id = l.carrier_id and c.org_id = l.org_id
          where l.org_id = app.current_org_id()
            and ($1::uuid is null or l.carrier_id = $1::uuid)
          order by c.code asc, l.origin asc, l.destination asc`,
        [filter],
      );
      return rows.map(mapLane);
    });
  } catch (err) {
    if (isUndefinedTable(err)) return [];
    console.error('[planning/freight] listTransportLanes failed', err);
    throw err;
  }
}

export async function upsertTransportLane(rawInput: unknown): Promise<FreightResult<TransportLaneRow>> {
  const parsed = TransportLaneUpsertSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<FreightResult<TransportLaneRow>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const carrier = await ctx.client.query<{ id: string }>(
        `select id
           from public.carriers
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [input.carrierId],
      );
      if (!carrier.rows[0]) return { ok: false, error: 'not_found' };

      const params = [
        input.carrierId,
        input.origin,
        input.destination,
        input.mode,
        toDbCostBasis(input.costBasis),
        input.costAmount,
        input.currency,
        input.transitDays ?? null,
        input.isActive,
        userId,
      ];

      const { rows } = input.id
        ? await ctx.client.query<{ id: string }>(
            `update public.transport_lanes
                set carrier_id = $1::uuid, origin = $2, destination = $3, mode = $4,
                    cost_basis = $5, cost_amount = $6::numeric, currency = $7,
                    transit_days = $8::integer, is_active = $9, updated_by = $10::uuid
              where org_id = app.current_org_id() and id = $11::uuid
            returning id`,
            [...params, input.id],
          )
        : await ctx.client.query<{ id: string }>(
            `insert into public.transport_lanes
               (org_id, carrier_id, origin, destination, mode, cost_basis, cost_amount,
                currency, transit_days, is_active, created_by, updated_by)
             values
               (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6::numeric, $7,
                $8::integer, $9, $10::uuid, $10::uuid)
             returning id`,
            params,
          );

      const savedId = rows[0]?.id;
      if (!savedId) return { ok: false, error: input.id ? 'not_found' : 'persistence_failed' };

      // Re-read with the carrier-name join so the row shape matches listTransportLanes.
      const { rows: joined } = await ctx.client.query<LaneDbRow>(
        `select l.id, l.carrier_id, c.name as carrier_name, l.origin, l.destination,
                l.mode, l.cost_basis, l.cost_amount, l.currency, l.transit_days, l.is_active
           from public.transport_lanes l
           join public.carriers c on c.id = l.carrier_id and c.org_id = l.org_id
          where l.org_id = app.current_org_id() and l.id = $1::uuid`,
        [savedId],
      );
      const row = joined[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeProcurementAudit(ctx, {
        action: input.id ? 'planning.transport_lane.updated' : 'planning.transport_lane.created',
        resourceType: 'transport_lane',
        resourceId: row.id,
        afterState: { origin: row.origin, destination: row.destination, mode: row.mode, costBasis: row.cost_basis },
      });
      return { ok: true, data: mapLane(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/freight] upsertTransportLane failed', err);
    return { ok: false, error };
  }
}

// ── Supplier scorecard ────────────────────────────────────────────────────────

type ScorecardPoDbRow = {
  id: string;
  po_number: string;
  status: string;
  expected_delivery: string | Date | null;
  first_receipt_date: string | Date | null;
  ordered_qty: string | null;
  received_qty: string | null;
};

type NcrCountRow = {
  ncr_count: string | number | null;
  open_ncr_count: string | number | null;
};

function dateOnly(value: string | Date | null): string | null {
  const iso = toNullableIso(value);
  return iso === null ? null : iso.slice(0, 10);
}

function isOnTime(expectedDelivery: string | Date | null, firstReceiptDate: string | Date | null): boolean | null {
  const expected = dateOnly(expectedDelivery);
  const received = dateOnly(firstReceiptDate);
  if (!expected || !received) return null;
  return received <= expected;
}

function decimalCount(value: number): Dec {
  return Dec.from(String(value));
}

function abs(value: Dec): Dec {
  return value.cmp(Dec.zero()) < 0 ? Dec.zero().sub(value) : value;
}

function decimalToNumber(value: Dec, fractionDigits: number): number {
  return Number(value.toFixed(fractionDigits));
}

function intCount(value: string | number | null | undefined): number {
  return Number.parseInt(String(value ?? '0'), 10) || 0;
}

function variancePct(orderedQty: string | null, receivedQty: string | null): Dec | null {
  const ordered = Dec.from(orderedQty ?? '0');
  if (ordered.isZero()) return null;
  return Dec.from(receivedQty ?? '0').sub(ordered).div(ordered).mul(Dec.from('100'));
}

function mapScorecardPo(row: ScorecardPoDbRow): ScorecardPoRow {
  const variance = variancePct(row.ordered_qty, row.received_qty);
  return {
    id: row.id,
    poNumber: row.po_number,
    status: row.status,
    expectedDelivery: toNullableIso(row.expected_delivery),
    receivedAt: toNullableIso(row.first_receipt_date),
    onTime: isOnTime(row.expected_delivery, row.first_receipt_date),
    qtyVariancePct: variance === null ? null : decimalToNumber(variance, 2),
  };
}

function buildScorecard(poRows: ScorecardPoDbRow[], ncr: NcrCountRow | undefined): SupplierScorecard {
  const allPos = poRows.map(mapScorecardPo);
  const comparableOnTime = allPos.filter((po) => po.onTime !== null);
  const onTimePct =
    comparableOnTime.length === 0
      ? null
      : decimalToNumber(
          decimalCount(comparableOnTime.filter((po) => po.onTime === true).length)
            .div(decimalCount(comparableOnTime.length))
            .mul(Dec.from('100')),
          1,
        );

  const receivedVariance = poRows
    .map((row) => ({
      variance: variancePct(row.ordered_qty, row.received_qty),
      received: Dec.from(row.received_qty ?? '0'),
    }))
    .filter((entry): entry is { variance: Dec; received: Dec } => entry.variance !== null && !entry.received.isZero());

  const avgQtyVariancePct =
    receivedVariance.length === 0
      ? null
      : decimalToNumber(
          receivedVariance
            .reduce((sum, entry) => sum.add(abs(entry.variance)), Dec.zero())
            .div(decimalCount(receivedVariance.length)),
          2,
        );

  return {
    onTimePct,
    avgQtyVariancePct,
    ncrCount: intCount(ncr?.ncr_count),
    openNcrCount: intCount(ncr?.open_ncr_count),
    recentPos: allPos.slice(0, 10),
  };
}

export async function getSupplierScorecard(supplierId: string): Promise<FreightResult<SupplierScorecard>> {
  if (!uuidPattern.test(supplierId)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ client }): Promise<FreightResult<SupplierScorecard>> => {
      const c = client as QueryClient;

      // Confirm the supplier is in-org first (org-scoped → out-of-org is not_found, not a leak).
      const supplier = await c.query<{ id: string }>(
        `select id from public.suppliers where org_id = app.current_org_id() and id = $1::uuid limit 1`,
        [supplierId],
      );
      if (supplier.rows.length === 0) return { ok: false, error: 'not_found' };

      const { rows: poRows } = await c.query<ScorecardPoDbRow>(
        `with received_by_line as (
           select gi.po_line_id,
                  sum(gi.received_qty) as received_qty,
                  min(g.receipt_date) as first_receipt_date
             from public.grn_items gi
             join public.grns g
               on g.id = gi.grn_id
              and g.org_id = app.current_org_id()
              and g.status <> 'cancelled'
            where gi.org_id = app.current_org_id()
              and gi.po_line_id is not null
            group by gi.po_line_id
         )
         select po.id,
                po.po_number,
                po.status,
                po.expected_delivery,
                min(r.first_receipt_date) as first_receipt_date,
                coalesce(sum(pol.qty), 0)::text as ordered_qty,
                coalesce(sum(coalesce(r.received_qty, 0)), 0)::text as received_qty
           from public.purchase_orders po
           left join public.purchase_order_lines pol
             on pol.org_id = app.current_org_id()
            and pol.po_id = po.id
           left join received_by_line r
             on r.po_line_id = pol.id
          where po.org_id = app.current_org_id()
            and po.supplier_id = $1::uuid
          group by po.id, po.po_number, po.status, po.expected_delivery, po.created_at
          order by po.created_at desc`,
        [supplierId],
      );

      let ncr: NcrCountRow | undefined;
      try {
        const { rows: ncrRows } = await c.query<NcrCountRow>(
          `select count(*)::text as ncr_count,
                  count(*) filter (where n.status not in ('closed', 'cancelled'))::text as open_ncr_count
             from public.ncr_reports n
            where n.org_id = app.current_org_id()
              and (
                (n.reference_type = 'supplier' and n.reference_id = $1::uuid)
                or (n.reference_type = 'po' and exists (
                  select 1
                    from public.purchase_orders po
                   where po.org_id = app.current_org_id()
                     and po.id = n.reference_id
                     and po.supplier_id = $1::uuid
                ))
                or (n.reference_type = 'grn' and exists (
                  select 1
                    from public.grns g
                    left join public.purchase_orders po
                      on po.org_id = app.current_org_id()
                     and po.id = g.po_id
                   where g.org_id = app.current_org_id()
                     and g.id = n.reference_id
                     and (
                       g.supplier_id = $1::uuid
                       or po.supplier_id = $1::uuid
                     )
                ))
              )`,
          [supplierId],
        );
        ncr = ncrRows[0];
      } catch (ncrErr) {
        if (!isUndefinedTable(ncrErr)) throw ncrErr;
      }

      return { ok: true, data: buildScorecard(poRows, ncr) };
    });
  } catch (err) {
    if (isUndefinedTable(err)) {
      // Pre-mig-316 / pre-quality environment: render an honest empty scorecard.
      return {
        ok: true,
        data: { onTimePct: null, avgQtyVariancePct: null, ncrCount: 0, openNcrCount: 0, recentPos: [] },
      };
    }
    console.error('[planning/freight] getSupplierScorecard failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
