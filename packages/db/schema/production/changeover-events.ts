import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';
import { workOrders } from '../work-orders.js';

// 08-Production T-006 — changeover_events: allergen/product changeover window record.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.7, §6 D9 (L3 schema-driven ext), §16.4 V-PROD-23.
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// risk_level CHECK IN ('low','medium','high','segregated').
// chk_changeover_time = V-PROD-23 (started_at < completed_at when completed_at NOT NULL).
// ext_jsonb = D9 L3 schema-driven tenant extension (must not be omitted).

export const changeoverEvents = pgTable(
  'changeover_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    lineId: text('line_id').notNull(),
    woFromId: uuid('wo_from_id').references(() => workOrders.id, { onDelete: 'set null' }),
    woToId: uuid('wo_to_id').references(() => workOrders.id, { onDelete: 'set null' }),

    allergenFrom: text('allergen_from').array(),
    allergenTo: text('allergen_to').array(),
    riskLevel: text('risk_level').notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    plannedDurationMin: integer('planned_duration_min'),
    actualDurationMin: integer('actual_duration_min'),

    cleaningCompleted: boolean('cleaning_completed').notNull().default(false),
    cleaningChecklist: jsonb('cleaning_checklist'),
    atpRequired: boolean('atp_required').notNull().default(false),
    atpResult: jsonb('atp_result'),

    dualSignOffStatus: text('dual_sign_off_status').notNull().default('pending'),
    firstSigner: uuid('first_signer').references(() => users.id, { onDelete: 'set null' }),
    firstSignedAt: timestamp('first_signed_at', { withTimezone: true }),
    secondSigner: uuid('second_signer').references(() => users.id, { onDelete: 'set null' }),
    secondSignedAt: timestamp('second_signed_at', { withTimezone: true }),

    extJsonb: jsonb('ext_jsonb').notNull().default({}), // D9 L3 extension

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    changeoverLineTimeIdx: index('idx_changeover_line_time').on(t.lineId, t.startedAt),
    changeoverWoFromIdx: index('idx_changeover_wo_from')
      .on(t.woFromId)
      .where(sql`${t.woFromId} is not null`),
    changeoverWoToIdx: index('idx_changeover_wo_to')
      .on(t.woToId)
      .where(sql`${t.woToId} is not null`),
    riskLevelCheck: check(
      'changeover_events_risk_level_check',
      sql`${t.riskLevel} in ('low', 'medium', 'high', 'segregated')`,
    ),
    changeoverTimeCheck: check(
      'chk_changeover_time',
      sql`${t.completedAt} is null or ${t.startedAt} < ${t.completedAt}`,
    ),
  }),
);

export type ChangeoverEvent = InferSelectModel<typeof changeoverEvents>;
export type NewChangeoverEvent = InferInsertModel<typeof changeoverEvents>;
