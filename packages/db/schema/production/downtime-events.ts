import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
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
import { downtimeSourceEnum } from './enums.js';

// 08-Production T-005 — downtime_events: categorized downtime + maintenance soft-link.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.6, §16.4 V-PROD-06/22.
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// duration_min is GENERATED ALWAYS AS STORED (V-PROD-06: never user-settable).
//   The Drizzle column is .generatedAlwaysAs(...) so application code can never write it.
// category_id is a HARD FK to downtime_categories (02-Settings reference table) — added in
//   the SQL migration alongside a downtime_categories shell table (soft-import boundary).
// mwo_id is a NULLable soft ref to 13-maintenance (no FK; module not yet built).
// V-PROD-22 (source='wo_pause' ⇒ wo_id NOT NULL) is enforced at the API layer (T-016), not
//   in the base table, per the PRD note — wo_id stays nullable here for manual/plc rows.
// Feeds: OEE Availability (15-OEE), quality root-cause, maintenance MWO trigger.

export const downtimeEvents = pgTable(
  'downtime_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    lineId: text('line_id').notNull(),
    woId: uuid('wo_id').references(() => workOrders.id, { onDelete: 'set null' }),
    // HARD FK to downtime_categories (02-Settings) — added in SQL migration.
    categoryId: uuid('category_id').notNull(),
    source: downtimeSourceEnum('source').notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    // V-PROD-06: GENERATED minute-difference, STORED, NULL while event is open.
    durationMin: integer('duration_min').generatedAlwaysAs(
      sql`case when ended_at is not null then (extract(epoch from ended_at - started_at) / 60)::integer end`,
    ),

    shiftId: text('shift_id'),
    operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),
    reasonNotes: text('reason_notes'),
    plcFaultCode: text('plc_fault_code'),
    // Soft ref to 13-maintenance MWO (module not yet built — no FK).
    mwoId: uuid('mwo_id'),

    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    extJsonb: jsonb('ext_jsonb').notNull().default({}),
  },
  (t) => ({
    downtimeLineTimeIdx: index('idx_downtime_line_time').on(t.lineId, t.startedAt),
    downtimeCategoryIdx: index('idx_downtime_category').on(t.categoryId),
    downtimeWoIdx: index('idx_downtime_wo')
      .on(t.woId)
      .where(sql`${t.woId} is not null`),
    downtimeMwoIdx: index('idx_downtime_mwo')
      .on(t.mwoId)
      .where(sql`${t.mwoId} is not null`),
    downtimeOpenIdx: index('idx_downtime_open')
      .on(t.orgId, t.lineId)
      .where(sql`${t.endedAt} is null`),
  }),
);

export type DowntimeEvent = InferSelectModel<typeof downtimeEvents>;
export type NewDowntimeEvent = InferInsertModel<typeof downtimeEvents>;
