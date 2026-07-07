import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
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

import { organizations } from './baseline.js';
import { items } from './items.js';
import { productionLines } from './infra-master.js';
import { prodDetail } from './prod-detail.js';

// Migration 389 + extensions (429/430/436/450).
export const npdWipProcesses = pgTable(
  'npd_wip_processes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    prodDetailId: uuid('prod_detail_id')
      .notNull()
      .references(() => prodDetail.id, { onDelete: 'cascade' }),
    processName: text('process_name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    durationHours: numeric('duration_hours', { precision: 10, scale: 4 }).notNull().default('0'),
    additionalCost: numeric('additional_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    createsWipItem: boolean('creates_wip_item').notNull().default(false),
    wipItemId: uuid('wip_item_id').references(() => items.id, { onDelete: 'set null' }),
    wipDefinitionId: uuid('wip_definition_id'),
    throughputPerHour: numeric('throughput_per_hour', { precision: 14, scale: 4 }),
    throughputUom: text('throughput_uom'),
    setupCost: numeric('setup_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    yieldPct: numeric('yield_pct', { precision: 6, scale: 3 }).notNull().default('100'),
    lineId: uuid('line_id').references(() => productionLines.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idOrgUnique: unique('npd_wip_processes_id_org_key').on(table.id, table.orgId),
    orgDetailOrderIdx: index('npd_wip_processes_org_detail_order_idx').on(
      table.orgId,
      table.prodDetailId,
      table.displayOrder,
    ),
    orgDefinitionIdx: index('npd_wip_processes_org_definition_idx')
      .on(table.orgId, table.wipDefinitionId)
      .where(sql`${table.wipDefinitionId} is not null`),
    lineIdIdx: index('npd_wip_processes_line_id_idx')
      .on(table.lineId)
      .where(sql`${table.lineId} is not null`),
    durationNonneg: check('npd_wip_processes_duration_nonneg', sql`${table.durationHours} >= 0`),
    addCostNonneg: check('npd_wip_processes_addcost_nonneg', sql`${table.additionalCost} >= 0`),
    yieldPctCheck: check(
      'npd_wip_processes_yield_pct_check',
      sql`${table.yieldPct} > 0 and ${table.yieldPct} <= 100`,
    ),
    throughputNonneg: check(
      'npd_wip_processes_throughput_nonneg',
      sql`${table.throughputPerHour} is null or ${table.throughputPerHour} >= 0`,
    ),
    setupCostNonneg: check('npd_wip_processes_setup_cost_nonneg', sql`${table.setupCost} >= 0`),
  }),
);

export type NpdWipProcess = InferSelectModel<typeof npdWipProcesses>;
export type NewNpdWipProcess = InferInsertModel<typeof npdWipProcesses>;
