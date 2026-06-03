import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

export const gdprErasureRequests = pgTable(
  'gdpr_erasure_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    domainsRun: text('domains_run').array().notNull().default(sql`'{}'::text[]`),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pendingIdx: index('gdpr_erasure_requests_pending_idx')
      .on(table.requestedAt, table.id)
      .where(sql`${table.status} = 'pending'`),
    orgRequestedIdx: index('gdpr_erasure_requests_org_requested_idx').on(
      table.orgId,
      table.requestedAt,
    ),
    statusCheck: check(
      'gdpr_erasure_requests_status_check',
      sql`${table.status} in ('pending', 'running', 'done', 'failed')`,
    ),
  }),
);
