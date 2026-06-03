import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { integer, pgSchema, primaryKey, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

import { organizations } from './baseline.js';

const reference = pgSchema('Reference');

export const alertThresholds = reference.table(
  'AlertThresholds',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    thresholdKey: text('threshold_key').notNull(),
    valueInt: integer('value_int'),
    valueText: text('value_text'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.thresholdKey] }),
    orgKeyIdx: index('alert_thresholds_org_key_idx').on(table.orgId, table.thresholdKey),
  }),
);

export type AlertThreshold = InferSelectModel<typeof alertThresholds>;
export type NewAlertThreshold = InferInsertModel<typeof alertThresholds>;
