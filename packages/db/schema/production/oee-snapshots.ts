import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from '../baseline.js';

// 08-Production T-008 — oee_snapshots: per-minute OEE producer table.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.9, §16.4 V-PROD-10/25, §5.5 (90-day retention).
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
//
// D-OEE-1 — 08-production is the SOLE PRODUCER of oee_snapshots. 15-OEE is a READ-ONLY
//   consumer (materialized views / drilldowns); it must NEVER write to this table.
// V-PROD-10: UNIQUE (org_id, line_id, shift_id, snapshot_minute) — duplicate rows would
//   corrupt the 15-OEE consumer. V-PROD-25: A/P/Q each CHECK BETWEEN 0 AND 100.
// oee_pct is GENERATED ALWAYS AS (A*P*Q/10000) STORED — never user-settable.
//
// Migration 286 (WO-complete producer, apps/web/lib/production/oee-snapshot-producer.ts):
//   * performance_pct / quality_pct are NULLABLE — honest NULL when no standard-time
//     source exists (performance) or the quality denominator is zero (quality).
//     oee_pct propagates NULL whenever any component is NULL (GENERATED semantics).
//   * partial unique index oee_snapshots_org_active_wo_uq (org_id, active_wo_id)
//     WHERE active_wo_id IS NOT NULL — one WO-grain snapshot per completed WO (R14-safe).

export const oeeSnapshots = pgTable(
  'oee_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    lineId: text('line_id').notNull(),
    shiftId: text('shift_id').notNull(),
    snapshotMinute: timestamp('snapshot_minute', { withTimezone: true }).notNull(),

    availabilityPct: numeric('availability_pct', { precision: 5, scale: 2 }).notNull(),
    // NULLABLE since migration 286 — honest NULL when no defensible standard-time source.
    performancePct: numeric('performance_pct', { precision: 5, scale: 2 }),
    // NULLABLE since migration 286 — honest NULL when the quality denominator is zero.
    qualityPct: numeric('quality_pct', { precision: 5, scale: 2 }),
    // V-PROD-25: composite OEE, GENERATED + STORED, never user-settable.
    oeePct: numeric('oee_pct', { precision: 5, scale: 2 }).generatedAlwaysAs(
      sql`availability_pct * performance_pct * quality_pct / 10000`,
    ),

    activeWoId: uuid('active_wo_id'), // soft ref (snapshot fact, no FK)
    outputQtyDelta: numeric('output_qty_delta', { precision: 12, scale: 3 }),
    downtimeMinDelta: integer('downtime_min_delta'),
    wasteQtyDelta: numeric('waste_qty_delta', { precision: 12, scale: 3 }),
    idealCycleTimeSec: numeric('ideal_cycle_time_sec', { precision: 8, scale: 2 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oeeUnique: unique('oee_snapshots_line_shift_minute_unique').on(
      t.orgId,
      t.lineId,
      t.shiftId,
      t.snapshotMinute,
    ),
    oeeLineTimeIdx: index('idx_oee_line_time').on(t.lineId, t.snapshotMinute.desc()),
    availabilityRangeCheck: check(
      'oee_snapshots_availability_pct_range_check',
      sql`${t.availabilityPct} between 0 and 100`,
    ),
    performanceRangeCheck: check(
      'oee_snapshots_performance_pct_range_check',
      sql`${t.performancePct} between 0 and 100`,
    ),
    qualityRangeCheck: check(
      'oee_snapshots_quality_pct_range_check',
      sql`${t.qualityPct} between 0 and 100`,
    ),
  }),
);

export type OeeSnapshot = InferSelectModel<typeof oeeSnapshots>;
export type NewOeeSnapshot = InferInsertModel<typeof oeeSnapshots>;
