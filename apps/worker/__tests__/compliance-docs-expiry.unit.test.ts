import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  runComplianceDocsExpiryScan,
  sendComplianceEmailViaResend,
  type ComplianceDocsExpiryEmailSender,
} from '../src/jobs/compliance-docs-expiry.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';

function makePool() {
  const emailRows: Array<{
    status: string;
    providerMessageId: string | null;
    lastErrorSummary: string | null;
  }> = [];
  let markedNotified = false;
  const client = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.compliance_docs_expiry_scan()')) {
        return {
          rows: [{
            org_id: ORG_ID,
            doc_id: DOC_ID,
            product_code: 'FA-001',
            doc_type: 'Spec',
            title: 'Expired spec',
            expires_at: '2026-07-01',
            previous_state: 'Expiring',
            expiry_state: 'Expired',
            uploaded_by_user: '33333333-3333-4333-8333-333333333333',
          }],
          rowCount: 1,
        };
      }
      if (normalized.includes('with recipient_candidates as')) {
        return { rows: [{ email: 'owner@example.test', recipient_order: 0 }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.email_delivery_log')) {
        emailRows.push({
          status: String(params[3]),
          providerMessageId: typeof params[4] === 'string' ? params[4] : null,
          lastErrorSummary: typeof params[5] === 'string' ? params[5] : null,
        });
      }
      if (normalized.startsWith('update public.compliance_docs')) markedNotified = true;
      return { rows: [], rowCount: 1 };
    },
    release: vi.fn(),
  };
  return {
    pool: { connect: vi.fn(async () => client) },
    emailRows,
    wasMarkedNotified: () => markedNotified,
  };
}

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  vi.unstubAllGlobals();
});

describe('compliance document expiry email delivery', () => {
  it('logs failed, never sent, and keeps the document retryable when the provider fails', async () => {
    const { pool, emailRows, wasMarkedNotified } = makePool();
    const sendEmail = vi.fn<ComplianceDocsExpiryEmailSender>(async () => ({
      status: 'failed',
      error: 'Missing required email environment variable: RESEND_API_KEY',
    }));

    const result = await runComplianceDocsExpiryScan(pool as never, { sendEmail });

    expect(result.emailsSent).toBe(0);
    expect(emailRows).toEqual([{
      status: 'failed',
      providerMessageId: null,
      lastErrorSummary: expect.stringContaining('RESEND_API_KEY'),
    }]);
    expect(emailRows.some((row) => row.status === 'sent')).toBe(false);
    expect(wasMarkedNotified()).toBe(false);
  });

  it('logs sent only with the provider message id and marks the document notified', async () => {
    const { pool, emailRows, wasMarkedNotified } = makePool();
    const sendEmail = vi.fn<ComplianceDocsExpiryEmailSender>(async () => ({
      status: 'sent',
      messageId: 'resend-message-123',
    }));

    const result = await runComplianceDocsExpiryScan(pool as never, { sendEmail });

    expect(result.emailsSent).toBe(1);
    expect(emailRows).toEqual([{
      status: 'sent',
      providerMessageId: 'resend-message-123',
      lastErrorSummary: null,
    }]);
    expect(wasMarkedNotified()).toBe(true);
  });

  it('fails loudly without calling Resend when RESEND_API_KEY is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendComplianceEmailViaResend({
      orgId: ORG_ID,
      docId: DOC_ID,
      productCode: 'FA-001',
      docType: 'Spec',
      title: 'Expired spec',
      expiresAt: '2026-07-01',
      to: ['owner@example.test'],
      subject: 'Expired spec',
      text: 'Expired.',
    });

    expect(result).toEqual({
      status: 'failed',
      error: expect.stringContaining('RESEND_API_KEY'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
