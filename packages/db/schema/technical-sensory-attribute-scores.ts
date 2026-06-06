import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { technicalSensoryEvaluations } from './technical-sensory-evaluations.js';

/**
 * Sensory PANEL detail (migration 237) — per-attribute radar scores.
 *
 * Technical-owned (NPD-driven extension). One row per (panel, attribute):
 * the radar attribute name, its 0..10 score, and the signed delta vs the
 * benchmark product. `panel_id` FKs the existing technical_sensory_evaluations
 * row (mig 166), which is the canonical panel/evaluation — we do NOT fork a
 * parallel panel table. org_id-scoped + RLS (FORCE) via app.current_org_id().
 */
export const technicalSensoryAttributeScores = pgTable(
  'technical_sensory_attribute_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    panelId: uuid('panel_id')
      .notNull()
      .references(() => technicalSensoryEvaluations.id, { onDelete: 'cascade' }),
    attributeName: text('attribute_name').notNull(),
    scoreOutOf10: numeric('score_out_of_10', { precision: 4, scale: 2 }),
    vsBenchmark: numeric('vs_benchmark', { precision: 4, scale: 2 }),
    displayOrder: integer('display_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    panelAttributeUnique: unique('technical_sensory_attribute_scores_panel_attribute_unique').on(
      table.panelId,
      table.attributeName,
    ),
    orgPanelIdx: index('idx_technical_sensory_attribute_scores_org_panel').on(table.orgId, table.panelId),
    panelOrderIdx: index('idx_technical_sensory_attribute_scores_panel_order').on(
      table.panelId,
      table.displayOrder,
    ),
    scoreCheck: check(
      'technical_sensory_attribute_scores_score_check',
      sql`${table.scoreOutOf10} is null or (${table.scoreOutOf10} >= 0 and ${table.scoreOutOf10} <= 10)`,
    ),
    vsBenchmarkRangeCheck: check(
      'technical_sensory_attribute_scores_vs_benchmark_range',
      sql`${table.vsBenchmark} is null or (${table.vsBenchmark} >= -10 and ${table.vsBenchmark} <= 10)`,
    ),
  }),
);

export type TechnicalSensoryAttributeScore = InferSelectModel<typeof technicalSensoryAttributeScores>;
export type NewTechnicalSensoryAttributeScore = InferInsertModel<typeof technicalSensoryAttributeScores>;
