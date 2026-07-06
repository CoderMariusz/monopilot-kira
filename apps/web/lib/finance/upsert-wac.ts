type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type UpsertWacInput = {
  orgId: string;
  siteId: string | null;
  itemId: string;
  deltaQtyKg: string;
  deltaValue: string;
  updatedBy: string;
};

type WacUpdateResult = {
  totalQtyKg: string;
  totalValue: string;
  clamped: boolean;
  excluded?: 'unresolved_uom';
};

export async function upsertWac(
  client: QueryClient,
  { orgId, itemId, deltaQtyKg, deltaValue, updatedBy }: UpsertWacInput,
): Promise<WacUpdateResult> {
  if (isZeroDecimalString(deltaQtyKg) && !isZeroDecimalString(deltaValue)) {
    console.warn('[wac] unresolved_uom', { orgId, itemId, deltaQtyKg, deltaValue });
    const { rows } = await client.query<WacUpdateResult>(
      `select total_qty_kg::text as "totalQtyKg",
              total_value::text as "totalValue",
              false as clamped
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid
          and currency_id = (select id from public.currencies where code = 'GBP')`,
      [orgId, itemId],
    );
    return { ...(rows[0] ?? { totalQtyKg: '0', totalValue: '0', clamped: false }), excluded: 'unresolved_uom' };
  }

  const { rows } = await client.query<WacUpdateResult>(
    `with existing as materialized (
       select total_qty_kg, total_value
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid
          and currency_id = (select id from public.currencies where code = 'GBP')
        for update
     ),
     computed as (
       select greatest(coalesce((select total_qty_kg from existing), 0) + $3::numeric, 0) as total_qty_kg,
              greatest(coalesce((select total_value from existing), 0) + $4::numeric, 0) as total_value,
              (
                coalesce((select total_qty_kg from existing), 0) + $3::numeric < 0
                or coalesce((select total_value from existing), 0) + $4::numeric < 0
              ) as clamped
     ),
     upserted as (
       insert into public.item_wac_state (
         org_id, item_id, currency_id, total_qty_kg, total_value, updated_by, updated_at
       )
       select $1::uuid,
              $2::uuid,
              (select id from public.currencies where code = 'GBP'),
              computed.total_qty_kg,
              computed.total_value,
              $5::uuid,
              now()
         from computed
       on conflict (org_id, item_id, currency_id) do update set
         total_qty_kg = greatest(public.item_wac_state.total_qty_kg + $3::numeric, 0),
         total_value = greatest(public.item_wac_state.total_value + $4::numeric, 0),
         updated_by = $5::uuid,
         updated_at = now()
       returning total_qty_kg::text, total_value::text
     )
     select upserted.total_qty_kg as "totalQtyKg",
            upserted.total_value as "totalValue",
            computed.clamped
       from upserted
       cross join computed`,
    [orgId, itemId, deltaQtyKg, deltaValue, updatedBy],
  );
  const result = rows[0] ?? { totalQtyKg: '0', totalValue: '0', clamped: false };
  if (result.clamped) {
    console.warn('[finance] item_wac_state clamped at zero', { orgId, itemId });
  }
  return result;
}

export type WacDeltaQtyKgResolution = {
  qtyKg: string;
  resolved: boolean;
  marker?: 'unresolved_uom';
};

export async function resolveWacDeltaQtyKg(
  client: QueryClient,
  { itemId, qty, uom }: { itemId: string; qty: string; uom: string },
): Promise<WacDeltaQtyKgResolution> {
  const { rows } = await client.query<{ qty_kg: string; resolved: boolean }>(
    `select (
       case
         when lower($2::text) = 'kg' then $1::numeric
         when lower($2::text) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then $1::numeric
         when lower($2::text) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then $1::numeric
         when lower($2::text) = 'each' and i.net_qty_per_each is not null then $1::numeric * i.net_qty_per_each
         when lower($2::text) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null
           then $1::numeric * i.each_per_box::numeric * i.net_qty_per_each
         else $1::numeric
       end
     )::text as qty_kg,
     (
       case
         when lower($2::text) = 'kg' then true
         when lower($2::text) = 'base' and lower(coalesce(i.uom_base, '')) = 'kg' then true
         when lower($2::text) = lower(coalesce(i.uom_base, '')) and lower(coalesce(i.uom_base, '')) = 'kg' then true
         when lower($2::text) = 'each' and i.net_qty_per_each is not null then true
         when lower($2::text) = 'box' and i.net_qty_per_each is not null and i.each_per_box is not null then true
         else false
       end
     ) as resolved
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $3::uuid
      limit 1`,
    [qty, uom, itemId],
  );
  const row = rows[0];
  if (!row) {
    console.warn('[wac] unresolved_uom', { itemId, uom, qty });
    return { qtyKg: '0', resolved: false, marker: 'unresolved_uom' };
  }
  if (!row.resolved) {
    console.warn('[wac] unresolved_uom', { itemId, uom, qty });
    return { qtyKg: '0', resolved: false, marker: 'unresolved_uom' };
  }
  return { qtyKg: row.qty_kg, resolved: row.resolved };
}

export type WacReversalDelta = {
  deltaQtyKg: string;
  deltaValue: string;
  source: 'snapshot' | 'fallback';
};

/** Reverses a prior WAC credit (output void, receipt void): negate booked qty/value. */
export function computeWacReversalDelta(input: {
  extJsonb: unknown;
  fallbackQtyKg: string;
  fallbackValue: string;
}): WacReversalDelta {
  const snapshot = readWacContributionSnapshot(input.extJsonb);
  if (snapshot) {
    return {
      deltaQtyKg: negateDecimalString(snapshot.wac_qty_kg),
      deltaValue: negateDecimalString(snapshot.wac_value),
      source: 'snapshot',
    };
  }

  return {
    deltaQtyKg: negateDecimalString(input.fallbackQtyKg),
    deltaValue: negateDecimalString(input.fallbackValue),
    source: 'fallback',
  };
}

/** Reverses a prior WAC debit (consumption reverse, ship cancel): restore booked qty/value. */
export function computeWacDebitReversalDelta(input: {
  extJsonb: unknown;
  fallbackQtyKg: string;
  fallbackValue: string;
}): WacReversalDelta {
  const snapshot = readWacContributionSnapshot(input.extJsonb);
  if (snapshot) {
    return {
      deltaQtyKg: snapshot.wac_qty_kg,
      deltaValue: snapshot.wac_value,
      source: 'snapshot',
    };
  }

  return {
    deltaQtyKg: input.fallbackQtyKg,
    deltaValue: input.fallbackValue,
    source: 'fallback',
  };
}

export function isWacExcluded(extJsonb: unknown): boolean {
  if (extJsonb == null || typeof extJsonb !== 'object' || Array.isArray(extJsonb)) return false;
  return (extJsonb as { wac_excluded?: unknown }).wac_excluded === 'unresolved_uom';
}

export type WacConsumptionReversalResult =
  | { applied: true; deltaQtyKg: string; deltaValue: string; source: 'snapshot' | 'fallback'; wac: WacUpdateResult }
  | { applied: false; skipped: 'wac_excluded' | 'no_contribution' };

export async function applyConsumptionWacReversal(
  client: QueryClient,
  input: {
    orgId: string;
    siteId: string | null;
    itemId: string;
    extJsonb: unknown;
    fallbackQty: string;
    fallbackUom: string;
    updatedBy: string;
    logContext?: Record<string, unknown>;
  },
): Promise<WacConsumptionReversalResult> {
  if (isWacExcluded(input.extJsonb)) {
    return { applied: false, skipped: 'wac_excluded' };
  }

  let reversal = computeWacDebitReversalDelta({
    extJsonb: input.extJsonb,
    fallbackQtyKg: '0',
    fallbackValue: '0',
  });
  if (reversal.source === 'fallback') {
    console.warn('[wac] reversal_fallback', input.logContext ?? { itemId: input.itemId });
    const resolution = await resolveWacDeltaQtyKg(client, {
      itemId: input.itemId,
      qty: input.fallbackQty,
      uom: input.fallbackUom,
    });
    if (!resolution.resolved || isZeroDecimalString(resolution.qtyKg)) {
      return { applied: false, skipped: 'no_contribution' };
    }
    const debit = await readLockedWacDebitAmounts(client, {
      orgId: input.orgId,
      itemId: input.itemId,
      qtyKg: resolution.qtyKg,
    });
    reversal = {
      deltaQtyKg: negateDecimalString(debit.deltaQtyKg),
      deltaValue: negateDecimalString(debit.deltaValue),
      source: 'fallback',
    };
  }

  const wac = await upsertWac(client, {
    orgId: input.orgId,
    siteId: input.siteId,
    itemId: input.itemId,
    deltaQtyKg: reversal.deltaQtyKg,
    deltaValue: reversal.deltaValue,
    updatedBy: input.updatedBy,
  });

  return {
    applied: true,
    deltaQtyKg: reversal.deltaQtyKg,
    deltaValue: reversal.deltaValue,
    source: reversal.source,
    wac,
  };
}

export type ShipmentWacDebitEntry = {
  lp_id: string;
  item_id: string;
  qty_kg?: string;
  wac_value?: string;
  wac_excluded?: string;
};

export function parseShipmentWacDebits(value: unknown): ShipmentWacDebitEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ShipmentWacDebitEntry => {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const row = entry as ShipmentWacDebitEntry;
    return typeof row.lp_id === 'string' && typeof row.item_id === 'string';
  });
}

export async function applyShipmentWacCancelCredits(
  client: QueryClient,
  input: {
    orgId: string;
    siteId: string | null;
    wacDebits: unknown;
    updatedBy: string;
  },
): Promise<void> {
  for (const debit of parseShipmentWacDebits(input.wacDebits)) {
    if (debit.wac_excluded === 'unresolved_uom') continue;
    if (!debit.qty_kg || !debit.wac_value) continue;
    await upsertWac(client, {
      orgId: input.orgId,
      siteId: input.siteId,
      itemId: debit.item_id,
      deltaQtyKg: debit.qty_kg,
      deltaValue: debit.wac_value,
      updatedBy: input.updatedBy,
    });
  }
}

function readWacContributionSnapshot(extJsonb: unknown): { wac_qty_kg: string; wac_value: string } | null {
  if (extJsonb == null || typeof extJsonb !== 'object' || Array.isArray(extJsonb)) return null;
  const snapshot = extJsonb as { wac_qty_kg?: unknown; wac_value?: unknown };
  if (typeof snapshot.wac_qty_kg !== 'string' || typeof snapshot.wac_value !== 'string') return null;
  return { wac_qty_kg: snapshot.wac_qty_kg, wac_value: snapshot.wac_value };
}

function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

function isZeroDecimalString(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value.trim());
}

export type WacDebitDelta = {
  qtyKg: string;
  valueDebited: string;
  avgCostUsed: string;
  deltaQtyKg: string;
  deltaValue: string;
};

export type WacDebitComputation =
  | ({ applied: true } & WacDebitDelta)
  | { applied: false; excluded: 'unresolved_uom' | 'zero_qty' };

export type DebitWacInput = {
  orgId: string;
  siteId: string | null;
  itemId: string;
  qty: string;
  uom: string;
  updatedBy: string;
};

export type DebitWacResult = WacDebitComputation & {
  wac?: WacUpdateResult;
};

/**
 * Resolves consumption/shipment qty to kg and computes the WAC debit deltas
 * (negative qty/value) using the locked pool avg_cost. Does not mutate state.
 */
export async function computeWacDebitDelta(
  client: QueryClient,
  input: { orgId: string; itemId: string; qty: string; uom: string },
): Promise<WacDebitComputation> {
  const resolution = await resolveWacDeltaQtyKg(client, {
    itemId: input.itemId,
    qty: input.qty,
    uom: input.uom,
  });
  if (!resolution.resolved) {
    return { applied: false, excluded: 'unresolved_uom' };
  }
  if (isZeroDecimalString(resolution.qtyKg)) {
    return { applied: false, excluded: 'zero_qty' };
  }

  const locked = await readLockedWacDebitAmounts(client, {
    orgId: input.orgId,
    itemId: input.itemId,
    qtyKg: resolution.qtyKg,
  });
  return {
    applied: true,
    qtyKg: locked.qtyKg,
    valueDebited: locked.valueDebited,
    avgCostUsed: locked.avgCostUsed,
    deltaQtyKg: locked.deltaQtyKg,
    deltaValue: locked.deltaValue,
  };
}

/** Applies a pre-computed debit delta to item_wac_state (org + GBP bucket). */
export async function applyWacDebitDelta(
  client: QueryClient,
  input: DebitWacInput & WacDebitDelta,
): Promise<WacUpdateResult> {
  return upsertWac(client, {
    orgId: input.orgId,
    siteId: input.siteId,
    itemId: input.itemId,
    deltaQtyKg: input.deltaQtyKg,
    deltaValue: input.deltaValue,
    updatedBy: input.updatedBy,
  });
}

/**
 * Debit WAC on material consumption or shipment: decrement total_qty_kg and
 * total_value by (qty_kg × locked avg_cost). Skips unresolved UoM conversions.
 */
export async function debitWac(client: QueryClient, input: DebitWacInput): Promise<DebitWacResult> {
  const resolution = await resolveWacDeltaQtyKg(client, {
    itemId: input.itemId,
    qty: input.qty,
    uom: input.uom,
  });
  if (!resolution.resolved) {
    return { applied: false, excluded: 'unresolved_uom' };
  }
  if (isZeroDecimalString(resolution.qtyKg)) {
    return { applied: false, excluded: 'zero_qty' };
  }

  const { rows } = await client.query<{
    qtyKg: string;
    valueDebited: string;
    avgCostUsed: string;
    totalQtyKg: string;
    totalValue: string;
    clamped: boolean;
  }>(
    `with existing as materialized (
       select total_qty_kg, total_value, avg_cost
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid
          and currency_id = (select id from public.currencies where code = 'GBP')
        for update
     ),
     computed as (
       select $3::numeric as qty_kg,
              coalesce((select avg_cost from existing), 0) as avg_cost_used,
              ($3::numeric * coalesce((select avg_cost from existing), 0)) as value_debited,
              -$3::numeric as delta_qty_kg,
              -($3::numeric * coalesce((select avg_cost from existing), 0)) as delta_value,
              greatest(coalesce((select total_qty_kg from existing), 0) - $3::numeric, 0) as total_qty_kg,
              greatest(coalesce((select total_value from existing), 0) - ($3::numeric * coalesce((select avg_cost from existing), 0)), 0) as total_value,
              (
                coalesce((select total_qty_kg from existing), 0) - $3::numeric < 0
                or coalesce((select total_value from existing), 0) - ($3::numeric * coalesce((select avg_cost from existing), 0)) < 0
              ) as clamped
     ),
     upserted as (
       insert into public.item_wac_state (
         org_id, item_id, currency_id, total_qty_kg, total_value, updated_by, updated_at
       )
       select $1::uuid,
              $2::uuid,
              (select id from public.currencies where code = 'GBP'),
              computed.total_qty_kg,
              computed.total_value,
              $4::uuid,
              now()
         from computed
       on conflict (org_id, item_id, currency_id) do update set
         total_qty_kg = greatest(public.item_wac_state.total_qty_kg + computed.delta_qty_kg, 0),
         total_value = greatest(public.item_wac_state.total_value + computed.delta_value, 0),
         updated_by = $4::uuid,
         updated_at = now()
       returning total_qty_kg::text, total_value::text
     )
     select computed.qty_kg::text as "qtyKg",
            computed.value_debited::text as "valueDebited",
            computed.avg_cost_used::text as "avgCostUsed",
            upserted.total_qty_kg as "totalQtyKg",
            upserted.total_value as "totalValue",
            computed.clamped
       from computed
       cross join upserted`,
    [input.orgId, input.itemId, resolution.qtyKg, input.updatedBy],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('[wac] debitWac: locked upsert returned no row');
  }
  if (row.clamped) {
    console.warn('[finance] item_wac_state clamped at zero', { orgId: input.orgId, itemId: input.itemId });
  }
  return {
    applied: true,
    qtyKg: row.qtyKg,
    valueDebited: row.valueDebited,
    avgCostUsed: row.avgCostUsed,
    deltaQtyKg: negateDecimalString(row.qtyKg),
    deltaValue: negateDecimalString(row.valueDebited),
    wac: {
      totalQtyKg: row.totalQtyKg,
      totalValue: row.totalValue,
      clamped: row.clamped,
    },
  };
}

async function readLockedWacDebitAmounts(
  client: QueryClient,
  input: { orgId: string; itemId: string; qtyKg: string },
): Promise<WacDebitDelta> {
  const { rows } = await client.query<{
    avg_cost_used: string;
    value_debited: string;
  }>(
    `with existing as materialized (
       select avg_cost
         from public.item_wac_state
        where org_id = $1::uuid
          and item_id = $2::uuid
          and currency_id = (select id from public.currencies where code = 'GBP')
        for update
     )
     select coalesce((select avg_cost from existing), 0)::text as avg_cost_used,
            ($3::numeric * coalesce((select avg_cost from existing), 0))::text as value_debited`,
    [input.orgId, input.itemId, input.qtyKg],
  );
  const avgCostUsed = rows[0]?.avg_cost_used ?? '0';
  const valueDebited = rows[0]?.value_debited ?? '0';
  return {
    qtyKg: input.qtyKg,
    valueDebited,
    avgCostUsed,
    deltaQtyKg: negateDecimalString(input.qtyKg),
    deltaValue: negateDecimalString(valueDebited),
  };
}
