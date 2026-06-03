import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

export const d365ImportCache = pgTable(
  'd365_import_cache',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: text('status').notNull(),
    comment: text('comment'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.code] }),
    orgStatusIdx: index('d365_import_cache_org_status_idx').on(table.orgId, table.status),
    orgLastSyncedIdx: index('d365_import_cache_org_last_synced_idx').on(
      table.orgId,
      table.lastSyncedAt,
    ),
    statusCheck: check(
      'd365_import_cache_status_check',
      sql`status in ('Found', 'NoCost', 'Missing')`,
    ),
  }),
);

export type D365ImportCache = InferSelectModel<typeof d365ImportCache>;
export type NewD365ImportCache = InferInsertModel<typeof d365ImportCache>;
