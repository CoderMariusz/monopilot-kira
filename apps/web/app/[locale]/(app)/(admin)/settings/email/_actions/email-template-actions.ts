'use server';

import { getTranslations } from 'next-intl/server';

import { testEmailProvider } from '../../../../../../../actions/email/test-provider';
import { upsertEmailConfig } from '../../../../../../../actions/email/upsert-config';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import type { EmailTemplateDraft, EmailTemplateSaveResult, TestSendInput, TestSendResult } from './email-template-actions-types';

/** Org-scoped probe send with fail-closed mapping for stub/not-configured backends. */
export async function testEmailTemplateSend(input: TestSendInput): Promise<TestSendResult> {
  const t = await getTranslations('settings.email_templates');
  const testSendError = t('testSendError');

  const result = await testEmailProvider({ to: input.fromEmail });
  if (result.status === 'ok') {
    if (result.message_id === 'not_configured') {
      return { ok: false, error: testSendError };
    }
    return { ok: true, message_id: result.message_id };
  }
  return { ok: false, error: result.code };
}

export async function saveEmailTemplate(input: EmailTemplateDraft): Promise<EmailTemplateSaveResult> {
  const result = await upsertEmailConfig({
    triggerCode: input.code,
    recipientsTo: input.activeTo.join('; '),
    subjectTemplate: input.subject,
    bodyTemplate: input.body,
    isActive: input.active,
  });

  if (result.status === 'ok') {
    revalidateLocalized('/settings/email');
    return { ok: true, templateCode: result.data.triggerCode, revalidatedPath: '/settings/email' };
  }

  return { ok: false, error: result.code };
}
