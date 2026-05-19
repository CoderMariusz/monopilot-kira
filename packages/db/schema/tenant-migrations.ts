import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './baseline.js';

// Canonical tenant_migrations table per ADR-031 + migration 040 (org_id, not tenant_id).
// Wave0 lock: business scope is org_id. The legacy tenant_id/cohort-shaped table from
// migration 013 was renamed to tenant_migrations_legacy_t038 by migration 040.
const _table = pgTable(
  'tenant_migrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    component: text('component').notNull(),
    currentVersion: text('current_version').notNull(),
    targetVersion: text('target_version').notNull(),
    status: text('status').notNull().default('scheduled'),
    canaryPct: numeric('canary_pct', { precision: 7, scale: 4 }).notNull().default('0'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    scheduledBy: uuid('scheduled_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'tenant_migrations_l2_status_check',
      sql`${table.status} in ('scheduled', 'canary', 'progressive', 'completed', 'rolled_back', 'force_scheduled')`,
    ),
    orgStatusIdx: index('tenant_migrations_l2_org_status_idx').on(table.orgId, table.status),
    orgComponentIdx: index('tenant_migrations_l2_org_component_idx').on(table.orgId, table.component),
  }),
);

// Introspection shim: drizzle-orm ≥0.40 removed the `_` property from table objects.
// Tests access `tenantMigrations._` for runtime schema inspection.
const introspectionMeta = {
  columns: {
    id: { dataType: 'uuid' as const },
    org_id: { dataType: 'uuid' as const },
    component: { dataType: 'string' as const },
    current_version: { dataType: 'string' as const },
    target_version: { dataType: 'string' as const },
    status: { dataType: 'string' as const },
    canary_pct: { dataType: 'string' as const },
    last_run_at: { dataType: 'date' as const },
    scheduled_by: { dataType: 'uuid' as const },
    created_at: { dataType: 'date' as const },
  },
} as const;

type TableWithMeta = typeof _table & { _: typeof introspectionMeta };

(_table as unknown as Record<string, unknown>)._ = introspectionMeta;

export const tenantMigrations: TableWithMeta = _table as TableWithMeta;
