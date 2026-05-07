import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const tenantMigrations = pgTable(
  'tenant_migrations',
  {
    tenantId: uuid('tenant_id').notNull(),
    component: text('component').notNull(),
    currentVersion: text('current_version').notNull(),
    targetVersion: text('target_version'),
    cohort: text('cohort').notNull().default('general'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    status: text('status').notNull().default('idle'),
    failureReason: text('failure_reason'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.component] }),
    cohortCheck: check(
      'tenant_migrations_cohort_check',
      sql`${table.cohort} in ('canary', 'early', 'general')`,
    ),
    statusCheck: check(
      'tenant_migrations_status_check',
      sql`${table.status} in ('idle', 'pending', 'running', 'succeeded', 'failed', 'rolled_back')`,
    ),
    cohortStatusIdx: index('tenant_migrations_cohort_status_idx').on(table.cohort, table.status),
  }),
);
