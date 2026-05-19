'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

export type TenantVariationsResult =
  | {
      ok: true;
      data: {
        deptOverrides: unknown;
        ruleVariantOverrides: unknown;
        featureFlags: unknown;
      };
    }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type TenantVariationRow = {
  dept_overrides?: unknown;
  rule_variant_overrides?: unknown;
  feature_flags?: unknown;
};

const FORBIDDEN = 'forbidden' as const;

export async function getTenantVariations(): Promise<TenantVariationsResult> {
  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.read' });

      const { rows } = await client.query<TenantVariationRow>(
        `select dept_overrides, rule_variant_overrides, feature_flags
           from public.tenant_variations
          where org_id = app.current_org_id()
          limit 1`,
      );
      const row = rows[0] ?? {};
      return {
        ok: true,
        data: {
          deptOverrides: row.dept_overrides ?? {},
          ruleVariantOverrides: row.rule_variant_overrides ?? {},
          featureFlags: row.feature_flags ?? {},
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function requirePermission({
  client,
  userId,
  orgId,
  permission,
}: OrgActionContext & { permission: string }): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  if (rows.length === 0) throw FORBIDDEN;
}
