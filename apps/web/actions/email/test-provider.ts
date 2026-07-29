'use server';

import { randomUUID } from 'node:crypto';

import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { getResendConfiguration, sendResendEmail } from './resend';

const EMAIL_CONFIG_EDIT_PERMISSION = 'settings.email_config.edit';
const TEST_SUBJECT = 'Monopilot email provider test';

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

export async function testEmailProvider(input: TestEmailProviderInput): Promise<TestEmailProviderResult> {
  const to = normalizeEmail(input?.to);
  if (!to) return { status: 'error', code: 'INVALID_INPUT' };
  const logId = randomUUID();

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<TestEmailProviderResult> => {
      if (!(await hasPermission({ userId, orgId, client }, EMAIL_CONFIG_EDIT_PERMISSION))) {
        return { status: 'error', code: 'FORBIDDEN' };
      }

      const configuration = getResendConfiguration();
      if (!configuration.ok) {
        await writeEmailDeliveryLog(client, {
          id: logId,
          orgId,
          to,
          status: 'failed',
          messageId: null,
          error: configuration.reason,
        });
        console.error('[testEmailProvider] provider_not_configured', {
          orgId,
          reason: configuration.reason,
        });
        return {
          status: 'error',
          code: configuration.code,
          message: configuration.reason,
        };
      }

      const delivery = await sendResendEmail({
        config: configuration.config,
        to: [to],
        subject: TEST_SUBJECT,
        text: 'This is a Monopilot email provider probe.',
        idempotencyKey: `email-provider-test/${logId}`,
      });
      if (delivery.status === 'failed') {
        await writeEmailDeliveryLog(client, {
          id: logId,
          orgId,
          to,
          status: 'failed',
          messageId: null,
          error: delivery.reason,
        });
        console.error('[testEmailProvider] provider_send_failed', {
          orgId,
          code: delivery.code,
          reason: delivery.reason,
        });
        return {
          status: 'error',
          code: delivery.code,
          message: delivery.reason,
        };
      }

      await writeEmailDeliveryLog(client, {
        id: logId,
        orgId,
        to,
        status: 'sent',
        messageId: delivery.messageId,
        error: null,
      });

      await writeAuditLog(client, {
        orgId,
        userId,
        action: 'email.provider.test',
        resourceId: 'resend',
        afterState: { provider: 'resend', to, message_id: delivery.messageId },
      });

      return { status: 'ok', message_id: delivery.messageId };
    });
  } catch (error) {
    console.error('[testEmailProvider] persistence_failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return { status: 'error', code: 'PERSISTENCE_FAILED' };
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

async function writeEmailDeliveryLog(
  client: QueryClient,
  params: {
    id: string;
    orgId: string;
    to: string;
    status: 'sent' | 'failed';
    messageId: string | null;
    error: string | null;
  },
): Promise<void> {
  await client.query(
    `insert into public.email_delivery_log
       (id, org_id, trigger_code, recipient_email, subject, status, provider_message_id, last_error_summary, payload)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      params.id,
      params.orgId,
      'email.provider.test',
      params.to,
      TEST_SUBJECT,
      params.status,
      params.messageId,
      params.error,
      JSON.stringify({ provider: 'resend', kind: 'provider_probe' }),
    ],
  );
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
