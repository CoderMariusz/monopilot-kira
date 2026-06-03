import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { product } from './product.js';
import { referenceAllergens } from './allergens.js';

export const faAllergenOverrideAction = pgEnum('fa_allergen_override_action', ['add', 'remove']);

export const faAllergenOverrides = pgTable(
  'fa_allergen_overrides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productCode: text('product_code')
      .notNull()
      .references(() => product.productCode, { onDelete: 'cascade' }),
    allergenCode: text('allergen_code').notNull(),
    action: faAllergenOverrideAction('action').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorRole: text('actor_role').notNull(),
    supersedesId: uuid('supersedes_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    allergenFk: foreignKey({
      name: 'fa_allergen_overrides_allergen_fk',
      columns: [table.orgId, table.allergenCode],
      foreignColumns: [referenceAllergens.orgId, referenceAllergens.allergenCode],
    }).onUpdate('cascade').onDelete('restrict'),
    supersedesFk: foreignKey({
      name: 'fa_allergen_overrides_supersedes_id_fkey',
      columns: [table.supersedesId],
      foreignColumns: [table.id],
    }),
    currentIdx: index('fa_allergen_overrides_current_idx')
      .on(table.orgId, table.productCode, table.allergenCode)
      .where(sql`${table.supersededAt} is null`),
    historyIdx: index('fa_allergen_overrides_history_idx').on(
      table.orgId,
      table.productCode,
      sql`${table.createdAt} desc`,
    ),
    supersedesIdx: index('fa_allergen_overrides_supersedes_idx')
      .on(table.supersedesId)
      .where(sql`${table.supersedesId} is not null`),
    reasonLengthCheck: check('fa_allergen_overrides_reason_length_check', sql`length(reason) >= 10`),
    actorRoleNonemptyCheck: check(
      'fa_allergen_overrides_actor_role_nonempty_check',
      sql`length(trim(actor_role)) > 0`,
    ),
    schemaVersionCheck: check('fa_allergen_overrides_schema_version_check', sql`schema_version >= 1`),
  }),
);

export type FaAllergenOverride = InferSelectModel<typeof faAllergenOverrides>;
export type NewFaAllergenOverride = InferInsertModel<typeof faAllergenOverrides>;
