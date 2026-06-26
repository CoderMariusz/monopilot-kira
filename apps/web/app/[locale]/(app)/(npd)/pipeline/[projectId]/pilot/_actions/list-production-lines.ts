'use server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type ProductionLineOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
};

const READ_PERMISSION = 'npd.pilot.read';

type ProductionLineRow = {
  id: string;
  code: string;
  name: string;
  warehouse_id: string | null;
};

export async function listProductionLines(): Promise<ProductionLineOption[]> {
  return await withOrgContext(async (rawCtx) => {
    const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

    if (!(await hasPilotPermission(ctx, READ_PERMISSION))) {
      throw new Error('forbidden');
    }

    const { rows } = await ctx.client.query<ProductionLineRow>(
      `select id::text, code, name, warehouse_id::text
         from public.production_lines
        where org_id = app.current_org_id()
          and coalesce(status, 'active') <> 'archived'
        order by code`,
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      warehouseId: row.warehouse_id,
    }));
  });
}
