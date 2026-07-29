import { Resend } from 'resend';

export type ResendConfiguration = {
  apiKey: string;
  from: string;
};

export type ResendConfigurationResult =
  | { ok: true; config: ResendConfiguration }
  | { ok: false; code: 'PROVIDER_NOT_CONFIGURED'; reason: string };

export type ResendDeliveryResult =
  | { status: 'sent'; messageId: string }
  | {
      status: 'failed';
      code: 'PROVIDER_AUTH_FAILED' | 'PROVIDER_SEND_FAILED';
      reason: string;
    };

export function getResendConfiguration(
  source: NodeJS.ProcessEnv = process.env,
): ResendConfigurationResult {
  const apiKey = source.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      reason: 'Missing required email environment variable: RESEND_API_KEY',
    };
  }

  const from = source.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    return {
      ok: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      reason: 'Missing required email environment variable: RESEND_FROM_EMAIL',
    };
  }

  return { ok: true, config: { apiKey, from } };
}

export async function sendResendEmail(input: {
  config: ResendConfiguration;
  to: string[];
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<ResendDeliveryResult> {
  try {
    const result = await new Resend(input.config.apiKey).emails.send(
      {
        from: input.config.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (result.error) {
      return {
        status: 'failed',
        code: isProviderAuthError(result.error) ? 'PROVIDER_AUTH_FAILED' : 'PROVIDER_SEND_FAILED',
        reason: redactSecret(providerErrorSummary(result.error), input.config.apiKey),
      };
    }

    if (!result.data?.id) {
      return {
        status: 'failed',
        code: 'PROVIDER_SEND_FAILED',
        reason: 'Resend accepted no message: provider response did not contain a message id',
      };
    }

    return { status: 'sent', messageId: result.data.id };
  } catch (error) {
    return {
      status: 'failed',
      code: isProviderAuthError(error) ? 'PROVIDER_AUTH_FAILED' : 'PROVIDER_SEND_FAILED',
      reason: redactSecret(providerErrorSummary(error), input.config.apiKey),
    };
  }
}

function providerErrorSummary(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (error && typeof error === 'object') {
    const message = String((error as Record<string, unknown>).message ?? '').trim();
    if (message) return message.slice(0, 500);
  }
  return 'Resend rejected the email request';
}

function redactSecret(value: string, secret: string): string {
  return secret ? value.replaceAll(secret, '[REDACTED]') : value;
}

function isProviderAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status ?? record.code;
  if (status === 401 || status === 403 || status === '401' || status === '403') return true;
  const message = String(record.message ?? record.name ?? '').toLowerCase();
  return message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('api key');
}
