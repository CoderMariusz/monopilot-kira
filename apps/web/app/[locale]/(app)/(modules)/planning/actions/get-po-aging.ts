'use server';

import { withOrgContext } from "../../../../../../lib/auth/with-org-context";

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PoAgingBucketKey = "0-30" | "31-60" | "61-90" | "90+";

type PoAgingBucket = {
  bucket: PoAgingBucketKey;
  count: number;
  /**
   * One entry PER CURRENCY. There are no FX tables in this system, so overdue
   * value is never summed across currencies — 1000 EUR + 500 GBP is not 1500 of
   * anything. Splitting (rather than nulling the whole bucket, as
   * `sales_orders.total_amount_gbp` does) keeps the report usable for orgs that
   * legitimately buy in more than one currency.
   */
  totals: Array<{ currency: string; value: string }>;
};

type PoAgingRow = {
  bucket: PoAgingBucketKey;
  currency: string | null;
  count: string | number;
  total_value: string | null;
};

const BUCKET_ORDER: PoAgingBucketKey[] = ["0-30", "31-60", "61-90", "90+"];

function emptyBuckets(): PoAgingBucket[] {
  return BUCKET_ORDER.map((bucket) => ({ bucket, count: 0, totals: [] }));
}

export async function getPoAging(): Promise<PoAgingBucket[]> {
  try {
    return await withOrgContext(async ({ client }): Promise<PoAgingBucket[]> => {
      const { rows } = await (client as QueryClient).query<PoAgingRow>(
        `with open_overdue_pos as (
           select po.id,
                  coalesce(nullif(upper(trim(po.currency)), ''), 'GBP') as currency,
                  case
                    when current_date - po.expected_delivery between 1 and 30 then '0-30'
                    when current_date - po.expected_delivery between 31 and 60 then '31-60'
                    when current_date - po.expected_delivery between 61 and 90 then '61-90'
                    else '90+'
                  end as bucket,
                  coalesce(sum(pol.qty * pol.unit_price), 0)::numeric(18, 4) as total_value
             from public.purchase_orders po
             left join public.purchase_order_lines pol
               on pol.org_id = app.current_org_id()
              and pol.po_id = po.id
            where po.org_id = app.current_org_id()
              and po.status in ('draft', 'sent', 'confirmed', 'partially_received')
              and po.expected_delivery is not null
              and po.expected_delivery < current_date
            group by po.id, po.expected_delivery, po.currency
         )
         select bucket::text as bucket,
                currency,
                count(*)::int as count,
                coalesce(sum(total_value), 0)::numeric(18, 4)::text as total_value
           from open_overdue_pos
          group by bucket, currency
          order by bucket, currency`,
      );

      const buckets = emptyBuckets();
      for (const row of rows) {
        const bucket = buckets.find((entry) => entry.bucket === row.bucket);
        if (!bucket) continue;
        bucket.count += Number(row.count);
        bucket.totals.push({ currency: row.currency ?? "GBP", value: row.total_value ?? "0" });
      }
      return buckets;
    });
  } catch (error) {
    console.error("[planning/po-aging] read failed", error);
    return emptyBuckets();
  }
}
