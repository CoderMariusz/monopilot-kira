import type pg from 'pg';

import type { JobRegistry } from '../registry.js';

const JOB_NAME = 'compliance-docs-expiry-scan';
const CRON = '0 2 * * *';
const APP_VERSION = 'T-085';

type ExpiryState = 'Expiring' | 'Expired';

type ScanRow = {
  org_id: string;
  doc_id: string;
  product_code: string;
  doc_type: string;
  title: string;
  expires_at: Date | string | null;
  previous_state: string;
  expiry_state: ExpiryState;
  uploaded_by_user: string;
};

type RecipientRow = {
  email: string;
  recipient_order: number;
};

export type ComplianceDocsExpiryEmail = {
  orgId: string;
  docId: string;
  productCode: string;
  docType: string;
  title: string;
  expiresAt: string | null;
  to: string[];
  subject: string;
  text: string;
};

export type ComplianceDocsExpiryEmailResult = {
  messageId?: string | null;
};

export type ComplianceDocsExpiryEmailSender = (
  email: ComplianceDocsExpiryEmail,
) => Promise<ComplianceDocsExpiryEmailResult | void>;

export type ComplianceDocsExpiryScanOptions = {
  sendEmail?: ComplianceDocsExpiryEmailSender;
};

export function registerComplianceDocsExpiryScan(
  registry: JobRegistry,
  opts: ComplianceDocsExpiryScanOptions = {},
): void {
  registry.register(JOB_NAME, { kind: 'cron', expr: CRON }, async (ctx) => {
    const result = await runComplianceDocsExpiryScan(ctx.pool, opts);
    ctx.logger.info('compliance docs expiry scan completed', {
      job: JOB_NAME,
      expiring: result.expiring,
      expired: result.expired,
      emailsSent: result.emailsSent,
    });
  });
}

export async function runComplianceDocsExpiryScan(
  pool: pg.Pool,
  opts: ComplianceDocsExpiryScanOptions = {},
): Promise<{ expiring: number; expired: number; emailsSent: number }> {
  const sendEmail = opts.sendEmail ?? queueOnlyEmailSender;
  const client = await pool.connect();
  let expiring = 0;
  let expired = 0;
  let emailsSent = 0;

  try {
    await client.query('begin');
    const scanned = await client.query<ScanRow>(
      `select org_id,
              doc_id,
              product_code,
              doc_type,
              title,
              expires_at,
              previous_state,
              expiry_state,
              uploaded_by_user
       from public.compliance_docs_expiry_scan()`,
    );

    for (const row of scanned.rows) {
      if (row.expiry_state === 'Expiring') {
        expiring += 1;
      } else {
        expired += 1;
      }

      await emitOutboxEvent(client, row);

      if (row.expiry_state === 'Expired') {
        const recipients = await loadExpiredDocRecipients(client, row);
        if (recipients.length > 0) {
          const email = buildExpiredEmail(row, recipients);
          const sendResult = await sendEmail(email);
          const messageId = sendResult?.messageId ?? null;
          await logExpiredEmail(client, row, recipients, messageId);
          await markExpiredNotified(client, row.doc_id);
          emailsSent += 1;
        }
      }
    }

    await client.query('commit');
    return { expiring, expired, emailsSent };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function emitOutboxEvent(client: pg.PoolClient, row: ScanRow): Promise<void> {
  const eventType =
    row.expiry_state === 'Expired' ? 'compliance_doc.expired' : 'compliance_doc.expiring';
  const businessDate = new Date().toISOString().slice(0, 10);
  const payload = {
    orgId: row.org_id,
    docId: row.doc_id,
    productCode: row.product_code,
    docType: row.doc_type,
    title: row.title,
    expiresAt: normalizeDate(row.expires_at),
    previousState: row.previous_state,
    expiryState: row.expiry_state,
  };

  await client.query(
    `insert into public.outbox_events (
       org_id,
       event_type,
       aggregate_type,
       aggregate_id,
       payload,
       dedup_key,
       app_version
     )
     values ($1::uuid, $2, 'compliance_doc', $3::uuid, $4::jsonb, $5, $6)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      row.org_id,
      eventType,
      row.doc_id,
      JSON.stringify(payload),
      `${eventType}:${row.doc_id}:${businessDate}`,
      APP_VERSION,
    ],
  );
}

async function loadExpiredDocRecipients(client: pg.PoolClient, row: ScanRow): Promise<string[]> {
  const recipients = await client.query<RecipientRow>(
    `with recipient_candidates as (
       select u.email::text as email, 0 as recipient_order
       from public.users u
       where u.id = $2::uuid
         and u.org_id = $1::uuid
       union all
       select u.email::text as email, 1 as recipient_order
       from public.users u
       where u.org_id = $1::uuid
         and (
           exists (
             select 1
             from public.user_roles ur
             join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
             where ur.user_id = u.id
               and ur.org_id = $1::uuid
               and (r.code = 'npd_manager' or r.slug = 'npd_manager')
           )
           or exists (
             select 1
             from public.roles r
             where r.id = u.role_id
               and r.org_id = $1::uuid
               and (r.code = 'npd_manager' or r.slug = 'npd_manager')
           )
         )
     ),
     ranked as (
       select email, min(recipient_order) as recipient_order
       from recipient_candidates
       where nullif(trim(email), '') is not null
       group by email
     )
     select email, recipient_order
     from ranked
     order by recipient_order, email`,
    [row.org_id, row.uploaded_by_user],
  );

  return recipients.rows.map((recipient) => recipient.email);
}

function buildExpiredEmail(row: ScanRow, recipients: string[]): ComplianceDocsExpiryEmail {
  const expiresAt = normalizeDate(row.expires_at);
  const subject = `Compliance document expired: ${row.title}`;
  const text = [
    `Compliance document "${row.title}" is expired.`,
    `Product: ${row.product_code}`,
    `Document type: ${row.doc_type}`,
    `Expired on: ${expiresAt ?? 'unknown'}`,
  ].join('\n');

  return {
    orgId: row.org_id,
    docId: row.doc_id,
    productCode: row.product_code,
    docType: row.doc_type,
    title: row.title,
    expiresAt,
    to: recipients,
    subject,
    text,
  };
}

async function logExpiredEmail(
  client: pg.PoolClient,
  row: ScanRow,
  recipients: string[],
  messageId: string | null,
): Promise<void> {
  for (const recipient of recipients) {
    await client.query(
      `insert into public.email_delivery_log (
         org_id,
         trigger_code,
         recipient_email,
         subject,
         status,
         provider_message_id,
         payload
       )
       values ($1::uuid, 'compliance_doc.expired', $2, $3, 'sent', $4, $5::jsonb)`,
      [
        row.org_id,
        recipient,
        `Compliance document expired: ${row.title}`,
        messageId,
        JSON.stringify({
          docId: row.doc_id,
          productCode: row.product_code,
          docType: row.doc_type,
          expiresAt: normalizeDate(row.expires_at),
        }),
      ],
    );
  }
}

async function markExpiredNotified(client: pg.PoolClient, docId: string): Promise<void> {
  await client.query(
    `update public.compliance_docs
     set last_notified_at = pg_catalog.now()
     where id = $1::uuid`,
    [docId],
  );
}

async function queueOnlyEmailSender(): Promise<ComplianceDocsExpiryEmailResult> {
  return { messageId: null };
}

function normalizeDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}
