import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { organizations } from './baseline';

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    warehouseType: text('warehouse_type').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    address: jsonb('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgCodeUnique: unique('warehouses_org_code_unique').on(table.orgId, table.code),
    orgIdx: index('warehouses_org_idx').on(table.orgId),
  }),
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => locations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    locationType: text('location_type').notNull(),
    level: integer('level').notNull(),
    path: text('path').notNull(),
    maxCapacity: numeric('max_capacity', { precision: 18, scale: 6 }),
  },
  (table) => ({
    orgCodeUnique: unique('locations_org_code_unique').on(table.orgId, table.code),
    orgPathIdx: index('locations_org_path_idx').on(table.orgId, table.path),
    warehouseIdx: index('locations_warehouse_idx').on(table.warehouseId),
  }),
);

export const machines = pgTable(
  'machines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    machineType: text('machine_type').notNull(),
    status: text('status').notNull().default('active'),
    capacityPerHour: numeric('capacity_per_hour', { precision: 18, scale: 6 }),
    specs: jsonb('specs').notNull().default(sql`'{}'::jsonb`),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  },
  (table) => ({
    orgCodeUnique: unique('machines_org_code_unique').on(table.orgId, table.code),
    orgIdx: index('machines_org_idx').on(table.orgId),
    locationIdx: index('machines_location_idx').on(table.locationId),
  }),
);

export const productionLines = pgTable(
  'production_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    defaultLocationId: uuid('default_location_id').references(() => locations.id, { onDelete: 'set null' }),
  },
  (table) => ({
    orgCodeUnique: unique('production_lines_org_code_unique').on(table.orgId, table.code),
    orgIdx: index('production_lines_org_idx').on(table.orgId),
    defaultLocationIdx: index('production_lines_default_location_idx').on(table.defaultLocationId),
  }),
);

// RLS: forced by 051; global join rows keep app_user access, with anon/auth revoked.
export const lineMachines = pgTable(
  'line_machines',
  {
    lineId: uuid('line_id')
      .notNull()
      .references(() => productionLines.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.lineId, table.machineId] }),
    machineIdx: index('line_machines_machine_idx').on(table.machineId),
  }),
);

// RLS: forced by 051; global reference rows are readable only through app_user.
export const allergens = pgTable('allergens', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  namePl: text('name_pl'),
  nameDe: text('name_de'),
  nameFr: text('name_fr'),
  nameUk: text('name_uk'),
  nameRo: text('name_ro'),
  iconUrl: text('icon_url'),
  isActive: boolean('is_active').notNull().default(true),
});

export const taxCodes = pgTable(
  'tax_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
    countryCode: char('country_code', { length: 2 }),
    taxType: text('tax_type'),
    jurisdiction: text('jurisdiction'),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => ({
    orgCodeEffectiveUnique: unique('tax_codes_org_code_effective_unique').on(
      table.orgId,
      table.code,
      table.effectiveFrom,
    ),
    orgIdx: index('tax_codes_org_idx').on(table.orgId),
  }),
);
