'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const TABLE_CODE = 'd365_constants';
const VIEW_PERMISSION = 'settings.d365.view';
const D365_CONSTANT_KEYS = [
  'PRODUCTIONSITEID',
  'APPROVERPERSONNELNUMBER',
  'CONSUMPTIONWAREHOUSEID',
  'PRODUCTGROUPID',
  'COSTINGOPERATIONRESOURCEID',
] as const;

type D365ConstantKey = (typeof D365_CONSTANT_KEYS)[number];

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ReferenceRow = {
  row_key: string;
  row_data: Record<string, unknown>;
  version?: number | null;
  is_active?: boolean | null;
};

export type GetD365ConstantsResult =
  | { ok: true; data: Record<D365ConstantKey, string | null> }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export async function getD365Constants(): Promise<GetD365ConstantsResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<GetD365ConstantsResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, VIEW_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<ReferenceRow>(
        `select row_key, row_data, version, is_active
           from public.reference_tables
          where org_id = app.current_org_id()
            and table_code = $1
            and row_key = any($2::text[])
            and is_active = true
          order by row_key`,
        [TABLE_CODE, D365_CONSTANT_KEYS],
      );

      const data = Object.fromEntries(D365_CONSTANT_KEYS.map((key) => [key, null])) as Record<D365ConstantKey, string | null>;
      for (const row of rows) {
        if (isD365ConstantKey(row.row_key)) {
          const value = row.row_data.value;
          data[row.row_key] = typeof value === 'string' ? value : null;
        }
      }
      return { ok: true, data };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function isD365ConstantKey(value: string): value is D365ConstantKey {
  return (D365_CONSTANT_KEYS as readonly string[]).includes(value);
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}
