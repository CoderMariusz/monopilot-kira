'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const EMAIL_CONFIG_TABLE = 'email_config';
const EMAIL_CONFIG_EDIT_PERMISSION = 'settings.email_config.edit';

const TRIGGER_PAYLOAD_SCHEMA: Record<string, readonly string[]> = {
  core_closed: ['fa_code', 'dept', 'closed_at', 'closed_by'],
  fa_d365_ready: ['fa_code', 'dept', 'd365_stage', 'ready_at'],
};

export type UpsertEmailConfigInput = {
  triggerCode?: string;
  recipientsTo?: string;
  recipientsCc?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  isActive?: boolean;
  expectedVersion?: number;
};

export type EmailConfigActionResult =
  | { status: 'ok'; data: { triggerCode: string; version: number; isActive: boolean } }
  | {
      status: 'error';
      code:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'RECIPIENTS_EMPTY'
        | 'UNKNOWN_TRIGGER_CODE'
        | 'UNKNOWN_TEMPLATE_VAR'
        | 'VERSION_CONFLICT'
        | 'PERSISTENCE_FAILED';
      message?: string;
      data?: unknown;
    };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type StoredEmailConfig = {
  row_key: string;
  row_data: Record<string, unknown>;
  version: number | string;
  is_active: boolean;
};

type ParsedEmailConfig = {
  triggerCode: string;
  recipientsTo: string[];
  recipientsCc: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  expectedVersion?: number;
};

export async function upsertEmailConfig(rawInput: UpsertEmailConfigInput): Promise<EmailConfigActionResult> {
  const parsed = parseInput(rawInput);
  if (!parsed) return { status: 'error', code: 'INVALID_INPUT' };

  if (parsed.isActive && parsed.recipientsTo.length === 0) {
    return { status: 'error', code: 'RECIPIENTS_EMPTY' };
  }

  const allowedVars = TRIGGER_PAYLOAD_SCHEMA[parsed.triggerCode];
  if (!allowedVars) return { status: 'error', code: 'UNKNOWN_TRIGGER_CODE' };

  const unknownVars = findUnknownTemplateVars(
    `${parsed.subjectTemplate}\n${parsed.bodyTemplate}`,
    new Set(allowedVars),
  );
  if (unknownVars.length > 0) {
    return { status: 'error', code: 'UNKNOWN_TEMPLATE_VAR', message: unknownVars.join(',') };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<EmailConfigActionResult> => {
      if (!(await hasPermission({ userId, orgId, client }, EMAIL_CONFIG_EDIT_PERMISSION))) {
        return { status: 'error', code: 'FORBIDDEN' };
      }

      await assertGeneratedSchemaLoaded(client);

      const existing = await getExistingConfig(client, parsed.triggerCode);
      if (
        existing &&
        parsed.expectedVersion !== undefined &&
        Number(existing.version) !== parsed.expectedVersion
      ) {
        return {
          status: 'error',
          code: 'VERSION_CONFLICT',
          data: { triggerCode: parsed.triggerCode, version: Number(existing.version) },
        };
      }

      const rowData = {
        trigger_code: parsed.triggerCode,
        recipients_to: parsed.recipientsTo,
        recipients_cc: parsed.recipientsCc,
        subject_template: parsed.subjectTemplate,
        body_template: parsed.bodyTemplate,
        is_active: parsed.isActive,
      };

      const { rows } = await client.query<StoredEmailConfig>(
        `insert into public.reference_tables
           (org_id, table_code, row_key, row_data, display_order, created_by)
         values ($1::uuid, $2, $3, $4::jsonb, 0, $5::uuid)
         on conflict (org_id, table_code, row_key) do update set
           row_data = excluded.row_data,
           is_active = ($6::boolean),
           version = public.reference_tables.version + 1,
           updated_at = now()
         where public.reference_tables.org_id = app.current_org_id()
           and ($7::integer is null or public.reference_tables.version = $7::integer)
         returning row_key, row_data, version, is_active`,
        [
          orgId,
          EMAIL_CONFIG_TABLE,
          parsed.triggerCode,
          JSON.stringify(rowData),
          userId,
          parsed.isActive,
          parsed.expectedVersion ?? null,
        ],
      );

      const saved = rows[0];
      if (!saved) {
        const latest = await getExistingConfig(client, parsed.triggerCode);
        if (latest) {
          return {
            status: 'error',
            code: 'VERSION_CONFLICT',
            data: { triggerCode: parsed.triggerCode, version: Number(latest.version) },
          };
        }
        return { status: 'error', code: 'PERSISTENCE_FAILED' };
      }

      await writeAuditLog(client, {
        orgId,
        userId,
        action: 'email.config.upsert',
        resourceId: parsed.triggerCode,
        beforeState: existing?.row_data ?? null,
        afterState: rowData,
      });

      return {
        status: 'ok',
        data: { triggerCode: saved.row_key, version: Number(saved.version), isActive: saved.is_active },
      };
    });
  } catch {
    return { status: 'error', code: 'PERSISTENCE_FAILED' };
  }
}

function parseInput(input: UpsertEmailConfigInput | null | undefined): ParsedEmailConfig | null {
  if (!input || typeof input !== 'object') return null;
  const triggerCode = normalizeCode(input.triggerCode);
  const subjectTemplate = nonEmpty(input.subjectTemplate);
  const bodyTemplate = nonEmpty(input.bodyTemplate);
  const isActive = input.isActive === true;
  const expectedVersion = input.expectedVersion === undefined ? undefined : Number(input.expectedVersion);
  if (!triggerCode || !subjectTemplate || !bodyTemplate) return null;
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) return null;
  return {
    triggerCode,
    recipientsTo: splitRecipients(input.recipientsTo),
    recipientsCc: splitRecipients(input.recipientsCc),
    subjectTemplate,
    bodyTemplate,
    isActive,
    expectedVersion,
  };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z][a-z0-9_]{0,63}$/.test(trimmed) ? trimmed : null;
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 4000 ? trimmed : null;
}

function splitRecipients(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function findUnknownTemplateVars(template: string, allowedVars: Set<string>): string[] {
  const unknown = new Set<string>();
  const tokenPattern = /{{\s*([#/^!>&]?)\s*([a-zA-Z0-9_.-]+)\s*}}/g;
  let match = tokenPattern.exec(template);
  while (match) {
    const sigil = match[1];
    const variable = match[2];
    if (variable && sigil !== '!' && sigil !== '/') {
      const root = variable.split('.')[0];
      if (root && !allowedVars.has(root)) unknown.add(root);
    }
    match = tokenPattern.exec(template);
  }
  const values: string[] = [];
  unknown.forEach((value) => values.push(value));
  return values.sort();
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function assertGeneratedSchemaLoaded(client: QueryClient): Promise<void> {
  await client.query(
    `select column_code, enum_values
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and deprecated_at is null
      order by column_code`,
    [EMAIL_CONFIG_TABLE],
  );
}

async function getExistingConfig(client: QueryClient, triggerCode: string): Promise<StoredEmailConfig | null> {
  const { rows } = await client.query<StoredEmailConfig>(
    `select row_key, row_data, version, is_active
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and row_key = $2
      limit 1`,
    [EMAIL_CONFIG_TABLE, triggerCode],
  );
  return rows[0] ?? null;
}

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; userId: string; action: string; resourceId: string; beforeState: unknown; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'email_config', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.userId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}
