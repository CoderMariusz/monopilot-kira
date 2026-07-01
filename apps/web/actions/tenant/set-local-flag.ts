'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { writeTenantOutbox } from './_shared/outbox';

export type SetLocalFlagInput = {
  flagKey: string;
  enabled: boolean;
  auditReason?: string;
};

export type SetLocalFlagResult =
  | { ok: true; data: { flagKey: string; enabled: boolean } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

const FORBIDDEN = 'forbidden' as const;
const FLAG_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;

export async function setLocalFlag(rawInput: SetLocalFlagInput): Promise<SetLocalFlagResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.flags.edit' });

      const updated = await client.query(
        `update public.tenant_variations
            set feature_flags = jsonb_set(
                  coalesce(feature_flags, '{}'::jsonb),
                  $1::text[],
                  to_jsonb($2::boolean),
                  true
                )
          where org_id = app.current_org_id()
        returning feature_flags`,
        [[input.flagKey], input.enabled],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) return { ok: false, error: 'not_found' };

      const afterState = {
        flag_key: input.flagKey,
        enabled: input.enabled,
        audit_reason: input.auditReason,
      };
      await writeAuditLog({ client, orgId, userId, action: 'tenant_variations.local_flag.updated', afterState });
      await writeTenantOutbox({
        client,
        orgId,
        aggregateId: orgId,
        eventType: 'settings.module.toggled',
        aggregateType: 'tenant_variation',
        appVersion: 'settings-tenant-variations-v1',
        payload: { org_id: orgId, scope: 'tenant', ...afterState, actor_user_id: userId },
      });

      revalidatePath('/settings/tenant');
      return { ok: true, data: { flagKey: input.flagKey, enabled: input.enabled } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: SetLocalFlagInput | null | undefined): SetLocalFlagInput | null {
  if (!input || typeof input !== 'object') return null;
  const flagKey = typeof input.flagKey === 'string' ? input.flagKey.trim() : '';
  const auditReason = typeof input.auditReason === 'string' ? input.auditReason.trim() : undefined;
  if (!FLAG_KEY_PATTERN.test(flagKey) || typeof input.enabled !== 'boolean') return null;
  return { flagKey, enabled: input.enabled, auditReason: auditReason && auditReason.length > 0 ? auditReason : undefined };
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

async function writeAuditLog({
  client,
  orgId,
  userId,
  action,
  afterState,
}: {
  client: QueryClient;
  orgId: string;
  userId: string;
  action: string;
  afterState: unknown;
}): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'tenant_variations', $4, $5::jsonb, 'standard')`,
    [orgId, userId, action, orgId, JSON.stringify(afterState)],
  );
}
