'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { EMAIL_MERGE_FIELD_REGISTRY } from './variable-registry';

/**
 * Server-side read loaders for the SET-090 (Email templates) and SET-091
 * (Email variables) screens. Both are org-scoped via `withOrgContext`
 * (RLS-enforced through `app.current_org_id()`); neither returns mock data.
 *
 * - Templates + provider config: real rows from `public.reference_tables`
 *   (table_code='email_config') and `public.integration_settings`.
 * - Variable groups: the real merge-field domain registry (variable-registry.ts).
 */

const EMAIL_CONFIG_TABLE = 'email_config';
const EMAIL_VIEW_PERMISSION = 'settings.email.view';
const EMAIL_EDIT_PERMISSION = 'settings.email.edit';

export type LoadedEmailProvider = {
  provider: 'Resend' | 'Postmark' | 'SES';
  apiKeyDisplay: string;
  fromEmail: string;
  fromName: string;
};

export type LoadedEmailTemplate = {
  code: string;
  name: string;
  consumer: string;
  subject: string;
  body?: string;
  active: boolean;
  activeTo?: string[];
};

export type LoadedEmailVariable = { name: string; token: `{{${string}}}`; desc: string; example: string };
export type LoadedEmailVariableGroup = { group: string; vars: LoadedEmailVariable[] };

export type EmailTemplatesData = {
  state: 'ready' | 'empty' | 'error' | 'permission_denied';
  providerSettings: LoadedEmailProvider;
  templates: LoadedEmailTemplate[];
  variableGroups: LoadedEmailVariableGroup[];
  canEdit: boolean;
};

export type EmailVariablesData = {
  state: 'ready' | 'empty' | 'error' | 'permission_denied';
  groups: LoadedEmailVariableGroup[];
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type TemplateRow = {
  row_key: string;
  row_data: Record<string, unknown> | string | null;
  is_active: boolean | string | null;
};

type ProviderRow = {
  provider?: string | null;
  from_email?: string | null;
  from_name?: string | null;
};

const DEFAULT_PROVIDER: LoadedEmailProvider = {
  provider: 'Resend',
  apiKeyDisplay: '',
  fromEmail: '',
  fromName: '',
};

/** Build the grouped merge-field catalog from the real domain registry. */
function variableGroupsFromRegistry(): LoadedEmailVariableGroup[] {
  return EMAIL_MERGE_FIELD_REGISTRY.map((group) => ({
    group: group.group,
    vars: group.vars.map((variable) => ({
      name: variable.name,
      token: variable.token,
      desc: variable.desc,
      example: variable.example,
    })),
  }));
}

async function hasPermission({ client, userId, orgId }: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

function parseRowData(raw: TemplateRow['row_data']): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter((entry) => entry.length > 0);
  if (typeof value === 'string') return value.split(/[;,]/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return [];
}

function toTemplate(row: TemplateRow): LoadedEmailTemplate {
  const data = parseRowData(row.row_data);
  const recipientsTo = asStringArray(data.recipients_to);
  const isActive = row.is_active === true || row.is_active === 'true' || data.is_active === true;
  return {
    code: row.row_key,
    name: typeof data.name === 'string' && data.name.length > 0 ? data.name : row.row_key,
    consumer: typeof data.consumer === 'string' && data.consumer.length > 0 ? data.consumer : 'Settings',
    subject: typeof data.subject_template === 'string' ? data.subject_template : '',
    body: typeof data.body_template === 'string' ? data.body_template : undefined,
    active: isActive,
    activeTo: recipientsTo,
  };
}

function normalizeProvider(value: string | null | undefined): LoadedEmailProvider['provider'] {
  switch ((value ?? '').toLowerCase()) {
    case 'postmark':
      return 'Postmark';
    case 'ses':
      return 'SES';
    case 'resend':
    default:
      return 'Resend';
  }
}

async function loadProvider(client: QueryClient): Promise<LoadedEmailProvider> {
  // integration_settings may not exist in every deployment — fail-closed to defaults.
  const { rows } = await client.query<{ ok: boolean | string | null }>(
    `select (to_regclass('public.integration_settings') is not null) as ok`,
  );
  const tableExists = rows[0]?.ok === true || rows[0]?.ok === 'true';
  if (!tableExists) return { ...DEFAULT_PROVIDER };

  const { rows: providerRows } = await client.query<ProviderRow>(
    // from_email / from_name are stored inside the `config` jsonb on
    // integration_settings (there are no top-level from_email/from_name columns —
    // selecting them raw threw 42703 and made the whole screen "Unable to load").
    `select provider, config->>'from_email' as from_email, config->>'from_name' as from_name
       from public.integration_settings
      where org_id = app.current_org_id()
        and category = 'email'
      order by updated_at desc nulls last
      limit 1`,
  );
  const row = providerRows[0];
  if (!row) return { ...DEFAULT_PROVIDER };
  return {
    provider: normalizeProvider(row.provider),
    apiKeyDisplay: '',
    fromEmail: typeof row.from_email === 'string' ? row.from_email : '',
    fromName: typeof row.from_name === 'string' ? row.from_name : '',
  };
}

async function loadTemplates(client: QueryClient): Promise<LoadedEmailTemplate[]> {
  const { rows } = await client.query<TemplateRow>(
    `select row_key, row_data, is_active
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
      order by display_order, row_key`,
    [EMAIL_CONFIG_TABLE],
  );
  return rows.map(toTemplate);
}

export async function loadEmailTemplatesData(): Promise<EmailTemplatesData> {
  const variableGroups = variableGroupsFromRegistry();
  try {
    return await withOrgContext(async (ctx): Promise<EmailTemplatesData> => {
      const context = ctx as OrgContextLike;
      const [canView, canEdit] = await Promise.all([
        hasPermission(context, EMAIL_VIEW_PERMISSION),
        hasPermission(context, EMAIL_EDIT_PERMISSION),
      ]);
      if (!canView && !canEdit) {
        return { state: 'permission_denied', providerSettings: { ...DEFAULT_PROVIDER }, templates: [], variableGroups, canEdit: false };
      }

      const [providerSettings, templates] = await Promise.all([
        loadProvider(context.client),
        loadTemplates(context.client),
      ]);

      return {
        state: templates.length === 0 ? 'empty' : 'ready',
        providerSettings,
        templates,
        variableGroups,
        canEdit,
      };
    });
  } catch (error) {
    console.error(
      '[settings/email] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', providerSettings: { ...DEFAULT_PROVIDER }, templates: [], variableGroups, canEdit: false };
  }
}

export async function loadEmailVariablesData(): Promise<EmailVariablesData> {
  const groups = variableGroupsFromRegistry();
  try {
    return await withOrgContext(async (ctx): Promise<EmailVariablesData> => {
      const context = ctx as OrgContextLike;
      const [canView, canEdit] = await Promise.all([
        hasPermission(context, EMAIL_VIEW_PERMISSION),
        hasPermission(context, EMAIL_EDIT_PERMISSION),
      ]);
      if (!canView && !canEdit) return { state: 'permission_denied', groups: [] };
      return { state: groups.length === 0 ? 'empty' : 'ready', groups };
    });
  } catch (error) {
    console.error(
      '[settings/email/variables] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', groups: [] };
  }
}
