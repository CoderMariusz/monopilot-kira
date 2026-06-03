import { sql } from 'drizzle-orm';
import { index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations } from './baseline.js';

export const referenceSchema = pgSchema('Reference');

export const packSizes = referenceSchema.table(
  'PackSizes',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.value] }),
    orgIdx: index('pack_sizes_org_id_idx').on(table.orgId),
  }),
);

export const templates = referenceSchema.table(
  'Templates',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateName: text('template_name').notNull(),
    operation1Name: text('operation_1_name'),
    operation2Name: text('operation_2_name'),
    operation3Name: text('operation_3_name'),
    operation4Name: text('operation_4_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.templateName] }),
    orgIdx: index('templates_org_id_idx').on(table.orgId),
  }),
);

export const linesByPackSize = referenceSchema.table(
  'Lines_By_PackSize',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    line: text('line').notNull(),
    supportedPackSizes: text('supported_pack_sizes').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.line] }),
    orgIdx: index('lines_by_pack_size_org_id_idx').on(table.orgId),
    supportedPackSizesIdx: index('lines_by_pack_size_supported_pack_sizes_gin_idx')
      .using('gin', table.supportedPackSizes),
  }),
);

export const equipmentSetupByLinePack = referenceSchema.table(
  'Equipment_Setup_By_Line_Pack',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    line: text('line').notNull(),
    packSize: text('pack_size').notNull(),
    equipmentSetup: text('equipment_setup').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.line, table.packSize] }),
    orgIdx: index('equipment_setup_by_line_pack_org_id_idx').on(table.orgId),
  }),
);

export const closeConfirm = referenceSchema.table(
  'CloseConfirm',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.value] }),
    orgIdx: index('close_confirm_org_id_idx').on(table.orgId),
  }),
);

export type PackSize = InferSelectModel<typeof packSizes>;
export type NewPackSize = InferInsertModel<typeof packSizes>;
export type Template = InferSelectModel<typeof templates>;
export type NewTemplate = InferInsertModel<typeof templates>;
export type LineByPackSize = InferSelectModel<typeof linesByPackSize>;
export type NewLineByPackSize = InferInsertModel<typeof linesByPackSize>;
export type EquipmentSetupByLinePack = InferSelectModel<typeof equipmentSetupByLinePack>;
export type NewEquipmentSetupByLinePack = InferInsertModel<typeof equipmentSetupByLinePack>;
export type CloseConfirm = InferSelectModel<typeof closeConfirm>;
export type NewCloseConfirm = InferInsertModel<typeof closeConfirm>;
