'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const TABLE_CODE = 'd365_constants';
const EDIT_PERMISSION = 'settings.d365.manage';
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

export type SetD365ConstantInput = {
  key: string;
  value: string;
};

export type SetD365ConstantResult =
  | { ok: true; data: { key: D365ConstantKey; value: string } }
  | { ok: false; error: 'invalid_input' | 'invalid_constant' | 'forbidden' | 'persistence_failed' };

export async function setD365Constant(rawInput: SetD365ConstantInput): Promise<SetD365ConstantResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };
  if (!isD365ConstantKey(input.key)) return { ok: false, error: 'invalid_constant' };
  const key = input.key;

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<SetD365ConstantResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, EDIT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const before = await getExistingConstant(client, key);
      const rowData = { value: input.value };
      if (before) {
        await client.query(
          `update public.reference_tables
              set row_data = $3::jsonb,
                  updated_at = now()
            where org_id = app.current_org_id()
              and table_code = $1
              and row_key = $2`,
          [TABLE_CODE, key, rowData],
        );
      } else {
        await client.query(
          `insert into public.reference_tables
             (org_id, table_code, row_key, row_data, display_order, created_by)
           values ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)`,
          [orgId, TABLE_CODE, key, rowData, D365_CONSTANT_KEYS.indexOf(key), userId],
        );
      }

      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'settings.d365_constant.updated',
        resourceId: `${TABLE_CODE}:${key}`,
        beforeState: before ? { key: before.row_key, value: before.row_data.value } : null,
        afterState: { key, value: input.value },
      });

      return { ok: true, data: { key, value: input.value } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: SetD365ConstantInput | null | undefined): { key: string; value: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' ? raw.key.trim().toUpperCase() : '';
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!key || !value || value.length > 512) return null;
  return { key, value };
}

function isD365ConstantKey(value: string): value is D365ConstantKey {
  return (D365_CONSTANT_KEYS as readonly string[]).includes(value);
}

async function getExistingConstant(client: QueryClient, key: D365ConstantKey): Promise<ReferenceRow | null> {
  const { rows } = await client.query<ReferenceRow>(
    `select row_key, row_data, version, is_active
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and row_key = $2
        and is_active = true
      limit 1`,
    [TABLE_CODE, key],
  );
  return rows[0] ?? null;
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

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; beforeState: unknown; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'd365_constant', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.resourceId, JSON.stringify(params.beforeState), JSON.stringify(params.afterState)],
  );
}
