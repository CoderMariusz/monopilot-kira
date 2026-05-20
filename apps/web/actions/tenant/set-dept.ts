'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type SetDepartmentOverrideInput = {
  action: 'split' | 'merge' | 'add' | 'rename';
  departmentCode?: string;
  targetDepartmentCodes?: string[];
  sourceDepartmentCodes?: string[];
  targetDepartmentCode?: string;
  newDepartmentCode?: string;
  label?: string;
  auditReason?: string;
};

export type SetDepartmentOverrideResult =
  | { ok: true; data: { deptOverrides: unknown } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'DUPLICATE_TARGET'
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

type TenantVariationRow = { dept_overrides?: unknown };
type DepartmentOverride =
  | { action: 'split'; source: string; targets: string[]; audit_reason?: string }
  | { action: 'merge'; sources: string[]; target: string; audit_reason?: string }
  | { action: 'add'; code: string; label?: string; audit_reason?: string }
  | { action: 'rename'; source: string; target: string; label?: string; audit_reason?: string };

type ParsedOverride =
  | { ok: true; override: DepartmentOverride }
  | { ok: false; error: 'invalid_input' | 'DUPLICATE_TARGET' };

const FORBIDDEN = 'forbidden' as const;
const CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export async function setDepartmentOverride(rawInput: SetDepartmentOverrideInput): Promise<SetDepartmentOverrideResult> {
  const parsed = parseDepartmentOverride(rawInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const override = parsed.override;

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId, permission: 'settings.org.update' });

      const updated = await client.query<TenantVariationRow>(
        `update public.tenant_variations
            set dept_overrides = jsonb_set(
                  coalesce(dept_overrides, '{}'::jsonb),
                  $1::text[],
                  $2::jsonb,
                  true
                )
          where org_id = app.current_org_id()
        returning dept_overrides`,
        [deptOverridePath(override), JSON.stringify(override)],
      );
      const row = updated.rows[0];
      if ((updated.rowCount ?? updated.rows.length) < 1 || !row) return { ok: false, error: 'not_found' };

      await writeAuditLog({ client, orgId, userId, action: 'tenant_variations.dept_override.updated', afterState: override });
      await writeOutbox({
        client,
        orgId,
        aggregateId: orgId,
        eventType: 'settings.dept_override.updated',
        payload: { org_id: orgId, scope: 'tenant', override, actor_user_id: userId },
      });

      revalidatePath('/settings/tenant');
      return { ok: true, data: { deptOverrides: row.dept_overrides ?? {} } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseDepartmentOverride(input: SetDepartmentOverrideInput | null | undefined): ParsedOverride {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const auditReason = optionalText(input.auditReason, 512);

  if (input.action === 'split') {
    const source = normalizeCode(input.departmentCode);
    const targets = normalizeCodeList(input.targetDepartmentCodes);
    if (!source || targets.length === 0) return { ok: false, error: 'invalid_input' };
    if (hasDuplicates(targets) || targets.includes(source)) {
      return { ok: false, error: 'DUPLICATE_TARGET' };
    }
    return { ok: true, override: { action: 'split', source, targets, audit_reason: auditReason } };
  }
  if (input.action === 'merge') {
    const sources = normalizeCodeList(input.sourceDepartmentCodes);
    const target = normalizeCode(input.targetDepartmentCode);
    if (sources.length < 2 || !target) return { ok: false, error: 'invalid_input' };
    if (hasDuplicates(sources) || sources.includes(target)) {
      return { ok: false, error: 'DUPLICATE_TARGET' };
    }
    return { ok: true, override: { action: 'merge', sources, target, audit_reason: auditReason } };
  }
  if (input.action === 'add') {
    const code = normalizeCode(input.newDepartmentCode ?? input.departmentCode);
    const label = optionalText(input.label, 100);
    if (!code) return { ok: false, error: 'invalid_input' };
    return { ok: true, override: { action: 'add', code, label, audit_reason: auditReason } };
  }
  if (input.action === 'rename') {
    const source = normalizeCode(input.departmentCode);
    const target = normalizeCode(input.newDepartmentCode ?? input.targetDepartmentCode);
    const label = optionalText(input.label, 100);
    if (!source || !target || source === target) return { ok: false, error: 'invalid_input' };
    return { ok: true, override: { action: 'rename', source, target, label, audit_reason: auditReason } };
  }
  return { ok: false, error: 'invalid_input' };
}

function deptOverridePath(override: DepartmentOverride): string[] {
  if (override.action === 'split') return ['actions', 'split', override.source];
  if (override.action === 'merge') return ['actions', 'merge', override.target];
  if (override.action === 'add') return ['actions', 'add', override.code];
  return ['actions', 'rename', override.source];
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

function normalizeCodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCode).filter((code): code is string => Boolean(code));
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
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

async function writeOutbox({
  client,
  orgId,
  aggregateId,
  eventType,
  payload,
}: {
  client: QueryClient;
  orgId: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'tenant_variation', $3::uuid, $4::jsonb, 'settings-tenant-variations-v1')`,
    [orgId, eventType, aggregateId, JSON.stringify(payload)],
  );
}
