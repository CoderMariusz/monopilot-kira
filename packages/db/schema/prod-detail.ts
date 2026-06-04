import { foreignKey, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations } from './baseline.js';
import { items } from './items.js';
import { product } from './product.js';

export const prodDetail = pgTable(
  'prod_detail',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code').notNull(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    intermediateCode: text('intermediate_code').notNull(),
    // Lane-B: optional FK to the real items master row this component represents.
    // intermediate_code stays the human display code; item_id wires the real item.
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    componentIndex: integer('component_index').notNull(),
    manufacturingOperation1: text('manufacturing_operation_1'),
    manufacturingOperation2: text('manufacturing_operation_2'),
    manufacturingOperation3: text('manufacturing_operation_3'),
    manufacturingOperation4: text('manufacturing_operation_4'),
    operationYield1: numeric('operation_yield_1'),
    operationYield2: numeric('operation_yield_2'),
    operationYield3: numeric('operation_yield_3'),
    operationYield4: numeric('operation_yield_4'),
    line: text('line'),
    equipmentSetup: text('equipment_setup'),
    yieldLine: numeric('yield_line'),
    resourceRequirement: text('resource_requirement'),
    rate: numeric('rate'),
    intermediateCodeP1: text('intermediate_code_p1'),
    intermediateCodeP2: text('intermediate_code_p2'),
    intermediateCodeP3: text('intermediate_code_p3'),
    intermediateCodeP4: text('intermediate_code_p4'),
    intermediateCodeFinal: text('intermediate_code_final'),
    sliceCount: integer('slice_count'),
    componentWeight: numeric('component_weight'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    productFk: foreignKey({
      name: 'prod_detail_product_code_fkey',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('cascade'),
    productCodeIdx: index('prod_detail_product_code_idx').on(table.productCode),
    orgProductCodeIdx: index('prod_detail_org_product_code_idx').on(table.orgId, table.productCode),
    itemIdIdx: index('prod_detail_item_id_idx').on(table.itemId),
  }),
);

export type ProdDetail = InferSelectModel<typeof prodDetail>;
export type NewProdDetail = InferInsertModel<typeof prodDetail>;
