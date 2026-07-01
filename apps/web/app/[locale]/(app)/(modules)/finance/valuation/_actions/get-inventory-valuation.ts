import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

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

type ValuationDbRow = {
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  qty_on_hand: string;
  wac: string;
  total_value: string;
  currency: string;
};

type GrandTotalDbRow = {
  currency: string;
  total_value: string;
};

type InventoryValuationRow = {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qtyOnHand: string;
  wac: string;
  totalValue: string;
  currency: string;
};

type InventoryValuationGrandTotal = {
  currency: string;
  totalValue: string;
};

type InventoryValuation = {
  rows: InventoryValuationRow[];
  grandTotals: InventoryValuationGrandTotal[];
};

type InventoryValuationResult =
  | { ok: true; data: InventoryValuation }
  | { ok: false; reason: 'forbidden' | 'error' };

async function hasFinancePermission(ctx: FinanceContext, permission: string): Promise<boolean> {
  const res = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r
         on r.id = ur.role_id
        and r.org_id = $2::uuid
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return (res.rowCount ?? res.rows.length) > 0;
}

async function getInventoryValuationInContext(ctx: FinanceContext): Promise<InventoryValuationResult> {
  if (!(await hasFinancePermission(ctx, FINANCE_VALUATION_READ_PERMISSION))) {
    return { ok: false, reason: 'forbidden' };
  }

  const rows = await ctx.client.query<ValuationDbRow>(
    `select lp.product_id::text as item_id,
            i.item_code,
            i.name as item_name,
            coalesce(sum(lp.quantity), 0)::text as qty_on_hand,
            wac.avg_cost::text as wac,
            round(coalesce(sum(lp.quantity * wac.avg_cost), 0), 4)::text as total_value,
            c.code as currency
       from public.license_plates lp
       join public.item_wac_state wac
         on wac.org_id = app.current_org_id()
        and wac.item_id = lp.product_id
       join public.currencies c
         on c.id = wac.currency_id
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = lp.product_id
      where lp.org_id = app.current_org_id()
        and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
      group by lp.product_id, i.item_code, i.name, wac.avg_cost, c.code
      order by round(coalesce(sum(lp.quantity * wac.avg_cost), 0), 4) desc, i.item_code asc nulls last`,
  );

  const grandTotals = await ctx.client.query<GrandTotalDbRow>(
    `select valued.currency,
            round(sum(valued.total_value), 4)::text as total_value
       from (
         select c.code as currency,
                coalesce(sum(lp.quantity * wac.avg_cost), 0) as total_value
           from public.license_plates lp
           join public.item_wac_state wac
             on wac.org_id = app.current_org_id()
            and wac.item_id = lp.product_id
           join public.currencies c
             on c.id = wac.currency_id
          where lp.org_id = app.current_org_id()
            and lp.status not in ('consumed', 'shipped', 'destroyed', 'merged', 'returned')
          group by c.code
       ) valued
      group by valued.currency
      order by valued.currency asc`,
  );

  return {
    ok: true,
    data: {
      rows: rows.rows.map((row) => ({
        itemId: row.item_id,
        itemCode: row.item_code,
        itemName: row.item_name,
        qtyOnHand: String(row.qty_on_hand),
        wac: String(row.wac),
        totalValue: String(row.total_value),
        currency: row.currency,
      })),
      grandTotals: grandTotals.rows.map((row) => ({
        currency: row.currency,
        totalValue: String(row.total_value),
      })),
    },
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
