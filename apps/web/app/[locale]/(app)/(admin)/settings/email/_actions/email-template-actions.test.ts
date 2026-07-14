import { beforeEach, describe, expect, it, vi } from 'vitest';

const testEmailProviderMock = vi.fn();
const getTranslationsMock = vi.fn();

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: unknown[]) => getTranslationsMock(...args),
}));

vi.mock('../../../../../../../actions/email/test-provider', () => ({
  testEmailProvider: (...args: unknown[]) => testEmailProviderMock(...args),
}));

vi.mock('../../../../../../../actions/email/upsert-config', () => ({
  upsertEmailConfig: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

describe('testEmailTemplateSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) =>
      key === 'testSendError' ? 'Unable to send probe email.' : key,
    );
  });

  it('is importable and fail-closes ok:true/not_configured probe results', async () => {
    testEmailProviderMock.mockResolvedValue({ status: 'ok', message_id: 'not_configured' });

    const { testEmailTemplateSend } = await import('./email-template-actions');

    await expect(
      testEmailTemplateSend({
        provider: 'Resend',
        fromEmail: 'ops@example.com',
        fromName: 'Ops',
      }),
    ).resolves.toEqual({ ok: false, error: 'Unable to send probe email.' });
  });

  it('passes through a real provider message id', async () => {
    testEmailProviderMock.mockResolvedValue({ status: 'ok', message_id: 'msg_123' });

    const { testEmailTemplateSend } = await import('./email-template-actions');

    await expect(
      testEmailTemplateSend({
        provider: 'Resend',
        fromEmail: 'ops@example.com',
        fromName: 'Ops',
      }),
    ).resolves.toEqual({ ok: true, message_id: 'msg_123' });
  });
});
