import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

// T-013 — feature_flags_core (§10.2, migration 067) + notification_preferences (§13.3, migration 049).
// PostHog non-core flags are NOT mirrored into feature_flags_core (T-013 red line).
export const featureFlagsCore = pgTable(
  'feature_flags_core',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    flagCode: text('flag_code').notNull(),
    description: text('description').notNull().default(''),
    isEnabled: boolean('is_enabled').notNull().default(false),
    rolledOutPct: integer('rolled_out_pct').notNull().default(0),
    tier: text('tier').notNull().default('L1'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.flagCode] }),
    orgIdx: index('feature_flags_core_org_idx').on(table.orgId),
    rolledOutPctCheck: check(
      'feature_flags_core_rolled_out_pct_check',
      sql`rolled_out_pct between 0 and 100`,
    ),
    tierCheck: check('feature_flags_core_tier_check', sql`tier in ('L1', 'L2', 'L3', 'L4')`),
  }),
);

// Already shipped by migration 049 (SET-092). Drizzle schema added here per T-013 scope.
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    event: text('event').notNull(),
    channelEmail: boolean('channel_email').notNull().default(true),
    channelInApp: boolean('channel_in_app').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.orgId, table.category, table.event] }),
    orgEventIdx: index('notification_preferences_org_event_idx').on(table.orgId, table.category, table.event),
    categoryEventNonempty: check(
      'notification_preferences_category_event_nonempty',
      sql`length(trim(category)) > 0 and length(trim(event)) > 0`,
    ),
  }),
);
