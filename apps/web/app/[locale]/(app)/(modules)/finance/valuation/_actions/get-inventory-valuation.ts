import { microToFixed, toMicro } from '../../../../../../../lib/shared/decimal';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import type {
  InventoryValuation,
  InventoryValuationResult,
  InventoryValuationRow,
} from './inventory-valuation-types';

const FINANCE_VALUATION_READ_PERMISSION = 'fin.costs.read';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type FinanceContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ValuedItemRow = {
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  wac: string;
  currency: string;
  qty_on_hand: string;
  total_value: string;
};

type UnvaluedAggregateRow = {
  lp_count: number;
  qty: string;
};

const LP_VALUATION_CTE = `
with lp_valuation as (
  select lp.id as lp_id,
         lp.product_id as item_id,
         i.item_code,
         i.name as item_name,
         lp.quantity,
         lp.uom,
         wac.avg_cost as wac,
         c.code as currency,
         case
           when lp.uom = coalesce(i.uom_base, 'kg') or lp.uom = 'base' then lp.quantity
           when lp.uom = 'each'
             and i.net_qty_per_each is not null
             then lp.quantity * i.net_qty_per_each
           when lp.uom = 'box'
             and i.net_qty_per_each is not null
             and i.each_per_box is not null
             then lp.quantity * i.each_per_box * i.net_qty_per_each
           else null
         end as base_qty_kg
    from public.license_plates lp
    left join public.items i
      on i.org_id = app.current_org_id()
     and i.id = lp.product_id
    left join public.item_wac_state wac
      on wac.org_id = app.current_org_id()
     and wac.item_id = lp.product_id
    left join public.currencies c
      on c.id = wac.currency_id
   where lp.org_id = app.current_org_id()
     and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
)`;

function formatQty(value: string): string {
  return microToFixed(toMicro(value), 6);
}

function formatMoney(value: string): string {
  return microToFixed(toMicro(value), 4);
}

function buildValuation(valuedRows: ValuedItemRow[], unvaluedRow: UnvaluedAggregateRow): InventoryValuation {
  const rows: InventoryValuationRow[] = valuedRows
    .map((row) => ({
      itemId: row.item_id,
      itemCode: row.item_code,
      itemName: row.item_name,
      qtyOnHand: formatQty(row.qty_on_hand),
      wac: row.wac,
      totalValue: formatMoney(row.total_value),
      currency: row.currency,
    }))
    .sort((a, b) => {
      const valueDiff = toMicro(b.totalValue) - toMicro(a.totalValue);
      if (valueDiff !== 0n) return valueDiff > 0n ? 1 : -1;
      return (a.itemCode ?? a.itemId).localeCompare(b.itemCode ?? b.itemId);
    });

  const grandByCurrency = new Map<string, bigint>();
  for (const row of rows) {
    const micro = toMicro(row.totalValue);
    grandByCurrency.set(row.currency, (grandByCurrency.get(row.currency) ?? 0n) + micro);
  }

  const grandTotals = [...grandByCurrency.entries()]
    .map(([currency, totalValueMicro]) => ({
      currency,
      totalValue: microToFixed(totalValueMicro, 4),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    rows,
    grandTotals,
    unvalued: {
      lpCount: unvaluedRow.lp_count,
      qty: formatQty(unvaluedRow.qty),
    },
  };
}

async function getInventoryValuationInContext(ctx: FinanceContext): Promise<InventoryValuationResult> {
  if (!(await hasPermission(ctx, FINANCE_VALUATION_READ_PERMISSION))) {
    return { ok: false, reason: 'forbidden' };
  }

  const [valuedRes, unvaluedRes] = await Promise.all([
    ctx.client.query<ValuedItemRow>(
      `${LP_VALUATION_CTE}
       select item_id::text,
              item_code,
              item_name,
              wac::text,
              currency,
              sum(base_qty_kg)::text as qty_on_hand,
              sum(base_qty_kg * wac)::text as total_value
         from lp_valuation
        where wac is not null
          and currency is not null
          and base_qty_kg is not null
        group by item_id, item_code, item_name, wac, currency
        order by sum(base_qty_kg * wac) desc nulls last, item_code nulls last`,
    ),
    ctx.client.query<UnvaluedAggregateRow>(
      `${LP_VALUATION_CTE}
       select count(*)::int as lp_count,
              coalesce(sum(quantity), 0)::text as qty
         from lp_valuation
        where wac is null
           or currency is null
           or base_qty_kg is null`,
    ),
  ]);

  const unvaluedRow = unvaluedRes.rows[0] ?? { lp_count: 0, qty: '0' };

  return {
    ok: true,
    data: buildValuation(valuedRes.rows, unvaluedRow),
  };
}

export async function getInventoryValuation(): Promise<InventoryValuationResult> {
  'use server';

  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<InventoryValuationResult> =>
        getInventoryValuationInContext({ userId, orgId, client: client as QueryClient }),
    );
  } catch (error) {
    console.error('[finance] getInventoryValuation failed', error);
    return { ok: false, reason: 'error' };
  }
}
