import { integer, numeric, pgView, text, uuid } from 'drizzle-orm/pg-core';

export const faBomView = pgView('fa_bom_view', {
  bomHeaderId: uuid('bom_header_id').notNull(),
  productCode: text('product_code').notNull(),
  status: text('status').notNull(),
  version: integer('version').notNull(),
  lineNo: integer('line_no').notNull(),
  componentType: text('component_type'),
  componentCode: text('component_code').notNull(),
  quantity: numeric('quantity').notNull(),
  processStage: text('process_stage').notNull(),
  source: text('source').notNull(),
  d365Status: text('d365_status').notNull(),
}).existing();

export type FaBomView = typeof faBomView.$inferSelect;
