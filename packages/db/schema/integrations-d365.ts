import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

// T-112 — d365_sync_runs (migration 065). D365 Sync Audit (SET-083).
// Column shape mirrors apps/web/.../settings/integrations/d365/audit/page.tsx. Producer is another module.
export const d365SyncRuns = pgTable(
  'd365_sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    direction: text('direction').notNull(),
    entityType: text('entity_type').notNull(),
    status: text('status').notNull(),
    rowsIn: integer('rows_in').notNull().default(0),
    rowsOk: integer('rows_ok').notNull().default(0),
    rowsFailed: integer('rows_failed').notNull().default(0),
    errorSummary: text('error_summary'),
    errors: jsonb('errors').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('d365_sync_runs_org_idx').on(table.orgId),
    orgStartedIdx: index('d365_sync_runs_org_started_idx').on(table.orgId, table.startedAt),
    directionCheck: check('d365_sync_runs_direction_check', sql`direction in ('pull', 'push')`),
    statusCheck: check('d365_sync_runs_status_check', sql`status in ('ok', 'partial', 'failed')`),
    rowCountsCheck: check(
      'd365_sync_runs_row_counts_check',
      sql`rows_in >= 0 and rows_ok >= 0 and rows_failed >= 0`,
    ),
  }),
);
