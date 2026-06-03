import type pg from 'pg';

export type StatusOverall = 'Built' | 'Complete' | 'Alert' | 'InProgress' | 'Pending';

export type FaStatusOverallRow = {
  productCode: string;
  orgId: string;
  doneCore: boolean;
  donePlanning: boolean;
  doneCommercial: boolean;
  doneProduction: boolean;
  doneTechnical: boolean;
  doneMrp: boolean;
  doneProcurement: boolean;
  statusOverall: StatusOverall;
  daysToLaunch: number | null;
};

type DbFaStatusOverallRow = {
  product_code: string;
  org_id: string;
  done_core: boolean;
  done_planning: boolean;
  done_commercial: boolean;
  done_production: boolean;
  done_technical: boolean;
  done_mrp: boolean;
  done_procurement: boolean;
  status_overall: StatusOverall;
  days_to_launch: number | null;
};

export async function getFaStatusOverall(
  client: pg.Pool | pg.PoolClient,
  productCode: string,
): Promise<FaStatusOverallRow | null> {
  const result = await client.query<DbFaStatusOverallRow>(
    `
      select
        product_code,
        org_id,
        done_core,
        done_planning,
        done_commercial,
        done_production,
        done_technical,
        done_mrp,
        done_procurement,
        status_overall,
        days_to_launch
      from public.fa_status_overall
      where product_code = $1
    `,
    [productCode],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    productCode: row.product_code,
    orgId: row.org_id,
    doneCore: row.done_core,
    donePlanning: row.done_planning,
    doneCommercial: row.done_commercial,
    doneProduction: row.done_production,
    doneTechnical: row.done_technical,
    doneMrp: row.done_mrp,
    doneProcurement: row.done_procurement,
    statusOverall: row.status_overall,
    daysToLaunch: row.days_to_launch,
  };
}
