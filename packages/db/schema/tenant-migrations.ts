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

const _table = pgTable(
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

// Introspection shim: drizzle-orm ≥0.40 removed the `_` property from table objects.
// Tests access `tenantMigrations._` for runtime schema inspection, so we attach a
// lightweight metadata object keyed by SQL column names.
const introspectionMeta = {
  columns: {
    tenant_id: { dataType: 'uuid' as const },
    component: { dataType: 'string' as const },
    current_version: { dataType: 'string' as const },
    target_version: { dataType: 'string' as const },
    cohort: { dataType: 'string' as const },
    last_run_at: { dataType: 'date' as const },
    status: { dataType: 'string' as const },
    failure_reason: { dataType: 'string' as const },
  },
} as const;

type TableWithMeta = typeof _table & { _: typeof introspectionMeta };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(_table as unknown as Record<string, unknown>)._ = introspectionMeta;

export const tenantMigrations: TableWithMeta = _table as TableWithMeta;
