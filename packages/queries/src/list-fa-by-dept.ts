import pg from 'pg';

const { Pool } = pg;

const DEPT_CONFIG = {
  Core: { closedColumn: 'closed_core' },
  Planning: { closedColumn: 'closed_planning' },
  Commercial: { closedColumn: 'closed_commercial' },
  Production: { closedColumn: 'closed_production' },
  Technical: { closedColumn: 'closed_technical' },
  MRP: { closedColumn: 'closed_mrp' },
  Procurement: { closedColumn: 'closed_procurement' },
} as const;

export type FaDept = keyof typeof DEPT_CONFIG;

export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type ListFaByDeptOptions = {
  showClosed?: boolean;
  client?: QueryClient;
};

export type ListFaByDeptRow = {
  productCode: string;
  productName: string | null;
  closedCore: string | null;
  closedPlanning: string | null;
  closedCommercial: string | null;
  closedProduction: string | null;
  closedTechnical: string | null;
  closedMrp: string | null;
  closedProcurement: string | null;
};

type DbRow = {
  product_code: string;
  product_name: string | null;
  closed_core: string | null;
  closed_planning: string | null;
  closed_commercial: string | null;
  closed_production: string | null;
  closed_technical: string | null;
  closed_mrp: string | null;
  closed_procurement: string | null;
};

export async function listFaByDept(
  dept: FaDept,
  options: ListFaByDeptOptions = {},
): Promise<ListFaByDeptRow[]> {
  const config = DEPT_CONFIG[dept];
  if (!config) {
    throw new Error(`Unsupported FA department: ${dept}`);
  }

  const ownedPool = options.client ? null : getAppConnection();
  const client = options.client ?? ownedPool;
  if (!client) throw new Error('listFaByDept requires a query client or app connection');

  try {
    const result = await client.query<DbRow>(
      `select product_code,
              product_name,
              closed_core,
              closed_planning,
              closed_commercial,
              closed_production,
              closed_technical,
              closed_mrp,
              closed_procurement
         from public.product
        where org_id = (select app.current_org_id())
          and deleted_at is null
          ${options.showClosed ? '' : `and ${config.closedColumn} <> 'Yes'`}
        order by ${config.closedColumn}, product_code`,
    );

    return result.rows.map(toListRow);
  } finally {
    await ownedPool?.end();
  }
}

function getAppConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_APP or DATABASE_URL is required for listFaByDept');
  }

  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }

  return new Pool({ connectionString: url.toString() });
}

function toListRow(row: DbRow): ListFaByDeptRow {
  return {
    productCode: row.product_code,
    productName: row.product_name,
    closedCore: row.closed_core,
    closedPlanning: row.closed_planning,
    closedCommercial: row.closed_commercial,
    closedProduction: row.closed_production,
    closedTechnical: row.closed_technical,
    closedMrp: row.closed_mrp,
    closedProcurement: row.closed_procurement,
  };
}
