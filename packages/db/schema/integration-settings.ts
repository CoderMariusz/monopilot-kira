import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, timestamp, unique, uuid, text } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

// W7/T-090 — integration_settings (migration 072).
// Per-org integration provider config (one active row per (org, category)).
// Consumed by apps/web/actions/email/load-email-config.ts (email category).
export const integrationSettings = pgTable(
  'integration_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    provider: text('provider'),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCategoryUnique: unique('integration_settings_org_category_unique').on(table.orgId, table.category),
    orgIdx: index('integration_settings_org_idx').on(table.orgId),
    orgCategoryIdx: index('integration_settings_org_category_idx').on(table.orgId, table.category),
  }),
);
