import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';

/**
 * T-005 — lab_results.
 *
 * QUALITY-OWNED read model. Technical reads it READ-ONLY (no Technical write/approve
 * path — see migration 162 + MON-domain-technical canonical-owner rules). Quality
 * canonical authorship/lifecycle lives in 09-QUALITY; this Drizzle model exists so
 * Technical read paths are typed. work_order_id is a soft uuid (FK lives in
 * 08-PRODUCTION). The ATP auto-fail trigger (V-TEC-44) is T-026, not here.
 */
export const labResults = pgTable(
  'lab_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable, no FK / no registry
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'restrict' }),
    workOrderId: uuid('work_order_id'), // soft uuid — FK lives in 08-PRODUCTION
    qualityResultId: uuid('quality_result_id'), // soft pointer to Quality canonical row/event
    testType: text('test_type').notNull(),
    testCode: text('test_code'),
    resultValue: numeric('result_value', { precision: 14, scale: 4 }),
    resultUnit: text('result_unit'),
    resultStatus: text('result_status').notNull(),
    thresholdRlu: numeric('threshold_rlu', { precision: 10, scale: 2 }).default('10.00'),
    testedAt: timestamp('tested_at', { withTimezone: true }),
    labProvider: text('lab_provider'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgItemIdx: index('idx_lab_results_org_item').on(table.orgId, table.itemId),
    orgTestTypeIdx: index('idx_lab_results_org_test_type').on(
      table.orgId,
      table.testType,
      table.resultStatus,
    ),
    orgWorkOrderIdx: index('idx_lab_results_org_work_order')
      .on(table.orgId, table.workOrderId)
      .where(sql`${table.workOrderId} is not null`),
    orgSiteIdx: index('idx_lab_results_org_site').on(table.orgId, table.siteId),
    testTypeCheck: check(
      'lab_results_test_type_check',
      sql`${table.testType} in ('atp_swab', 'allergen_elisa', 'micro_apc', 'nutrition', 'sensory')`,
    ),
    resultStatusCheck: check(
      'lab_results_result_status_check',
      sql`${table.resultStatus} in ('pass', 'fail', 'inconclusive', 'pending', 'hold')`,
    ),
    thresholdRluNonnegativeCheck: check(
      'lab_results_threshold_rlu_nonnegative_check',
      sql`${table.thresholdRlu} is null or ${table.thresholdRlu} >= 0`,
    ),
  }),
);

export type LabResult = InferSelectModel<typeof labResults>;
export type NewLabResult = InferInsertModel<typeof labResults>;
