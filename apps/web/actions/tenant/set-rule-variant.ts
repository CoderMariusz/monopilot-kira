'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { writeTenantOutbox } from './_shared/outbox';

export type SetRuleVariantInput = {
  ruleCode: string;
  variantVersionId: string;
  auditReason?: string;
};

export type SetRuleVariantResult =
  | { ok: true; data: { ruleCode: string; variantVersionId: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'VARIANT_NOT_FOUND'
        | 'forbidden'
        | 'not_found'
        | 'persistence_failed';
      message?: string;
    };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type RuleDefinitionRow = { id: string; rule_code?: string; version?: number };

const FORBIDDEN = 'forbidden' as const;
const RULE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function setRuleVariant(rawInput: SetRuleVariantInput): Promise<SetRuleVariantResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      // V-SET-31: variant must reference an existing rule_definitions row (org-scoped).
      const variant = await client.query<RuleDefinitionRow>(
        `select id, rule_code, version
           from public.rule_definitions
          where org_id = app.current_org_id()
            and id = $1::uuid
            and rule_code = $2
          limit 1`,
        [input.variantVersionId, input.ruleCode],
      );
      if ((variant.rowCount ?? variant.rows.length) < 1) {
        return { ok: false, error: 'VARIANT_NOT_FOUND' };
      }

      const updated = await client.query(
        `update public.tenant_variations
            set rule_variant_overrides = jsonb_set(
                  coalesce(rule_variant_overrides, '{}'::jsonb),
                  $1::text[],
                  to_jsonb($2::text),
                  true
                )
          where org_id = app.current_org_id()
        returning rule_variant_overrides`,
        [[input.ruleCode], input.variantVersionId],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) return { ok: false, error: 'not_found' };

      const afterState = {
        rule_code: input.ruleCode,
        variant_version_id: input.variantVersionId,
        audit_reason: input.auditReason,
      };
      await writeAuditLog({ client, orgId, userId, action: 'tenant_variations.rule_variant.updated', afterState });
      await writeTenantOutbox({
        client,
        orgId,
        aggregateId: input.variantVersionId,
        eventType: 'settings.rule_variant.updated',
        aggregateType: 'tenant_variation',
        appVersion: 'settings-tenant-variations-v1',
        payload: { org_id: orgId, scope: 'tenant', ...afterState, actor_user_id: userId },
      });

      revalidatePath('/settings/tenant');
      return { ok: true, data: { ruleCode: input.ruleCode, variantVersionId: input.variantVersionId } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: SetRuleVariantInput | null | undefined): SetRuleVariantInput | null {
  if (!input || typeof input !== 'object') return null;
  const ruleCode = typeof input.ruleCode === 'string' ? input.ruleCode.trim() : '';
  const variantVersionId = typeof input.variantVersionId === 'string' ? input.variantVersionId.trim() : '';
  const auditReason = typeof input.auditReason === 'string' ? input.auditReason.trim() : undefined;
  if (!RULE_CODE_PATTERN.test(ruleCode) || !UUID_PATTERN.test(variantVersionId)) return null;
  return { ruleCode, variantVersionId, auditReason: auditReason && auditReason.length > 0 ? auditReason : undefined };
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
