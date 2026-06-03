import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

// T-113 — email_delivery_log (migration 066). Email Delivery Log (SET-093).
// Column shape mirrors apps/web/.../settings/notifications/email-log/page.tsx. Producer is the email worker.
export const emailDeliveryLog = pgTable(
  'email_delivery_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    triggerCode: text('trigger_code').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject'),
    status: text('status').notNull().default('queued'),
    retryStatus: text('retry_status').notNull().default('not_retried'),
    retryCount: integer('retry_count').notNull().default(0),
    providerMessageId: text('provider_message_id'),
    lastErrorSummary: text('last_error_summary'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('email_delivery_log_org_idx').on(table.orgId),
    orgCreatedIdx: index('email_delivery_log_org_created_idx').on(table.orgId, table.createdAt),
    orgTriggerIdx: index('email_delivery_log_org_trigger_idx').on(table.orgId, table.triggerCode),
    statusCheck: check(
      'email_delivery_log_status_check',
      sql`status in ('queued', 'sent', 'failed', 'dlq')`,
    ),
    retryStatusCheck: check(
      'email_delivery_log_retry_status_check',
      sql`retry_status in ('not_retried', 'retry_scheduled', 'retry_exhausted', 'dlq')`,
    ),
    retryCountCheck: check('email_delivery_log_retry_count_check', sql`retry_count >= 0`),
  }),
);
