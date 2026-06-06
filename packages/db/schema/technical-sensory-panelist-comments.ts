import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { technicalSensoryEvaluations } from './technical-sensory-evaluations.js';

/**
 * Sensory PANEL detail (migration 237) — per-panelist comments.
 *
 * Technical-owned (NPD-driven extension). Free-text feedback attributed to a
 * panelist code, attached to the canonical panel/evaluation row (mig 166) via
 * `panel_id`. org_id-scoped + RLS (FORCE) via app.current_org_id().
 */
export const technicalSensoryPanelistComments = pgTable(
  'technical_sensory_panelist_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    panelId: uuid('panel_id')
      .notNull()
      .references(() => technicalSensoryEvaluations.id, { onDelete: 'cascade' }),
    panelistCode: text('panelist_code').notNull(),
    comment: text('comment').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgPanelIdx: index('idx_technical_sensory_panelist_comments_org_panel').on(table.orgId, table.panelId),
    panelOrderIdx: index('idx_technical_sensory_panelist_comments_panel_order').on(
      table.panelId,
      table.displayOrder,
    ),
  }),
);

export type TechnicalSensoryPanelistComment = InferSelectModel<typeof technicalSensoryPanelistComments>;
export type NewTechnicalSensoryPanelistComment = InferInsertModel<typeof technicalSensoryPanelistComments>;
