import { bigint, date, integer, pgView, text, uuid } from 'drizzle-orm/pg-core';

export const missingRequiredCols = pgView('missing_required_cols', {
  productCode: text('product_code').notNull(),
  orgId: uuid('org_id').notNull(),
  missingData: text('missing_data').notNull(),
}).existing();

export const dashboardSummary = pgView('dashboard_summary', {
  orgId: uuid('org_id').notNull(),
  totalActive: bigint('total_active', { mode: 'number' }).notNull(),
  fullyComplete: bigint('fully_complete', { mode: 'number' }).notNull(),
  pending: bigint('pending', { mode: 'number' }).notNull(),
  totalBuilt: bigint('total_built', { mode: 'number' }).notNull(),
}).existing();

export const launchAlerts = pgView('launch_alerts', {
  productCode: text('product_code').notNull(),
  orgId: uuid('org_id').notNull(),
  launchDate: date('launch_date'),
  daysLeft: integer('days_left'),
  alertLevel: text('alert_level').notNull(),
  missingData: text('missing_data'),
}).existing();

export type MissingRequiredCols = typeof missingRequiredCols.$inferSelect;
export type DashboardSummary = typeof dashboardSummary.$inferSelect;
export type LaunchAlert = typeof launchAlerts.$inferSelect;
