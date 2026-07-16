import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations } from './baseline.js';

export const npdDepartments = pgTable(
  'npd_departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    stageCode: text('stage_code').notNull().default('brief'),
    displayOrder: integer('display_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCodeUnique: unique('npd_departments_org_id_code_key').on(table.orgId, table.code),
    idOrgUnique: unique('npd_departments_id_org_id_key').on(table.id, table.orgId),
    orgActiveOrderIdx: index('npd_departments_org_active_order_idx').on(
      table.orgId,
      table.active,
      table.displayOrder,
      table.code,
    ),
    stageCodeCheck: check(
      'npd_departments_stage_code_check',
      sql`${table.stageCode} in ('brief', 'recipe', 'packaging', 'costing_nutrition', 'trial', 'sensory', 'pilot', 'approval', 'handoff')`,
    ),
  }),
);

export const npdFieldCatalog = pgTable(
  'npd_field_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    label: text('label').notNull(),
    dataType: text('data_type').notNull(),
    validationJson: jsonb('validation_json'),
    helpText: text('help_text'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgCodeUnique: unique('npd_field_catalog_org_id_code_key').on(table.orgId, table.code),
    idOrgUnique: unique('npd_field_catalog_id_org_id_key').on(table.id, table.orgId),
    orgActiveCodeIdx: index('npd_field_catalog_org_active_code_idx').on(table.orgId, table.active, table.code),
    activeSemanticCodeUnique: uniqueIndex('npd_field_catalog_active_semantic_code_uidx')
      .on(table.orgId, sql`lower(regexp_replace(trim(${table.code}), '[^a-z0-9]+', '', 'g'))`)
      .where(sql`${table.active} = true`),
    activeSemanticLabelUnique: uniqueIndex('npd_field_catalog_active_semantic_label_uidx')
      .on(table.orgId, sql`lower(regexp_replace(trim(${table.label}), '[^a-z0-9]+', '', 'g'))`)
      .where(sql`${table.active} = true`),
    dataTypeCheck: check(
      'npd_field_catalog_data_type_check',
      sql`${table.dataType} in ('text', 'number', 'integer', 'boolean', 'date', 'datetime', 'dropdown', 'formula', 'json')`,
    ),
  }),
);

export const npdDepartmentField = pgTable(
  'npd_department_field',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => npdDepartments.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => npdFieldCatalog.id, { onDelete: 'cascade' }),
    required: boolean('required').notNull().default(false),
    visible: boolean('visible').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => ({
    orgDepartmentFieldUnique: unique('npd_department_field_org_id_department_id_field_id_key').on(
      table.orgId,
      table.departmentId,
      table.fieldId,
    ),
    departmentOrgFk: foreignKey({
      name: 'npd_department_field_department_org_fkey',
      columns: [table.departmentId, table.orgId],
      foreignColumns: [npdDepartments.id, npdDepartments.orgId],
    }).onDelete('cascade'),
    fieldOrgFk: foreignKey({
      name: 'npd_department_field_field_org_fkey',
      columns: [table.fieldId, table.orgId],
      foreignColumns: [npdFieldCatalog.id, npdFieldCatalog.orgId],
    }).onDelete('cascade'),
    orgDeptOrderIdx: index('npd_department_field_org_dept_order_idx').on(
      table.orgId,
      table.departmentId,
      table.visible,
      table.displayOrder,
    ),
  }),
);

export type NpdDepartment = InferSelectModel<typeof npdDepartments>;
export type NewNpdDepartment = InferInsertModel<typeof npdDepartments>;
export type NpdFieldCatalog = InferSelectModel<typeof npdFieldCatalog>;
export type NewNpdFieldCatalog = InferInsertModel<typeof npdFieldCatalog>;
export type NpdDepartmentField = InferSelectModel<typeof npdDepartmentField>;
export type NewNpdDepartmentField = InferInsertModel<typeof npdDepartmentField>;
