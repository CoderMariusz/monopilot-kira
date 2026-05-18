import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './baseline.js';

export const tenantMigrationStatuses = [
  'scheduled',
  'canary',
  'progressive',
  'completed',
  'rolled_back',
  'force_scheduled',
] as const;

export type TenantMigrationStatus = (typeof tenantMigrationStatuses)[number];

export const tenantVariations = pgTable('tenant_variations', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  deptOverrides: jsonb('dept_overrides').notNull().default(sql`'{}'::jsonb`),
  ruleVariantOverrides: jsonb('rule_variant_overrides').notNull().default(sql`'{}'::jsonb`),
  featureFlags: jsonb('feature_flags').notNull().default(sql`'{}'::jsonb`),
  schemaExtensionsCount: integer('schema_extensions_count').notNull().default(0),
  upgradedAt: timestamp('upgraded_at', { withTimezone: true }),
  upgradedFromVersion: text('upgraded_from_version'),
  upgradedToVersion: text('upgraded_to_version'),
});

export const tenantMigrations = pgTable(
  'tenant_migrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
  }),
);
