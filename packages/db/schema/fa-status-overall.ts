import { boolean, integer, pgView, text, uuid } from 'drizzle-orm/pg-core';

export const faStatusOverall = pgView('fa_status_overall', {
  productCode: text('product_code').notNull(),
  orgId: uuid('org_id').notNull(),
  doneCore: boolean('done_core').notNull(),
  donePlanning: boolean('done_planning').notNull(),
  doneCommercial: boolean('done_commercial').notNull(),
  doneProduction: boolean('done_production').notNull(),
  doneTechnical: boolean('done_technical').notNull(),
  doneMrp: boolean('done_mrp').notNull(),
  doneProcurement: boolean('done_procurement').notNull(),
  statusOverall: text('status_overall').notNull(),
  daysToLaunch: integer('days_to_launch'),
}).existing();

export type FaStatusOverall = typeof faStatusOverall.$inferSelect;
