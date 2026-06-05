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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';

// 07-Planning-Extended T-003 — changeover_matrix + changeover_matrix_versions.
// PRD: docs/prd/07-PLANNING-EXT-PRD.md §9.4, §6 D5 (per-line override).
//
// This is the EXTERNAL CHANGEOVER CONTRACT that 08-production consumes: the allergen-pair
// from->to changeover duration lookup the solver and the production changeover step both read.
// 08-production's runtime `changeover_events` (mig 184) is a DIFFERENT table (the recorded
// window); this is the planned lookup matrix. They do not overlap.
//
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// site_id day-1: nullable site_id uuid (no FK / registry yet).
// D5 per-line override: line_id NULL = org-wide default; non-NULL = line-specific override.
// Only ONE active version per org — partial unique index on is_active=true.
// NUMERIC-exact: changeover_minutes NUMERIC(10,2) (never float).

export const changeoverMatrixVersions = pgTable(
  'changeover_matrix_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    versionNumber: integer('version_number').notNull(),
    label: text('label'),
    isActive: boolean('is_active').notNull().default(false),
    status: text('status').notNull().default('draft'),

    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgVersionUnique: unique('changeover_matrix_versions_org_version_unique').on(
      t.orgId,
      t.versionNumber,
    ),
    // D5: only one active version per org (partial unique on is_active=true).
    activePerOrg: uniqueIndex('idx_changeover_active_per_org')
      .on(t.orgId)
      .where(sql`is_active = true`),
    orgIdx: index('idx_changeover_matrix_versions_org').on(t.orgId),
    statusCheck: check(
      'changeover_matrix_versions_status_check',
      sql`${t.status} in ('draft', 'pending_review', 'active', 'archived')`,
    ),
    versionPositiveCheck: check(
      'changeover_matrix_versions_version_positive_check',
      sql`${t.versionNumber} >= 1`,
    ),
  }),
);

export const changeoverMatrix = pgTable(
  'changeover_matrix',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    versionId: uuid('version_id')
      .notNull()
      .references(() => changeoverMatrixVersions.id, { onDelete: 'cascade' }),
    lineId: text('line_id'), // D5: NULL = org-wide default; non-NULL = per-line override
    allergenFrom: text('allergen_from').notNull(),
    allergenTo: text('allergen_to').notNull(),
    changeoverMinutes: numeric('changeover_minutes', { precision: 10, scale: 2 }).notNull(),
    requiresCleaning: boolean('requires_cleaning').notNull().default(false),
    requiresAtp: boolean('requires_atp').notNull().default(false),
    riskLevel: text('risk_level').notNull().default('low'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // UNIQUE permits NULL line_id (default) AND a specific line_id (override) to coexist for the
    // same pair+version because NULLs are distinct in a UNIQUE constraint.
    pairUnique: unique('changeover_matrix_pair_unique').on(
      t.orgId,
      t.versionId,
      t.lineId,
      t.allergenFrom,
      t.allergenTo,
    ),
    versionIdx: index('idx_changeover_matrix_version').on(t.versionId),
    orgPairIdx: index('idx_changeover_matrix_org_pair').on(
      t.orgId,
      t.allergenFrom,
      t.allergenTo,
    ),
    lineIdx: index('idx_changeover_matrix_line')
      .on(t.lineId)
      .where(sql`${t.lineId} is not null`),
    riskLevelCheck: check(
      'changeover_matrix_risk_level_check',
      sql`${t.riskLevel} in ('low', 'medium', 'high', 'segregated')`,
    ),
    changeoverNonnegCheck: check(
      'changeover_matrix_changeover_nonneg_check',
      sql`${t.changeoverMinutes} >= 0`,
    ),
  }),
);

export type ChangeoverMatrixVersion = InferSelectModel<typeof changeoverMatrixVersions>;
export type NewChangeoverMatrixVersion = InferInsertModel<typeof changeoverMatrixVersions>;
export type ChangeoverMatrix = InferSelectModel<typeof changeoverMatrix>;
export type NewChangeoverMatrix = InferInsertModel<typeof changeoverMatrix>;
