import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: text('actor_type'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    requestId: uuid('request_id'),
    retentionClass: text('retention_class').notNull().default('standard'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.occurredAt] }),
    orgOccurredIdx: index('audit_log_org_occurred_idx').on(table.orgId, table.occurredAt),
    requestIdx: index('audit_log_request_id_idx').on(table.requestId),
    resourceIdx: index('audit_log_resource_idx').on(
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
    retentionClassCheck: check(
      'audit_log_retention_class_check',
      sql`${table.retentionClass} in ('security', 'standard', 'operational', 'ephemeral')`,
    ),
  }),
);
