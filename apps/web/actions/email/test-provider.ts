'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const EMAIL_CONFIG_EDIT_PERMISSION = 'settings.email_config.edit';
const RESEND_MODULE = 'resend';

export type TestEmailProviderInput = {
  to?: string;
};

export type TestEmailProviderResult =
  | { status: 'ok'; message_id: string }
  | {
      status: 'error';
      code:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'PROVIDER_NOT_CONFIGURED'
        | 'PROVIDER_AUTH_FAILED'
        | 'PROVIDER_SEND_FAILED'
        | 'PERSISTENCE_FAILED';
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

type ProviderConfigRow = {
  provider?: string | null;
  api_key_vault_ref?: string | null;
  secret_ref?: string | null;
  vault_ref?: string | null;
};

type SecretRow = {
  secret_value?: string | null;
  value?: string | null;
};

type ResendSendResult = {
  data?: { id?: string | null } | null;
  error?: unknown;
};

type ResendClient = {
  emails: {
    send(input: Record<string, unknown>): Promise<ResendSendResult>;
  };
};

type ResendFactory = {
  (apiKey: string): ResendClient;
  new (apiKey: string): ResendClient;
};

export async function testEmailProvider(input: TestEmailProviderInput): Promise<TestEmailProviderResult> {
  const to = normalizeEmail(input?.to);
  if (!to) return { status: 'error', code: 'INVALID_INPUT' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<TestEmailProviderResult> => {
      if (!(await hasPermission({ userId, orgId, client }, EMAIL_CONFIG_EDIT_PERMISSION))) {
        return { status: 'error', code: 'FORBIDDEN' };
      }

      const providerConfig = await loadResendConfig(client);
      const vaultRef = providerConfig?.api_key_vault_ref ?? providerConfig?.secret_ref ?? providerConfig?.vault_ref;
      if (!vaultRef) return { status: 'error', code: 'PROVIDER_NOT_CONFIGURED' };

      const apiKey = await loadVaultSecret(client, vaultRef);
      if (!apiKey) return { status: 'error', code: 'PROVIDER_NOT_CONFIGURED' };

      const sent = await sendResendProbe(apiKey, to);
      if (sent.status === 'error') return sent;

      await writeAuditLog(client, {
        orgId,
        userId,
        action: 'email.provider.test',
        resourceId: 'resend',
        afterState: { provider: 'resend', to, message_id: sent.message_id },
      });

      return sent;
    });
  } catch {
    return { status: 'error', code: 'PERSISTENCE_FAILED' };
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
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

async function loadResendConfig(client: QueryClient): Promise<ProviderConfigRow | null> {
  const { rows } = await client.query<ProviderConfigRow>(
    `select provider, api_key_vault_ref, secret_ref, vault_ref
       from public.integration_settings
      where org_id = app.current_org_id()
        and provider = 'resend'
      limit 1`,
  );
  return rows[0] ?? null;
}

async function loadVaultSecret(client: QueryClient, vaultRef: string): Promise<string | null> {
  const { rows } = await client.query<SecretRow>(
    `select secret_value, value
       from app.vault_secrets
      where org_id = app.current_org_id()
        and vault_ref = $1
      limit 1`,
    [vaultRef],
  );
  const value = rows[0]?.secret_value ?? rows[0]?.value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function sendResendProbe(apiKey: string, to: string): Promise<TestEmailProviderResult> {
  try {
    const mod = (await import(RESEND_MODULE)) as unknown as {
      Resend?: ResendFactory;
      default?: ResendFactory;
    };
    const ResendCtor = mod.Resend ?? mod.default;
    if (!ResendCtor) return { status: 'error', code: 'PROVIDER_SEND_FAILED' };

    const resend = createResendClient(ResendCtor, apiKey);
    const result = await resend.emails.send({
      from: 'Monopilot <no-reply@monopilot.local>',
      to: [to],
      subject: 'Monopilot email provider test',
      text: 'This is a Monopilot email provider probe.',
    });

    if (result.error) return mapProviderError(result.error);
    const messageId = result.data?.id;
    if (!messageId) return { status: 'error', code: 'PROVIDER_SEND_FAILED' };
    return { status: 'ok', message_id: messageId };
  } catch (error) {
    return mapProviderError(error);
  }
}

function createResendClient(factory: ResendFactory, apiKey: string): ResendClient {
  try {
    return factory(apiKey);
  } catch {
    return new factory(apiKey);
  }
}

function mapProviderError(error: unknown): TestEmailProviderResult {
  if (isProviderAuthError(error)) return { status: 'error', code: 'PROVIDER_AUTH_FAILED' };
  return { status: 'error', code: 'PROVIDER_SEND_FAILED' };
}

function isProviderAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status ?? record.code;
  if (status === 401 || status === 403 || status === '401' || status === '403') return true;
  const message = String(record.message ?? record.name ?? '').toLowerCase();
  return message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('api key');
}

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; userId: string; action: string; resourceId: string; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'email_provider', $4, null, $5::jsonb, 'security')`,
    [params.orgId, params.userId, params.action, params.resourceId, JSON.stringify(params.afterState)],
  );
}
