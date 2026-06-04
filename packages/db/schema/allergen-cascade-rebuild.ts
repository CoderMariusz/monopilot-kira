import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations } from './baseline.js';
import { product } from './product.js';

export const allergenCascadeRebuildJobs = pgTable(
  'allergen_cascade_rebuild_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    sourceEventId: uuid('source_event_id').notNull(),
    sourceEventType: text('source_event_type').notNull(),
    status: text('status').notNull().default('pending'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupUnique: unique('allergen_cascade_rebuild_jobs_dedup_unique').on(
      table.orgId,
      table.productCode,
      table.sourceEventId,
    ),
    pendingIdx: index('allergen_cascade_rebuild_jobs_pending_idx')
      .on(table.orgId, table.runAfter, table.createdAt)
      .where(sql`${table.processedAt} is null`),
  }),
);

export type AllergenCascadeRebuildJob = InferSelectModel<typeof allergenCascadeRebuildJobs>;
export type NewAllergenCascadeRebuildJob = InferInsertModel<typeof allergenCascadeRebuildJobs>;
