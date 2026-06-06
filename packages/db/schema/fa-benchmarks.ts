import { check, foreignKey, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { organizations, users } from './baseline.js';
import { product } from './product.js';

// Migration 241 — 01-NPD FA Core tab multi-benchmark rows. NPD-owned, per-FG.
// Supersedes the single product.benchmark Core field with a repeatable
// {label, price} list per Factory Article (per-org product_code).
// price is NUMERIC(12,2) — exact decimal, never float; non-negative CHECK.
// FK is composite (org_id, product_code) -> product(org_id, product_code) because
// product PK became per-org in mig 142.
export const faBenchmarks = pgTable(
  'fa_benchmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    productCode: text('product_code').notNull(),
    label: text('label').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }),
    displayOrder: integer('display_order').notNull().default(0),
    // Audit (R13)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    orgProductIdx: index('fa_benchmarks_org_product_idx').on(table.orgId, table.productCode),
    productFk: foreignKey({
      name: 'fa_benchmarks_product_fk',
      columns: [table.orgId, table.productCode],
      foreignColumns: [product.orgId, product.productCode],
    }).onDelete('cascade'),
    priceNonnegCheck: check(
      'fa_benchmarks_price_nonneg',
      sql`${table.price} is null or ${table.price} >= 0`,
    ),
  }),
);

export type FaBenchmark = InferSelectModel<typeof faBenchmarks>;
export type NewFaBenchmark = InferInsertModel<typeof faBenchmarks>;
